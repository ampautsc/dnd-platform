/**
 * SceneEngine — Turn-based initiative engine for social/exploration scenes.
 *
 * Mirrors combat's initiative structure for non-combat encounters.
 * Every participant (NPCs and player characters alike) rolls CHA-based
 * initiative, takes turns in order, and can speak, act, observe, or pass.
 *
 * NPCs are driven by vessel-surrender LLM calls on their turn.
 * Players submit free-text actions.
 * NPCs CANNOT distinguish between players and other NPCs.
 *
 * Architecture:
 *   - Immutable SceneState (modeled on combat's GameState)
 *   - CHA-based initiative via SceneInitiative
 *   - Scene-aware system prompts via buildSceneSystemPrompt
 *   - Auto-advances NPC turns after player action
 *   - In-memory store (Map), class-scoped for test isolation
 *
 * @module SceneEngine
 */

import { SceneState } from './SceneState.js';
import { rollSceneInitiative } from './SceneInitiative.js';
import { buildSceneSystemPrompt } from '../npc/buildSceneSystemPrompt.js';
import { MemorySynthesizer } from './MemorySynthesizer.js';

let _idCounter = 0;
let _entryCounter = 0;

function _generateSceneId() {
  return `scene_${(++_idCounter).toString(36)}${Date.now().toString(36)}`;
}

function _generateEntryId() {
  return `te_${(++_entryCounter).toString(36)}${Date.now().toString(36)}`;
}

const DEFAULT_MAX_SCENES = 50;
const SCENE_TTL = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Parse an NPC's LLM response into a structured action.
 * Expected format: "[TYPE] content" or "[TYPE][TO: target] content"
 * where TYPE is SPEAK, ACT, OBSERVE, PASS, or LEAVE.
 *
 * @param {string} responseText
 * @returns {{ type: string, content: string, target: string|null }}
 */
export function parseNpcAction(responseText) {
  const text = (responseText || '').trim();

  const match = text.match(/^\[(SPEAK|ACT|OBSERVE|PASS|LEAVE)\]\s*([\s\S]*)/i);
  if (match) {
    let type = match[1].toLowerCase();
    // Normalize SPEAK → speech to match convention used throughout the codebase
    if (type === 'speak') type = 'speech';
    let remainder = match[2].trim();
    let target = null;

    // Extract optional [TO: name] target
    const toMatch = remainder.match(/^\[to:\s*([^\]]+)\]\s*([\s\S]*)/i);
    if (toMatch) {
      target = toMatch[1].trim();
      remainder = toMatch[2].trim();
    }

    const content = remainder || (type === 'pass' || type === 'leave' ? '' : text);
    return { type, content, target };
  }

  // No bracket prefix — infer from content
  if (!text || text === '...' || text.toLowerCase() === 'pass') {
    return { type: 'pass', content: '', target: null };
  }
  if (text.startsWith('*') && text.endsWith('*')) {
    return { type: 'act', content: text, target: null };
  }
  // Default: treat as speech
  return { type: 'speech', content: text, target: null };
}

export class SceneEngine {
  /**
   * @param {Object} deps
   * @param {import('../npc/EncounterMemoryService.js').EncounterMemoryService} deps.encounterMemory
   * @param {import('../npc/CharacterResponseService.js').CharacterResponseService} deps.responseService
   * @param {function(string): Object|null} deps.personalityLookup
   * @param {import('../npc/NpcRuntimeContext.js').NpcRuntimeContext} [deps.runtimeContext]
   * @param {import('../npc/PersonalityEvolutionService.js').PersonalityEvolutionService} [deps.evolutionService]
   * @param {import('./SceneNarrator.js').SceneNarrator} [deps.sceneNarrator]
   * @param {function(string): Object|null} [deps.locationLookup]
   * @param {import('./MemorySynthesizer.js').MemorySynthesizer} [deps.memorySynthesizer]
   * @param {import('./RelationshipRepository.js').RelationshipRepository} [deps.relationshipRepo]
   * @param {number} [deps.maxScenes]
   */
  constructor({ encounterMemory, responseService, personalityLookup, runtimeContext, evolutionService, sceneNarrator, locationLookup, memorySynthesizer, relationshipRepo, maxScenes }) {
    this._encounterMemory = encounterMemory;
    this._responseService = responseService;
    this._personalityLookup = personalityLookup;
    this._runtimeContext = runtimeContext || null;
    this._evolutionService = evolutionService || null;
    this._sceneNarrator = sceneNarrator || null;
    this._locationLookup = locationLookup || null;
    this._memorySynthesizer = memorySynthesizer || null;
    this._relationshipRepo = relationshipRepo || null;
    this._maxScenes = maxScenes || DEFAULT_MAX_SCENES;

    /** @type {Map<string, SceneState>} */
    this._scenes = new Map();

    /** @type {Set<string>} Track which scenes have had their opening narrated */
    this._narratedOpenings = new Set();
  }

  // ── Housekeeping ──────────────────────────────────────────────

  _pruneExpired() {
    const now = Date.now();
    for (const [id, scene] of this._scenes) {
      if (now - (scene.createdAt || 0) > SCENE_TTL) {
        this._scenes.delete(id);
      }
    }
  }

  _throwError(message, code) {
    const err = new Error(message);
    err.code = code;
    throw err;
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Create a new scene.
   *
   * @param {Object} params
   * @param {Array<{ id, name, chaMod, isPlayer, templateKey }>} params.participants
   * @param {Object} [params.worldContext={}]
   * @param {number} [params.maxRounds=20]
   * @returns {SceneState}
   */
  createScene({ participants, worldContext = {}, maxRounds = 20 }) {
    if (!Array.isArray(participants) || participants.length === 0) {
      this._throwError('participants must be a non-empty array', 'INVALID_INPUT');
    }

    this._pruneExpired();
    if (this._scenes.size >= this._maxScenes) {
      this._throwError('Maximum scenes reached', 'MAX_SESSIONS');
    }

    const id = _generateSceneId();
    const state = new SceneState({ id, participants, createdAt: Date.now() })
      .withWorldContext(worldContext)
      .withMaxRounds(maxRounds);

    // Auto-seed display labels for NPCs the player hasn't met
    this._seedDisplayLabels(participants);

    this._scenes.set(id, state);
    return state;
  }

  /**
   * Resolve a scene state JSON for the player's perspective.
   * Replaces NPC names with display labels based on recognition tier.
   *
   * @param {Object} stateJson — output of SceneState.toJSON()
   * @returns {Object} — transformed JSON with resolved names
   */
  resolveForPlayer(stateJson) {
    if (!this._relationshipRepo) return stateJson;

    return {
      ...stateJson,
      participants: stateJson.participants.map(p => {
        if (p.isPlayer) return p;
        const templateKey = p.templateKey || p.id;
        return {
          ...p,
          name: this._relationshipRepo.getDisplayName('player', templateKey, p.name),
        };
      }),
      transcript: stateJson.transcript.map(entry => {
        if (entry.participantId === 'dm') return entry;
        const p = stateJson.participants.find(pp => pp.id === entry.participantId);
        if (!p || p.isPlayer) return entry;
        const templateKey = p.templateKey || p.id;
        return {
          ...entry,
          participantName: this._relationshipRepo.getDisplayName('player', templateKey, entry.participantName),
        };
      }),
    };
  }

  /**
   * Start a scene — roll initiative, set to active.
   *
   * @param {string} sceneId
   * @returns {SceneState}
   */
  startScene(sceneId) {
    let state = this._scenes.get(sceneId);
    if (!state) this._throwError(`Scene not found: ${sceneId}`, 'SCENE_NOT_FOUND');

    const { order, rolls } = rollSceneInitiative(state.allParticipants);

    state = state
      .withInitiativeOrder(order, rolls)
      .withRound(1)
      .withStatus('active')
      .withPendingAction(order[0]);

    this._scenes.set(sceneId, state);
    return state;
  }

  /**
   * Get current scene state.
   *
   * @param {string} sceneId
   * @returns {SceneState}
   */
  getScene(sceneId) {
    const state = this._scenes.get(sceneId);
    if (!state) this._throwError(`Scene not found: ${sceneId}`, 'SCENE_NOT_FOUND');
    return state;
  }

  /**
   * Submit a participant's action, then auto-resolve NPC turns.
   *
   * This is the main loop driver. When a player submits:
   * 1. Record the action in transcript
   * 2. Advance to next turn
   * 3. Auto-resolve all consecutive NPC turns until it's a player's turn
   *    (or the scene ends)
   * 4. Return updated state + all NPC actions generated
   *
   * @param {string} sceneId
   * @param {string} participantId
   * @param {{ type: string, content: string }} action
   * @returns {Promise<{ sceneState: SceneState, npcActions: Array }>}
   */
  async submitAction(sceneId, participantId, action) {
    let state = this._scenes.get(sceneId);
    if (!state) this._throwError(`Scene not found: ${sceneId}`, 'SCENE_NOT_FOUND');
    if (state.status !== 'active') this._throwError('Scene has ended', 'SCENE_ENDED');

    // Validate it's this participant's turn
    const current = state.currentParticipant;
    if (!current || current.id !== participantId) {
      this._throwError(
        `Not ${participantId}'s turn. Current turn: ${current?.id || 'none'}`,
        'NOT_YOUR_TURN'
      );
    }

    // Record player action in BOTH transcripts
    state = this._addTranscriptEntry(state, participantId, action.type, action.content);
    state = this._addPrivateTranscriptEntry(state, participantId, action.type, action.content);

    // Advance to next turn
    state = this._advanceTurn(state);

    // Auto-resolve NPC turns
    const npcActions = [];
    const npcInnerStates = [];
    let skipCount = 0;
    while (state.status === 'active') {
      const npcParticipant = state.currentParticipant;

      // Skip removed participants (e.g., left the scene)
      if (!npcParticipant) {
        state = this._advanceTurn(state);
        if (++skipCount > state.initiativeOrder.length) break;
        continue;
      }

      // Stop at player turn
      if (npcParticipant.isPlayer) break;
      skipCount = 0;

      const npcAction = await this._generateNpcAction(state, npcParticipant);

      // Record in private transcript (raw NPC output for DM)
      state = this._addPrivateTranscriptEntry(state, npcParticipant.id, npcAction.type, npcAction.content);

      // If no narrator, also add to public transcript (backward compat)
      if (!this._sceneNarrator) {
        state = this._addTranscriptEntry(state, npcParticipant.id, npcAction.type, npcAction.content);
      }

      npcActions.push({
        participantId: npcParticipant.id,
        participantName: this._resolvePlayerDisplayName(npcParticipant),
        templateKey: npcParticipant.templateKey,
        ...npcAction,
      });

      // Collect inner state for DM consciousness
      npcInnerStates.push(this._buildNpcInnerState(npcParticipant, state.allParticipants));

      // Handle LEAVE — remove NPC from scene
      if (npcAction.type === 'leave') {
        state = state.withoutParticipant(npcParticipant.id);
        const remainingNpcs = state.allParticipants.filter(p => !p.isPlayer);
        if (remainingNpcs.length === 0) {
          state = state.withEndReason('all_left');
          break;
        }
      }

      state = this._advanceTurn(state);
    }

    // DM narration: synthesize player-facing narration from NPC batch
    // Pass ALL NPC participant inner states (not just actors) so the DM
    // has full awareness of every character in the scene.
    if (npcActions.length > 0 && this._sceneNarrator) {
      const playerParticipant = state.allParticipants.find(p => p.isPlayer);

      // Collect inner states for ALL NPC participants, not just those who acted
      const allNpcInnerStates = state.allParticipants
        .filter(p => !p.isPlayer)
        .map(p => this._buildNpcInnerState(p, state.allParticipants));

      const { narration } = await this._sceneNarrator.narrateNpcBatch({
        npcActions,
        worldContext: state.worldContext,
        round: state.round,
        playerName: playerParticipant?.name || 'adventurer',
        npcInnerStates: allNpcInnerStates.length > 0 ? allNpcInnerStates : null,
        playerAction: action,
        sceneId: sceneId,
      });
      if (narration) {
        state = state.withTranscriptEntry({
          id: _generateEntryId(),
          participantId: 'dm',
          participantName: 'DM',
          type: 'narration',
          content: narration,
          round: state.round,
          turnIndex: state.turnIndex,
          timestamp: Date.now(),
        });
      }
    }

    // Update pending action
    if (state.status === 'active' && state.currentParticipant) {
      state = state.withPendingAction(state.currentParticipant.id);
    }

    this._scenes.set(sceneId, state);
    return { sceneState: state, npcActions };
  }

  /**
   * End a scene.
   *
   * @param {string} sceneId
   * @param {string} reason — 'player_left' | 'combat_triggered' | 'dm_ended' | 'all_left'
   * @returns {SceneState}
   */
  endScene(sceneId, reason = 'dm_ended') {
    let state = this._scenes.get(sceneId);
    if (!state) this._throwError(`Scene not found: ${sceneId}`, 'SCENE_NOT_FOUND');

    state = state.withEndReason(reason);
    this._scenes.set(sceneId, state);

    // Clean up narrator conversation history for this scene
    if (this._sceneNarrator?.clearNarratorHistory) {
      this._sceneNarrator.clearNarratorHistory(sceneId);
    }

    return state;
  }

  /**
   * Synthesize and store relationship memories after a scene ends.
   * Asks the DM LLM to analyze the transcript and record what each participant remembers.
   * No-op if memorySynthesizer or relationshipRepo are not wired.
   *
   * @param {string} sceneId
   * @returns {Promise<{ memoriesStored: number } | null>}
   */
  async synthesizeAndStoreMemories(sceneId) {
    if (!this._memorySynthesizer || !this._relationshipRepo) return null;

    const state = this._scenes.get(sceneId);
    if (!state) return null;

    // Use the private transcript (raw NPC output) if available, fall back to public
    const transcript = (state.privateTranscript?.length > 0 ? state.privateTranscript : state.transcript)
      .map(entry => ({
        sender: entry.participantId,
        senderName: entry.participantName,
        text: entry.content,
      }));

    const participants = state.initiativeOrder.map(p => ({
      id: p.id,
      name: p.name,
      isPlayer: p.isPlayer,
      templateKey: p.templateKey || p.id,
    }));

    const { memories } = await this._memorySynthesizer.synthesizeEncounterMemories({
      transcript,
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
   * Auto-resolve consecutive NPC turns from the current position.
   *
   * Use after startScene when NPCs rolled higher initiative than the player —
   * they take their opening turns before the player gets control.
   *
   * If it's already the player's turn, this is a no-op.
   *
   * @param {string} sceneId
   * @returns {Promise<{ sceneState: SceneState, npcActions: Array }>}
   */
  async advanceNpcTurns(sceneId) {
    let state = this._scenes.get(sceneId);
    if (!state) this._throwError(`Scene not found: ${sceneId}`, 'SCENE_NOT_FOUND');

    // ── Scene Opening Narration (first call only) ─────────────────
    if (this._sceneNarrator && !this._narratedOpenings.has(sceneId)) {
      this._narratedOpenings.add(sceneId);

      const playerParticipant = state.allParticipants.find(p => p.isPlayer);
      const npcParticipants = state.allParticipants.filter(p => !p.isPlayer);

      // Build inner states for ALL NPCs in the scene
      const allNpcInnerStates = npcParticipants.map(p => this._buildNpcInnerState(p, state.allParticipants));

      // Build participant names for the narrator
      const participantNames = npcParticipants.map(p => ({
        realName: p.name,
        templateKey: p.templateKey || p.id,
      }));

      if (this._sceneNarrator.narrateSceneOpening) {
        const { narration } = await this._sceneNarrator.narrateSceneOpening({
          worldContext: state.worldContext,
          participantNames,
          playerName: playerParticipant?.name || 'adventurer',
          npcInnerStates: allNpcInnerStates.length > 0 ? allNpcInnerStates : null,
          sceneId: state.id,
        });
        if (narration) {
          state = state.withTranscriptEntry({
            id: _generateEntryId(),
            participantId: 'dm',
            participantName: 'DM',
            type: 'narration',
            content: narration,
            round: state.round,
            turnIndex: state.turnIndex,
            timestamp: Date.now(),
          });
        } else {
          console.warn('[SceneEngine] narrateSceneOpening returned empty narration — opening transcript entry skipped');
        }
      }
    }

    const npcActions = [];
    const npcInnerStates = [];
    let skipCount = 0;

    while (state.status === 'active') {
      const npcParticipant = state.currentParticipant;

      // Skip removed participants (e.g., left the scene)
      if (!npcParticipant) {
        state = this._advanceTurn(state);
        if (++skipCount > state.initiativeOrder.length) break;
        continue;
      }

      // Stop at player turn
      if (npcParticipant.isPlayer) break;
      skipCount = 0;

      const npcAction = await this._generateNpcAction(state, npcParticipant);

      // Record in private transcript (raw NPC output for DM)
      state = this._addPrivateTranscriptEntry(state, npcParticipant.id, npcAction.type, npcAction.content);

      // If no narrator, also add to public transcript (backward compat)
      if (!this._sceneNarrator) {
        state = this._addTranscriptEntry(state, npcParticipant.id, npcAction.type, npcAction.content);
      }

      npcActions.push({
        participantId: npcParticipant.id,
        participantName: this._resolvePlayerDisplayName(npcParticipant),
        templateKey: npcParticipant.templateKey,
        ...npcAction,
      });

      // Collect inner state for DM consciousness
      npcInnerStates.push(this._buildNpcInnerState(npcParticipant, state.allParticipants));

      // Handle LEAVE — remove NPC from scene
      if (npcAction.type === 'leave') {
        state = state.withoutParticipant(npcParticipant.id);
        const remainingNpcs = state.allParticipants.filter(p => !p.isPlayer);
        if (remainingNpcs.length === 0) {
          state = state.withEndReason('all_left');
          break;
        }
      }

      state = this._advanceTurn(state);
    }

    // DM narration: synthesize player-facing narration from NPC batch
    // Pass ALL NPC participant inner states (not just actors) so the DM
    // has full awareness of every character in the scene.
    if (npcActions.length > 0 && this._sceneNarrator) {
      const playerParticipant = state.allParticipants.find(p => p.isPlayer);

      // Collect inner states for ALL NPC participants, not just those who acted
      const allNpcInnerStates = state.allParticipants
        .filter(p => !p.isPlayer)
        .map(p => this._buildNpcInnerState(p, state.allParticipants));

      const { narration } = await this._sceneNarrator.narrateNpcBatch({
        npcActions,
        worldContext: state.worldContext,
        round: state.round,
        playerName: playerParticipant?.name || 'adventurer',
        npcInnerStates: allNpcInnerStates.length > 0 ? allNpcInnerStates : null,
        sceneId: sceneId,
      });
      if (narration) {
        state = state.withTranscriptEntry({
          id: _generateEntryId(),
          participantId: 'dm',
          participantName: 'DM',
          type: 'narration',
          content: narration,
          round: state.round,
          turnIndex: state.turnIndex,
          timestamp: Date.now(),
        });
      }
    }

    // Update pending action
    if (state.status === 'active' && state.currentParticipant) {
      state = state.withPendingAction(state.currentParticipant.id);
    }

    this._scenes.set(sceneId, state);
    return { sceneState: state, npcActions };
  }

  /**
   * List all scenes.
   *
   * @returns {Array<{ sceneId, status, participantCount, round, createdAt }>}
   */
  listScenes() {
    this._pruneExpired();
    const result = [];
    for (const state of this._scenes.values()) {
      result.push({
        sceneId: state.id,
        status: state.status,
        participantCount: state.participantCount,
        round: state.round,
        createdAt: state.createdAt || null,
      });
    }
    return result;
  }

  /**
   * Clear all scenes (for testing).
   */
  clearAll() {
    this._scenes.clear();
  }

  // ── Internal methods ──────────────────────────────────────────

  /**
   * Auto-seed display labels for NPCs the player hasn't met yet.
   * Called during createScene. For each NPC participant:
   * - If player→NPC is stranger with no display label: generate one from appearance data
   * - Promote stranger → recognized (player has seen them in the room)
   *
   * @param {Array<{ id, name, isPlayer, templateKey }>} participants
   */
  _seedDisplayLabels(participants) {
    if (!this._relationshipRepo) return;

    for (const p of participants) {
      if (p.isPlayer) continue;
      const templateKey = p.templateKey || p.id;
      const rel = this._relationshipRepo.getOrCreateRelationship('player', templateKey);

      // Set display label if not already set
      if (!rel.displayLabel) {
        const personality = this._personalityLookup(templateKey);
        if (personality) {
          const label = MemorySynthesizer.generateDisplayLabel(personality);
          this._relationshipRepo.setDisplayLabel('player', templateKey, label);
        }
      }

      // Promote to recognized — player has seen them
      if (rel.recognitionTier === 'stranger') {
        this._relationshipRepo.promoteTier('player', templateKey, 'recognized');
      }
    }
  }

  /**
   * Resolve an NPC participant's name for player-facing output.
   * Uses the RelationshipRepository's recognition-gated display names.
   *
   * @param {{ id, name, isPlayer, templateKey }} participant
   * @returns {string} display name (label for strangers, real name for acquaintances+)
   */
  _resolvePlayerDisplayName(participant) {
    if (!this._relationshipRepo || participant.isPlayer) return participant.name;
    const templateKey = participant.templateKey || participant.id;
    return this._relationshipRepo.getDisplayName('player', templateKey, participant.name);
  }

  /**
   * Build NPC inner state data for the DM consciousness prompt.
   * Collects mood, wants/needs, secrets, activity from personality + runtime.
   *
   * @param {{ id, name, isPlayer, templateKey }} participant
   * @returns {{ displayName, mood, consciousWant, unconsciousNeed, currentActivity, secrets, isLying }}
   */
  _buildNpcInnerState(participant, allParticipants = []) {
    const displayName = this._resolvePlayerDisplayName(participant);
    const personality = this._personalityLookup?.(participant.templateKey) || null;
    const snapshot = this._runtimeContext?.getSnapshot(participant.templateKey) || null;
    const cc = personality?.consciousnessContext || null;

    // Build NPC-to-NPC relationship data
    let relationships = null;
    if (this._relationshipRepo && allParticipants.length > 0) {
      const npcKey = participant.templateKey || participant.id;
      const rels = [];
      for (const other of allParticipants) {
        if (other.isPlayer || other.id === participant.id) continue;
        const otherKey = other.templateKey || other.id;
        const rel = this._relationshipRepo.getRelationship(npcKey, otherKey);
        if (rel && rel.recognitionTier !== 'stranger') {
          rels.push({
            targetDisplayName: this._resolvePlayerDisplayName(other),
            opinion: rel.opinion || null,
            recognitionTier: rel.recognitionTier,
            valence: rel.emotionalValence >= 0.2 ? 'positive' : rel.emotionalValence <= -0.2 ? 'negative' : 'neutral',
          });
        }
      }
      if (rels.length > 0) relationships = rels;
    }

    return {
      displayName,
      mood: snapshot?.currentMood || cc?.emotionalBaseline || null,
      consciousWant: cc?.consciousWant || null,
      unconsciousNeed: cc?.unconsciousNeed || null,
      currentActivity: snapshot?.currentActivity || null,
      secrets: personality?.knowledge?.secretsHeld?.length ? personality.knowledge.secretsHeld : null,
      isLying: false, // TODO: detect lies from NPC response analysis
      gender: personality?.gender || null,
      race: personality?.race || null,
      appearance: personality?.appearance || null,
      relationships,
    };
  }

  /**
   * Add an entry to the public transcript.
   * Uses recognition-gated names for player-facing display.
   * @returns {SceneState}
   */
  _addTranscriptEntry(state, participantId, type, content) {
    const participant = state.getParticipant(participantId);
    const displayName = participant ? this._resolvePlayerDisplayName(participant) : participantId;
    return state.withTranscriptEntry({
      id: _generateEntryId(),
      participantId,
      participantName: displayName,
      type,
      content,
      round: state.round,
      turnIndex: state.turnIndex,
      timestamp: Date.now(),
    });
  }

  /**
   * Add an entry to the private transcript (raw NPC output, DM-only).
   * @returns {SceneState}
   */
  _addPrivateTranscriptEntry(state, participantId, type, content) {
    const participant = state.getParticipant(participantId);
    return state.withPrivateTranscriptEntry({
      id: _generateEntryId(),
      participantId,
      participantName: participant?.name || participantId,
      type,
      content,
      round: state.round,
      turnIndex: state.turnIndex,
      timestamp: Date.now(),
    });
  }

  /**
   * Advance to the next turn. Increments round if needed. Checks round cap.
   * @returns {SceneState}
   */
  _advanceTurn(state) {
    const nextIndex = state.turnIndex + 1;

    if (nextIndex >= state.initiativeOrder.length) {
      // New round
      const nextRound = state.round + 1;
      if (nextRound > state.maxRounds) {
        return state.withEndReason('round_cap');
      }
      return state.withTurnIndex(0).withRound(nextRound);
    }

    return state.withTurnIndex(nextIndex);
  }

  /**
   * Generate an NPC's action via LLM.
   *
   * Builds the scene-aware system prompt and converts the transcript
   * into multi-turn messages from this NPC's perspective.
   *
   * @param {SceneState} state
   * @param {{ id, name, templateKey }} npcParticipant
   * @returns {Promise<{ type: string, content: string }>}
   */
  async _generateNpcAction(state, npcParticipant) {
    const personality = this._personalityLookup(npcParticipant.templateKey);
    if (!personality) {
      return { type: 'observe', content: '*looks around quietly*' };
    }

    try {
      // Build runtime context
      const runtimeSnapshot = this._runtimeContext
        ? this._runtimeContext.getSnapshot(npcParticipant.templateKey)
        : null;

      const ageInDays = this._runtimeContext && personality.age != null
        ? this._runtimeContext.computeAgeInDays(personality)
        : null;

      const memorySummary = this._encounterMemory
        ? this._encounterMemory.buildMemorySummary(state.id, npcParticipant.templateKey)
        : null;

      const evolutionSummary = this._evolutionService
        ? this._evolutionService.buildEvolutionSummary(npcParticipant.templateKey, personality)
        : '';

      // Build relationship context from persistent memories + opinions (unified)
      let relationshipContext = '';
      let nameResolver = null;
      if (this._relationshipRepo) {
        const npcId = npcParticipant.templateKey || npcParticipant.id;

        // Seed relationships from personality opinionsAbout if not already seeded
        if (personality) {
          this._relationshipRepo.seedFromPersonality(personality);
        }

        const otherParticipants = state.allParticipants
          .filter(p => p.id !== npcParticipant.id)
          .map(p => ({ id: p.id, templateKey: p.templateKey || p.id, name: p.name }));

        relationshipContext = this._relationshipRepo.buildRelationshipContext(npcId, otherParticipants);

        // Name resolver for scene participant list
        nameResolver = (participantId, realName) => {
          const targetKey = state.allParticipants.find(p => p.id === participantId)?.templateKey || participantId;
          return this._relationshipRepo.getDisplayName(npcId, targetKey, realName);
        };
      }

      // Build scene-aware system prompt
      // Look up full location data for atmosphere (sounds, smells, lighting)
      const locationId = state.worldContext?.locationId;
      const location = locationId && this._locationLookup ? this._locationLookup(locationId) : null;

      const systemPrompt = buildSceneSystemPrompt({
        personality,
        location,
        runtimeSnapshot,
        ageInDays,
        memorySummary,
        evolutionSummary,
        relationshipContext,
        timeOfDay: state.worldContext?.timeOfDay || null,
        sceneContext: {
          participants: state.allParticipants.map(p => ({ id: p.id, name: p.name })),
          round: state.round,
          thisParticipantId: npcParticipant.id,
          nameResolver,
        },
      });

      // Build multi-turn messages from transcript
      // ⚠ CANONICAL user prompt template — pass NPC context so first message matches
      // the product-owner-defined format: "{name}, this is your {days} day. You have
      // just been {context}, and you were planning to {plan}, when {trigger} occurs."
      const messages = this._buildSceneMessages(state, npcParticipant.id, {
        name: personality.name,
        ageInDays,
        currentActivity: runtimeSnapshot?.currentActivity || null,
        dailyPlan: runtimeSnapshot?.dailyPlan || null,
        sceneTrigger: state.worldContext?.scenePremise || null,
      });

      // Context package for CharacterResponseService
      const contextPackage = {
        character: {
          id: npcParticipant.templateKey,
          name: personality.name,
          npcType: personality.npcType || 'neutral',
        },
        situationalContext: {
          triggerEvent: 'scene_turn',
          emotionalState: 'calm',
          nearbyEntities: state.allParticipants
            .filter(p => p.id !== npcParticipant.id)
            .map(p => ({
              name: nameResolver ? nameResolver(p.id, p.name) : p.name,
              side: 'neutral', hpStatus: 'healthy', distance: 5,
            })),
          recentEvents: [],
        },
        responseConstraints: {
          maxTokens: 512,
          format: 'spoken',
          avoidRepetition: [],
        },
      };

      const result = await this._responseService.generateResponse(contextPackage, {
        sessionId: state.id,
        personality,
        systemPrompt,
        messages,
      });

      // Update memory
      if (this._encounterMemory) {
        this._encounterMemory.applyTriggerEffects(
          state.id, npcParticipant.templateKey, 'scene_turn', npcParticipant.name
        );
      }

      return parseNpcAction(result.text);

    } catch {
      // Fallback: NPC observes silently
      return { type: 'observe', content: '*looks around quietly*' };
    }
  }

  /**
   * Build multi-turn messages from the private transcript for a specific NPC.
   *
   * Uses privateTranscript (raw NPC output) for context.
   * This NPC's prior entries → role: 'assistant' (full content — they know their own thoughts)
   * Other participants' entries → role: 'user' (observable content only — no inner monologue leak)
   *
   * @param {SceneState} state
   * @param {string} participantId — this NPC's participant ID
   * @returns {Array<{ role: string, content: string }>}
   */
  /**
   * @param {SceneState} state
   * @param {string} participantId
   * @param {object} [npcContext] — passed from NPC turn builder, used for canonical first message
   * @param {string|null} [npcContext.name]
   * @param {number|null} [npcContext.ageInDays]
   * @param {string|null} [npcContext.currentActivity]
   * @param {string|null} [npcContext.dailyPlan]
   * @param {string|null} [npcContext.sceneTrigger]
   */
  _buildSceneMessages(state, participantId, npcContext = {}) {
    const msgs = [];

    for (const entry of state.privateTranscript) {
      if (entry.participantId === participantId) {
        // This NPC's own prior actions — full content (they know their own thoughts)
        const label = this._formatTranscriptEntry(entry);
        msgs.push({ role: 'assistant', content: label });
      } else {
        // Someone else — observable content only (no inner monologue leak)
        const label = this._extractObservableContent(entry);
        msgs.push({ role: 'user', content: `[${entry.participantName}: ${label}]` });
      }
    }

    // If no messages yet, build the canonical first user message.
    // ⚠ CANONICAL format (DO NOT MODIFY without product owner approval):
    // "{name}, this is your {days} day.  You have just been {context}, and you
    //  were planning to {plan}, when {trigger} occurs.  What do you do?"
    if (msgs.length === 0) {
      const { name, ageInDays, currentActivity, dailyPlan, sceneTrigger } = npcContext;
      const parts = [];

      if (name && ageInDays != null) {
        parts.push(`${name}, this is your ${ageInDays.toLocaleString()}-day-old life.`);
      }

      if (currentActivity) {
        parts.push(`You have just been ${currentActivity}.`);
      }

      if (dailyPlan) {
        parts.push(`You were planning to ${dailyPlan}.`);
      }

      if (sceneTrigger) {
        parts.push(`${sceneTrigger}  What do you do?`);
      } else {
        parts.push('The scene unfolds before you.  What do you do?');
      }

      msgs.push({ role: 'user', content: parts.join('  ') });
    }

    return msgs;
  }

  /**
   * Extract observable content from an entry (for other NPCs' messages).
   * Strips inner monologue — only what can be seen/heard by others.
   */
  _extractObservableContent(entry) {
    switch (entry.type) {
      case 'speech':
        return `"${entry.content}"`;
      case 'act':
        return entry.content;
      case 'observe':
        return '*observes quietly*';
      case 'pass':
        return '*does nothing*';
      case 'leave':
        return '*leaves the scene*';
      default:
        return entry.content || '...';
    }
  }

  /**
   * Format a transcript entry for message building (full content — for own messages).
   */
  _formatTranscriptEntry(entry) {
    switch (entry.type) {
      case 'speech':
        return `"${entry.content}"`;
      case 'act':
        return entry.content;
      case 'observe':
        return entry.content || '*observes silently*';
      case 'pass':
        return '*does nothing*';
      case 'leave':
        return entry.content || '*leaves the scene*';
      default:
        return entry.content || '...';
    }
  }
}
