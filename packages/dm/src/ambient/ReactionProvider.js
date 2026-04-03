/**
 * ReactionProvider — Abstraction for the local AI model that evaluates NPC reactions.
 *
 * The provider loads a local GGUF model via node-llama-cpp and evaluates whether
 * an NPC would react to a player utterance based on their full personality context.
 *
 * Output is constrained by JSON grammar enforcement at the token-selection level,
 * making malformed output physically impossible.
 *
 * @module ReactionProvider
 */

import { getLlama, LlamaJsonSchemaGrammar, LlamaChatSession } from 'node-llama-cpp';

/**
 * The JSON schema for reaction evaluation output.
 * Enforced at the grammar level — the model cannot produce non-conforming output.
 */
export const REACTION_SCHEMA = {
  type: 'object',
  properties: {
    shouldReact: { type: 'boolean' },
    reactionStrength: { type: 'number' },
  },
  required: ['shouldReact', 'reactionStrength'],
};

/**
 * Clamp reactionStrength to [1, 5] since JSON schema min/max
 * aren't enforced at the grammar level.
 */
function clampReaction(result) {
  return {
    shouldReact: result.shouldReact,
    reactionStrength: Math.max(1, Math.min(5, Math.round(result.reactionStrength))),
  };
}

/**
 * LocalLlamaProvider — loads a local GGUF model and evaluates NPC reactions.
 *
 * Usage:
 *   const provider = new LocalLlamaProvider({ modelPath: '...' });
 *   await provider.init();
 *   const result = await provider.evaluateReaction(systemPrompt, utterance);
 *   await provider.dispose();
 */
export class LocalLlamaProvider {
  /**
   * @param {object} options
   * @param {string} options.modelPath — Absolute path to the .gguf model file
   * @param {number} [options.maxTokens=150] — Max tokens for response
   * @param {number} [options.temperature=0] — Sampling temperature (0 = deterministic)
   * @param {number} [options.seed=42] — RNG seed for reproducibility
   */
  constructor({ modelPath, maxTokens = 150, temperature = 0, seed = 42 } = {}) {
    this.modelPath = modelPath;
    this.maxTokens = maxTokens;
    this.temperature = temperature;
    this.seed = seed;

    this._llama = null;
    this._model = null;
    this._grammar = null;
    this._initialized = false;
  }

  /** Load the model and prepare the grammar. Call once before evaluateReaction. */
  async init() {
    if (this._initialized) return;

    this._llama = await getLlama({ gpu: false });
    this._model = await this._llama.loadModel({ modelPath: this.modelPath });
    this._grammar = new LlamaJsonSchemaGrammar(this._llama, REACTION_SCHEMA);
    this._initialized = true;
  }

  /** @returns {boolean} Whether the provider has been initialized. */
  get isReady() {
    return this._initialized;
  }

  /**
   * Evaluate whether an NPC would react to the given utterance.
   *
   * @param {string} systemPrompt — Full NPC personality prompt from buildReactionPrompt
   * @param {string} utterance — What the player said
   * @returns {Promise<{shouldReact: boolean, reactionStrength: number}>}
   */
  async evaluateReaction(systemPrompt, utterance) {
    if (!this._initialized) {
      throw new Error('LocalLlamaProvider not initialized. Call init() first.');
    }

    const context = await this._model.createContext();
    try {
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt,
      });

      const response = await session.prompt(utterance, {
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        grammar: this._grammar,
        seed: this.seed,
      });

      const parsed = JSON.parse(response);
      return clampReaction(parsed);
    } finally {
      await context.dispose();
    }
  }

  /** Release model and llama resources. Timeout after 10s to avoid hanging. */
  async dispose() {
    const timeout = (ms) => new Promise((_, reject) =>
      setTimeout(() => reject(new Error('dispose timeout')), ms));

    try {
      if (this._model) {
        await Promise.race([this._model.dispose(), timeout(10_000)]);
      }
    } catch { /* disposal timeout is acceptable */ }

    try {
      if (this._llama) {
        await Promise.race([this._llama.dispose(), timeout(10_000)]);
      }
    } catch { /* disposal timeout is acceptable */ }

    this._model = null;
    this._llama = null;
    this._initialized = false;
  }
}
