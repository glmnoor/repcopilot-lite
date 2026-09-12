export function createSemanticView({hcp, accounts, activity, access}) {
  return hcp.map(profile => {
    const account = accounts.find(item => item.accountId === profile.accountId) || {};
    const usage = activity.find(item => item.hcpId === profile.hcpId) || {};
    const accessSignal = access.find(item => item.hcpId === profile.hcpId) || {};
    return {
      id: profile.hcpId,
      ...profile,
      ...account,
      ...usage,
      ...accessSignal,
      last: usage.daysSinceLastTouch
    };
  });
}

export function retrieve(view, query = {}) {
  let rows = view;
  if (query.hcpId) rows = rows.filter(row => row.hcpId === query.hcpId);
  if (query.eligibleOnly) rows = rows.filter(row => row.eligible);
  if (query.specialty) rows = rows.filter(row => row.specialty.toLowerCase() === query.specialty.toLowerCase());
  return rows;
}

export function sourcesFor(query = {}) {
  return [
    {source:'dim-hcp.json', role:'identity, eligibility, channel, specialty'},
    {source:'dim-account.json', role:'account and territory ownership'},
    {source:'fact-activity.json', role:'TRx, trend, cadence, engagement'},
    {source:'fact-access.json', role:'access barrier and formulary signal'},
    ...(query.includeContent === false ? [] : [{source:'approved-content.json', role:'approved action content'}]),
    {source:'compliance-rules.json', role:'governance constraints'}
  ];
}
