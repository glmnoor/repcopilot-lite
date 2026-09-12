export function identifyNextBestAction(hcp, content) {
  if (!hcp || !hcp.eligible) return {priority:'Blocked', action:'Do not contact', why:'The HCP is opted out or not eligible for outreach.', content:null, timing:'No outreach', score:0};
  if (hcp.trend <= -10 && hcp.last > 21) return {priority:'High', action:'Plan an in-person PA-support visit', why:`TRx is down ${Math.abs(hcp.trend)}% and cadence is overdue by ${hcp.last} days. The preferred formulary position creates an approved access conversation.`, content:content.find(item => item.id === 'pa-support'), timing:'Within 7 days', score:92};
  if (hcp.last > 21) return {priority:'Medium', action:'Draft a compliant re-engagement plan', why:`Cadence is overdue at ${hcp.last} days and ${hcp.channel} is the preferred channel.`, content:content.find(item => item.id === 'follow-up'), timing:'This week', score:67};
  return {priority:'Planned', action:'Maintain planned engagement cadence', why:'No urgent trigger outweighs the current compliant cadence.', content:content.find(item => item.id === 'account-plan'), timing:'Next planned touchpoint', score:38};
}

export function buildPlan(hcp, context) {
  const action = identifyNextBestAction(hcp, context.content);
  const contentName = action.content?.name || 'No content';
  return {
    hcp,
    action: {...action, content:contentName},
    objective:hcp?.objective,
    contextSources:context.sources,
    guardrails:context.rules,
    agenda:hcp?.eligible ? ['Confirm time and role of office contact','Lead with the approved access objective','Ask one open workflow question','Offer the approved resource','Agree on a compliant next step'] : ['Do not initiate contact','Route questions through approved support channels'],
    followUp:hcp?.eligible ? `Send ${contentName} through the approved channel and document the agreed next step.` : 'No follow-up permitted'
  };
}
