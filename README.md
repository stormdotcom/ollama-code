# OLLAMA-CODE-CLI

![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square)

OLLAMA-CODE-CLI is a **local-first, agentic** coding assistant that runs in your terminal. It uses [Ollama](https://ollama.com) on your machine—no cloud API keys or data leave your computer. You give it a task in natural language; it uses tools (read, write, edit, run commands, search) in a loop until the job is done. It understands your codebase, writes directly into it, and works with git—all driven by your instructions.

<img src="./demo.gif" alt="Demo" />

---

## Privacy & Data Sovereignty First

Your code never leaves your environment. Unlike cloud-based AI tools, Ollama Code processes everything locally through your own Ollama server, ensuring:

- **Complete Privacy:** No data transmission to external services
- **Data Sovereignty:** Full control over your models and processing
- **Offline Capability:** Work without internet dependency once models are downloaded
- **Enterprise Ready:** Perfect for sensitive codebases and air-gapped environments

---

## No conflict with existing Claude Code

You can run OLLAMA-CODE-CLI alongside an already installed **Claude Code** without conflicts:

| | Claude Code | OLLAMA-CODE-CLI |
|---|-------------|------------------|
| **Command** | `claude` | `ollama-code` |
| **Config directory** | `.claude/` | `.ollama-code/` (optional; we do not use `.claude`) |
| **Environment** | Uses `ANTHROPIC_API_KEY`, etc. | Uses only `OLLAMA_BASE_URL` (optional, default `http://localhost:11434`) |
| **Install location** | Separate (e.g. system path, Cask, WinGet) | This repo or `npm install -g` (different package name) |

We never read or write `.claude/`, and we do not use any Anthropic or Claude-specific environment variables.

For a **feature-by-feature comparison** with Claude Code CLI (slash commands, shortcuts, tools, permissions), see [docs/CLAUDE-CODE-FEATURES.md](docs/CLAUDE-CODE-FEATURES.md).

---

## Environment variables

OLLAMA-CODE-CLI uses these optional environment variables to talk to Ollama:

| Variable | Description | Default |
|----------|-------------|---------|
| `OLLAMA_MODEL` | Default model (instead of `deepseek-r1:7b`). | `deepseek-r1:7b` |
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
ollama pull deepseek-r1:7b
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

**Optional: choose a model** — Default is `deepseek-r1:7b`. Override with `--model` (e.g. `ollama-code --model deepseek-coder`).  
**Version** — Run `ollama-code --version` (or `node bin/ollama-code.js --version`) to see the version and "Local-First Custom Fork" label.

---

## ⚠️ Quality Considerations

**Important:** This tool uses local Ollama models which may have different capabilities compared to cloud-based models:

- **Smaller models** (7B–14B parameters) may provide less accurate results than larger cloud models
- **Response quality** varies significantly based on your chosen model and hardware
- **Complex reasoning tasks** may require larger models (70B+) for optimal results
- **Consider your use case:** Test with your specific workflows to ensure model suitability

---

## Install on Windows

1. **Install Node.js 18+**  
   Download from [nodejs.org](https://nodejs.org) or use Winget: `winget install OpenJS.NodeJS.LTS`

2. **Install and run Ollama**  
   Download from [ollama.com](https://ollama.com) or: `winget install Ollama.Ollama`. Start Ollama (it may run in the background). Pull a model: `ollama pull deepseek-r1:7b`

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
   [ollama.com](https://ollama.com) or Homebrew: `brew install ollama`. Start the Ollama app or run `ollama serve`. Then: `ollama pull deepseek-r1:7b`

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
   ollama pull deepseek-r1:7b
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

## Agentic behavior

The CLI runs as an **agentic coder**: you describe a task, and the model can use tools repeatedly until it’s done.

1. You send a message (e.g. “add a health check endpoint to the API”).
2. The model may reply with tool tags: `<read_file>`, `<write_file>`, `<edit_file>`, `<execute_command>`, `<search_code>`.
3. The CLI runs those tools and feeds the results back to the model.
4. The model can reply again with more tool calls or a final answer. This loop continues for up to 10 rounds (or until the model stops emitting tools).

So the result you get is **agentic**: the model reads files, edits code, and runs commands in your repo by itself, only pausing to ask when a shell command needs your approval.

---

## CLI commands

Inside the CLI, use these slash commands:

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/model <name>` | Switch model mid-session (clears history) |
| `/models` | List all models pulled in Ollama |
| `/tools` | List available tools |
| `/shortcuts` | Show keyboard shortcuts (also `/keys`, `/keybindings`) |
| `/scan <file>` | Scan a file for hardcoded secrets |
| `/permissions` | Show current permission levels |
| `/settings` | Show `.ollama-code/settings.json` rules |
| `/allow <rule>` | Add an allow rule (e.g. `/allow Bash(git:*)`) |
| `/deny <rule>` | Add a deny rule |
| `/revoke <rule>` | Remove a rule |
| `/clear` | Clear conversation history |
| `/exit` | Quit (also `/quit`, `/q`, `exit`, `quit`, `q`) |

---

## Keyboard shortcuts

These shortcuts work inside the OLLAMA-CODE-CLI prompt, similar to Claude Code:

### Core

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Ctrl+C` | Interrupt / cancel current generation |
| `Ctrl+D` | Exit the CLI |
| `Ctrl+L` | Clear terminal screen |

### Input editing

| Shortcut | Action |
|----------|--------|
| `Ctrl+A` | Move cursor to start of line |
| `Ctrl+E` | Move cursor to end of line |
| `Ctrl+U` | Delete from cursor to start of line |
| `Ctrl+K` | Delete from cursor to end of line |
| `Ctrl+W` | Delete previous word |
| `Ctrl+B` / `Left` | Move cursor left |
| `Ctrl+F` / `Right` | Move cursor right |

### History

| Shortcut | Action |
|----------|--------|
| `Up` | Previous input |
| `Down` | Next input |
| `Ctrl+R` | Search command history (terminal-level) |

> **Tip:** Type `/shortcuts` inside the CLI to see all shortcuts at any time.

---

## Security

### Command approval

Every `<execute_command>` the model produces requires your approval before it runs. You'll see the command and can choose:
- **y** (yes, run it)
- **n** (no, deny)
- **a** (always, auto-approve for this session)

### Blocked commands

Dangerous commands are blocked outright and never reach your shell (e.g. `rm -rf /`, `format C:`, `shutdown`, `Invoke-Expression`, `mimikatz`, and more). The full list is in `src/security.js`.

### Path sandbox

File tools (`read_file`, `write_file`, `edit_file`) cannot escape your working directory. Paths with `..` or absolute paths outside `cwd` are denied.

### Secret scanner

Files written or edited are automatically scanned for hardcoded secrets (AWS keys, GitHub tokens, private keys, connection strings, etc.). You can also scan manually with `/scan <file>`.

### Settings file (`.ollama-code/settings.json`)

Create `.ollama-code/settings.json` in your project root to pre-approve or deny specific commands and file operations, similar to Claude Code's `settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(dir:*)",
      "Bash(git:*)",
      "Bash(npm install:*)",
      "Bash(pip install:*)",
      "Bash(python -m pytest:*)",
      "Bash(python main.py:*)",
      "Read(*)",
      "Write(src/**)"
    ],
    "deny": [
      "Bash(rm:*)"
    ]
  }
}
```

**Rule format:** `Tool(pattern)` where:

| Tool | Matches |
|------|---------|
| `Bash(git:*)` | Any command starting with `git` (e.g. `git status`, `git commit`) |
| `Bash(npm install:*)` | Any command starting with `npm install` |
| `Bash(*)` | All commands (use with caution) |
| `Read(*)` | All file reads (including outside workspace) |
| `Write(src/**)` | Writes under `src/` |

**Manage rules from the CLI:**

```
/allow Bash(git:*)          # add an allow rule
/allow Bash(python:*)       # auto-approve python commands
/deny Bash(rm:*)            # block rm commands
/revoke Bash(git:*)         # remove a rule
/settings                   # show all rules
/permissions                # show full permission summary
```

When a command is prompted and you choose **[s]ave rule**, the CLI auto-detects the command prefix and saves a `Bash(prefix:*)` rule to your settings file.

---

## Personas (quick-launch aliases)

Set up one-word commands to launch the CLI with different models.

### Windows (PowerShell)

Open your profile with `notepad $PROFILE` and add:

```powershell
# Hacking persona: payload / exploit generation (uncensored)
function h-code { node "D:\code\future-tools\ollama-code\bin\ollama-code.js" --model dolphin-mistral @args }

# Reasoning persona: logic / binary analysis
function r-code { node "D:\code\future-tools\ollama-code\bin\ollama-code.js" --model deepseek-r1:7b @args }

# Dev persona: general coding (uncensored)
function d-code { node "D:\code\future-tools\ollama-code\bin\ollama-code.js" --model llama2-uncensored @args }
```

Save, then restart PowerShell (or run `. $PROFILE`). Now use:

```powershell
h-code    # starts with dolphin-mistral
r-code    # starts with deepseek-r1:7b
d-code    # starts with llama2-uncensored
```

> **Important:** Use `@args` (not `$args`) inside functions so extra flags pass through correctly.

> **Note:** PowerShell does **not** support `alias` for commands with arguments. You must use `function` as shown above.

### macOS / Linux (bash / zsh)

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Hacking persona
h-code() { node "/path/to/ollama-code/bin/ollama-code.js" --model dolphin-mistral "$@"; }

# Reasoning persona
r-code() { node "/path/to/ollama-code/bin/ollama-code.js" --model deepseek-r1:7b "$@"; }

# Dev persona
d-code() { node "/path/to/ollama-code/bin/ollama-code.js" --model llama2-uncensored "$@"; }
```

Then `source ~/.bashrc` (or restart the terminal).

### Switch mid-session

You can also switch models inside the CLI at any time:

```
/model dolphin-mistral
/model deepseek-r1:7b
/models              # list all pulled models
```

---

## Plugins

This repository includes plugins that extend the CLI with custom commands and agents. See the [plugins directory](./plugins/README.md) for documentation.

## Reporting bugs

Open a [GitHub issue](https://github.com/your-org/ollama-code/issues) or use the `/bug` command inside the CLI.

## Privacy

All processing is **local**. No code or conversation data is sent to the cloud. See [SECURITY.md](./SECURITY.md) for how to report security issues.
