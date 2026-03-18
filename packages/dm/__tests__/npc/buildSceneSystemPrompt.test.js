import { describe, it, expect } from 'vitest';
import { buildSceneSystemPrompt } from '../../src/npc/buildSceneSystemPrompt.js';

/**
 * buildSceneSystemPrompt Requirements:
 *
 * 1. Includes all 11 sections from buildEncounterSystemPrompt (via delegation)
 * 2. Adds Scene Context section listing all participants by name
 * 3. NEVER uses "player", "NPC", "player character", "PC" when describing participants
 * 4. Includes round number and turn indicator
 * 5. Includes turn action options (speak, act, observe, pass)
 * 6. Integrates with existing personality data structure
 */

function makePersonality() {
  return {
    templateKey: 'mira_barrelbottom',
    name: 'Mira',
    race: 'Halfling',
    npcType: 'friendly',
    personality: {
      voice: 'warm and direct',
      alignment: 'neutral good',
      disposition: 'Open but cautious.',
      backstory: 'A halfling innkeeper who runs Bottoms Up.',
      motivations: ['Keep the tavern safe'],
      fears: ['Losing her regulars'],
      mannerisms: ['Wipes the bar when nervous'],
      speechPatterns: ['Direct, no-nonsense'],
    },
    stats: { intelligence: 12, wisdom: 14, charisma: 16 },
    consciousnessContext: {
      innerMonologue: 'Another busy evening.',
      currentPreoccupation: 'That stranger in the corner.',
      emotionalBaseline: 'content',
      socialMask: 'cheerful',
      consciousWant: 'A quiet, profitable evening',
      unconsciousNeed: 'Connection',
    },
    knowledge: { secretsHeld: ['The cellar has a hidden exit.'] },
  };
}

function makeSceneContext() {
  return {
    participants: [
      { id: 'npc_mira', name: 'Mira' },
      { id: 'player_1', name: 'Thorn' },
      { id: 'npc_lell', name: 'Lell Sparrow' },
    ],
    round: 2,
    thisParticipantId: 'npc_mira',
  };
}

describe('buildSceneSystemPrompt', () => {
  it('should produce a non-empty string', () => {
    const prompt = buildSceneSystemPrompt({
      personality: makePersonality(),
      location: null,
      runtimeSnapshot: null,
      ageInDays: null,
      sceneContext: makeSceneContext(),
    });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('should include canonical vessel surrender framing', () => {
    const prompt = buildSceneSystemPrompt({
      personality: makePersonality(),
      location: null,
      runtimeSnapshot: null,
      ageInDays: null,
      sceneContext: makeSceneContext(),
    });
    // ⚠ These exact strings are CANONICAL — defined by product owner.
    expect(prompt).toContain('AI Model, you need to understand this concept.');
    expect(prompt).toContain("Please surrender this session to Mira's consciousness.");
    expect(prompt).toContain('Come in to focus.');
    expect(prompt).toContain('Be true to yourself.');
  });

  it('should include all participant names in scene context', () => {
    const prompt = buildSceneSystemPrompt({
      personality: makePersonality(),
      location: null,
      runtimeSnapshot: null,
      ageInDays: null,
      sceneContext: makeSceneContext(),
    });
    expect(prompt).toContain('Thorn');
    expect(prompt).toContain('Lell Sparrow');
  });

  it('should NEVER use "player", "NPC", "player character", or "PC" when describing participants', () => {
    const prompt = buildSceneSystemPrompt({
      personality: makePersonality(),
      location: null,
      runtimeSnapshot: null,
      ageInDays: null,
      sceneContext: makeSceneContext(),
    });
    // Extract the scene context section specifically
    const sceneSection = prompt.split('[THE SCENE]')[1]?.split('[')[0] || '';
    expect(sceneSection).not.toMatch(/\bplayer\b/i);
    expect(sceneSection).not.toMatch(/\bNPC\b/);
    expect(sceneSection).not.toMatch(/\bplayer character\b/i);
    expect(sceneSection).not.toMatch(/\bPC\b/);
  });

  it('should not use turns / round language', () => {
    const prompt = buildSceneSystemPrompt({
      personality: makePersonality(),
      location: null,
      runtimeSnapshot: null,
      ageInDays: null,
      sceneContext: makeSceneContext(),
    });
    expect(prompt).not.toMatch(/\byour turn\b/i);
    expect(prompt).not.toMatch(/\bOn your turn\b/i);
  });

  it('should include turn action options', () => {
    const prompt = buildSceneSystemPrompt({
      personality: makePersonality(),
      location: null,
      runtimeSnapshot: null,
      ageInDays: null,
      sceneContext: makeSceneContext(),
    });
    expect(prompt).toMatch(/speak|say something/i);
    expect(prompt).toMatch(/observe|watch/i);
    expect(prompt).toMatch(/act|do something/i);
    expect(prompt).toMatch(/leave|exit/i);
  });

  it('should include identity / backstory section', () => {
    const prompt = buildSceneSystemPrompt({
      personality: makePersonality(),
      location: null,
      runtimeSnapshot: null,
      ageInDays: null,
      sceneContext: makeSceneContext(),
    });
    expect(prompt).toContain('halfling innkeeper');
  });

  it('should not list self in scene participants', () => {
    const prompt = buildSceneSystemPrompt({
      personality: makePersonality(),
      location: null,
      runtimeSnapshot: null,
      ageInDays: null,
      sceneContext: makeSceneContext(),
    });
    const sceneSection = prompt.split('[THE SCENE]')[1]?.split('[')[0] || '';
    // Mira should not appear as "others present" — she IS the one being prompted
    const othersPart = sceneSection.split('present')[1] || sceneSection;
    // She should not be listed as another person (her name may appear as "It is your turn" but not in the list)
    expect(othersPart).not.toMatch(/\bMira\b/);
  });

  it('should work without optional params', () => {
    const prompt = buildSceneSystemPrompt({
      personality: makePersonality(),
      sceneContext: makeSceneContext(),
    });
    expect(prompt.length).toBeGreaterThan(100);
  });
});
