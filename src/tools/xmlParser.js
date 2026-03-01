/**
 * Parse XML-like tool tags from assistant response.
 * Returns array of { tag, innerText } for each top-level tool tag.
 */
const TAG_NAMES = ['read_file', 'write_file', 'edit_file', 'execute_command', 'search_code', 'list_files', 'scan_secrets'];

function extractTagContent(text, tagName) {
  const results = [];
  const open = `<${tagName}>`;
  const close = `</${tagName}>`;
  let start = 0;
  while (true) {
    const i = text.indexOf(open, start);
    if (i === -1) break;
    const j = text.indexOf(close, i + open.length);
    if (j === -1) break;
    const inner = text.slice(i + open.length, j).trim();
    results.push({ tag: tagName, innerText: inner });
    start = j + close.length;
  }
  return results;
}

/**
 * Parse response and return all tool invocations in order.
 * @param {string} response
 * @returns {Array<{ tag: string, innerText: string }>}
 */
export function parseToolCalls(response) {
  const calls = [];
  for (const tag of TAG_NAMES) {
    calls.push(...extractTagContent(response, tag));
  }
  return calls;
}

/**
 * Extract content for write_file when using <ncontent>...</ncontent> to avoid nesting.
 */
export function parseWriteFileContent(innerText) {
  const ncontentMatch = /<ncontent>([\s\S]*?)<\/ncontent>/i.exec(innerText);
  if (ncontentMatch) {
    return { path: innerText.replace(ncontentMatch[0], '').trim(), content: ncontentMatch[1].trim() };
  }
  const firstLine = innerText.split('\n')[0]?.trim() || '';
  const rest = innerText.slice(firstLine.length).trim();
  return { path: firstLine, content: rest };
}
