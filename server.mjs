import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {join, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const port = Number(process.env.PORT || 8000);
const root = fileURLToPath(new URL('./public/', import.meta.url));
const interactions = [];

const hcps = [
  {id:'rao', name:'Dr. Priya Rao', specialty:'Medical Oncology', account:'Northwell Cancer Institute', tier:'A', eligible:true, trx:142, trend:-18, last:31, channel:'In-person', barrier:'PA workflow confusion and competitor switching', formulary:'New preferred formulary position', notes:'Staff requested approved PA support.', objective:'Clarify the approved access pathway and confirm the right office contact.', nextTouch:'Within 7 days'},
  {id:'lee', name:'Dr. James Lee', specialty:'Medical Oncology', account:'Hudson Valley Oncology', tier:'B', eligible:true, trx:98, trend:-7, last:14, channel:'Email', barrier:'Patient identification', formulary:'PA required', notes:'Open to approved access materials.', objective:'Share the approved patient identification checklist and ask about workflow friction.', nextTouch:'This week'},
  {id:'bose', name:'Dr. Nia Bose', specialty:'Medical Oncology', account:'Eastside Oncology Group', tier:'B', eligible:false, trx:70, trend:-4, last:19, channel:'Opted out', barrier:'Access', formulary:'Preferred', notes:'Opted out; no contact permitted.', objective:'No outreach. Route any account need through the approved service channel.', nextTouch:'Do not contact'}
];

function getHcp(id) { return hcps.find(hcp => hcp.id === id); }
function nba(hcp) {
  if (!hcp || !hcp.eligible) return {priority:'Blocked', action:'Do not contact', why:'The HCP is opted out or not eligible for outreach.', content:'No content', timing:'No outreach'};
  if (hcp.trend <= -10 && hcp.last > 21) return {priority:'High', action:'Plan an in-person PA-support visit', why:`TRx is down ${Math.abs(hcp.trend)}% and cadence is overdue by ${hcp.last} days. The preferred formulary position creates an approved access conversation.`, content:'Approved PA Support Resource', timing:'Within 7 days'};
  if (hcp.last > 21) return {priority:'Medium', action:'Draft a compliant re-engagement plan', why:`Cadence is overdue at ${hcp.last} days and ${hcp.channel} is the preferred channel.`, content:'Approved Follow-up Checklist', timing:'This week'};
  return {priority:'Planned', action:'Maintain planned engagement cadence', why:'No urgent trigger outweighs the current compliant cadence.', content:'Approved account plan', timing:'Next planned touchpoint'};
}
function tools(hcp) {
  return [
    {tool:'get_hcp_profile', status:'passed', output:hcp},
    {tool:'validate_governance', status:hcp?.eligible ? 'passed' : 'blocked', output:{passed:Boolean(hcp?.eligible), reason:hcp?.eligible ? 'Territory aligned, reachable, on target list, and no opt-out found.' : 'Blocked: HCP opted out or is not eligible.'}},
    {tool:'identify_next_best_action', status:'passed', output:nba(hcp)},
    {tool:'check_approved_content', status:hcp?.eligible ? 'passed' : 'blocked', output:hcp?.eligible ? {content:nba(hcp).content, indication:'Approved commercial use only'} : {content:'None', reason:'No outreach allowed'}}
  ];
}
function plan(hcp) {
  const action = nba(hcp);
  return {hcp, action, objective:hcp?.objective, guardrails:['No clinical guidance','No off-label promotion','No patient-level data','Use approved content only','Document only business-relevant information'], agenda:hcp?.eligible ? ['Confirm time and role of office contact','Lead with the approved access objective','Ask one open workflow question','Offer the approved resource','Agree on a compliant next step'] : ['Do not initiate contact','Route questions through approved support channels'], followUp:hcp?.eligible ? `Send ${action.content} through the approved channel and document the agreed next step.` : 'No follow-up permitted', trace:tools(hcp)};
}
async function ask({hcpId, question}) {
  const hcp = getHcp(hcpId);
  const context = JSON.stringify(plan(hcp));
  if (!hcp || !hcp.eligible) return {answer:'This HCP is not eligible for outreach. No message or follow-up should be created.', trace:tools(hcp), model:'governance block'};
  const trace = tools(hcp);
  const base = process.env.LLM_BASE_URL || 'http://localhost:11434/v1';
  const model = process.env.LLM_MODEL || 'llama3.2:3b';
  try {
    const response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {method:'POST', headers:{'content-type':'application/json', ...(process.env.LLM_API_KEY ? {authorization:`Bearer ${process.env.LLM_API_KEY}`} : {})}, body:JSON.stringify({model, temperature:.2, messages:[{role:'system', content:'You are a compliant pharmaceutical commercial co-pilot. Answer only from the supplied account plan. Never provide clinical advice, patient data, or off-label claims. Separate evidence from recommendation. End with a compliant next step.'},{role:'user', content:`Account plan: ${context}\nQuestion: ${question}`}]})});
    if (!response.ok) throw Error(await response.text());
    const data = await response.json();
    return {answer:data.choices?.[0]?.message?.content || 'No model response.', trace, model};
  } catch (error) {
    return {answer:`LLM unavailable (${error.message}). Offline answer: ${nba(hcp).why} Next step: ${plan(hcp).followUp}`, trace, model:'offline fallback'};
  }
}
function json(res, value, status=200) { res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(value)); }
const type = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css'};
http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/hcps') return json(res, hcps);
    if (req.method === 'GET' && req.url.startsWith('/api/plan')) return json(res, plan(getHcp(new URL(req.url, `http://${req.headers.host}`).searchParams.get('hcpId'))));
    if (req.method === 'POST' && req.url === '/api/ask') { let body=''; for await (const chunk of req) body += chunk; return json(res, await ask(JSON.parse(body))); }
    if (req.method === 'POST' && req.url === '/api/interactions') { let body=''; for await (const chunk of req) body += chunk; const item={...JSON.parse(body), id:Date.now(), createdAt:new Date().toISOString()}; interactions.unshift(item); return json(res, item, 201); }
    const file = join(root, req.url === '/' ? 'index.html' : req.url);
    const data = await readFile(file); res.writeHead(200, {'content-type':type[extname(file)] || 'text/plain'}); res.end(data);
  } catch (error) { json(res, {error:error.message}, 404); }
}).listen(port, () => console.log(`RepCopilot Lite: http://localhost:${port}`));
