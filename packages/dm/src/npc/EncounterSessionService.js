/**
 * EncounterSessionService — Manages conversational encounter sessions.
 *
 * An "encounter" is a non-combat social interaction between the player and
 * one or more NPCs. Think tavern conversations, interrogations, negotiations.
 *
 * Architecture:
 *   - In-memory session store (Map), class-scoped for test isolation
 *   - Uses CharacterResponseService for NPC responses (injected)
 *   - Uses InfoExtractionService for initial appearance generation (injected)
 *   - Uses EncounterMemoryService for per-NPC memory (injected)
 *   - Personality lookup is an injected function (no filesystem or DB dependency)
 *
 * No HTTP, no DB, no global state. Pure service layer.
 *
 * @module EncounterSessionService
 */

let _idCounter = 0;
let _msgCounter = 0;

function _generateId() {
  return `enc_${(++_idCounter).toString(36)}${Date.now().toString(36)}`;
}

function _messageId() {
  return `msg_${(++_msgCounter).toString(36)}${Date.now().toString(36)}`;
}

const DEFAULT_MAX_SESSIONS = 50;
const SESSION_TTL = 2 * 60 * 60 * 1000; // 2 hours

export class EncounterSessionService {
  /**
   * @param {Object} deps
   * @param {import('./EncounterMemoryService.js').EncounterMemoryService} deps.encounterMemory
   * @param {import('./InfoExtractionService.js').InfoExtractionService} deps.infoExtraction
   * @param {import('./CharacterResponseService.js').CharacterResponseService} deps.responseService
   * @param {function(string): Object|null} deps.personalityLookup — returns personality for templateKey
   * @param {number} [deps.maxSessions]
   */
  constructor({ encounterMemory, infoExtraction, responseService, personalityLookup, maxSessions }) {
    this._encounterMemory = encounterMemory;
    this._infoExtraction = infoExtraction;
    this._responseService = responseService;
    this._personalityLookup = personalityLookup;
    this._maxSessions = maxSessions || DEFAULT_MAX_SESSIONS;

    /** @type {Map<string, Object>} */
    this._sessions = new Map();
  }

  // ── Housekeeping ──────────────────────────────────────────────────────

  _pruneExpired() {
    const now = Date.now();
    for (const [id, session] of this._sessions) {
      if (now - session.createdAt > SESSION_TTL) {
        this._sessions.delete(id);
      }
    }
  }

  _enrichNpcsWithRevealedInfo(sessionId, npcs) {
    return npcs.map(npc => ({
      ...npc,
      revealedInfo: this._encounterMemory.getRevealedInfo(sessionId, npc.templateKey),
    }));
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Create a new encounter session.
   *
   * @param {Object} params
   * @param {string[]} params.npcTemplateKeys
   * @param {string}   [params.playerName='Adventurer']
   * @param {Object}   [params.worldContext]
   * @returns {Promise<{ encounterId, npcs, messages, worldContext, status }>}
   */
  async createEncounter(params) {
    const {
      npcTemplateKeys,
      playerName = 'Adventurer',
      worldContext = {},
    } = params;

    if (!Array.isArray(npcTemplateKeys) || npcTemplateKeys.length === 0) {
      const err = new Error('npcTemplateKeys must be a non-empty array');
      err.code = 'INVALID_INPUT';
      throw err;
    }

    this._pruneExpired();

    if (this._sessions.size >= this._maxSessions) {
      const err = new Error('Maximum encounter sessions reached. End an existing encounter first.');
      err.code = 'MAX_SESSIONS';
      throw err;
    }

    // Load all NPC personalities
    const personalities = {};
    const npcs = [];

    for (const key of npcTemplateKeys) {
      const p = this._personalityLookup(key);
      if (!p) {
        const err = new Error(`No personality found for templateKey: ${key}`);
        err.code = 'NPC_NOT_FOUND';
        throw err;
      }
      personalities[key] = p;
      npcs.push({
        templateKey: key,
        name: p.name,
        race: p.race,
        npcType: p.npcType || 'neutral',
        disposition: p.personality?.disposition || 'neutral',
        voice: p.personality?.voice || 'neutral',
      });
    }

    const wc = {
      location: worldContext.location || 'a quiet room',
      timeOfDay: worldContext.timeOfDay || 'day',
      tone: worldContext.tone || 'conversational',
    };

    const id = _generateId();
    const session = {
      id,
      playerName,
      npcs,
      personalities,
      messages: [],
      worldContext: wc,
      status: 'active',
      createdAt: Date.now(),
    };

    this._sessions.set(id, session);

    // Generate initial appearance for each NPC and seed revealedInfo
    const appearancePromises = npcs.map(async (npc) => {
      try {
        const appearance = await this._infoExtraction.generateAppearance(personalities[npc.templateKey]);
        this._encounterMemory.getMemory(id, npc.templateKey);
        this._encounterMemory.revealInfo(id, npc.templateKey, 'appearance', appearance);
      } catch {
        // Ensure memory slot exists even on failure
        this._encounterMemory.getMemory(id, npc.templateKey);
      }
    });
    await Promise.all(appearancePromises);

    return {
      encounterId: id,
      npcs: this._enrichNpcsWithRevealedInfo(id, npcs),
      messages: session.messages,
      worldContext: session.worldContext,
      status: session.status,
    };
  }

  /**
   * Get current encounter state.
   *
   * @param {string} encounterId
   * @returns {{ encounterId, npcs, messages, worldContext, status }}
   */
  getEncounter(encounterId) {
    const session = this._sessions.get(encounterId);
    if (!session) {
      const err = new Error(`Encounter not found: ${encounterId}`);
      err.code = 'ENCOUNTER_NOT_FOUND';
      throw err;
    }
    return {
      encounterId: session.id,
      npcs: this._enrichNpcsWithRevealedInfo(encounterId, session.npcs),
      messages: session.messages,
      worldContext: session.worldContext,
      status: session.status,
    };
  }

  /**
   * Send a player message and get NPC response(s).
   *
   * @param {string} encounterId
   * @param {Object} params
   * @param {string} params.text
   * @param {string[]} [params.addressedTo]
   * @returns {Promise<{ playerMessage, npcResponses }>}
   */
  async sendMessage(encounterId, params) {
    const session = this._sessions.get(encounterId);
    if (!session) {
      const err = new Error(`Encounter not found: ${encounterId}`);
      err.code = 'ENCOUNTER_NOT_FOUND';
      throw err;
    }
    if (session.status !== 'active') {
      const err = new Error('Encounter has ended');
      err.code = 'ENCOUNTER_ENDED';
      throw err;
    }

    const { text, addressedTo } = params;
    if (!text || typeof text !== 'string' || text.trim() === '') {
      const err = new Error('Message text is required');
      err.code = 'INVALID_INPUT';
      throw err;
    }

    // Record player message
    const playerMessage = {
      id: _messageId(),
      sender: 'player',
      senderName: session.playerName,
      text: text.trim(),
      source: 'player',
      timestamp: Date.now(),
    };
    session.messages.push(playerMessage);

    // Determine which NPCs to address
    const targetKeys = Array.isArray(addressedTo) && addressedTo.length > 0
      ? addressedTo.filter(k => session.personalities[k])
      : session.npcs.map(n => n.templateKey);

    // Build nearby entities
    const nearbyEntities = session.npcs.map(n => ({
      name: n.name,
      side: n.npcType === 'friendly' ? 'ally' : n.npcType === 'enemy' ? 'enemy' : 'neutral',
      hpStatus: 'healthy',
      distance: 5,
    }));
    nearbyEntities.push({
      name: session.playerName,
      side: 'ally',
      hpStatus: 'healthy',
      distance: 5,
    });

    // Generate responses from each addressed NPC
    const npcResponses = [];

    for (const templateKey of targetKeys) {
      const personality = session.personalities[templateKey];
      if (!personality) continue;

      try {
        const contextPackage = {
          character: {
            id: templateKey,
            name: personality.name,
            npcType: personality.npcType || 'neutral',
          },
          situationalContext: {
            triggerEvent: 'player_addressed',
            emotionalState: 'calm',
            nearbyEntities,
            recentEvents: [`${session.playerName} says: "${text.trim()}"`],
          },
          responseConstraints: {
            maxTokens: 150,
            format: 'spoken',
            avoidRepetition: [],
          },
        };

        const result = await this._responseService.generateResponse(contextPackage, {
          sessionId: encounterId,
          personality,
          entityId: 'player',
          playerMessage: text.trim(),
        });

        const npcMessage = {
          id: _messageId(),
          sender: templateKey,
          senderName: result.npcName || personality.name,
          text: result.text,
          source: result.source,
          timestamp: Date.now(),
        };
        session.messages.push(npcMessage);
        npcResponses.push(npcMessage);

      } catch {
        // If one NPC fails, still try the others
        const fallbackMessage = {
          id: _messageId(),
          sender: templateKey,
          senderName: personality.name,
          text: '*looks at you thoughtfully but says nothing*',
          source: 'fallback',
          timestamp: Date.now(),
        };
        session.messages.push(fallbackMessage);
        npcResponses.push(fallbackMessage);
      }
    }

    return {
      playerMessage,
      npcResponses,
      npcs: this._enrichNpcsWithRevealedInfo(encounterId, session.npcs),
    };
  }

  /**
   * End an encounter session.
   *
   * @param {string} encounterId
   * @returns {{ encounterId, status, messageCount }}
   */
  endEncounter(encounterId) {
    const session = this._sessions.get(encounterId);
    if (!session) {
      const err = new Error(`Encounter not found: ${encounterId}`);
      err.code = 'ENCOUNTER_NOT_FOUND';
      throw err;
    }
    session.status = 'ended';
    return {
      encounterId,
      status: 'ended',
      messageCount: session.messages.length,
    };
  }

  /**
   * List all encounter sessions.
   *
   * @returns {Array<{ encounterId, npcs, status, messageCount, createdAt }>}
   */
  listEncounters() {
    this._pruneExpired();
    const result = [];
    for (const session of this._sessions.values()) {
      result.push({
        encounterId: session.id,
        npcs: session.npcs,
        status: session.status,
        messageCount: session.messages.length,
        createdAt: session.createdAt,
      });
    }
    return result;
  }

  /**
   * Clear all sessions (for testing).
   */
  clearAll() {
    this._sessions.clear();
  }
}
