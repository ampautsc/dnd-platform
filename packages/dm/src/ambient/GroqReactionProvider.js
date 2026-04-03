/**
 * GroqReactionProvider — Evaluates NPC reactions via Groq's free API.
 *
 * Uses the OpenAI-compatible endpoint at api.groq.com with the
 * already-installed `openai` package. No new dependencies.
 *
 * Free tier (as of March 2026):
 *   - 30 requests/min (RPM)
 *   - 14,400 requests/day (RPD)
 *   - 6,000 tokens/min for most models
 *   - Models: llama-3.1-8b-instant, llama-3.3-70b-versatile, gemma2-9b-it, mixtral-8x7b
 *
 * Same interface as LocalLlamaProvider:
 *   init(), isReady, evaluateReaction(systemPrompt, utterance), dispose()
 *
 * @module GroqReactionProvider
 */

import OpenAI from 'openai';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'llama-3.1-8b-instant';

/**
 * Clamp reactionStrength to [1, 5].
 */
function clampReaction(result) {
  return {
    shouldReact: result.shouldReact,
    reactionStrength: Math.max(1, Math.min(5, Math.round(result.reactionStrength))),
  };
}

/**
 * Validate that the parsed response has the expected shape.
 * Cloud APIs use JSON mode (valid JSON guaranteed) but not schema enforcement,
 * so we validate post-hoc.
 */
function validateShape(parsed) {
  if (typeof parsed.shouldReact !== 'boolean') {
    throw new Error(`Invalid shouldReact: expected boolean, got ${typeof parsed.shouldReact}`);
  }
  if (typeof parsed.reactionStrength !== 'number') {
    throw new Error(`Invalid reactionStrength: expected number, got ${typeof parsed.reactionStrength}`);
  }
  return true;
}

export class GroqReactionProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey] — Groq API key. Falls back to GROQ_API_KEY env var.
   * @param {string} [options.model] — Model to use. Default: llama-3.1-8b-instant
   * @param {number} [options.maxTokens=30] — Max response tokens (tiny for yes/no classification)
   * @param {number} [options.temperature=0] — Sampling temperature (0 = deterministic)
   * @param {number} [options.timeoutMs=5000] — Request timeout in milliseconds
   * @param {number} [options.rpmLimit=12] — Max requests per minute. Default 12 respects 6K TPM with ~500-token prompts.
   */
  constructor({
    apiKey,
    model = DEFAULT_MODEL,
    maxTokens = 30,
    temperature = 0,
    timeoutMs = 5000,
    rpmLimit = 12,
  } = {}) {
    this.apiKey = apiKey || process.env.GROQ_API_KEY;
    this.model = model;
    this.maxTokens = maxTokens;
    this.temperature = temperature;
    this.timeoutMs = timeoutMs;
    this._rpmLimit = rpmLimit;

    this._client = null;
    this._initialized = false;
    this._lastRequestTime = 0;
    this._requestQueue = Promise.resolve();
  }

  /**
   * Initialize the provider. Validates the API key exists.
   * No model loading — that's Groq's problem.
   */
  async init() {
    if (this._initialized) return;

    if (!this.apiKey) {
      throw new Error(
        'GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys'
      );
    }

    this._client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: GROQ_BASE_URL,
      timeout: this.timeoutMs,
    });

    this._initialized = true;
  }

  /** @returns {boolean} Whether the provider has been initialized. */
  get isReady() {
    return this._initialized;
  }

  /**
   * Rate-limit aware throttle. Ensures requests are spaced to stay within
   * the RPM limit. Serializes concurrent calls through a promise queue
   * so parallel evaluateAll() calls don't burst past the limit.
   * @private
   */
  _throttle() {
    this._requestQueue = this._requestQueue.then(async () => {
      const now = Date.now();
      const elapsed = now - this._lastRequestTime;
      const minInterval = Math.ceil(60_000 / this._rpmLimit); // e.g., 2000ms for 30 RPM
      if (elapsed < minInterval) {
        await new Promise(r => setTimeout(r, minInterval - elapsed));
      }
      this._lastRequestTime = Date.now();
    });
    return this._requestQueue;
  }

  /**
   * Evaluate whether an NPC would react to the given utterance.
   *
   * @param {string} systemPrompt — NPC personality/classification prompt
   * @param {string} utterance — What was said in the scene
   * @returns {Promise<{shouldReact: boolean, reactionStrength: number}>}
   */
  async evaluateReaction(systemPrompt, utterance) {
    if (!this._initialized) {
      throw new Error('GroqReactionProvider not initialized. Call init() first.');
    }

    await this._throttle();

    const response = await this._client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: utterance },
      ],
      response_format: { type: 'json_object' },
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: false,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('Groq returned empty response');
    }

    const parsed = JSON.parse(raw);
    validateShape(parsed);
    return clampReaction(parsed);
  }

  /**
   * Returns usage metadata from the most recent Groq response headers.
   * Useful for tracking rate limit consumption.
   */
  async checkRateLimits() {
    // Groq returns rate limit info in response headers but the OpenAI SDK
    // doesn't expose them directly. For now, this is a placeholder.
    // In production we'd use response.headers or a custom fetch wrapper.
    return {
      provider: 'groq',
      model: this.model,
      freeTier: {
        rpm: 30,
        rpd: 14_400,
        tokensPerMin: 6_000,
      },
    };
  }

  /** No-op — nothing to clean up for a stateless HTTP client. */
  async dispose() {
    this._client = null;
    this._initialized = false;
  }
}
