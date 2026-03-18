/**
 * SceneController — Thin bridge between Express routes and the DM engine's
 * SceneEngine.
 *
 * Same pattern as EncounterController: zero logic, pure delegation.
 */
export function createSceneController(sceneEngine, { locationLookup, personalityLookup } = {}) {
  return {
    /**
     * Create a new scene.
     * @param {{ participants: Array, worldContext?: Object, maxRounds?: number }} params
     */
    create(params) {
      const state = sceneEngine.createScene(params);
      return sceneEngine.resolveForPlayer(state.toJSON());
    },

    /**
     * Start a scene — roll initiative, set active, auto-advance NPC turns.
     * @param {string} sceneId
     * @returns {Promise<Object>} scene JSON with openingActions if NPCs went first
     */
    async start(sceneId) {
      sceneEngine.startScene(sceneId);
      const { sceneState, npcActions } = await sceneEngine.advanceNpcTurns(sceneId);
      return {
        ...sceneEngine.resolveForPlayer(sceneState.toJSON()),
        openingActions: npcActions,
      };
    },

    /**
     * Get current scene state.
     * @param {string} sceneId
     */
    get(sceneId) {
      const state = sceneEngine.getScene(sceneId);
      return sceneEngine.resolveForPlayer(state.toJSON());
    },

    /**
     * Submit a participant action.
     * @param {string} sceneId
     * @param {string} participantId
     * @param {{ type: string, content: string }} action
     */
    async submitAction(sceneId, participantId, action) {
      const result = await sceneEngine.submitAction(sceneId, participantId, action);
      return {
        sceneState: sceneEngine.resolveForPlayer(result.sceneState.toJSON()),
        npcActions: result.npcActions,
      };
    },

    /**
     * End a scene.
     * @param {string} sceneId
     * @param {string} [reason='dm_ended']
     */
    end(sceneId, reason) {
      const state = sceneEngine.endScene(sceneId, reason);
      return sceneEngine.resolveForPlayer(state.toJSON());
    },

    /**
     * List all scenes.
     */
    list() {
      return sceneEngine.listScenes();
    },

    /**
     * Create and auto-start a scene at a named location.
     * Builds participants from the location's regulars list.
     *
     * @param {{ locationId: string, playerName?: string, playerChaMod?: number }} params
     * @returns {Object} scene state JSON (already active with initiative rolled)
     */
    async createAtLocation({ locationId, playerName = 'You', playerChaMod = 2 }) {
      if (!locationId) {
        const err = new Error('locationId is required');
        err.code = 'INVALID_INPUT';
        throw err;
      }

      if (!locationLookup) {
        const err = new Error('locationLookup not configured');
        err.code = 'INVALID_INPUT';
        throw err;
      }

      const location = locationLookup(locationId);
      if (!location) {
        const err = new Error(`Location not found: ${locationId}`);
        err.code = 'SCENE_NOT_FOUND';
        throw err;
      }

      // Build NPC participants from location regulars
      const npcParticipants = (location.regulars || [])
        .map(templateKey => {
          const npc = personalityLookup ? personalityLookup(templateKey) : null;
          if (!npc) return null;
          return {
            id: `npc_${templateKey}`,
            name: npc.name,
            chaMod: npc.personality?.chaMod ?? 0,
            isPlayer: false,
            templateKey,
          };
        })
        .filter(Boolean);

      if (npcParticipants.length === 0) {
        const err = new Error('No valid NPCs found at this location');
        err.code = 'INVALID_INPUT';
        throw err;
      }

      const participants = [
        { id: 'player1', name: playerName, chaMod: playerChaMod, isPlayer: true },
        ...npcParticipants,
      ];

      const worldContext = {
        locationId: location.id,
        locationName: location.name,
        locationType: location.type,
        description: location.description,
        atmosphere: location.atmosphere,
        ...(location.worldContext || {}),
      };

      const state = sceneEngine.createScene({ participants, worldContext });
      sceneEngine.startScene(state.id);

      // Auto-resolve any NPC turns before the player's first turn
      const { sceneState, npcActions } = await sceneEngine.advanceNpcTurns(state.id);

      return {
        ...sceneEngine.resolveForPlayer(sceneState.toJSON()),
        openingActions: npcActions,
      };
    },
  };
}
