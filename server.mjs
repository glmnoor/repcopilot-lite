import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {join, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {identifyNextBestAction, buildPlan} from './decisioning.mjs';
import {validateOutreach, validateContent, beforeCrmWrite, governanceTrace} from './hooks.mjs';
import {createSemanticView, retrieve, sourcesFor} from './semantic-view.mjs';

const port = Number(process.env.PORT || 8000);
const root = fileURLToPath(new URL('./public/', import.meta.url));
const contextRoot = fileURLToPath(new URL('./context/', import.meta.url));
const interactions = [];

const [hcpDimension, accountDimension, activityFacts, accessFacts, content, compliance, territory, responseFormats] = await Promise.all([
  readFile(join(contextRoot, 'dim-hcp.json'), 'utf8').then(JSON.parse),
  readFile(join(contextRoot, 'dim-account.json'), 'utf8').then(JSON.parse),
  readFile(join(contextRoot, 'fact-activity.json'), 'utf8').then(JSON.parse),
  readFile(join(contextRoot, 'fact-access.json'), 'utf8').then(JSON.parse),
  readFile(join(contextRoot, 'approved-content.json'), 'utf8').then(JSON.parse),
  readFile(join(contextRoot, 'compliance-rules.json'), 'utf8').then(JSON.parse),
  readFile(join(contextRoot, 'territory.json'), 'utf8').then(JSON.parse),
  readFile(join(contextRoot, 'response-formats.md'), 'utf8')
]);
const semanticView = createSemanticView({hcp:hcpDimension, accounts:accountDimension, activity:activityFacts, access:accessFacts});
const hcps = semanticView;
const context = {content, rules:compliance.rules, sources:sourcesFor()};

function formatResponse(section, values) {
  const marker = `## ${section}`;
  const start = responseFormats.indexOf(marker);
  if (start < 0) return responseFormats;
  const bodyStart = start + marker.length;
  const next = responseFormats.indexOf('\n## ', bodyStart);
  const template = responseFormats.slice(bodyStart, next < 0 ? responseFormats.length : next).trim();
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}

function rankedHcps() {
  return semanticView.map(hcp => ({hcp, action:identifyNextBestAction(hcp, content)})).sort((left, right) => right.action.score - left.action.score).map(item => ({...item.hcp, priorityScore:item.action.score, priority:item.action.priority}));
}

function getHcp(id) { return semanticView.find(hcp => hcp.hcpId === id); }
function plan(hcp) {
  const result = buildPlan(hcp, context);
  const action = identifyNextBestAction(hcp, content);
  const contentCheck = validateContent(action.content, hcp?.channel);
  return {...result, trace:governanceTrace(hcp, action, contentCheck)};
}
async function ask({hcpId, question}) {
  const hcp = getHcp(hcpId);
  const context = JSON.stringify(plan(hcp));
  const governance = validateOutreach(hcp);
  if (!governance.allowed) return {answer:'This HCP is not eligible for outreach. No message or follow-up should be created.', trace:plan(hcp).trace, model:'governance block'};
  const trace = plan(hcp).trace;
  const base = process.env.LLM_BASE_URL || 'http://localhost:11434/v1';
  const model = process.env.LLM_MODEL || 'llama3.2:3b';
  try {
    const response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {method:'POST', headers:{'content-type':'application/json', ...(process.env.LLM_API_KEY ? {authorization:`Bearer ${process.env.LLM_API_KEY}`} : {})}, body:JSON.stringify({model, temperature:.2, messages:[{role:'system', content:'You are a compliant pharmaceutical commercial co-pilot. Answer only from the supplied account plan. Never provide clinical advice, patient data, or off-label claims. Separate evidence from recommendation. End with a compliant next step.'},{role:'user', content:`Account plan: ${context}\nQuestion: ${question}`}]})});
    if (!response.ok) throw Error(await response.text());
    const data = await response.json();
    return {answer:data.choices?.[0]?.message?.content || 'No model response.', trace, model};
  } catch (error) {
    return {answer:`LLM unavailable (${error.message}). Offline answer: ${plan(hcp).action.why} Next step: ${plan(hcp).followUp}`, trace, model:'offline fallback'};
  }
}
function interpretAgentRequest(message = '') {
  const text = message.toLowerCase();
  const match = semanticView.find(row => text.includes(row.hcpId) || text.includes(row.name.toLowerCase().replace('dr. ', '')));
  if (text.includes('list') || text.includes('target') || text.includes('recommend')) return {intent:'list_targets', query:{eligibleOnly:true}};
  if (text.includes('nba') || text.includes('next best') || text.includes('what should i do')) return {intent:'hcp_nba', query:{hcpId:match?.hcpId}};
  if (text.includes('select') || text.includes('tell me about') || text.includes('details')) return {intent:'select_hcp', query:{hcpId:match?.hcpId}};
  return {intent:'clarify', query:{hcpId:match?.hcpId}};
}
async function agent({message, hcpId}) {
  const parsed = interpretAgentRequest(message);
  if (hcpId) parsed.query.hcpId = hcpId;
  const rows = retrieve(semanticView, parsed.query);
  const trace = [{tool:'interpret_request', status:'passed', output:parsed}, {tool:'retrieve_semantic_view', status:'passed', output:{rowCount:rows.length, sources:sourcesFor(parsed.query)}}];
  if (parsed.intent === 'list_targets') {
    const rankedRows = rows.map(row => ({row, action:identifyNextBestAction(row, content)})).sort((left, right) => right.action.score - left.action.score);
    const answerRows = rankedRows.map((item, index) => `${index + 1}. ${item.row.name} — ${item.row.account} — ${item.action.priority} priority (${item.action.score}/100)`).join('\n');
    return {intent:parsed.intent, answer:formatResponse('list_targets', {count:rows.length, rows:answerRows}), rows:rankedRows.map(item => item.row), sources:sourcesFor(parsed.query), trace};
  }
  if (!rows.length) return {intent:'clarify', answer:formatResponse('unknown', {}), rows:[], sources:sourcesFor(parsed.query), trace};
  const row = rows[0];
  const rowPlan = plan(row);
  if (parsed.intent === 'hcp_nba') return {intent:parsed.intent, answer:formatResponse('hcp_nba', {name:row.name, action:rowPlan.action.action, why:rowPlan.action.why, score:rowPlan.action.score, timing:rowPlan.action.timing, content:rowPlan.action.content}), rows:[row], plan:rowPlan, sources:sourcesFor(parsed.query), trace};
  return {intent:parsed.intent, answer:formatResponse('select_hcp', {name:row.name, tier:row.tier === 'A' ? 'Tier A' : 'Tier B', account:row.account, trx:row.trx, trend:row.trend, daysSinceLastTouch:row.daysSinceLastTouch, barrier:row.barrier, formulary:row.formulary}), rows:[row], plan:rowPlan, sources:sourcesFor(parsed.query), trace};
}
function json(res, value, status=200) { res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(value)); }
const type = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css'};
http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/hcps') return json(res, rankedHcps());
    if (req.method === 'GET' && req.url === '/api/briefing') { const ranked=rankedHcps(); const eligible=ranked.filter(row => row.eligible); const top=eligible[0]; return json(res, {message:formatResponse('briefing', {eligibleCount:eligible.length, topName:top?.name || 'no HCP', topScore:top?.priorityScore || 0}), recommended:top, ranked:eligible}); }
    if (req.method === 'GET' && req.url.startsWith('/api/plan')) return json(res, plan(getHcp(new URL(req.url, `http://${req.headers.host}`).searchParams.get('hcpId'))));
    if (req.method === 'POST' && req.url === '/api/ask') { let body=''; for await (const chunk of req) body += chunk; return json(res, await ask(JSON.parse(body))); }
    if (req.method === 'POST' && req.url === '/api/agent') { let body=''; for await (const chunk of req) body += chunk; return json(res, await agent(JSON.parse(body))); }
    if (req.method === 'POST' && req.url === '/api/interactions') { let body=''; for await (const chunk of req) body += chunk; const payload=JSON.parse(body); const hcp=getHcp(payload.hcpId); const governance=beforeCrmWrite(hcp, payload); if (!governance.allowed) return json(res, {error:governance.reason, governance}, 422); const item={...payload, id:Date.now(), createdAt:new Date().toISOString(), status:'pending_confirmation', governance}; interactions.unshift(item); return json(res, item, 201); }
    const file = join(root, req.url === '/' ? 'index.html' : req.url);
    const data = await readFile(file); res.writeHead(200, {'content-type':type[extname(file)] || 'text/plain'}); res.end(data);
  } catch (error) { json(res, {error:error.message}, 404); }
}).listen(port, () => console.log(`RepCopilot Lite: http://localhost:${port}`));
