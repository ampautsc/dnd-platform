/**
 * NpcReactionEvaluator — Evaluates all NPCs in a scene for reaction to a player utterance.
 *
 * This is the core orchestrator that:
 * 1. Takes a list of NPCs present in the scene
 * 2. Builds a personality-driven prompt for each one
 * 3. Sends each prompt to the local model via ReactionProvider
 * 4. Returns the reaction results (only for NPCs that would react)
 *
 * Non-reacting NPCs produce NOTHING. They are not in the output.
 *
 * @module NpcReactionEvaluator
 */

import { buildReactionPrompt } from './buildReactionPrompt.js';

/**
 * @param {object} options
 * @param {import('./ReactionProvider.js').LocalLlamaProvider} options.provider — The local model provider
 */
export class NpcReactionEvaluator {
  constructor({ provider }) {
    if (!provider) throw new Error('provider is required');
    this.provider = provider;
  }

  /**
   * Evaluate all NPCs for reaction to the given utterance.
   *
   * @param {object[]} npcs — Array of NPC personality objects from content/npcs
   * @param {string} utterance — What the player said
   * @param {object} [options={}]
   * @param {string} [options.speakerName='a stranger'] — Who said it
   * @param {string} [options.locationName='the tavern'] — Where the scene takes place
   * @returns {Promise<Array<{npcKey: string, npcName: string, shouldReact: boolean, reactionStrength: number}>>}
   *   Only NPCs where shouldReact === true are returned.
   */
  async evaluateAll(npcs, utterance, options = {}) {
    if (!npcs || npcs.length === 0) return [];
    if (!utterance || utterance.trim() === '') return [];

    if (!this.provider.isReady) {
      throw new Error('Provider not initialized. Call provider.init() first.');
    }

    const speakerName = options.speakerName || 'a stranger';
    const locationName = options.locationName || 'the tavern';

    const promises = npcs.map(async (npc) => {
      const prompt = buildReactionPrompt(npc, { speakerName, locationName });
      const reaction = await this.provider.evaluateReaction(prompt, utterance);
      return { npc, reaction };
    });

    const settled = await Promise.allSettled(promises);
    const results = [];
    let rateLimited = false;

    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled') {
        // Detect rate-limit errors so we can surface them
        const msg = outcome.reason?.message || '';
        if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('Rate limit')) {
          rateLimited = true;
        }
        continue;
      }
      const { npc, reaction } = outcome.value;
      if (reaction.shouldReact) {
        results.push({
          npcKey: npc.templateKey,
          npcName: npc.name,
          ...reaction,
        });
      }
    }

    // If ALL evaluations failed due to rate limiting, propagate the error
    // so the API can return a meaningful status instead of silent empty results
    if (results.length === 0 && rateLimited) {
      const err = new Error('All NPC evaluations failed due to API rate limits');
      err.code = 'RATE_LIMITED';
      throw err;
    }

    return results;
  }

  /**
   * Evaluate a single NPC's reaction. Useful for testing individual NPCs.
   *
   * @param {object} npc — NPC personality object
   * @param {string} utterance — What the player said
   * @param {object} [options={}]
   * @returns {Promise<{npcKey: string, npcName: string, shouldReact: boolean, reactionStrength: number}>}
   *   Always returns the full result, even if shouldReact is false.
   */
  async evaluateOne(npc, utterance, options = {}) {
    if (!this.provider.isReady) {
      throw new Error('Provider not initialized. Call provider.init() first.');
    }

    const prompt = buildReactionPrompt(npc, {
      speakerName: options.speakerName || 'a stranger',
      locationName: options.locationName || 'the tavern',
    });

    const reaction = await this.provider.evaluateReaction(prompt, utterance);

    return {
      npcKey: npc.templateKey,
      npcName: npc.name,
      ...reaction,
    };
  }
}
