/**
 * AmbientController — Bridges the ambient reaction engine with REST API.
 *
 * Looks up which NPCs are at a location, builds the personality + stats
 * payload, and delegates to AmbientSceneEngine.processUtterance().
 *
 * @module AmbientController
 */

/**
 * @param {import('@dnd-platform/dm').AmbientSceneEngine} ambientEngine
 * @param {object} options
 * @param {function(string): object|null} options.personalityLookup
 * @param {function(string): object|null} options.locationLookup
 */
export function createAmbientController(ambientEngine, { personalityLookup, locationLookup }) {
  if (!ambientEngine) throw new Error('ambientEngine is required');
  if (!personalityLookup) throw new Error('personalityLookup is required');
  if (!locationLookup) throw new Error('locationLookup is required');

  return {
    /**
     * Process a player utterance at a location and return NPC reactions.
     *
     * @param {{ locationId: string, utterance: string, speakerName?: string }} params
     * @returns {Promise<{ reactions: Array, responses: Array, locationName: string }>}
     */
    async processUtterance({ locationId, utterance, speakerName = 'a stranger' }) {
      if (!locationId) {
        const err = new Error('locationId is required');
        err.code = 'INVALID_INPUT';
        throw err;
      }
      if (!utterance || !utterance.trim()) {
        const err = new Error('utterance is required');
        err.code = 'INVALID_INPUT';
        throw err;
      }

      const location = locationLookup(locationId);
      if (!location) {
        const err = new Error(`Location not found: ${locationId}`);
        err.code = 'LOCATION_NOT_FOUND';
        throw err;
      }

      // Build NPC list from location regulars — cap at MAX_EVAL to stay
      // within Groq free-tier TPM limits (~5K tokens/NPC, 6K TPM limit).
      // Shuffle so different NPCs get evaluated on each utterance.
      const MAX_EVAL = 3;
      const allNpcs = (location.regulars || [])
        .map(key => personalityLookup(key))
        .filter(Boolean);

      if (allNpcs.length === 0) {
        return { reactions: [], responses: [], locationName: location.name };
      }

      // Fisher-Yates shuffle, then take first MAX_EVAL
      const shuffled = [...allNpcs];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const presentNpcs = shuffled.slice(0, MAX_EVAL);

      // Build stats map from ALL regulars (priority resolver needs CHA for any reactor)
      const npcStats = {};
      for (const npc of allNpcs) {
        npcStats[npc.templateKey] = {
          charisma: npc.stats?.charisma ?? 10,
        };
      }

      const result = await ambientEngine.processUtterance({
        utterance: utterance.trim(),
        presentNpcs,
        speakerName,
        locationName: location.name,
        npcStats,
      });

      return {
        reactions: result.reactions,
        responses: result.responses,
        locationName: location.name,
      };
    },
  };
}
