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

CRM interaction writes are intentionally returned as `pending_confirmation`. The prototype does not perform an external write-back without a future explicit confirmation step.
