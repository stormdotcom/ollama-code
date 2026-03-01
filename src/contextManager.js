/**
 * Context window manager — estimates tokens, prunes old messages,
 * and optionally summarizes conversation to reclaim context space.
 */
import { chat } from './ollamaClient.js';
import { NUM_CTX } from './constants.js';

/** Rough token estimate: ~4 chars per token for English/code. */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

/** Estimate total tokens in a message array. */
export function estimateMessagesTokens(messages) {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.content) + 4; // +4 for role/framing overhead
  }
  return total;
}

/**
 * Token usage tracker for the session.
 */
export function createTokenTracker() {
  const stats = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    turns: 0,
    toolCalls: 0,
    compactions: 0,
  };

  return {
    stats,
    addTurn(promptTokens, completionTokens, toolCallCount = 0) {
      stats.promptTokens += promptTokens;
      stats.completionTokens += completionTokens;
      stats.totalTokens += promptTokens + completionTokens;
      stats.turns++;
      stats.toolCalls += toolCallCount;
    },
    addCompaction() {
      stats.compactions++;
    },
    getSummary() {
      return { ...stats };
    },
  };
}

/**
 * Auto-prune messages when approaching context limit.
 * Keeps: system prompt (index 0) + last `keepRecent` message pairs.
 * Inserts a "[earlier conversation pruned]" marker.
 *
 * @param {Array} messages
 * @param {object} options
 * @returns {{ messages: Array, pruned: boolean, prunedCount: number }}
 */
export function autoPrune(messages, { maxTokens = NUM_CTX, reserveTokens = 4096, keepRecent = 10 } = {}) {
  const budget = maxTokens - reserveTokens; // leave room for next response
  const currentTokens = estimateMessagesTokens(messages);

  if (currentTokens <= budget) {
    return { messages, pruned: false, prunedCount: 0 };
  }

  // Always keep system prompt (index 0) and the most recent messages
  const system = messages[0];
  const middle = messages.slice(1);
  const keep = Math.min(keepRecent, middle.length);
  const recent = middle.slice(-keep);
  const prunable = middle.slice(0, -keep || undefined);

  if (prunable.length === 0) {
    // Nothing to prune — all messages are "recent"
    return { messages, pruned: false, prunedCount: 0 };
  }

  // Progressively remove oldest messages until we're under budget
  let removed = [];
  let remaining = [...prunable];

  while (remaining.length > 0) {
    const candidate = [system, ...remaining, ...recent];
    const tokens = estimateMessagesTokens(candidate);
    if (tokens <= budget) break;
    removed.push(remaining.shift());
  }

  if (removed.length === 0) {
    return { messages, pruned: false, prunedCount: 0 };
  }

  const pruneMarker = {
    role: 'system',
    content: `[Earlier conversation pruned — ${removed.length} message(s) removed to fit context window. The assistant should continue based on recent context.]`,
  };

  const pruned = [system, pruneMarker, ...remaining, ...recent];
  return { messages: pruned, pruned: true, prunedCount: removed.length };
}

/**
 * Summarize old messages into a compact summary using the LLM.
 * This is what /compact should actually do.
 *
 * @param {string} model - current model name
 * @param {Array} messages - full message array
 * @param {object} options
 * @returns {Promise<{ messages: Array, summarized: boolean, originalCount: number }>}
 */
export async function compactConversation(model, messages, { keepRecent = 6 } = {}) {
  if (messages.length <= keepRecent + 2) {
    return { messages, summarized: false, originalCount: messages.length };
  }

  const system = messages[0];
  const middle = messages.slice(1);
  const keep = Math.min(keepRecent, middle.length);
  const recent = middle.slice(-keep);
  const toSummarize = middle.slice(0, -keep || undefined);

  if (toSummarize.length < 3) {
    return { messages, summarized: false, originalCount: messages.length };
  }

  // Build a summary request
  const summaryMessages = [
    {
      role: 'system',
      content: 'You are a conversation summarizer. Produce a concise summary of the conversation below. Focus on: what the user asked for, what files were modified, what commands were run, what decisions were made, and any pending tasks. Be factual and brief. Output only the summary, no preamble.',
    },
    {
      role: 'user',
      content: toSummarize.map(m => `[${m.role}]: ${m.content.slice(0, 1000)}`).join('\n\n'),
    },
  ];

  try {
    const summary = await chat(model, summaryMessages);
    if (!summary || summary.length < 20) {
      // Summary failed or too short, fall back to prune
      return autoPruneResult(system, toSummarize, recent);
    }

    const summaryMsg = {
      role: 'system',
      content: `[Conversation summary — ${toSummarize.length} messages compacted]\n${summary}`,
    };

    const compacted = [system, summaryMsg, ...recent];
    return { messages: compacted, summarized: true, originalCount: messages.length };
  } catch {
    // LLM summary failed, fall back to auto-prune
    return autoPruneResult(system, toSummarize, recent);
  }
}

function autoPruneResult(system, pruned, recent) {
  const marker = {
    role: 'system',
    content: `[Earlier conversation pruned — ${pruned.length} message(s) removed. Summary unavailable.]`,
  };
  return {
    messages: [system, marker, ...recent],
    summarized: false,
    originalCount: pruned.length + recent.length + 1,
  };
}
