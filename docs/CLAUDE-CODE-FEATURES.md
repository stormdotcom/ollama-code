# Claude Code CLI Features → OLLAMA-CODE-CLI Mapping

This document lists **Claude Code CLI** features (from [code.claude.com](https://code.claude.com)) and how **OLLAMA-CODE-CLI** covers them. Use it to see what exists, what’s different, and what’s not implemented (local-only scope).

---

## Built-in slash commands

| Claude Code Command | OLLAMA-CODE-CLI | Notes |
|---------------------|-----------------|--------|
| `/help` | ✅ `/help` | Show commands and tools |
| `/clear` | ✅ `/clear` | Clear conversation history |
| `/exit`, `/quit` | ✅ `/exit`, `/quit`, `/q` | Exit CLI |
| `/model [model]` | ✅ `/model <name>` | Switch model (clears history) |
| `/models` (picker) | ✅ `/models` | List models + **number to switch** (1, 2, 3…) |
| `/permissions`, `/allowed-tools` | ✅ `/permissions`, `/perms` | View permission summary + settings rules |
| `/config`, `/settings` | ✅ `/settings` | Show `.ollama-code/settings.json` rules |
| `/keybindings` | ✅ `/shortcuts`, `/keys`, `/keybindings` | Show keyboard shortcuts (no JSON file) |
| `/compact [instructions]` | ✅ `/compact` | Toggle compact mode (hide model output, show steps only) |
| `/copy` | ❌ | No copy-last-response / code-block picker |
| `/cost` | ❌ | No token/cost tracking (local = no cost) |
| `/diff` | ❌ | No interactive diff viewer |
| `/doctor` | ❌ | No install/settings doctor |
| `/export [filename]` | ❌ | No export conversation |
| `/feedback`, `/bug` | ❌ | No in-CLI feedback (use GitHub issues) |
| `/fork [name]` | ❌ | No conversation fork |
| `/hooks` | ❌ | No hook system |
| `/init` | ❌ | No project init / CLAUDE.md wizard |
| `/keybindings` (edit file) | ⚠️ | We show shortcuts only; no `~/.ollama-code/keybindings.json` |
| `/memory` | ❌ | No CLAUDE.md / auto-memory |
| `/mcp` | ❌ | No MCP servers |
| `/output-style` | ❌ | No output-style switching |
| `/plan` | ❌ | No plan mode |
| `/plugin` | ⚠️ | Repo has plugins dir; not full Claude plugin system |
| `/release-notes` | ❌ | No in-CLI changelog |
| `/rename [name]` | ⚠️ | Use `/save [name]` to name when saving |
| `/resume`, `/continue` | ✅ `/resume <id|#>` | Resume saved session by ID or list number |
| Pause | Implicit | ✅ `/pause [name]` – save session and hint to resume later |
| `/rewind`, `/checkpoint` | ❌ | No rewind/checkpointing |
| `/sandbox` | ❌ | No sandbox toggle (we have path + command rules) |
| `/skills` | ❌ | No skills / custom slash commands |
| `/status` | ⚠️ | Model + version shown at startup; no status tab |
| `/tasks` | ❌ | No background task list |
| `/terminal-setup` | ❌ | No terminal keybinding setup |
| `/theme` | ❌ | No theme picker (fixed ANSI colors) |
| `/usage` | ❌ | No usage/rate limits (local) |
| `/vim` | ❌ | No vim input mode |

---

## Bundled skills (Claude Code)

| Claude Code | OLLAMA-CODE-CLI | Notes |
|-------------|-----------------|--------|
| `/debug [description]` | ❌ | No session debug log / troubleshoot skill |
| `/batch` | ❌ | No parallel worktree/batch refactors |
| `/simplify` | ❌ | No multi-agent simplify/review skill |

Custom skills (`.claude/skills/` or `.claude/commands/`) are not implemented. You can extend behavior via system prompt or project-specific docs.

---

## Keyboard shortcuts

| Claude Code | OLLAMA-CODE-CLI | Notes |
|-------------|-----------------|--------|
| `Ctrl+C` | ✅ | Interrupt generation |
| `Ctrl+D` | ✅ | Exit |
| `Ctrl+L` | ✅ | Clear screen |
| `Ctrl+R` | ✅ | Reverse search (terminal history) |
| `Ctrl+G` | ❌ | No “open in editor” |
| `Ctrl+O` | ❌ | No verbose output toggle |
| `Ctrl+V` / paste image | ❌ | No image paste |
| `Ctrl+B` | ❌ | No background task |
| `Ctrl+T` | ❌ | No task list toggle |
| `Up`/`Down` | ✅ | Command history (readline) |
| `Esc`+`Esc` | ❌ | No rewind/summarize |
| `Shift+Tab` | ❌ | No permission mode cycle |
| `Option+P` / `Alt+P` | ❌ | No model switch without clearing |
| `Option+T` / `Alt+T` | ❌ | No extended-thinking toggle |
| `Ctrl+K` / `Ctrl+U` | ✅ | Kill line / delete to start (terminal) |
| `Ctrl+Y` | ❌ | No paste killed text |
| `Ctrl+A` / `Ctrl+E` | ✅ | Start/end of line (terminal) |
| `Ctrl+W` | ✅ | Delete previous word (terminal) |
| `Ctrl+B` / `Ctrl+F` | ✅ | Character left/right (terminal) |
| `/` at start | ✅ | Slash commands |
| `!` at start | ❌ | No direct bash mode |
| `@` | ❌ | No file path mention/autocomplete |

---

## Tools (model actions)

| Claude Code–style | OLLAMA-CODE-CLI | Notes |
|-------------------|-----------------|--------|
| Read file | ✅ `<read_file>path</read_file>` | Same idea; we use XML tags |
| Write file | ✅ `<write_file>path<ncontent>...</ncontent></write_file>` | Writes to repo |
| Edit file | ✅ `<edit_file>path<search>...</search><replace>...</replace></edit_file>` | Search/replace |
| Run command (Bash) | ✅ `<execute_command>cmd</execute_command>` | With approval (y/n/a/s or 1–4) |
| Grep/search | ✅ `<search_code>pattern</search_code>` | In-repo search |
| — | ✅ `<scan_secrets>path</scan_secrets>` | Extra: secret scanner |

We do **not** have: MCP tools, TaskOutput for background jobs, or separate “allowed tools” UI beyond settings rules.

---

## Permissions and security

| Claude Code | OLLAMA-CODE-CLI | Notes |
|-------------|-----------------|--------|
| Permission prompts (allow/deny) | ✅ | Command approval: y/n/a/s or 1=yes, 2=no, 3=always, 4=save rule |
| Allowed-tools / plan mode | ⚠️ | We have allow/deny in `.ollama-code/settings.json` (Bash, Read, Write patterns) |
| Blocked commands | ✅ | Hard blocklist in `src/security.js` (rm -rf, format, etc.) |
| Path sandbox | ✅ | Workspace-bound; outside = prompt or deny |
| Save rule from prompt | ✅ | `[s]ave rule` or `4` → adds to settings |
| Sandbox mode toggle | ❌ | No separate sandbox flag |

---

## Output and display

| Claude Code | OLLAMA-CODE-CLI | Notes |
|-------------|-----------------|--------|
| Streaming | ✅ | Token-by-token from Ollama |
| Model label on reply | ✅ | `[model-name]` before each reply |
| Code block formatting | ✅ | Boxed code blocks in terminal |
| Syntax highlighting in CLI | ❌ | No syntax highlighting |
| Task list in status area | ❌ | No task list UI |
| PR status in footer | ❌ | No PR/gh integration |

---

## Configuration and storage

| Claude Code | OLLAMA-CODE-CLI | Notes |
|-------------|-----------------|--------|
| Config dir | `.claude/` | `.ollama-code/` |
| Settings | `.claude/settings.json` | `.ollama-code/settings.json` (permissions) |
| Keybindings | `~/.claude/keybindings.json` | Not used; shortcuts are fixed |
| Skills | `.claude/skills/`, `~/.claude/skills/` | Not implemented |
| Memory | `CLAUDE.md`, auto-memory | Not implemented |
| Session resume | Stored sessions | ✅ MongoDB; `/save`, `/sessions`, `/resume`, `/session` |

---

## Summary

- **Implemented in OLLAMA-CODE-CLI:** Core REPL, `/help`, `/clear`, `/exit`, `/model`, `/models` (with number selection), `/permissions`, `/settings`, `/shortcuts`, `/allow`, `/deny`, `/revoke`, `/scan`, `/unleash`, `/compact`; **sessions** (`/session`, `/save`, `/pause`, `/sessions`, `/resume`, `/delete-session`); **RAG** (`/index`, `/search`, `/rag`); **LAN web UI** (`--serve`); file and command tools with approval; blocked commands; path sandbox; streaming; model label; code-block formatting; number choices; input queuing; duplicate command prevention; command timeout.
- **Different:** XML tool tags instead of JSON; no cloud/account; no MCP/skills/plugins; no rewind or fork.
- **Not implemented:** Bundled skills (`/debug`, `/batch`, `/simplify`), vim mode, theme picker, keybindings file, memory/CLAUDE.md, background tasks, diff viewer, copy/last-response, plan mode.

For full OLLAMA-CODE-CLI usage, see the main [README](../README.md).
