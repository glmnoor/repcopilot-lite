export function validateOutreach(hcp) {
  if (!hcp) return {allowed:false, code:'not_found', reason:'HCP profile was not found.'};
  if (!hcp.eligible) return {allowed:false, code:'not_eligible', reason:'HCP is opted out or not eligible for outreach.'};
  return {allowed:true, code:'eligible', reason:'Territory aligned, reachable, on target list, and no opt-out found.'};
}

export function validateContent(content, channel) {
  if (!content) return {allowed:false, code:'missing_content', reason:'No approved content is available.'};
  if (content.status !== 'approved') return {allowed:false, code:'content_not_approved', reason:'Content is not currently approved.'};
  if (content.expires < new Date().toISOString().slice(0, 10)) return {allowed:false, code:'content_expired', reason:'Content approval has expired.'};
  if (!content.channels.includes(channel)) return {allowed:false, code:'channel_not_allowed', reason:`Approved content is not cleared for ${channel}.`};
  return {allowed:true, code:'approved', reason:'Content is approved for this channel.'};
}

export function beforeCrmWrite(hcp, interaction) {
  const governance = validateOutreach(hcp);
  if (!governance.allowed) return governance;
  if (!interaction?.objective || !interaction?.nextStep) return {allowed:false, code:'missing_fields', reason:'Objective and next step are required before CRM write-back.'};
  return {allowed:true, code:'ready_for_confirmation', reason:'Required business fields are present. User confirmation is still required.'};
}

export function governanceTrace(hcp, action, contentCheck) {
  return [
    {tool:'get_hcp_profile', status:hcp ? 'passed' : 'blocked', output:hcp},
    {tool:'validate_governance', status:hcp?.eligible ? 'passed' : 'blocked', output:validateOutreach(hcp)},
    {tool:'identify_next_best_action', status:action.priority === 'Blocked' ? 'blocked' : 'passed', output:action},
    {tool:'check_approved_content', status:contentCheck.allowed ? 'passed' : 'blocked', output:contentCheck}
  ];
}
