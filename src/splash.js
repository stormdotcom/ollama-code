import { networkInterfaces } from 'os';

/** Get the first non-internal IPv4 LAN address. */
export function getLanAddress() {
  try {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch { /* ignore */ }
  return '127.0.0.1';
}

/** ANSI escape codes — zero dependencies. */
export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  // foreground
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  // background
  bgBlack: '\x1b[40m',
  bgMagenta: '\x1b[45m',
};

const W = 52;
const bar = c.magenta + '━'.repeat(W) + c.reset;

export function printSplash(model, version) {
  const lanIp = getLanAddress();
  const port = process.env.OLLAMA_CODE_SERVE_PORT || '3141';
  console.log('');
  console.log(bar);
  console.log(c.brightWhite + c.bold + `
   ██████╗ ██╗     ██╗      █████╗ ███╗   ███╗ █████╗
  ██╔═══██╗██║     ██║     ██╔══██╗████╗ ████║██╔══██╗
  ██║   ██║██║     ██║     ███████║██╔████╔██║███████║
  ██║   ██║██║     ██║     ██╔══██║██║╚██╔╝██║██╔══██║
  ╚██████╔╝███████╗███████╗██║  ██║██║ ╚═╝ ██║██║  ██║
   ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝
` + c.reset);
  console.log(c.magenta + c.bold + '          C O D E   C L I' + c.reset + `  ${c.brightCyan}${c.bold}v${version}${c.reset}`);
  console.log(c.gray + '     Local-First Agentic Coding with Ollama' + c.reset);
  console.log(bar);
  console.log('');
  console.log(`  ${c.cyan}Model  ${c.reset} ${c.bold}${model}${c.reset}`);
  console.log(`  ${c.cyan}Server ${c.reset} ${c.gray}${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}${c.reset}`);
  console.log(`  ${c.cyan}LAN    ${c.reset} ${c.underline}http://${lanIp}:${port}${c.reset} ${c.gray}(--serve to enable web UI)${c.reset}`);
  console.log('');
  console.log(`  ${c.green}Type a task${c.reset} or ${c.yellow}/help${c.reset} for commands.  ${c.dim}Ctrl+D to quit.${c.reset}`);
  console.log(bar);
  console.log('');
}

export function printVersion(version) {
  console.log(`${c.magenta}${c.bold}ollama-code-cli${c.reset} ${version} (${c.cyan}Local-First Custom Fork${c.reset})`);
}

export function printHelp() {
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Commands${c.reset}`);
  console.log(`  ${c.yellow}/help${c.reset}              Show this help`);
  console.log(`  ${c.yellow}/model <name>${c.reset}      Switch model mid-session`);
  console.log(`  ${c.yellow}/models${c.reset}            List models available in Ollama`);
  console.log(`  ${c.yellow}/tools${c.reset}             List available tools`);
  console.log(`  ${c.yellow}/compact${c.reset}           Summarize and compress conversation (reclaim context)`);
  console.log(`  ${c.yellow}/compact display${c.reset}   Toggle compact output mode (hide model output)`);
  console.log(`  ${c.yellow}/usage${c.reset}             Show token usage and context stats`);
  console.log(`  ${c.yellow}/clear${c.reset}             Clear conversation history`);
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Sessions${c.reset} ${c.gray}(MongoDB or file-based fallback)${c.reset}`);
  console.log(`  ${c.yellow}/session${c.reset}           Show current session ID and LAN URL`);
  console.log(`  ${c.yellow}/save [name]${c.reset}       Save current session`);
  console.log(`  ${c.yellow}/pause [name]${c.reset}      Save and pause (resume later with /resume)`);
  console.log(`  ${c.yellow}/sessions${c.reset}          List saved sessions`);
  console.log(`  ${c.yellow}/resume <id|#>${c.reset}    Resume a saved session`);
  console.log(`  ${c.yellow}/delete-session${c.reset}    Delete a saved session`);
  console.log('');
  console.log(`  ${c.magenta}${c.bold}RAG (ChromaDB)${c.reset}`);
  console.log(`  ${c.yellow}/index${c.reset}             Index project into ChromaDB for semantic search`);
  console.log(`  ${c.yellow}/search <query>${c.reset}    Semantic search your codebase`);
  console.log(`  ${c.yellow}/rag${c.reset}               Toggle RAG context injection on/off`);
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Security & Permissions${c.reset}`);
  console.log(`  ${c.gray}  When a command needs approval:${c.reset}`);
  console.log(`  ${c.gray}    ${c.green}[y]${c.reset}${c.gray} yes once  ${c.cyan}[a]${c.reset}${c.gray} always (save rule)  ${c.magenta}[!]${c.reset}${c.gray} all cmds  ${c.red}[n]${c.reset}${c.gray} deny${c.reset}`);
  console.log(`  ${c.gray}  Rules saved to .ollama-code/settings.json persist across sessions${c.reset}`);
  console.log('');
  console.log(`  ${c.yellow}/permissions${c.reset}       Show current permission levels`);
  console.log(`  ${c.yellow}/settings${c.reset}          Show .ollama-code/settings.json rules`);
  console.log(`  ${c.yellow}/allow <rule>${c.reset}      Add allow rule (e.g. /allow Bash(git:*))`);
  console.log(`  ${c.yellow}/deny <rule>${c.reset}       Add deny rule`);
  console.log(`  ${c.yellow}/revoke <rule>${c.reset}     Remove a rule`);
  console.log(`  ${c.yellow}/scan <file>${c.reset}       Scan a file for hardcoded secrets`);
  console.log(`  ${c.yellow}/unleash${c.reset}           Toggle unleashed mode (security research)`);
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Other${c.reset}`);
  console.log(`  ${c.yellow}/shortcuts${c.reset}         Show keyboard shortcuts`);
  console.log(`  ${c.yellow}/exit${c.reset}              Quit (also: /quit, /q, exit, quit, q)`);
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Tools${c.reset}  (model uses XML tags automatically)`);
  console.log(`  ${c.cyan}<read_file>${c.reset}       Read a file from disk`);
  console.log(`  ${c.cyan}<write_file>${c.reset}      Create or overwrite a file`);
  console.log(`  ${c.cyan}<edit_file>${c.reset}       Edit a file with search/replace`);
  console.log(`  ${c.cyan}<execute_command>${c.reset} Run a shell command ${c.red}(requires approval)${c.reset}`);
  console.log(`  ${c.cyan}<search_code>${c.reset}     Search files for a pattern`);
  console.log(`  ${c.cyan}<list_files>${c.reset}      List/glob project files`);
  console.log('');
  console.log(`  ${c.gray}Tip: Use numbers to choose options — e.g. /models then type 1, 2, 3…${c.reset}`);
  console.log(`  ${c.gray}Tip: You can queue instructions while a task is running.${c.reset}`);
  console.log(`  ${c.gray}Flags: --compact, --model <name>, --unleashed, --resume <id>, --serve, --no-sessions, --no-rag${c.reset}`);
  console.log('');
}

export function printTools() {
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Available Tools${c.reset}`);
  console.log(`  ${c.cyan}read_file${c.reset}        Read file contents`);
  console.log(`  ${c.cyan}write_file${c.reset}       Create / overwrite file`);
  console.log(`  ${c.cyan}edit_file${c.reset}        Search-and-replace edit (multi-edit supported)`);
  console.log(`  ${c.cyan}execute_command${c.reset}  Shell command ${c.red}(confirm first)${c.reset}`);
  console.log(`  ${c.cyan}search_code${c.reset}      Grep-like code search`);
  console.log(`  ${c.cyan}list_files${c.reset}       List/glob files (e.g. *.js, src/**)`);
  console.log(`  ${c.cyan}scan_secrets${c.reset}     Scan for hardcoded secrets`);
  console.log('');
}

export function printShortcuts() {
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Keyboard Shortcuts${c.reset}`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Core${c.reset}`);
  console.log(`  ${c.yellow}Enter${c.reset}             Send message`);
  console.log(`  ${c.yellow}Ctrl+C${c.reset}            Cancel current generation / interrupt`);
  console.log(`  ${c.yellow}Ctrl+D${c.reset}            Exit the CLI`);
  console.log(`  ${c.yellow}Ctrl+L${c.reset}            Clear terminal screen`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Input editing${c.reset}`);
  console.log(`  ${c.yellow}Ctrl+A${c.reset}            Move cursor to start of line`);
  console.log(`  ${c.yellow}Ctrl+E${c.reset}            Move cursor to end of line`);
  console.log(`  ${c.yellow}Ctrl+U${c.reset}            Delete from cursor to start of line`);
  console.log(`  ${c.yellow}Ctrl+K${c.reset}            Delete from cursor to end of line`);
  console.log(`  ${c.yellow}Ctrl+W${c.reset}            Delete previous word`);
  console.log(`  ${c.yellow}Ctrl+B${c.reset} / ${c.yellow}Left${c.reset}     Move cursor left`);
  console.log(`  ${c.yellow}Ctrl+F${c.reset} / ${c.yellow}Right${c.reset}    Move cursor right`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}History${c.reset}`);
  console.log(`  ${c.yellow}Up${c.reset}                Previous input`);
  console.log(`  ${c.yellow}Down${c.reset}              Next input`);
  console.log(`  ${c.yellow}Ctrl+R${c.reset}            Search command history (terminal)`);
  console.log('');
  console.log(`  ${c.cyan}${c.bold}Quick commands${c.reset}`);
  console.log(`  ${c.yellow}Ctrl+D${c.reset}            Exit (same as /exit)`);
  console.log(`  ${c.gray}Type /help for slash commands${c.reset}`);
  console.log('');
}

// Styled output helpers
export const style = {
  user(text) { return `${c.green}${c.bold}You: ${c.reset}${text}`; },
  assistant(text) { return `${c.magenta}${text}${c.reset}`; },
  tool(label, text) { return `${c.cyan}${c.bold}[${label}]${c.reset} ${text}`; },
  toolResult(text) { return `${c.gray}${text}${c.reset}`; },
  error(text) { return `${c.red}${c.bold}${text}${c.reset}`; },
  warn(text) { return `${c.yellow}${text}${c.reset}`; },
  info(text) { return `${c.gray}${text}${c.reset}`; },
  success(text) { return `${c.green}${text}${c.reset}`; },
  prompt() { return `${c.green}${c.bold}You: ${c.reset}`; },
  thinking() { return `${c.magenta}${c.dim}Thinking...${c.reset}`; },
  modelLabel(model) { return `${c.cyan}[${model}]${c.reset}`; },
};

// ── CLI look & feel (agent-style bullets, status, running command) ─────────
export const cliTheme = {
  /** Bullet for agent line (e.g. "• Model (working)") */
  bullet: '•',
  /** Green bullet for active/running process */
  bulletActive() { return `${c.green}•${c.reset}`; },
  /** Nested status line: "  L Message (shortcuts)" */
  statusLine(msg, shortcuts = '') {
    const suffix = shortcuts ? ` ${c.dim}· ${shortcuts}${c.reset}` : '';
    return `  ${c.gray}L${c.reset} ${msg}${suffix}`;
  },
  /** Running command line: ":. Running command... <cmd> [duration]s" */
  runningCommand(cmd, durationSec = null) {
    const cmdShort = (cmd || '').trim().split('\n')[0].slice(0, 72);
    const duration = durationSec != null ? ` ${c.gray}${durationSec}s${c.reset}` : '';
    return `  ${c.cyan}:.${c.reset} ${c.dim}Running command...${c.reset} ${cmdShort}${duration}`;
  },
  /** Footer when task is running */
  taskFooter(taskName = 'Task') {
    return `  ${c.gray}${taskName} (running) · Ctrl+C to interrupt${c.reset}`;
  },
  /** First-line prefix for assistant (bullet + model) */
  assistantPrefix(model) {
    return `${c.green}•${c.reset} ${c.cyan}[${model}]${c.reset} `;
  },
};
