import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {join, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {identifyNextBestAction, buildPlan} from './decisioning.mjs';
import {validateOutreach, validateContent, beforeCrmWrite, governanceTrace} from './hooks.mjs';

const port = Number(process.env.PORT || 8000);
const root = fileURLToPath(new URL('./public/', import.meta.url));
const contextRoot = fileURLToPath(new URL('./context/', import.meta.url));
const interactions = [];

const [hcps, content, compliance, territory] = await Promise.all([
  readFile(join(contextRoot, 'hcp-profiles.json'), 'utf8').then(JSON.parse),
  readFile(join(contextRoot, 'approved-content.json'), 'utf8').then(JSON.parse),
  readFile(join(contextRoot, 'compliance-rules.json'), 'utf8').then(JSON.parse),
  readFile(join(contextRoot, 'territory.json'), 'utf8').then(JSON.parse)
]);
const context = {content, rules:compliance.rules, sources:[territory, 'hcp-profiles.json', 'approved-content.json', 'compliance-rules.json']};

function getHcp(id) { return hcps.find(hcp => hcp.id === id); }
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
function json(res, value, status=200) { res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(value)); }
const type = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css'};
http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/hcps') return json(res, hcps);
    if (req.method === 'GET' && req.url.startsWith('/api/plan')) return json(res, plan(getHcp(new URL(req.url, `http://${req.headers.host}`).searchParams.get('hcpId'))));
    if (req.method === 'POST' && req.url === '/api/ask') { let body=''; for await (const chunk of req) body += chunk; return json(res, await ask(JSON.parse(body))); }
    if (req.method === 'POST' && req.url === '/api/interactions') { let body=''; for await (const chunk of req) body += chunk; const payload=JSON.parse(body); const hcp=getHcp(payload.hcpId); const governance=beforeCrmWrite(hcp, payload); if (!governance.allowed) return json(res, {error:governance.reason, governance}, 422); const item={...payload, id:Date.now(), createdAt:new Date().toISOString(), status:'pending_confirmation', governance}; interactions.unshift(item); return json(res, item, 201); }
    const file = join(root, req.url === '/' ? 'index.html' : req.url);
    const data = await readFile(file); res.writeHead(200, {'content-type':type[extname(file)] || 'text/plain'}); res.end(data);
  } catch (error) { json(res, {error:error.message}, 404); }
}).listen(port, () => console.log(`RepCopilot Lite: http://localhost:${port}`));
