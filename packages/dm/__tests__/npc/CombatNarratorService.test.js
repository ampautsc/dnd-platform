import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { CombatNarratorService } from '../../src/npc/CombatNarratorService.js';
import { MockProvider } from '../../src/llm/MockProvider.js';
import { CharacterContextBuilder } from '../../src/npc/CharacterContextBuilder.js';
import { CharacterResponseService } from '../../src/npc/CharacterResponseService.js';
import { TRIGGER_EVENT } from '../../src/llm/CharacterContextPackage.js';

/**
 * CombatNarratorService Requirements:
 *
 * 1. processStateTransition(sessionId, prevState, nextState, actorId, resolutionResult)
 *    a. Returns [] for null/missing inputs
 *    b. Detects NEAR_DEATH when HP drops ≤ 25%
 *    c. Detects ATTACKED when significant damage (>25% maxHP) dealt
 *    d. Detects ALLY_DIED when an ally dies
 *    e. Detects ENEMY_DIED when an enemy dies
 *    f. Generates narration text for each trigger via CharacterResponseService
 *    g. Deduplicates: one trigger per combatant (highest priority wins)
 *    h. Priority order: NEAR_DEATH > ALLY_DIED > ATTACKED > ENEMY_DIED
 *    i. Only generates dialogue for NPCs with personalities
 *
 * 2. processCombatEnd(sessionId, finalState)
 *    a. Generates COMBAT_END dialogue for each surviving NPC with personality
 *    b. Skips dead combatants
 *    c. Returns [] if no NPCs have personalities
 */

/** Minimal combatant stub */
function makeCombatant(id, side, currentHP, maxHP, overrides = {}) {
  return {
    id,
    side,
    currentHP,
    maxHP,
    name: overrides.name || id,
    templateKey: overrides.templateKey || null,
    isNPC: overrides.isNPC !== undefined ? overrides.isNPC : true,
    ...overrides,
  };
}

/** Minimal GameState stub with getCombatant and getAllCombatants */
function makeState(combatants) {
  return {
    getCombatant: (id) => combatants.find(c => c.id === id) || null,
    getAllCombatants: () => [...combatants],
  };
}

/** A basic personality record */
function makePersonality(key, name) {
  return {
    templateKey: key,
    name,
    race: 'Human',
    npcType: 'enemy',
    personality: {
      voice: 'gruff',
      disposition: 'Hostile.',
      backstory: 'A mercenary.',
    },
  };
}

describe('CombatNarratorService', () => {
  let service;
  let provider;
  let personalities;

  beforeEach(() => {
    provider = new MockProvider();
    const contextBuilder = new CharacterContextBuilder();
    const responseService = new CharacterResponseService({ provider, contextBuilder });
    personalities = {
      bandit: makePersonality('bandit', 'Bandit Captain'),
      guard: makePersonality('guard', 'Town Guard'),
    };
    personalities.guard.npcType = 'friendly';

    service = new CombatNarratorService({
      responseService,
      personalityLookup: (key) => personalities[key] || null,
    });
  });

  // ── processStateTransition ─────────────────────────────────────────────

  describe('processStateTransition', () => {
    it('should return empty array for null inputs', async () => {
      assert.deepStrictEqual(await service.processStateTransition(null, null, null, null, null), []);
      assert.deepStrictEqual(await service.processStateTransition('s1', null, makeState([]), 'a', null), []);
    });

    it('should detect NEAR_DEATH when HP drops to ≤ 25%', async () => {
      provider.setMockResponse('This... isn\'t over...');

      const prev = makeState([
        makeCombatant('bandit-1', 'enemy', 30, 100, { templateKey: 'bandit', name: 'Bandit Captain' }),
        makeCombatant('player-1', 'player', 50, 50, { isNPC: false }),
      ]);
      const next = makeState([
        makeCombatant('bandit-1', 'enemy', 20, 100, { templateKey: 'bandit', name: 'Bandit Captain' }),
        makeCombatant('player-1', 'player', 50, 50, { isNPC: false }),
      ]);

      const result = await service.processStateTransition('s1', prev, next, 'player-1', {
        type: 'attack', targetId: 'bandit-1', hit: true,
      });

      assert.ok(result.length >= 1);
      assert.ok(result[0].includes('Bandit Captain'));
    });

    it('should detect ATTACKED when >25% maxHP damage dealt', async () => {
      provider.setMockResponse('You\'ll pay for that!');

      const prev = makeState([
        makeCombatant('bandit-1', 'enemy', 100, 100, { templateKey: 'bandit', name: 'Bandit Captain' }),
        makeCombatant('player-1', 'player', 50, 50, { isNPC: false }),
      ]);
      const next = makeState([
        makeCombatant('bandit-1', 'enemy', 70, 100, { templateKey: 'bandit', name: 'Bandit Captain' }),
        makeCombatant('player-1', 'player', 50, 50, { isNPC: false }),
      ]);

      const result = await service.processStateTransition('s1', prev, next, 'player-1', {
        type: 'attack', targetId: 'bandit-1', hit: true,
      });

      assert.ok(result.length >= 1);
      assert.ok(result[0].includes('Bandit Captain'));
    });

    it('should detect ALLY_DIED when teammate dies', async () => {
      provider.setMockResponse('No! Fall back!');

      const prev = makeState([
        makeCombatant('guard-1', 'ally', 10, 50, { templateKey: 'guard', name: 'Town Guard' }),
        makeCombatant('guard-2', 'ally', 50, 50, { templateKey: 'guard', name: 'Guard Sergeant' }),
        makeCombatant('bandit-1', 'enemy', 50, 50, { templateKey: 'bandit', name: 'Bandit Captain' }),
      ]);
      const next = makeState([
        makeCombatant('guard-1', 'ally', 0, 50, { templateKey: 'guard', name: 'Town Guard' }),
        makeCombatant('guard-2', 'ally', 50, 50, { templateKey: 'guard', name: 'Guard Sergeant' }),
        makeCombatant('bandit-1', 'enemy', 50, 50, { templateKey: 'bandit', name: 'Bandit Captain' }),
      ]);

      const result = await service.processStateTransition('s1', prev, next, 'bandit-1', null);

      assert.ok(result.length >= 1);
      // Guard Sergeant should react to ally dying
      const sergeantNarration = result.find(r => r.includes('Guard Sergeant'));
      assert.notStrictEqual(sergeantNarration, undefined);
    });

    it('should detect ENEMY_DIED when foe dies', async () => {
      provider.setMockResponse('One less to worry about.');

      const prev = makeState([
        makeCombatant('bandit-1', 'enemy', 5, 50, { templateKey: 'bandit', name: 'Bandit Captain' }),
        makeCombatant('guard-1', 'ally', 50, 50, { templateKey: 'guard', name: 'Town Guard' }),
      ]);
      const next = makeState([
        makeCombatant('bandit-1', 'enemy', 0, 50, { templateKey: 'bandit', name: 'Bandit Captain' }),
        makeCombatant('guard-1', 'ally', 50, 50, { templateKey: 'guard', name: 'Town Guard' }),
      ]);

      const result = await service.processStateTransition('s1', prev, next, 'guard-1', null);

      assert.ok(result.length >= 1);
      // Guard reacts to enemy dying
      assert.notStrictEqual(result.find(r => r.includes('Town Guard')), undefined);
    });

    it('should skip player characters (non-NPC) for dialogue generation', async () => {
      provider.setMockResponse('Something.');

      const prev = makeState([
        makeCombatant('player-1', 'player', 50, 50, { isNPC: false }),
        makeCombatant('bandit-1', 'enemy', 50, 50, { templateKey: 'bandit', name: 'Bandit Captain' }),
      ]);
      const next = makeState([
        makeCombatant('player-1', 'player', 10, 50, { isNPC: false }),
        makeCombatant('bandit-1', 'enemy', 50, 50, { templateKey: 'bandit', name: 'Bandit Captain' }),
      ]);

      const result = await service.processStateTransition('s1', prev, next, 'bandit-1', {
        type: 'attack', targetId: 'player-1', hit: true,
      });

      // Player shouldn't generate dialogue even if near death
      const playerLine = result.find(r => r.includes('player-1'));
      assert.strictEqual(playerLine, undefined);
    });

    it('should skip combatants without personalities', async () => {
      const service2 = new CombatNarratorService({
        responseService: new CharacterResponseService({
          provider,
          contextBuilder: new CharacterContextBuilder(),
        }),
        personalityLookup: () => null, // No personalities for anyone
      });

      const prev = makeState([
        makeCombatant('goblin-1', 'enemy', 30, 100, { templateKey: 'goblin', name: 'Goblin' }),
      ]);
      const next = makeState([
        makeCombatant('goblin-1', 'enemy', 20, 100, { templateKey: 'goblin', name: 'Goblin' }),
      ]);

      const result = await service2.processStateTransition('s1', prev, next, 'player-1', {
        type: 'attack', targetId: 'goblin-1', hit: true,
      });

      assert.deepStrictEqual(result, []);
    });

    it('should deduplicate triggers — highest priority wins per combatant', async () => {
      // Bandit takes massive damage AND drops to near death — NEAR_DEATH should win
      provider.setMockResponse('Not like this...');

      const prev = makeState([
        makeCombatant('bandit-1', 'enemy', 50, 100, { templateKey: 'bandit', name: 'Bandit Captain' }),
        makeCombatant('player-1', 'player', 50, 50, { isNPC: false }),
      ]);
      const next = makeState([
        makeCombatant('bandit-1', 'enemy', 20, 100, { templateKey: 'bandit', name: 'Bandit Captain' }),
        makeCombatant('player-1', 'player', 50, 50, { isNPC: false }),
      ]);

      const result = await service.processStateTransition('s1', prev, next, 'player-1', {
        type: 'attack', targetId: 'bandit-1', hit: true,
      });

      // Should only get ONE narration for bandit (not two for ATTACKED + NEAR_DEATH)
      const banditLines = result.filter(r => r.includes('Bandit Captain'));
      assert.strictEqual(banditLines.length, 1);
    });
  });

  // ── processCombatEnd ───────────────────────────────────────────────────

  describe('processCombatEnd', () => {
    it('should generate COMBAT_END dialogue for surviving NPCs', async () => {
      provider.setMockResponse('We survived.');

      const finalState = makeState([
        makeCombatant('guard-1', 'ally', 30, 50, { templateKey: 'guard', name: 'Town Guard' }),
        makeCombatant('bandit-1', 'enemy', 0, 50, { templateKey: 'bandit', name: 'Bandit Captain' }),
      ]);

      const result = await service.processCombatEnd('s1', finalState);

      // Only the guard (alive) should speak
      assert.ok(result.length >= 1);
      assert.notStrictEqual(result.find(r => r.includes('Town Guard')), undefined);
      assert.strictEqual(result.find(r => r.includes('Bandit Captain')), undefined);
    });

    it('should return empty array when no NPCs have personalities', async () => {
      const service2 = new CombatNarratorService({
        responseService: new CharacterResponseService({
          provider,
          contextBuilder: new CharacterContextBuilder(),
        }),
        personalityLookup: () => null,
      });

      const finalState = makeState([
        makeCombatant('goblin-1', 'enemy', 20, 50, { name: 'Goblin' }),
      ]);

      const result = await service2.processCombatEnd('s1', finalState);
      assert.deepStrictEqual(result, []);
    });

    it('should skip dead combatants', async () => {
      provider.setMockResponse('Victory!');

      const finalState = makeState([
        makeCombatant('guard-1', 'ally', 0, 50, { templateKey: 'guard', name: 'Town Guard' }),
        makeCombatant('bandit-1', 'enemy', 0, 50, { templateKey: 'bandit', name: 'Bandit Captain' }),
      ]);

      const result = await service.processCombatEnd('s1', finalState);
      assert.deepStrictEqual(result, []);
    });
  });
});
