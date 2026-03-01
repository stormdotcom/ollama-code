import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from './constants.js';
import { c } from './splash.js';

/**
 * Load .ollama-code/settings.json from the workspace.
 * Format mirrors Claude Code:
 * {
 *   "permissions": {
 *     "allow": [
 *       "Bash(git:*)",
 *       "Bash(dir:*)",
 *       "Bash(npm install:*)",
 *       "Read(*)",
 *       "Write(src/**)"
 *     ],
 *     "deny": [
 *       "Bash(rm:*)"
 *     ]
 *   }
 * }
 *
 * Rule format:
 *   Tool(pattern)
 *   - Tool: Bash, Read, Write, Edit, Search
 *   - pattern: glob-like, * = wildcard
 *   - Bash(git:*) = any command starting with "git"
 *   - Bash(*) = allow all commands (use with caution)
 *   - Read(*) = auto-allow all file reads
 *   - Write(src/**) = auto-allow writes under src/
 */

const DEFAULT_SETTINGS = {
  permissions: {
    allow: [],
    deny: [],
  },
};

let cachedSettings = null;
let settingsPath = null;

export function getSettingsPath(cwd) {
  return join(cwd, CONFIG_DIR, 'settings.json');
}

export function loadSettings(cwd) {
  settingsPath = getSettingsPath(cwd);
  if (existsSync(settingsPath)) {
    try {
      const raw = readFileSync(settingsPath, 'utf8');
      cachedSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      if (!cachedSettings.permissions) cachedSettings.permissions = { allow: [], deny: [] };
      if (!Array.isArray(cachedSettings.permissions.allow)) cachedSettings.permissions.allow = [];
      if (!Array.isArray(cachedSettings.permissions.deny)) cachedSettings.permissions.deny = [];
    } catch {
      cachedSettings = { ...DEFAULT_SETTINGS };
    }
  } else {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  return cachedSettings;
}

export function saveSettings(cwd) {
  const dir = join(cwd, CONFIG_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = getSettingsPath(cwd);
  writeFileSync(path, JSON.stringify(cachedSettings, null, 2) + '\n', 'utf8');
}

export function getSettings() {
  return cachedSettings || DEFAULT_SETTINGS;
}

export function addAllowRule(cwd, rule) {
  if (!cachedSettings) loadSettings(cwd);
  if (!cachedSettings.permissions.allow.includes(rule)) {
    cachedSettings.permissions.allow.push(rule);
    saveSettings(cwd);
  }
}

export function removeAllowRule(cwd, rule) {
  if (!cachedSettings) loadSettings(cwd);
  cachedSettings.permissions.allow = cachedSettings.permissions.allow.filter(r => r !== rule);
  saveSettings(cwd);
}

export function addDenyRule(cwd, rule) {
  if (!cachedSettings) loadSettings(cwd);
  if (!cachedSettings.permissions.deny.includes(rule)) {
    cachedSettings.permissions.deny.push(rule);
    saveSettings(cwd);
  }
}

// ── Rule matching ───────────────────────────────────────────────────────────

/**
 * Parse a rule like "Bash(git:*)" into { tool: "Bash", pattern: "git:*" }
 */
function parseRule(rule) {
  const match = /^(\w+)\((.+)\)$/.exec(rule.trim());
  if (!match) return null;
  return { tool: match[1], pattern: match[2] };
}

/**
 * Check if a command string matches a pattern.
 * Pattern uses : as separator and * as wildcard.
 * "git:*" matches "git status", "git commit -m foo"
 * "npm install:*" matches "npm install express"
 * "*" matches everything
 */
function matchesPattern(value, pattern) {
  if (pattern === '*') return true;
  const cleanPattern = pattern.replace(/:\*$/, '');
  const cleanValue = value.trim();
  if (cleanValue === cleanPattern) return true;
  if (cleanValue.startsWith(cleanPattern + ' ')) return true;
  if (cleanValue.startsWith(cleanPattern + '\t')) return true;
  // glob-like ** for paths
  if (pattern.includes('**')) {
    const prefix = pattern.split('**')[0];
    if (cleanValue.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Check if a tool+value is allowed by the settings.
 * @param {'Bash'|'Read'|'Write'|'Edit'|'Search'} tool
 * @param {string} value - command string or file path
 * @returns {'allow'|'deny'|'prompt'}
 */
export function checkSettingsPermission(tool, value) {
  const settings = getSettings();
  // Check deny rules first
  for (const rule of settings.permissions.deny) {
    const parsed = parseRule(rule);
    if (!parsed) continue;
    if (parsed.tool === tool && matchesPattern(value, parsed.pattern)) return 'deny';
  }
  // Then check allow rules
  for (const rule of settings.permissions.allow) {
    const parsed = parseRule(rule);
    if (!parsed) continue;
    if (parsed.tool === tool && matchesPattern(value, parsed.pattern)) return 'allow';
  }
  return 'prompt';
}

/**
 * Pretty-print settings for /permissions and /settings.
 */
export function printSettings(cwd) {
  const settings = getSettings();
  const path = getSettingsPath(cwd);
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Settings${c.reset} ${c.gray}${path}${c.reset}`);
  console.log('');
  if (settings.permissions.allow.length === 0 && settings.permissions.deny.length === 0) {
    console.log(`  ${c.gray}(no custom rules — using defaults)${c.reset}`);
  }
  if (settings.permissions.allow.length > 0) {
    console.log(`  ${c.green}${c.bold}Allow rules:${c.reset}`);
    for (const rule of settings.permissions.allow) {
      console.log(`    ${c.green}✓${c.reset} ${rule}`);
    }
  }
  if (settings.permissions.deny.length > 0) {
    console.log(`  ${c.red}${c.bold}Deny rules:${c.reset}`);
    for (const rule of settings.permissions.deny) {
      console.log(`    ${c.red}✗${c.reset} ${rule}`);
    }
  }
  console.log('');
}
