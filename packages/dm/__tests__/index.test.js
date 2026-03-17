/**
 * Engine Integration Tests
 *
 * Requirements:
 * - createDmEngine exposes log, session, actions, scenes, story, NPC response, and encounter memory modules
 * - CharacterContextPackage enums and builders are re-exported from barrel
 */
import { describe, it, expect } from 'vitest';
import { createDmEngine, TRIGGER_EVENT, NPC_TYPE, buildContextPackage } from '../src/index.js';
import { MockProvider } from '../src/llm/MockProvider.js';

describe('DM Engine Integration', () => {
  it('exposes all core services including encounterMemory', () => {
    const engine = createDmEngine();
    
    expect(engine.gameLog).toBeDefined();
    expect(engine.sessionManager).toBeDefined();
    expect(engine.actionProcessor).toBeDefined();
    expect(engine.sceneManager).toBeDefined();
    expect(engine.storyEngine).toBeDefined();
    expect(engine.groupDecisionArbiter).toBeDefined();
    expect(engine.characterResponseService).toBeDefined();
    expect(engine.encounterMemory).toBeDefined();
    expect(engine.infoExtraction).toBeDefined();
    expect(engine.personalityEvolution).toBeDefined();
    expect(engine.encounterSession).toBeDefined();
    expect(engine.combatNarrator).toBeDefined();
    expect(engine.npcScheduler).toBeDefined();
    expect(engine.partyCoherenceMonitor).toBeDefined();
    expect(engine.chapterGenerator).toBeDefined();
    expect(engine.imagePromptBuilder).toBeDefined();
    expect(engine.narrationGenerator).toBeDefined();
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

    expect(result.text).toBe('Hail, adventurer!');
    expect(result.source).toBe('llm');
  });

  it('re-exports CharacterContextPackage enums and builders', () => {
    expect(TRIGGER_EVENT.COMBAT_START).toBe('combat_start');
    expect(NPC_TYPE.ENEMY).toBe('enemy');
    expect(typeof buildContextPackage).toBe('function');
  });
});
