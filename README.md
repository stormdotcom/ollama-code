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

## Prerequisites

- **Node.js 18+**
- **[Ollama](https://ollama.com)** installed and running locally (e.g. `ollama serve` or the Ollama app)

Pull a coding model before first use, for example:

```bash
ollama pull qwen2.5-coder:7b
```

## Get started

1. **Install from source**

   ```bash
   npm install
   npm run build
   ```

2. **Run the CLI**

   From your project directory:

   ```bash
   npx ollama-code
   ```

   Or after linking/installing globally:

   ```bash
   ollama-code
   ```

3. **Optional: choose a model**

   Default model is `qwen2.5-coder:7b`. Override with `--model`:

   ```bash
   ollama-code --model deepseek-coder
   ollama-code --model llama3.1
   ```

   Use any model you have pulled in Ollama (e.g. `qwen2.5-coder:7b`, `deepseek-v3`, `llama3.1`).

4. **Version**

   ```bash
   ollama-code --version
   ```

   Shows the CLI version and identifies this as a **Local-First Custom Fork**.

## Plugins

This repository includes plugins that extend the CLI with custom commands and agents. See the [plugins directory](./plugins/README.md) for documentation.

## Reporting bugs

Open a [GitHub issue](https://github.com/your-org/ollama-code/issues) or use the `/bug` command inside the CLI.

## Privacy

All processing is **local**. No code or conversation data is sent to the cloud. See [SECURITY.md](./SECURITY.md) for how to report security issues.
