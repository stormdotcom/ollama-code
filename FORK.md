# OLLAMA-CODE-CLI Fork

This repository is a **local-first custom fork** of the Claude Code plugins/tooling repo, extended with a CLI that talks to [Ollama](https://ollama.com) instead of cloud APIs.

## Goals

- **Local-only:** No API keys; no code or conversations leave your machine.
- **Ollama:** Uses `http://localhost:11434/v1` (OpenAI-compatible). Works with any model you pull (e.g. `deepseek-r1:7b`, `deepseek-coder`, `llama3.1`).
- **Default model:** `deepseek-r1:7b` unless you pass `--model <name>`.
- **Agentic behavior:** File and command tools are wrapped in XML tags (`<read_file>`, `<write_file>`, `<edit_file>`, `<execute_command>`, `<search_code>`) so local models can invoke them reliably.
- **Pre-flight:** The CLI checks that Ollama is running (GET `http://localhost:11434/api/tags`) before starting a session.

## What’s different from upstream

- Branding: **OLLAMA-CODE-CLI** (splash, docs, version string “Local-First Custom Fork”).
- API: Ollama base URL, optional `num_ctx: 32768`, streaming via `/v1/chat/completions`.
- Tools: XML-based tool protocol instead of JSON tool_calls.
- System prompt: Short “local autonomous developer” prompt focused on code and minimal latency.
- Docs: README, SECURITY, and plugin docs updated for this fork; no cloud or Anthropic-specific install steps.

## Running

1. Install and run [Ollama](https://ollama.com); pull a model, e.g. `ollama pull deepseek-r1:7b`.
2. From this repo: `npm install && npm run build` then `npx ollama-code` (or `ollama-code` if linked).
3. Optional: `ollama-code --model <model-name>`.

See [README.md](README.md) for full instructions.

## Coexistence with Claude Code

OLLAMA-CODE-CLI does not conflict with an existing Claude Code install: it uses the command `ollama-code` (not `claude`), does not use `.claude/` or any Anthropic environment variables, and uses `.ollama-code/` for its own config when needed.
