# RepCopilot Lite

A clean local agent with no Python, no React, and no package installation. It uses Node 18+ only.

## Run

```powershell
$env:LLM_BASE_URL = "https://api.openai.com/v1"
$env:LLM_MODEL = "gpt-4o-mini"
$env:LLM_API_KEY = "your_new_key"
node server.mjs
```

Open `http://localhost:8000`.

It works with any OpenAI-compatible chat-completions endpoint. For a local LLM, use Ollama or LM Studio. For a small cloud model, set `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` to your provider values. The key remains in the local server environment, never in the webpage.

If no model is running, the agent visibly falls back to its deterministic NBA engine while preserving the same tool trace.

## Agent architecture

The Work-in-Progress branch separates evidence, decisions, and actions:

- `context/` contains synthetic HCP, territory, approved-content, and compliance context.
- `decisioning.mjs` produces explainable next-best actions from those records.
- `hooks.mjs` gates outreach, content selection, and CRM write-back.
- `server.mjs` orchestrates the workflow and keeps the LLM as an optional drafting layer.

The context is modeled like a semantic data platform rather than one profile document:

- `context/dim-hcp.json` and `context/dim-account.json` hold dimensions.
- `context/fact-activity.json` and `context/fact-access.json` hold measurable signals.
- `semantic-view.mjs` joins only the rows needed for a request and returns source provenance.

The interactive agent endpoint is `POST /api/agent`:

```json
{"message":"Show me the list of HCPs I can target"}
```

```json
{"message":"What is the NBA for Rao?"}
```

The deterministic request router handles list, select, and NBA questions without an LLM. The LLM remains an optional reasoning and drafting layer after governed retrieval.

CRM interaction writes are intentionally returned as `pending_confirmation`. The prototype does not perform an external write-back without a future explicit confirmation step.
