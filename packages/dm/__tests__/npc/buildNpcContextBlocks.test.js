import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNpcContextBlocks, buildNpcDayUserPrompt } from '../../src/npc/buildNpcContextBlocks.js';

/**
 * Requirements for buildNpcContextBlocks:
 *
 * 1. Returns an array of { text } objects usable as LLMProvider `systemBlocks`
 * 2. Block 0 is always the world context (world-common.xml by default)
 * 3. When townContextName is provided, town context is inserted as block 1
 * 4. When venueContextName is provided, venue context is inserted after town (or block 1 if no town)
 * 5. Last block is always the NPC consciousness prompt (vessel surrender → come in to focus)
 * 6. Block count: 2 (world + NPC), 3 (world + town/venue + NPC), or 4 (world + town + venue + NPC)
 * 7. worldContextName defaults to 'world-common' but can be overridden
 * 8. runtimeSnapshot day experiences are included in the consciousness block
 * 9. Each block has a non-empty .text string
 *
 * Requirements for buildNpcDayUserPrompt:
 * 1. Contains NPC name
 * 2. Contains age in days (formatted with commas)
 * 3. Contains the day narrative
 * 4. Contains the scene trigger
 */

const MINIMAL_NPC = {
  templateKey: 'test_npc',
  name: 'Test Bartender',
  race: 'Human',
  npcType: 'friendly',
  age: 35,
  personality: {
    voice: 'flat and measured',
    alignment: 'neutral good',
    disposition: 'Calm, professional',
    backstory: 'Has run the bar for ten years.',
    motivations: ['Keep the lights on'],
    fears: ['Losing the bar'],
    mannerisms: ['Wipes the bar'],
    speechPatterns: ['Says "pal" to regulars'],
  },
  knowledge: {
    secretsHeld: ['Knows where the cash is hidden'],
    languagesSpoken: ['Common'],
  },
  stats: { intelligence: 10, wisdom: 10, charisma: 12 },
  consciousnessContext: {
    innerMonologue: 'The room tells you everything.',
    currentPreoccupation: 'The keg order that has not arrived.',
    emotionalBaseline: 'steady',
    socialMask: 'competent, unflappable',
    contradictions: ['Calm exterior, worried interior'],
    internalConflicts: ['Wants to leave; cannot leave'],
    wakeUpQuestions: ['Is this enough?'],
    psychologicalProfile: {
      moralFramework: 'Help who you can, hurt no one.',
      copingMechanisms: ['Keep busy'],
    },
    conversationPersona: {
      informationRelease: 'Gives a little to get a little.',
      deflectionPatterns: ['Changes subject to a drink order'],
    },
    consciousWant: 'A full house.',
    unconsciousNeed: 'To feel that the work matters.',
  },
};

// ─── buildNpcContextBlocks ────────────────────────────────────────────────────

describe('buildNpcContextBlocks — block count', () => {
  it('should return 2 blocks when no town or venue context provided', () => {
    const blocks = buildNpcContextBlocks({ npc: MINIMAL_NPC });
    assert.equal(blocks.length, 2, `expected 2 blocks, got ${blocks.length}`);
  });

  it('should return 3 blocks when townContextName is provided', () => {
    const blocks = buildNpcContextBlocks({ npc: MINIMAL_NPC, townContextName: 'town-millhaven' });
    assert.equal(blocks.length, 3, `expected 3 blocks, got ${blocks.length}`);
  });

  it('should return 3 blocks when only venueContextName is provided', () => {
    const blocks = buildNpcContextBlocks({ npc: MINIMAL_NPC, venueContextName: 'location-bottoms-up' });
    assert.equal(blocks.length, 3, `expected 3 blocks, got ${blocks.length}`);
  });

  it('should return 4 blocks when both townContextName and venueContextName are provided', () => {
    const blocks = buildNpcContextBlocks({
      npc: MINIMAL_NPC,
      townContextName: 'town-millhaven',
      venueContextName: 'location-bottoms-up',
    });
    assert.equal(blocks.length, 4, `expected 4 blocks, got ${blocks.length}`);
  });
});

describe('buildNpcContextBlocks — block content', () => {
  it('each block should be an object with a non-empty text string', () => {
    const blocks = buildNpcContextBlocks({
      npc: MINIMAL_NPC,
      townContextName: 'town-millhaven',
      venueContextName: 'location-bottoms-up',
    });
    for (let i = 0; i < blocks.length; i++) {
      assert.ok(typeof blocks[i].text === 'string', `block ${i} should have a text string`);
      assert.ok(blocks[i].text.length > 0, `block ${i} text should not be empty`);
    }
  });

  it('block 0 should contain world-common.xml content by default', () => {
    const blocks = buildNpcContextBlocks({ npc: MINIMAL_NPC });
    assert.ok(
      blocks[0].text.includes('<world-context'),
      'block 0 should contain world-context root element',
    );
  });

  it('block 0 should use a custom worldContextName when provided', () => {
    const blocks = buildNpcContextBlocks({ npc: MINIMAL_NPC, worldContextName: 'city-waterdeep' });
    assert.ok(
      blocks[0].text.includes('<city-context id="waterdeep"'),
      'block 0 should contain Waterdeep city-context when worldContextName is city-waterdeep',
    );
  });

  it('block 1 should contain town-millhaven.xml content when townContextName is provided', () => {
    const blocks = buildNpcContextBlocks({ npc: MINIMAL_NPC, townContextName: 'town-millhaven' });
    assert.ok(
      blocks[1].text.includes('<town-context id="millhaven"'),
      'block 1 should contain millhaven town-context',
    );
  });

  it('block 2 should contain location-bottoms-up.xml content when both contexts provided', () => {
    const blocks = buildNpcContextBlocks({
      npc: MINIMAL_NPC,
      townContextName: 'town-millhaven',
      venueContextName: 'location-bottoms-up',
    });
    assert.ok(
      blocks[2].text.includes('<location-context id="bottoms-up"'),
      'block 2 should contain bottoms-up location-context',
    );
  });

  it('last block should contain vessel surrender text (NPC consciousness)', () => {
    const blocks = buildNpcContextBlocks({ npc: MINIMAL_NPC });
    const last = blocks[blocks.length - 1].text;
    assert.ok(
      last.includes('surrender this session'),
      'last block should contain vessel surrender text',
    );
  });

  it('last block should contain "Come in to focus" closing', () => {
    const blocks = buildNpcContextBlocks({ npc: MINIMAL_NPC });
    const last = blocks[blocks.length - 1].text;
    assert.ok(
      last.includes('Come in to focus'),
      'last block should contain "Come in to focus" closing',
    );
  });

  it('last block should include NPC name', () => {
    const blocks = buildNpcContextBlocks({ npc: MINIMAL_NPC });
    const last = blocks[blocks.length - 1].text;
    assert.ok(last.includes('Test Bartender'), 'last block should mention NPC name');
  });

  it('last block should include runtimeSnapshot day experiences', () => {
    const snap = {
      currentActivity: 'wiping the bar',
      dayExperiences: [{ summary: 'Opened at dawn. Checked the kegs.' }],
    };
    const blocks = buildNpcContextBlocks({ npc: MINIMAL_NPC, runtimeSnapshot: snap });
    const last = blocks[blocks.length - 1].text;
    assert.ok(
      last.includes('Opened at dawn. Checked the kegs.'),
      'day experience summary should appear in consciousness block',
    );
  });

  it('last block should include runtimeSnapshot currentActivity', () => {
    const snap = { currentActivity: 'wiping the bar top slowly' };
    const blocks = buildNpcContextBlocks({ npc: MINIMAL_NPC, runtimeSnapshot: snap });
    const last = blocks[blocks.length - 1].text;
    assert.ok(
      last.includes('wiping the bar top slowly'),
      'currentActivity should appear in consciousness block',
    );
  });

  it('last block should include ageInDays when provided', () => {
    const blocks = buildNpcContextBlocks({ npc: MINIMAL_NPC, ageInDays: 12775 });
    const last = blocks[blocks.length - 1].text;
    assert.ok(
      last.includes('12,775'),
      'ageInDays should appear formatted with commas in consciousness block',
    );
  });

  it('last block should include memorySummary when provided', () => {
    const blocks = buildNpcContextBlocks({
      npc: MINIMAL_NPC,
      memorySummary: 'The stranger has been here thirty minutes and ordered twice.',
    });
    const last = blocks[blocks.length - 1].text;
    assert.ok(
      last.includes('The stranger has been here thirty minutes'),
      'memorySummary should appear in consciousness block',
    );
  });

  it('last block should include evolutionSummary when provided', () => {
    const blocks = buildNpcContextBlocks({
      npc: MINIMAL_NPC,
      evolutionSummary: 'Has grown more guarded since the robbery last month.',
    });
    const last = blocks[blocks.length - 1].text;
    assert.ok(
      last.includes('grown more guarded'),
      'evolutionSummary should appear in consciousness block',
    );
  });
});

describe('buildNpcContextBlocks — venue-only (no town)', () => {
  it('should place venue context in block 1 when only venueContextName is given', () => {
    const blocks = buildNpcContextBlocks({
      npc: MINIMAL_NPC,
      venueContextName: 'location-bottoms-up',
    });
    assert.ok(
      blocks[1].text.includes('<location-context id="bottoms-up"'),
      'block 1 should be the venue context when no town is provided',
    );
  });
});

// ─── buildNpcDayUserPrompt ────────────────────────────────────────────────────

describe('buildNpcDayUserPrompt', () => {
  it('should include NPC name', () => {
    const p = buildNpcDayUserPrompt({
      npcName: 'Samren',
      ageInDays: 14610,
      dayNarrative: 'The morning moved at its usual pace.',
      sceneTrigger: 'An adventurer walks in.',
    });
    assert.ok(p.includes('Samren'), 'should include NPC name');
  });

  it('should include ageInDays formatted with commas', () => {
    const p = buildNpcDayUserPrompt({
      npcName: 'Samren',
      ageInDays: 14610,
      dayNarrative: 'A quiet morning.',
      sceneTrigger: 'A stranger sits down.',
    });
    assert.ok(p.includes('14,610'), 'should include age with commas');
  });

  it('should include the day narrative', () => {
    const p = buildNpcDayUserPrompt({
      npcName: 'Samren',
      ageInDays: 14610,
      dayNarrative: 'The morning moved at its usual pace.',
      sceneTrigger: 'An adventurer walks in.',
    });
    assert.ok(p.includes('The morning moved at its usual pace.'), 'should include day narrative');
  });

  it('should include the scene trigger', () => {
    const p = buildNpcDayUserPrompt({
      npcName: 'Samren',
      ageInDays: 14610,
      dayNarrative: 'A quiet morning.',
      sceneTrigger: 'An adventurer calls out for the finest ale.',
    });
    assert.ok(
      p.includes('An adventurer calls out for the finest ale.'),
      'should include scene trigger',
    );
  });

  it('should work without a day narrative', () => {
    const p = buildNpcDayUserPrompt({
      npcName: 'Samren',
      ageInDays: 14610,
      sceneTrigger: 'The door opens.',
    });
    assert.ok(p.includes('Samren'), 'should still include name');
    assert.ok(p.includes('The door opens.'), 'should include scene trigger');
  });
});
