/**
 * AmbientSceneEngine — The main orchestrator for ambient NPC reactions.
 *
 * Two-tier architecture:
 *   Tier 1 (FREE): Local model evaluates which NPCs would react → NpcReactionEvaluator
 *   Tier 2 (PAID): Only reacting NPCs get expensive API calls for actual dialogue
 *
 * Flow:
 *   1. Player says something
 *   2. AmbientSceneEngine.processUtterance()
 *   3. NpcReactionEvaluator evaluates all present NPCs (local model, free)
 *   4. ReactionPriorityResolver determines speaking order (d20 + strength + CHA)
 *   5. Top N reactors get paid LLM calls for actual dialogue (via responseGenerator)
 *   6. Returns: array of { npcKey, npcName, dialogue, reactionType }
 *
 * Non-reacting NPCs produce NOTHING. They are not returned. They do not speak.
 *
 * @module AmbientSceneEngine
 */

export class AmbientSceneEngine {
  /**
   * @param {object} options
   * @param {import('./NpcReactionEvaluator.js').NpcReactionEvaluator} options.evaluator
   * @param {import('./ReactionPriorityResolver.js').ReactionPriorityResolver} options.priorityResolver
   * @param {function(npcKey: string, npcPersonality: object, utterance: string, reactionContext: object): Promise<string>} [options.responseGenerator]
   *   — Callback that generates the actual NPC dialogue via the paid LLM.
   *     reactionContext = { reactionStrength, priority }.
   *     If not provided, only returns reaction data without dialogue.
   */
  constructor({ evaluator, priorityResolver, responseGenerator = null }) {
    if (!evaluator) throw new Error('evaluator is required');
    if (!priorityResolver) throw new Error('priorityResolver is required');

    this.evaluator = evaluator;
    this.priorityResolver = priorityResolver;
    this.responseGenerator = responseGenerator;
  }

  /**
   * Process a player utterance and determine which NPCs react.
   *
   * @param {object} params
   * @param {string} params.utterance — What the player said
   * @param {object[]} params.presentNpcs — NPC personality objects present in the scene
   * @param {string} [params.speakerName='a stranger'] — Who said it
   * @param {string} [params.locationName='the tavern'] — Where
   * @param {object} [params.npcStats={}] — Map of npcKey → { charisma: number }
   * @returns {Promise<{reactions: Array, responses: Array}>}
   *   reactions: All NPCs that would react (with priority data), sorted by priority
   *   responses: Dialogue from paid LLM calls (if responseGenerator is provided)
   */
  async processUtterance({
    utterance,
    presentNpcs,
    speakerName = 'a stranger',
    locationName = 'the tavern',
    npcStats = {},
  }) {
    if (!utterance || utterance.trim() === '') {
      return { reactions: [], responses: [] };
    }

    if (!presentNpcs || presentNpcs.length === 0) {
      return { reactions: [], responses: [] };
    }

    // Tier 1: Local model evaluates all NPCs (free)
    const rawReactions = await this.evaluator.evaluateAll(
      presentNpcs,
      utterance,
      { speakerName, locationName }
    );

    if (rawReactions.length === 0) {
      return { reactions: [], responses: [] };
    }

    // Priority resolution: d20 + reactionStrength + CHA mod
    const prioritized = this.priorityResolver.resolve(rawReactions, npcStats);

    // Tier 2: Paid LLM calls for top reactors (if generator provided)
    const responses = [];
    if (this.responseGenerator) {
      for (const reaction of prioritized) {
        const npc = presentNpcs.find(n => n.templateKey === reaction.npcKey);
        if (!npc) continue;

        try {
          const dialogue = await this.responseGenerator(
            reaction.npcKey,
            npc,
            utterance,
            {
              reactionStrength: reaction.reactionStrength,
              priority: reaction.priority,
            }
          );

          if (dialogue && dialogue.trim()) {
            responses.push({
              npcKey: reaction.npcKey,
              npcName: reaction.npcName,
              dialogue: dialogue.trim(),
              reactionStrength: reaction.reactionStrength,
            });
          }
        } catch (err) {
          // LLM failure for one NPC should not break the whole round
          // Log but continue — graceful degradation per architecture rules
          console.error(`[AmbientSceneEngine] Response generation failed for ${reaction.npcKey}:`, err.message);
        }
      }
    }

    return { reactions: prioritized, responses };
  }
}
