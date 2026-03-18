import { buildEncounterSystemPrompt } from './buildEncounterSystemPrompt.js'
import { MemorySynthesizer } from '../services/MemorySynthesizer.js'

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
 *   - Uses NpcRuntimeContext for location/activity/mood (injected, optional)
 *   - Uses PersonalityEvolutionService for cross-session growth (injected, optional)
 *   - Uses buildEncounterSystemPrompt for vessel-surrender prompting
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
   * @param {import('./NpcRuntimeContext.js').NpcRuntimeContext} [deps.runtimeContext] — per-NPC runtime state
   * @param {import('./PersonalityEvolutionService.js').PersonalityEvolutionService} [deps.evolutionService] — cross-session growth
   * @param {function(string): Object|null} [deps.locationLookup] — returns location data for locationId
   * @param {import('../services/MemorySynthesizer.js').MemorySynthesizer} [deps.memorySynthesizer] — LLM encounter memory extraction
   * @param {import('../services/RelationshipRepository.js').RelationshipRepository} [deps.relationshipRepo] — persistent relationship store
   * @param {number} [deps.maxSessions]
   */
  constructor({ encounterMemory, infoExtraction, responseService, personalityLookup, runtimeContext, evolutionService, locationLookup, memorySynthesizer, relationshipRepo, maxSessions }) {
    this._encounterMemory = encounterMemory;
    this._infoExtraction = infoExtraction;
    this._responseService = responseService;
    this._personalityLookup = personalityLookup;
    this._runtimeContext = runtimeContext || null;
    this._evolutionService = evolutionService || null;
    this._locationLookup = locationLookup || null;
    this._memorySynthesizer = memorySynthesizer || null;
    this._relationshipRepo = relationshipRepo || null;
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

    // Auto-seed display labels for NPCs the player hasn't met
    this._seedDisplayLabels(npcs.map(n => n.templateKey));

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
      npcs: this._resolveNpcNamesForPlayer(this._enrichNpcsWithRevealedInfo(id, npcs)),
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
      npcs: this._resolveNpcNamesForPlayer(this._enrichNpcsWithRevealedInfo(encounterId, session.npcs)),
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
        // ── Build encounter system prompt ──────────────────────────
        const runtimeSnapshot = this._runtimeContext
          ? this._runtimeContext.getSnapshot(templateKey)
          : null;

        const ageInDays = this._runtimeContext && personality.age != null
          ? this._runtimeContext.computeAgeInDays(personality)
          : null;

        const memorySummary = this._encounterMemory.buildMemorySummary(encounterId, templateKey);

        const evolutionSummary = this._evolutionService
          ? this._evolutionService.buildEvolutionSummary(templateKey, personality)
          : '';

        const nearbyNpcKeys = session.npcs.map(n => n.templateKey).filter(k => k !== templateKey);

        // Build unified relationship context (opinions + memories)
        let relationshipContext = '';
        if (this._relationshipRepo) {
          this._relationshipRepo.seedFromPersonality(personality);
          const otherParticipants = nearbyNpcKeys.map(k => ({ id: k, templateKey: k, name: k }));
          relationshipContext = this._relationshipRepo.buildRelationshipContext(templateKey, otherParticipants);
        }

        const locationId = runtimeSnapshot?.currentLocation?.locationId
          || session.worldContext?.locationId
          || null;
        const location = locationId && this._locationLookup
          ? this._locationLookup(locationId)
          : null;

        const systemPrompt = buildEncounterSystemPrompt({
          personality,
          location,
          runtimeSnapshot,
          ageInDays,
          memorySummary,
          evolutionSummary,
          relationshipContext,
        });

        // ── Build multi-turn messages ──────────────────────────────
        const messages = this._buildConversationMessages(session, templateKey);

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
            maxTokens: 1024,
            format: 'spoken',
            avoidRepetition: [],
          },
        };

        const result = await this._responseService.generateResponse(contextPackage, {
          sessionId: encounterId,
          personality,
          entityId: 'player',
          playerMessage: text.trim(),
          systemPrompt,
          messages,
        });

        // Update encounter memory with this interaction
        this._encounterMemory.applyTriggerEffects(
          encounterId, templateKey, 'player_addressed', session.playerName
        );

        const npcMessage = {
          id: _messageId(),
          sender: templateKey,
          senderName: this._resolvePlayerDisplayName(templateKey, result.npcName || personality.name),
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
          senderName: this._resolvePlayerDisplayName(templateKey, personality.name),
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
      npcs: this._resolveNpcNamesForPlayer(this._enrichNpcsWithRevealedInfo(encounterId, session.npcs)),
    };
  }

  /**
   * Build multi-turn messages array for the LLM from session history.
   *
   * Converts the flat session.messages array into alternating user/assistant
   * messages for a specific NPC. Player messages → role:'user',
   * this NPC's messages → role:'assistant', other NPCs → folded into user context.
   *
   * @param {Object} session
   * @param {string} templateKey — the NPC we're generating for
   * @returns {Array<{ role: string, content: string }>}
   */
  _buildConversationMessages(session, templateKey) {
    const msgs = []

    for (const m of session.messages) {
      if (m.sender === 'player') {
        msgs.push({ role: 'user', content: m.text })
      } else if (m.sender === templateKey) {
        msgs.push({ role: 'assistant', content: m.text })
      } else {
        // Other NPC's speech — fold into user context so the NPC "hears" it
        msgs.push({ role: 'user', content: `[${m.senderName} says: "${m.text}"]` })
      }
    }

    return msgs
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
   * Synthesize and store relationship memories after an encounter ends.
   * Asks the DM LLM to analyze the transcript and record what each participant remembers.
   * No-op if memorySynthesizer or relationshipRepo are not wired.
   *
   * @param {string} encounterId
   * @returns {Promise<{ memoriesStored: number } | null>}
   */
  async synthesizeAndStoreMemories(encounterId) {
    if (!this._memorySynthesizer || !this._relationshipRepo) return null;

    const session = this._sessions.get(encounterId);
    if (!session) return null;

    const participants = [
      { id: 'player', name: session.playerName || 'Adventurer', isPlayer: true },
      ...session.npcs.map(npc => ({
        id: npc.templateKey,
        name: npc.name,
        isPlayer: false,
        templateKey: npc.templateKey,
      })),
    ];

    const { memories } = await this._memorySynthesizer.synthesizeEncounterMemories({
      transcript: session.messages,
      participants,
    });

    let stored = 0;
    for (const mem of memories) {
      this._relationshipRepo.recordMemory(mem.subjectId, mem.targetId, {
        summary: mem.summary,
        significance: mem.significance,
      });
      if (typeof mem.emotionalShift === 'number' && mem.emotionalShift !== 0) {
        this._relationshipRepo.adjustValence(mem.subjectId, mem.targetId, mem.emotionalShift);
      }
      if (mem.tierPromotion) {
        this._relationshipRepo.promoteTier(mem.subjectId, mem.targetId, mem.tierPromotion);
      }
      stored++;
    }

    return { memoriesStored: stored };
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

  // ── Player-facing name resolution ─────────────────────────────

  /**
   * Auto-seed display labels for NPCs the player hasn't met yet.
   * For each NPC: generate appearance label if stranger, promote to recognized.
   *
   * @param {string[]} templateKeys
   */
  _seedDisplayLabels(templateKeys) {
    if (!this._relationshipRepo) return;

    for (const key of templateKeys) {
      const rel = this._relationshipRepo.getOrCreateRelationship('player', key);

      if (!rel.displayLabel) {
        const personality = this._personalityLookup(key);
        if (personality) {
          const label = MemorySynthesizer.generateDisplayLabel(personality);
          this._relationshipRepo.setDisplayLabel('player', key, label);
        }
      }

      if (rel.recognitionTier === 'stranger') {
        this._relationshipRepo.promoteTier('player', key, 'recognized');
      }
    }
  }

  /**
   * Resolve an NPC's name for player-facing output based on recognition tier.
   *
   * @param {string} templateKey
   * @param {string} realName
   * @returns {string}
   */
  _resolvePlayerDisplayName(templateKey, realName) {
    if (!this._relationshipRepo) return realName;
    return this._relationshipRepo.getDisplayName('player', templateKey, realName);
  }

  /**
   * Resolve NPC names in an npcs array for player-facing output.
   *
   * @param {Array<{ templateKey, name, ... }>} npcs
   * @returns {Array}
   */
  _resolveNpcNamesForPlayer(npcs) {
    if (!this._relationshipRepo) return npcs;
    return npcs.map(npc => ({
      ...npc,
      name: this._resolvePlayerDisplayName(npc.templateKey, npc.name),
    }));
  }
}
