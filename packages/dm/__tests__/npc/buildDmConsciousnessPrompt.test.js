import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDmConsciousnessPrompt } from '../../src/npc/buildDmConsciousnessPrompt.js';

/**
 * buildDmConsciousnessPrompt Requirements:
 *
 * The DM consciousness prompt establishes the narrator as an omniscient,
 * expert storyteller — not a text formatter. It must include:
 *
 * 1. DM Identity — vessel-surrender-style framing for the DM role
 * 2. Storytelling philosophy — show don't tell, sensory prose, pacing
 * 3. Omniscience declaration — DM knows all inner states, secrets, lies
 * 4. Selective reveal rules — what to show depends on observer, perception, dramatic moment
 * 5. Voice & style — second person, literary prose, no game mechanics, no markdown
 * 6. Name gating — only use names the observer has learned
 * 7. Location context — injected when available
 * 8. Time of day — injected when available
 * 9. NPC inner states — injected so DM can translate to body language
 * 10. Target clarity — narration must make unambiguous who is being addressed
 */

describe('buildDmConsciousnessPrompt', () => {
  const minimalParams = {
    playerName: 'Aldric',
  };

  // ── DM Identity ──────────────────────────────────────────────

  it('should include DM identity / vessel surrender framing', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    assert.match(prompt, /you are the dungeon master/i);
    assert.match(prompt, /omniscient/i);
  });

  it('should include storytelling philosophy', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    assert.match(prompt, /show.*don.t tell|sensory|body language/i);
  });

  it('should include selective reveal rules', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    // DM knows everything but chooses what to reveal
    assert.match(prompt, /choose|reveal|observable|perceiv/i);
    assert.match(prompt, /never.*inner thoughts|never.*reveal.*thinking/i);
  });

  it('should include voice and style guidelines', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    assert.match(prompt, /second person/i);
    assert.match(prompt, /you see|you notice|you hear/i);
    assert.match(prompt, /no.*markdown|no.*bullet/i);
  });

  it('should include name gating rules', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    assert.match(prompt, /never.*reveal.*name|only.*names.*learned/i);
  });

  it('should reference the player by name', () => {
    const prompt = buildDmConsciousnessPrompt({ playerName: 'Kael' });
    assert.ok(prompt.includes('Kael'));
  });

  // ── Location Context ──────────────────────────────────────────

  it('should include location data when provided', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      worldContext: {
        locationName: "The Bottom's Up",
        description: 'A cozy halfling-run tavern.',
        atmosphere: {
          lighting: 'Warm lantern glow',
          sounds: ['Murmured conversation', 'Clinking glasses'],
          smells: ['Fresh bread', 'Pipe smoke'],
        },
      },
    });
    assert.ok(prompt.includes("The Bottom's Up"));
    assert.ok(prompt.includes('Warm lantern glow'));
    assert.ok(prompt.includes('Fresh bread'));
  });

  it('should include time of day when provided', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      worldContext: { timeOfDay: 'late evening' },
    });
    assert.ok(prompt.includes('late evening'));
  });

  // ── NPC Inner States ──────────────────────────────────────────

  it('should include NPC inner state data for omniscient narration', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      npcInnerStates: [
        {
          displayName: 'the halfling behind the bar',
          mood: 'content but watchful',
          consciousWant: 'To keep the tavern safe and warm',
          currentActivity: 'Wiping down the bar',
          isLying: false,
        },
      ],
    });
    assert.ok(prompt.includes('the halfling behind the bar'));
    assert.ok(prompt.includes('content but watchful'));
    assert.ok(prompt.includes('keep the tavern safe'));
    assert.ok(prompt.includes('Wiping down the bar'));
  });

  it('should flag when an NPC is hiding something or lying', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      npcInnerStates: [
        {
          displayName: 'a quiet man at the bar',
          mood: 'tense',
          secrets: ['Carrying stolen goods in his pack'],
          isLying: true,
        },
      ],
    });
    assert.ok(prompt.includes('tense'));
    assert.ok(prompt.includes('stolen goods'));
    // DM should know this but only reveal through observable behavior
    assert.match(prompt, /body language|micro-expression|observable/i);
  });

  // ── Target Clarity ────────────────────────────────────────────

  it('should include target clarity rules', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    // Narration must make it clear who is being addressed
    assert.match(prompt, /who.*address|target|direct/i);
    assert.match(prompt, /unambiguous|clear/i);
  });

  // ── Appearance Data in NPC Inner States ────────────────────

  it('should render full appearance data when NPC inner state includes appearance', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      npcInnerStates: [
        {
          displayName: 'the halfling behind the bar',
          mood: 'content but watchful',
          gender: 'female',
          race: 'Halfling',
          appearance: {
            build: 'Compact and sturdy, halfling frame',
            hair: 'Curly auburn, pinned back with a wooden clip',
            skin: 'Warm olive complexion',
            eyes: 'Dark brown, quick-moving',
            height: 'Short even for a halfling',
            typicalAttire: 'A practical dress with rolled sleeves',
            distinguishingFeatures: [
              'Constantly wiping her hands on a worn apron',
              'A small leather-bound notebook in her apron pocket',
            ],
          },
        },
      ],
    });
    assert.ok(prompt.includes('Gender: female'));
    assert.ok(prompt.includes('Race: Halfling'));
    assert.ok(prompt.includes('Build: Compact and sturdy'));
    assert.ok(prompt.includes('Hair: Curly auburn'));
    assert.ok(prompt.includes('Skin: Warm olive complexion'));
    assert.ok(prompt.includes('Eyes: Dark brown'));
    assert.ok(prompt.includes('Height: Short even for a halfling'));
    assert.ok(prompt.includes('Attire: A practical dress'));
    assert.ok(prompt.includes('wiping her hands on a worn apron'));
    assert.ok(prompt.includes('leather-bound notebook'));
  });

  it('should gracefully skip missing appearance fields', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      npcInnerStates: [
        {
          displayName: 'a quiet man at the bar',
          mood: 'cautious',
          gender: 'male',
          race: 'Human',
          appearance: {
            build: 'Lean',
            // no hair, skin, eyes, height
          },
        },
      ],
    });
    assert.ok(prompt.includes('Gender: male'));
    assert.ok(prompt.includes('Race: Human'));
    assert.ok(prompt.includes('Build: Lean'));
    // Should NOT contain labels for missing fields
    assert.doesNotMatch(prompt, /Hair:/);
    assert.doesNotMatch(prompt, /Skin:/);
  });

  it('should render NPC state without appearance when appearance is not provided', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      npcInnerStates: [
        {
          displayName: 'a figure in the shadows',
          mood: 'angry',
          // no gender, race, or appearance
        },
      ],
    });
    assert.ok(prompt.includes('a figure in the shadows'));
    assert.ok(prompt.includes('angry'));
    assert.doesNotMatch(prompt, /Gender:/);
    assert.doesNotMatch(prompt, /Race:/);
  });

  // ── Backward Compatibility ──────────────────────────────────

  it('should produce valid output with minimal params', () => {
    const prompt = buildDmConsciousnessPrompt({ playerName: 'Test' });
    assert.strictEqual(typeof prompt, 'string');
    assert.ok(prompt.length > 200);
  });

  it('should not crash with empty npcInnerStates', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      npcInnerStates: [],
    });
    assert.strictEqual(typeof prompt, 'string');
  });

  it('should not crash with undefined worldContext', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    assert.strictEqual(typeof prompt, 'string');
  });

  // ── Perception Boundary Enforcement ───────────────────────────

  it('should include an explicit information boundary section', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    assert.match(prompt, /INFORMATION BOUNDARY|PERCEPTION BOUNDARY/i);
  });

  it('should enumerate ALLOWED information categories', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    // Must explicitly state what IS allowed
    assert.match(prompt, /ALLOWED|PERMITTED|you (may|can) describe/i);
    assert.match(prompt, /physical appearance|visible|audible|sensory/i);
  });

  it('should enumerate FORBIDDEN information categories', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    // Must explicitly state what is FORBIDDEN
    assert.match(prompt, /FORBIDDEN|NEVER|must not/i);
    assert.match(prompt, /backstory|inner thoughts|motivations|private/i);
    // Name leak protection
    assert.match(prompt, /name.*not.*learned|unearned name|name.*player.*hasn.t/i);
  });

  it('should include a perception test question', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    // DM should ask: "could the player character perceive this right now?"
    assert.match(prompt, /could.*player.*perceive|five senses|observable.*right now/i);
  });

  it('should instruct correct pronoun usage from observable appearance', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    // DM must use pronouns based on visible appearance, never from metadata
    assert.match(prompt, /pronoun|gender.*appear|refer.*based on.*appear/i);
  });

  // ── NPC-to-NPC Relationship Context ─────────────────────────

  it('should include NPC-to-NPC relationship context when provided', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      npcInnerStates: [
        {
          displayName: 'the halfling behind the bar',
          mood: 'content',
          relationships: [
            {
              targetDisplayName: 'a quiet man at the bar',
              opinion: 'Part of the furniture. Mostly harmless. Occasionally useful.',
              recognitionTier: 'familiar',
              valence: 'neutral',
            },
          ],
        },
        {
          displayName: 'a quiet man at the bar',
          mood: 'cautious',
          relationships: [
            {
              targetDisplayName: 'the halfling behind the bar',
              opinion: 'Tolerates me. Kinder than she has to be.',
              recognitionTier: 'familiar',
              valence: 'neutral',
            },
          ],
        },
      ],
    });
    assert.ok(prompt.includes('Part of the furniture'));
    assert.ok(prompt.includes('Tolerates me'));
    assert.match(prompt, /familiar/i);
  });

  it('should label NPC-to-NPC relationships section clearly', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      npcInnerStates: [
        {
          displayName: 'the halfling behind the bar',
          mood: 'content',
          relationships: [
            {
              targetDisplayName: 'a quiet man at the bar',
              opinion: 'Part of the furniture.',
              recognitionTier: 'familiar',
              valence: 'neutral',
            },
          ],
        },
      ],
    });
    // Should have a recognizable section header so the DM can use relationship data
    assert.match(prompt, /relationship|knows about|thinks about/i);
  });

  it('should skip relationships section when no relationships provided', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      npcInnerStates: [
        {
          displayName: 'a quiet man at the bar',
          mood: 'cautious',
          // no relationships field
        },
      ],
    });
    // Should not contain stale relationship headers
    assert.doesNotMatch(prompt, /Thinks about:|Knows about:/);
  });
});
