# OLLAMA-CODE-CLI

![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square)

OLLAMA-CODE-CLI is a **local-first** coding assistant that runs in your terminal. It uses [Ollama](https://ollama.com) on your machine—no cloud API keys or data leave your computer. It understands your codebase, helps with routine tasks, explains code, and works with git—all through natural language.

<img src="./demo.gif" alt="Demo" />

## No conflict with existing Claude Code

You can run OLLAMA-CODE-CLI alongside an already installed **Claude Code** without conflicts:

| | Claude Code | OLLAMA-CODE-CLI |
|---|-------------|------------------|
| **Command** | `claude` | `ollama-code` |
| **Config directory** | `.claude/` | `.ollama-code/` (optional; we do not use `.claude`) |
| **Environment** | Uses `ANTHROPIC_API_KEY`, etc. | Uses only `OLLAMA_BASE_URL` (optional, default `http://localhost:11434`) |
| **Install location** | Separate (e.g. system path, Cask, WinGet) | This repo or `npm install -g` (different package name) |

We never read or write `.claude/`, and we do not use any Anthropic or Claude-specific environment variables.

---

## Environment variables

OLLAMA-CODE-CLI uses these optional environment variables to talk to Ollama:

| Variable | Description | Default |
|----------|-------------|---------|
| `OLLAMA_BASE_URL` | Full base URL for Ollama (host + port + protocol). Overrides host/port/tls below. | `http://localhost:11434` |
| `OLLAMA_HOST` | Ollama server host (ignored if `OLLAMA_BASE_URL` is set). | `localhost` |
| `OLLAMA_PORT` | Ollama server port (ignored if `OLLAMA_BASE_URL` is set). | `11434` |
| `OLLAMA_TLS` | Set to `1` to use `https` instead of `http` (only when using `OLLAMA_HOST`/`OLLAMA_PORT`). | — |

**Examples**

```bash
# Custom host and port (e.g. Ollama on another machine)
export OLLAMA_HOST=192.168.1.10
export OLLAMA_PORT=11434
ollama-code

# Or set the full URL
export OLLAMA_BASE_URL=http://my-server:11434
ollama-code
```

```powershell
# Windows (PowerShell)
$env:OLLAMA_HOST = "192.168.1.10"
$env:OLLAMA_PORT = "11434"
node bin\ollama-code.js
```

---

## Prerequisites

- **Node.js 18+**
- **[Ollama](https://ollama.com)** installed and running locally (e.g. `ollama serve` or the Ollama app)

Pull a coding model before first use, for example:

```bash
ollama pull qwen2.5-coder:7b
```

## Get started

**Option A — Run locally without npm install (zero dependencies)**

From the repo root (requires only Node.js 18+ and Ollama running):

```bash
node bin/ollama-code.js
```

With a specific model:

```bash
node bin/ollama-code.js --model deepseek-coder
```

To run from any directory, add the repo to your PATH or create a small wrapper script that runs `node /path/to/ollama-code/bin/ollama-code.js "$@"`.

**Option B — Install with npm**

```bash
npm install
npm run build
npx ollama-code
```

Or install globally so the `ollama-code` command is available everywhere:

```bash
npm install -g .
ollama-code
```

**Optional: choose a model** — Default is `qwen2.5-coder:7b`. Override with `--model` (e.g. `ollama-code --model deepseek-coder`).  
**Version** — Run `ollama-code --version` (or `node bin/ollama-code.js --version`) to see the version and "Local-First Custom Fork" label.

---

## Install on Windows

1. **Install Node.js 18+**  
   Download from [nodejs.org](https://nodejs.org) or use Winget: `winget install OpenJS.NodeJS.LTS`

2. **Install and run Ollama**  
   Download from [ollama.com](https://ollama.com) or: `winget install Ollama.Ollama`. Start Ollama (it may run in the background). Pull a model: `ollama pull qwen2.5-coder:7b`

3. **Get the CLI**  
   Clone or download this repo, then open PowerShell or Command Prompt in the repo folder.

4. **Run without npm install** (no dependencies):

   ```powershell
   node bin\ollama-code.js
   ```

   With a model:

   ```powershell
   node bin\ollama-code.js --model deepseek-coder
   ```

5. **Optional: install globally so `ollama-code` works from any folder**

   ```powershell
   npm install -g .
   ollama-code
   ```

   (Requires npm; run from the repo folder.)

6. **Optional: run from any directory without global install**  
   Add the repo’s full path to your user PATH, then run:

   ```powershell
   node "C:\path\to\ollama-code\bin\ollama-code.js" %*
   ```

   Or create a batch file (e.g. `ollama-code.cmd`) somewhere on your PATH:

   ```batch
   @echo off
   node "C:\path\to\ollama-code\bin\ollama-code.js" %*
   ```

   Replace `C:\path\to\ollama-code` with the actual path to this repo.

---

## Install on macOS

1. **Install Node.js 18+**  
   [nodejs.org](https://nodejs.org) or Homebrew: `brew install node`

2. **Install and run Ollama**  
   [ollama.com](https://ollama.com) or Homebrew: `brew install ollama`. Start the Ollama app or run `ollama serve`. Then: `ollama pull qwen2.5-coder:7b`

3. **Get the CLI**  
   Clone or download this repo, then open Terminal in the repo folder.

4. **Run without npm install** (no dependencies):

   ```bash
   node bin/ollama-code.js
   ```

   With a model:

   ```bash
   node bin/ollama-code.js --model deepseek-coder
   ```

5. **Optional: install globally** so `ollama-code` works from any folder:

   ```bash
   npm install -g .
   ollama-code
   ```

6. **Optional: run from any directory** — Add the repo to your PATH or create a wrapper (e.g. in `~/bin/ollama-code`):

   ```bash
   #!/bin/sh
   exec node "/path/to/ollama-code/bin/ollama-code.js" "$@"
   ```

   Then `chmod +x ~/bin/ollama-code` and ensure `~/bin` is in your PATH.

---

## Install on Linux (Ubuntu)

1. **Install Node.js 18+**  
   [nodejs.org](https://nodejs.org) or NodeSource:

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Install and run Ollama**  
   Follow [Ollama Linux install](https://ollama.com/download/linux) or:

   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ollama serve   # or start the ollama service
   ollama pull qwen2.5-coder:7b
   ```

3. **Get the CLI**  
   Clone or download this repo, then open a terminal in the repo folder.

4. **Run without npm install** (no dependencies):

   ```bash
   node bin/ollama-code.js
   ```

   With a model:

   ```bash
   node bin/ollama-code.js --model deepseek-coder
   ```

5. **Optional: install globally** so `ollama-code` works from any folder:

   ```bash
   npm install -g .
   ollama-code
   ```

6. **Optional: run from any directory** — Add the repo to your PATH or create a wrapper (e.g. `~/bin/ollama-code`):

   ```bash
   #!/bin/bash
   exec node "/path/to/ollama-code/bin/ollama-code.js" "$@"
   ```

   Then `chmod +x ~/bin/ollama-code` and ensure `~/bin` is in your PATH.

---

## Plugins

This repository includes plugins that extend the CLI with custom commands and agents. See the [plugins directory](./plugins/README.md) for documentation.

## Reporting bugs

Open a [GitHub issue](https://github.com/your-org/ollama-code/issues) or use the `/bug` command inside the CLI.

## Privacy

All processing is **local**. No code or conversation data is sent to the cloud. See [SECURITY.md](./SECURITY.md) for how to report security issues.
