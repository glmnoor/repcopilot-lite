# RepCopilot Lite

A clean local agent with no Python, no React, and no package installation. It uses Node 18+ only.

## Run

```powershell
$env:LLM_BASE_URL = "http://localhost:11434/v1"
$env:LLM_MODEL = "llama3.2:3b"
node server.mjs
```

Open `http://localhost:8000`.

It works with any OpenAI-compatible chat-completions endpoint. For a local LLM, use Ollama or LM Studio. For a small cloud model, set `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` to your provider values. The key remains in the local server environment, never in the webpage.

If no model is running, the agent visibly falls back to its deterministic NBA engine while preserving the same tool trace.
