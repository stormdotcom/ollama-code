import { OLLAMA_BASE_URL, NUM_CTX } from './constants.js';

/**
 * Stream chat from Ollama native /api/chat endpoint.
 * Uses Ollama-specific params (num_ctx, keep_alive, temperature).
 * Native endpoint streams JSON objects (one per line), not SSE.
 * @param {string} model
 * @param {Array<{ role: string, content: string }>} messages
 * @param {function(string): void} onToken
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<string>} Full content
 */
export async function streamChat(model, messages, onToken, options = {}) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      options: {
        num_ctx: NUM_CTX,
        temperature: 0.4,
        num_predict: 512,
        num_batch: 128,
        repeat_penalty: 1.1,
        low_vram: true,
      },
      keep_alive: '10m',
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        const content = parsed.message?.content;
        if (content) {
          fullContent += content;
          onToken(content);
        }
      } catch (_) {
        // skip malformed chunk
      }
    }
  }
  // Process remaining buffer
  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer);
      const content = parsed.message?.content;
      if (content) {
        fullContent += content;
        onToken(content);
      }
    } catch (_) {}
  }
  return fullContent;
}

/**
 * Non-streaming completion (e.g. for tool follow-up).
 */
export async function chat(model, messages) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        num_ctx: NUM_CTX,
        temperature: 0.4,
        num_predict: 512,
        num_batch: 128,
        repeat_penalty: 1.1,
        low_vram: true,
      },
      keep_alive: '10m',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.message?.content ?? '';
}
