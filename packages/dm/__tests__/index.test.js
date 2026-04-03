/**
 * Engine Integration Tests
 *
 * Requirements:
 * - createDmEngine exposes log, session, actions, scenes, story, NPC response, and encounter memory modules
 * - CharacterContextPackage enums and builders are re-exported from barrel
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDmEngine, TRIGGER_EVENT, NPC_TYPE, buildContextPackage } from '../src/index.js';
import { MockProvider } from '../src/llm/MockProvider.js';

describe('DM Engine Integration', () => {
  it('exposes all core services including encounterMemory', () => {
    const engine = createDmEngine();
    
    assert.notStrictEqual(engine.gameLog, undefined);
    assert.notStrictEqual(engine.sessionManager, undefined);
    assert.notStrictEqual(engine.actionProcessor, undefined);
    assert.notStrictEqual(engine.sceneManager, undefined);
    assert.notStrictEqual(engine.storyEngine, undefined);
    assert.notStrictEqual(engine.groupDecisionArbiter, undefined);
    assert.notStrictEqual(engine.characterResponseService, undefined);
    assert.notStrictEqual(engine.encounterMemory, undefined);
    assert.notStrictEqual(engine.infoExtraction, undefined);
    assert.notStrictEqual(engine.personalityEvolution, undefined);
    assert.notStrictEqual(engine.encounterSession, undefined);
    assert.notStrictEqual(engine.combatNarrator, undefined);
    assert.notStrictEqual(engine.npcScheduler, undefined);
    assert.notStrictEqual(engine.partyCoherenceMonitor, undefined);
    assert.notStrictEqual(engine.chapterGenerator, undefined);
    assert.notStrictEqual(engine.imagePromptBuilder, undefined);
    assert.notStrictEqual(engine.narrationGenerator, undefined);
    // ambientEngine is null by default — caller must init the local model and inject it
    assert.strictEqual(engine.ambientEngine, null);
  });

  it('accepts a custom provider for NPC responses', async () => {
    const provider = new MockProvider();
    provider.setMockResponse('Hail, adventurer!');
    const engine = createDmEngine({ provider });

    const result = await engine.characterResponseService.generateResponse(
      {
        character: { id: 'npc-1', name: 'Guard', npcType: 'friendly' },
        situationalContext: { triggerEvent: 'player_addressed', emotionalState: 'calm' },
        responseConstraints: { maxTokens: 60, format: 'spoken', avoidRepetition: [] },
      },
      { personality: { name: 'Guard', backstory: 'A loyal guard.' } }
    );

    assert.strictEqual(result.text, 'Hail, adventurer!');
    assert.strictEqual(result.source, 'llm');
  });

  it('re-exports CharacterContextPackage enums and builders', () => {
    assert.strictEqual(TRIGGER_EVENT.COMBAT_START, 'combat_start');
    assert.strictEqual(NPC_TYPE.ENEMY, 'enemy');
    assert.strictEqual(typeof buildContextPackage, 'function');
  });
});
