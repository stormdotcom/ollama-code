import { c } from './splash.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL = 60;

let active = null;

/**
 * Start an animated spinner with a label.
 * Only one spinner runs at a time — calling start() while one is active replaces it.
 * @param {string} label - e.g. "Thinking..." or "Running command..."
 * @param {string} color - ANSI color for label
 * @param {{ thinking?: boolean }} opts - If thinking: true, shows "Beaming... (thought for Xs)" in red
 */
export function spinnerStart(label, color = c.cyan, opts = {}) {
  spinnerStop();
  let frame = 0;
  const state = {
    label,
    color,
    thinking: !!opts.thinking,
    timer: null,
    startTime: Date.now(),
  };

  state.timer = setInterval(() => {
    const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
    const spinner = `${c.magenta}${FRAMES[frame % FRAMES.length]}${c.reset}`;
    let text, time;
    if (state.thinking) {
      text = `${c.red}Beaming...${c.reset}`;
      time = `${c.gray}(thought for ${elapsed}s)${c.reset}`;
    } else {
      text = `${state.color}${state.label}${c.reset}`;
      time = `${c.gray}${elapsed}s${c.reset}`;
    }
    process.stdout.write(`\r  ${spinner} ${text} ${time}  `);
    frame++;
  }, INTERVAL);

  active = state;
}

/**
 * Update the label of the currently running spinner.
 */
export function spinnerUpdate(label, color) {
  if (!active) return;
  active.label = label;
  if (color) active.color = color;
}

/**
 * Start the "thinking" spinner: "Beaming... (thought for Xs)" in red.
 */
export function spinnerStartThinking() {
  spinnerStart('Thinking...', c.magenta, { thinking: true });
}

/**
 * Stop the spinner and clear its line.
 * Optionally print a final message on the same line.
 */
export function spinnerStop(finalMessage) {
  if (!active) return;
  clearInterval(active.timer);
  const elapsed = ((Date.now() - active.startTime) / 1000).toFixed(1);
  process.stdout.write('\r\x1b[2K');
  if (finalMessage) {
    console.log(`  ${finalMessage} ${c.gray}${elapsed}s${c.reset}`);
  }
  active = null;
}

/**
 * Run an async function with a spinner showing.
 * Spinner auto-starts with `label` and stops when the function resolves.
 */
export async function withSpinner(label, fn, { color = c.cyan, successLabel, failLabel } = {}) {
  spinnerStart(label, color);
  try {
    const result = await fn();
    spinnerStop(successLabel || `${c.green}✓${c.reset} ${label.replace(/\.{3}$/, '')}`);
    return result;
  } catch (err) {
    spinnerStop(failLabel || `${c.red}✗${c.reset} ${label.replace(/\.{3}$/, '')} — failed`);
    throw err;
  }
}

/**
 * Map of tool tags to user-friendly action labels with icons.
 */
export const ACTION_LABELS = {
  read_file:        { label: 'Reading file...',      icon: '📖', color: c.cyan },
  write_file:       { label: 'Writing file...',      icon: '✏️',  color: c.green },
  edit_file:        { label: 'Editing file...',      icon: '🔧', color: c.yellow },
  execute_command:  { label: 'Running command...',   icon: '⚡', color: c.magenta },
  search_code:      { label: 'Searching code...',    icon: '🔍', color: c.cyan },
  list_files:       { label: 'Listing files...',     icon: '📁', color: c.cyan },
  scan_secrets:     { label: 'Scanning secrets...',  icon: '🔒', color: c.red },
};

/**
 * Start spinner for a specific tool action.
 */
export function spinnerForTool(tag, detail) {
  const action = ACTION_LABELS[tag] || { label: 'Working...', icon: '⚙️', color: c.gray };
  const suffix = detail ? ` ${c.gray}${detail}${c.reset}` : '';
  spinnerStart(`${action.label}${suffix}`, action.color);
}
