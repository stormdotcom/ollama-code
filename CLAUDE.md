# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ollama-code-cli** is a local-first, privacy-focused coding assistant CLI that uses Ollama instead of cloud APIs. It runs entirely on your machine with local LLM models. It has two modes: an interactive terminal REPL (default) and a LAN-accessible web UI (`--serve` flag).

## Build & Run Commands

```bash
# Install dependencies (root + UI)
npm install
cd ui && npm install && cd ..

# Build the Svelte frontend (outputs to public/)
npm run build

# Run CLI mode
node bin/ollama-code.js
# or with global install: ollama-code

# Run web server mode (LAN UI on port 3141)
node bin/ollama-code.js --serve

# Run with a specific model
node bin/ollama-code.js --model deepseek-coder

# Dev server for frontend (hot reload)
cd ui && npm run dev
```

There are no test or lint scripts configured.

## Prerequisites

- Node.js 18+
- Ollama running locally (`ollama serve`)
- At least one model pulled (default: `deepseek-r1:7b`)

## Architecture

### Two-Mode Entry Point

`bin/ollama-code.js` routes to either:
- `src/index.js` → CLI REPL mode (interactive terminal)
- `src/webServer.js` → HTTP server mode (Svelte web UI)

### Backend (src/)

All backend code is plain Node.js ES modules with no runtime dependencies beyond `qrcode-terminal`.

- **index.js** — Main CLI loop, REPL, command routing, agentic tool execution loop (up to 10 iterations)
- **webServer.js** — HTTP server serving `public/`, REST API endpoints, SSE streaming for real-time updates
- **ollamaClient.js** — Ollama API client (streaming chat at `/api/chat`)
- **constants.js** — Configuration (Ollama URL, model, context window) and dynamic system prompt builder
- **security.js** — Command blocklist, file path sandboxing, secret scanner, unleashed mode toggle
- **settings.js** — Load/save `.ollama-code/settings.json` (permission allow/deny rules)
- **sessionStore.js** — File-based session persistence in `.ollama-code/sessions/`
- **contextManager.js** — Token estimation (~3.5 chars/token), auto-pruning, conversation compaction
- **tools/executors.js** — Execute tool calls (read/write/edit/command/search) with permission checks
- **tools/xmlParser.js** — Parse XML-style tool tags from model responses

### Frontend (ui/)

Svelte 4 + TypeScript + Vite app. Build output goes to `public/` which the web server serves as static files.

- **App.svelte** — Main component (chat, sidebar, sessions, QR code)
- **store.ts** — Svelte store for state management, API calls, SSE event handling

### Tool System

The model emits XML tags (`<read_file>`, `<write_file>`, `<edit_file>`, `<execute_command>`, `<search_code>`, `<list_files>`) which are parsed by `xmlParser.js` and executed by `executors.js`. Read-only tools run in parallel. Write/command tools require permission checks.

### Security Layers

1. Hard-blocked command patterns (never reach shell)
2. Settings-based allow/deny rules
3. Interactive user approval prompts (y/n/a/s)
4. Workspace path sandboxing (no escape via `..` or absolute paths)
5. Automatic secret scanning on written files

### Configuration

- **Environment variables**: `OLLAMA_MODEL`, `OLLAMA_BASE_URL`, `OLLAMA_HOST`, `OLLAMA_PORT`, `OLLAMA_TLS`, `OLLAMA_CODE_SERVE_HOST`, `OLLAMA_CODE_SERVE_PORT`, `OLLAMA_CODE_CMD_TIMEOUT`
- **Runtime config**: `.ollama-code/settings.json` for permission rules, `.ollama-code/sessions/` for saved sessions

### Web Server API (--serve mode)

- `GET /api/sessions` — List sessions
- `GET /api/sessions/:id` — Load session
- `POST /api/sessions/:id/message` — Send message (streams NDJSON response)
- `GET /api/sessions/:id/events` — SSE stream for real-time updates
- `DELETE /api/sessions/:id` — Delete session
