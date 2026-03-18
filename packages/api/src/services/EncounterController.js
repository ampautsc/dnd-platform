/**
 * EncounterController — thin bridge between Express routes and the DM engine's
 * EncounterSessionService.
 *
 * This lives in the API package and wraps the DM service's encounter methods
 * with error-code-to-HTTP-status mapping.
 *
 * The API package imports @dnd-platform/dm (architecture boundary relaxed for
 * encounter routes — approved decision).
 */
export function createEncounterController(encounterSession) {
  return {
    /**
     * Create a new encounter.
     * @param {{ npcTemplateKeys: string[], playerName?: string, worldContext?: object }} params
     */
    async create(params) {
      return encounterSession.createEncounter(params);
    },

    /**
     * Get current encounter state.
     * @param {string} encounterId
     */
    get(encounterId) {
      return encounterSession.getEncounter(encounterId);
    },

    /**
     * Send a player message and get NPC responses.
     * @param {string} encounterId
     * @param {{ text: string, addressedTo?: string[] }} messageParams
     */
    async sendMessage(encounterId, messageParams) {
      return encounterSession.sendMessage(encounterId, messageParams);
    },

    /**
     * End an encounter session.
     * @param {string} encounterId
     */
    end(encounterId) {
      return encounterSession.endEncounter(encounterId);
    },

    /**
     * List all encounters.
     */
    list() {
      return encounterSession.listEncounters();
    },
  };
}
