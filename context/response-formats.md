# RepCopilot Response Formats

This file defines the response shape for common commercial field-rep questions.

## briefing
There are {{eligibleCount}} eligible HCPs in your territory today. Based on priority score, {{topName}} is recommended first with a score of {{topScore}}/100.

What would you like to do?
- Start pre-call prep
- See why this HCP is prioritized
- View the target HCP list
- Ask about another HCP

## list_targets
I found {{count}} eligible HCPs ranked by priority score:

{{rows}}

What would you like to do next: select an HCP, prepare for the top priority, or ask a follow-up question?

## select_hcp
{{name}} is a {{tier}} priority HCP at {{account}}.

Evidence: TRx {{trx}}, trend {{trend}}%, and {{daysSinceLastTouch}} days since the last touch.
Access context: {{barrier}}; {{formulary}}.

What would you like to know or do next: see the NBA, start pre-call prep, or draft a follow-up?

## hcp_nba
Recommended NBA for {{name}}: {{action}}

Why: {{why}}
Priority score: {{score}}/100
Timing: {{timing}}
Approved content: {{content}}

Would you like to start pre-call prep, draft a follow-up, or log the planned interaction?

## unknown
I can help with target HCP lists, HCP details, next-best actions, pre-call preparation, follow-up drafts, and interaction logging.

What would you like to do?
