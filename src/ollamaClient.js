import { OLLAMA_API_BASE, NUM_CTX } from './constants.js';

/**
 * Stream chat completion from Ollama (OpenAI-compatible /v1/chat/completions).
 * Sends num_ctx for context window. No API key needed.
 * @param {string} model
 * @param {Array<{ role: string, content: string }>} messages
 * @param {function(string): void} onToken
 * @returns {Promise<string>} Full content
 */
export async function streamChat(model, messages, onToken) {
  const res = await fetch(`${OLLAMA_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: 8192,
      num_ctx: NUM_CTX,
    }),
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
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onToken(delta);
          }
        } catch (_) {
          // skip malformed chunk
        }
      }
    }
  }
  if (buffer.startsWith('data: ')) {
    try {
      const parsed = JSON.parse(buffer.slice(6));
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        onToken(delta);
      }
    } catch (_) {}
  }
  return fullContent;
}

/**
 * Non-streaming completion (e.g. for tool follow-up).
 */
export async function chat(model, messages) {
  const res = await fetch(`${OLLAMA_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      max_tokens: 8192,
      num_ctx: NUM_CTX,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}
