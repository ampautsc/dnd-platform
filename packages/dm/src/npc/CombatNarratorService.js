/**
 * CombatNarratorService — Bridges the combat engine and LLM personality layer.
 *
 * Listens for state changes (prevState → nextState) and semantic action results,
 * extracting narrative triggers (damage, death, crits) and generating NPC dialogue.
 *
 * Architecture:
 *   - Pure service — no filesystem, no DB, no global state
 *   - Uses CharacterResponseService (injected) for NPC response generation
 *   - Personality lookup is an injected function
 *   - Operates on GameState-like objects (getCombatant, getAllCombatants)
 *
 * @module CombatNarratorService
 */

import { TRIGGER_EVENT } from '../llm/CharacterContextPackage.js';

/**
 * Priority ranking for trigger deduplication.
 * Higher = wins when multiple triggers fire for same combatant.
 */
const TRIGGER_PRIORITY = Object.freeze({
  [TRIGGER_EVENT.NEAR_DEATH]: 4,
  [TRIGGER_EVENT.ALLY_DIED]:  3,
  [TRIGGER_EVENT.ATTACKED]:   2,
  [TRIGGER_EVENT.ENEMY_DIED]: 1,
});

export class CombatNarratorService {
  /**
   * @param {Object} deps
   * @param {import('./CharacterResponseService.js').CharacterResponseService} deps.responseService
   * @param {function(string): Object|null} deps.personalityLookup — returns personality for templateKey
   */
  constructor({ responseService, personalityLookup }) {
    this._responseService = responseService;
    this._personalityLookup = personalityLookup;
  }

  // ── Personality resolution ────────────────────────────────────────────

  _findPersonality(combatant) {
    const key = combatant.templateKey || combatant.id.split('-')[0];
    return this._personalityLookup(key);
  }

  // ── State transition processing ───────────────────────────────────────

  /**
   * Scan the state transition to generate dramatic triggers for all combatants.
   *
   * @param {string} sessionId
   * @param {Object} prevState — GameState-like with getCombatant/getAllCombatants
   * @param {Object} nextState
   * @param {string} actorId — who just acted
   * @param {Object} [resolutionResult] — { type, targetId, hit, isCrit }
   * @returns {Promise<string[]>} — Array of narration strings
   */
  async processStateTransition(sessionId, prevState, nextState, actorId, resolutionResult) {
    if (!sessionId || !prevState || !nextState) return [];

    const triggersToFire = [];

    for (const combatant of nextState.getAllCombatants()) {
      const prevC = prevState.getCombatant(combatant.id);
      if (!prevC) continue;

      // Only process NPCs
      if (combatant.side === 'player' && !combatant.isNPC) continue;

      // Must have a personality
      const personality = this._findPersonality(combatant);
      if (!personality) continue;

      // ── Death detection ───────────────────────────────────────
      if (combatant.currentHP <= 0 && prevC.currentHP > 0) {
        // This combatant just died — notify allies and enemies
        const allies = nextState.getAllCombatants().filter(
          c => c.side === combatant.side && c.id !== combatant.id,
        );
        for (const ally of allies) {
          triggersToFire.push({
            combatant: ally,
            triggerEvent: TRIGGER_EVENT.ALLY_DIED,
            entityId: combatant.id,
          });
        }

        const enemies = nextState.getAllCombatants().filter(
          c => c.side !== combatant.side,
        );
        for (const enemy of enemies) {
          triggersToFire.push({
            combatant: enemy,
            triggerEvent: TRIGGER_EVENT.ENEMY_DIED,
            entityId: combatant.id,
          });
        }

        continue; // Dead things don't talk
      }

      // ── Attacked with significant damage ──────────────────────
      if (resolutionResult && resolutionResult.targetId === combatant.id) {
        if (resolutionResult.hit) {
          const damageTaken = prevC.currentHP - combatant.currentHP;
          if (damageTaken > combatant.maxHP * 0.25) {
            triggersToFire.push({
              combatant,
              triggerEvent: TRIGGER_EVENT.ATTACKED,
              entityId: actorId,
            });
          }
        }
      }

      // ── Near death ────────────────────────────────────────────
      const hpPctPrev = prevC.currentHP / prevC.maxHP;
      const hpPctNow = combatant.currentHP / combatant.maxHP;
      if (hpPctPrev > 0.25 && hpPctNow <= 0.25 && hpPctNow > 0) {
        triggersToFire.push({
          combatant,
          triggerEvent: TRIGGER_EVENT.NEAR_DEATH,
          entityId: actorId,
        });
      }
    }

    // ── Deduplicate: one trigger per combatant, highest priority wins ──
    const uniqueTriggers = new Map();
    for (const t of triggersToFire) {
      // Only generate for combatants with personalities
      const personality = this._findPersonality(t.combatant);
      if (!personality) continue;

      if (!uniqueTriggers.has(t.combatant.id)) {
        uniqueTriggers.set(t.combatant.id, t);
      } else {
        const existing = uniqueTriggers.get(t.combatant.id);
        if ((TRIGGER_PRIORITY[t.triggerEvent] || 0) > (TRIGGER_PRIORITY[existing.triggerEvent] || 0)) {
          uniqueTriggers.set(t.combatant.id, t);
        }
      }
    }

    // ── Generate dialogue for each unique trigger ───────────────────────
    return this._generateNarrations(sessionId, uniqueTriggers, nextState);
  }

  /**
   * Hook for when an entire combat ends.
   * Generates COMBAT_END dialogue for each surviving NPC with a personality.
   *
   * @param {string} sessionId
   * @param {Object} finalState
   * @returns {Promise<string[]>}
   */
  async processCombatEnd(sessionId, finalState) {
    const narrations = [];

    for (const combatant of finalState.getAllCombatants()) {
      if (combatant.currentHP <= 0) continue;

      const personality = this._findPersonality(combatant);
      if (!personality) continue;

      const contextPackage = {
        character: {
          id: combatant.id,
          name: combatant.name,
          npcType: personality.npcType || 'enemy',
        },
        situationalContext: {
          triggerEvent: TRIGGER_EVENT.COMBAT_END,
          emotionalState: 'calm',
        },
        responseConstraints: {
          maxTokens: 80,
          format: 'spoken',
          avoidRepetition: [],
        },
      };

      try {
        const response = await this._responseService.generateResponse(contextPackage, {
          sessionId,
          personality,
        });
        if (response && response.text) {
          narrations.push(`${combatant.name} says: "${response.text}"`);
        }
      } catch {
        // Silently skip failed generations
      }
    }

    return narrations;
  }

  // ── Internal ──────────────────────────────────────────────────────────

  async _generateNarrations(sessionId, uniqueTriggers, nextState) {
    const narrations = [];

    for (const entry of uniqueTriggers.values()) {
      const { combatant, triggerEvent, entityId } = entry;
      const personality = this._findPersonality(combatant);
      if (!personality) continue;

      const contextPackage = {
        character: {
          id: combatant.id,
          name: combatant.name,
          npcType: personality.npcType || 'enemy',
        },
        situationalContext: {
          triggerEvent,
          emotionalState: 'tense',
        },
        responseConstraints: {
          maxTokens: 80,
          format: 'spoken',
          avoidRepetition: [],
        },
      };

      try {
        const response = await this._responseService.generateResponse(contextPackage, {
          sessionId,
          personality,
          entityId,
        });
        if (response && response.text) {
          narrations.push(`${combatant.name} says: "${response.text}"`);
        }
      } catch {
        // Silently skip failed generations
      }
    }

    return narrations;
  }
}
