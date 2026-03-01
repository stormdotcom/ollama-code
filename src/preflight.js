import { OLLAMA_BASE_URL } from './constants.js';

/**
 * Verify Ollama is running by pinging /api/tags.
 * @returns {{ ok: true, models?: string[] } | { ok: false, error: string }}
 */
export async function checkOllamaRunning() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, error: `Ollama returned ${res.status}. Ensure Ollama is running.` };
    }
    const data = await res.json();
    const models = Array.isArray(data.models)
      ? data.models.map((m) => m.name || m.model)
      : [];
    return { ok: true, models };
  } catch (err) {
    const message = err.cause?.code === 'ECONNREFUSED' || err.message?.includes('fetch')
      ? 'Ollama is not running. Start it with `ollama serve` or the Ollama app.'
      : (err.message || 'Failed to reach Ollama.');
    return { ok: false, error: message };
  }
}

/**
 * Check if the given model name exists in the tags list (optional validation).
 */
export function isModelAvailable(modelName, models) {
  if (!models || models.length === 0) return true;
  const normalized = modelName.split(':')[0];
  return models.some((m) => m === modelName || m.startsWith(normalized + ':'));
}
