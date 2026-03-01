import { c } from './splash.js';

/**
 * Line-buffered formatter for CLI: detects markdown code blocks and prints
 * them with clear borders and colors. Keeps [model] prompt-style output clear.
 */
export function createStreamFormatter(write, modelLabel) {
  let lineBuffer = '';
  let inCodeBlock = false;
  let codeLang = '';
  let lineCount = 0;

  function flushLine(line) {
    const trimmed = line.trimEnd();
    if (inCodeBlock) {
      if (trimmed.startsWith('```')) {
        inCodeBlock = false;
        write(`${c.gray}  └${'─'.repeat(58)}${c.reset}\n`);
        return;
      }
      write(`${c.cyan}  │ ${c.reset}${c.gray}${trimmed}${c.reset}\n`);
      return;
    }
    if (trimmed.startsWith('```')) {
      const match = trimmed.match(/^```(\w*)/);
      codeLang = (match && match[1]) ? match[1] : 'code';
      inCodeBlock = true;
      write(`${c.gray}  ┌${'─'.repeat(58)} ${c.cyan}${codeLang}${c.reset}\n`);
      return;
    }
    write(`${c.magenta}${trimmed}${c.reset}\n`);
  }

  return {
    /**
     * Push a token; flushes complete lines with formatting.
     */
    push(token) {
      lineBuffer += token;
      let idx;
      while ((idx = lineBuffer.indexOf('\n')) !== -1) {
        const line = lineBuffer.slice(0, idx);
        lineBuffer = lineBuffer.slice(idx + 1);
        flushLine(line);
        lineCount++;
      }
    },

    /**
     * Flush any remaining buffer (no trailing newline).
     */
    flush() {
      if (lineBuffer.length > 0) {
        if (inCodeBlock) {
          write(`${c.cyan}  │ ${c.reset}${c.gray}${lineBuffer.trimEnd()}${c.reset}\n`);
          inCodeBlock = false;
          write(`${c.gray}  └${'─'.repeat(58)}${c.reset}\n`);
        } else {
          write(`${c.magenta}${lineBuffer}${c.reset}`);
        }
        lineBuffer = '';
      }
    },

    /**
     * Write raw (e.g. for first token before newline) — use when not using line buffer.
     */
    writeRaw(text) {
      write(`${c.magenta}${text}${c.reset}`);
    },
  };
}

/**
 * Format a full string for CLI: add newline after user prompt, model label, then content.
 * Used when we have the full response and want to print it once (e.g. after interrupt).
 */
export function formatAssistantBlock(modelName, content) {
  const lines = content.split('\n');
  const out = [];
  let inCode = false;
  let codeLang = '';
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) {
        const m = line.match(/^```(\w*)/);
        codeLang = (m && m[1]) ? m[1] : 'code';
        out.push(`${c.gray}  ┌${'─'.repeat(58)} ${c.cyan}${codeLang}${c.reset}`);
      } else {
        out.push(`${c.gray}  └${'─'.repeat(58)}${c.reset}`);
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(`${c.cyan}  │ ${c.reset}${c.gray}${line}${c.reset}`);
    } else {
      out.push(`${c.magenta}${line}${c.reset}`);
    }
  }
  if (inCode) out.push(`${c.gray}  └${'─'.repeat(58)}${c.reset}`);
  return `${c.cyan}[${modelName}]${c.reset}\n${out.join('\n')}\n`;
}
