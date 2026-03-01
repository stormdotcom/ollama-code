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
  console.log(c.magenta + c.bold + '          C O D E   C L I' + c.reset);
  console.log(c.gray + '     Local-First Agentic Coding with Ollama' + c.reset);
  console.log(bar);
  console.log('');
  console.log(`  ${c.cyan}Model   ${c.reset}${c.bold}${model}${c.reset}`);
  console.log(`  ${c.cyan}Version ${c.reset}${c.gray}${version} (Local-First Custom Fork)${c.reset}`);
  console.log(`  ${c.cyan}Server  ${c.reset}${c.gray}${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}${c.reset}`);
  console.log('');
  console.log(`  ${c.green}Type a task${c.reset} or use ${c.yellow}/help${c.reset} for commands.`);
  console.log(`  ${c.gray}Tools: read_file, write_file, edit_file, execute_command, search_code${c.reset}`);
  console.log(bar);
  console.log('');
}

export function printVersion(version) {
  console.log(`${c.magenta}${c.bold}ollama-code-cli${c.reset} ${version} (${c.cyan}Local-First Custom Fork${c.reset})`);
}

export function printHelp() {
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Commands${c.reset}`);
  console.log(`  ${c.yellow}/help${c.reset}           Show this help`);
  console.log(`  ${c.yellow}/model <name>${c.reset}   Switch model mid-session`);
  console.log(`  ${c.yellow}/models${c.reset}         List models available in Ollama`);
  console.log(`  ${c.yellow}/tools${c.reset}          List available tools`);
  console.log(`  ${c.yellow}/permissions${c.reset}     Show current permission levels`);
  console.log(`  ${c.yellow}/settings${c.reset}       Show .ollama-code/settings.json rules`);
  console.log(`  ${c.yellow}/allow <rule>${c.reset}   Add allow rule (e.g. /allow Bash(git:*))`);
  console.log(`  ${c.yellow}/deny <rule>${c.reset}    Add deny rule`);
  console.log(`  ${c.yellow}/revoke <rule>${c.reset}  Remove a rule`);
  console.log(`  ${c.yellow}/clear${c.reset}          Clear conversation history`);
  console.log(`  ${c.yellow}/scan <file>${c.reset}    Scan a file for hardcoded secrets`);
  console.log(`  ${c.yellow}/unleash${c.reset}        Toggle unleashed mode (security research)`);
  console.log(`  ${c.yellow}/shortcuts${c.reset}      Show keyboard shortcuts`);
  console.log(`  ${c.yellow}/exit${c.reset}           Quit (also: /quit, /q, exit, quit, q)`);
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Tools${c.reset}  (model uses XML tags automatically)`);
  console.log(`  ${c.cyan}<read_file>${c.reset}       Read a file from disk`);
  console.log(`  ${c.cyan}<write_file>${c.reset}      Create or overwrite a file`);
  console.log(`  ${c.cyan}<edit_file>${c.reset}       Edit a file with search/replace`);
  console.log(`  ${c.cyan}<execute_command>${c.reset} Run a shell command ${c.red}(requires approval)${c.reset}`);
  console.log(`  ${c.cyan}<search_code>${c.reset}     Search files for a pattern`);
  console.log('');
  console.log(`  ${c.gray}Tip: Use numbers to choose options — e.g. /models then type 1, 2, 3… to switch; approval prompts accept 1=yes, 2=no, 3=always, 4=save${c.reset}`);
  console.log(`  ${c.gray}Tip: You can queue another instruction while a task is running — just type and press Enter; it will run after the current one.${c.reset}`);
  console.log('');
}

export function printTools() {
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Available Tools${c.reset}`);
  console.log(`  ${c.cyan}read_file${c.reset}        Read file contents`);
  console.log(`  ${c.cyan}write_file${c.reset}       Create / overwrite file`);
  console.log(`  ${c.cyan}edit_file${c.reset}        Search-and-replace edit`);
  console.log(`  ${c.cyan}execute_command${c.reset}  Shell command ${c.red}(confirm first)${c.reset}`);
  console.log(`  ${c.cyan}search_code${c.reset}      Grep-like code search`);
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
