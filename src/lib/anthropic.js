// Browser-direct Anthropic API client for the BYOK pattern.
// The user's key is held in memory (optionally localStorage, opt-in) and is
// sent ONLY to api.anthropic.com — there is no backend in this app.
// CORS is enabled via Anthropic's explicit opt-in header for browser usage.

const API_URL = 'https://api.anthropic.com/v1/messages';

// Two model tiers (see docs/architecture.md). Facts come from web searches,
// so factual gathering runs on the cheap fast tier; judgment work — synthesis,
// ranking, reconciling conflicting sources — runs on the strong tier.
export const MODELS = {
  GATHERER: 'claude-haiku-4-5',
  ANALYST: 'claude-sonnet-5',
};

// Haiku 4.5 predates the dynamic-filtering web search tool; Sonnet 5 supports it.
const SEARCH_TOOL_FOR_MODEL = {
  [MODELS.GATHERER]: 'web_search_20250305',
  [MODELS.ANALYST]: 'web_search_20260209',
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Make one Messages API call.
 * Returns { text, searchQueries, usage, latencyMs, stopReason }.
 * - text: all text blocks joined (search responses interleave text, tool and
 *   thinking blocks, so blocks are always filtered by type, never by position).
 * - searchQueries: the actual web searches the model ran (server_tool_use blocks).
 */
export async function callClaude({
  apiKey,
  model = MODELS.ANALYST,
  system,
  messages,
  useSearch = false,
  maxSearches = 3,
  maxTokens = 8000,
  signal,
}) {
  const started = performance.now();

  const body = { model, max_tokens: maxTokens, messages };
  if (system) body.system = system;
  if (useSearch) {
    body.tools = [
      {
        type: SEARCH_TOOL_FOR_MODEL[model] || 'web_search_20250305',
        name: 'web_search',
        max_uses: maxSearches,
      },
    ];
  }

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(
      'Network error reaching api.anthropic.com. Check your connection (or an ad-blocker may be interfering).',
      0,
    );
  }

  const latencyMs = Math.round(performance.now() - started);

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) detail = errJson.error.message;
    } catch {
      /* keep the HTTP status message */
    }
    if (res.status === 401) {
      detail = 'Invalid API key — check it and try again. ' + detail;
    }
    throw new ApiError(detail, res.status);
  }

  const data = await res.json();
  const content = Array.isArray(data.content) ? data.content : [];

  // Join with '' — web-search citations split the answer into many text blocks,
  // often mid-string inside the JSON. A '\n' separator would inject raw newlines
  // into quoted values, which is illegal JSON.
  const text = content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim();

  const searchQueries = content
    .filter((b) => b.type === 'server_tool_use' && b.name === 'web_search')
    .map((b) => b.input?.query)
    .filter(Boolean);

  if (data.stop_reason === 'max_tokens') {
    throw new Error(
      `Response was cut off at the ${maxTokens}-token limit before the agent finished — increase maxTokens for this call.`,
    );
  }

  return {
    text,
    searchQueries,
    usage: data.usage || {},
    latencyMs,
    stopReason: data.stop_reason,
  };
}

/**
 * Extract a JSON object from model output, tolerating markdown fences
 * and any stray prose before/after the object.
 */
export function parseAgentJson(text) {
  if (!text) throw new Error('Agent returned an empty response.');
  const cleaned = text.replace(/```json/gi, '```').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Agent response contained no JSON object.');
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error('Agent response JSON could not be parsed.');
  }
}
