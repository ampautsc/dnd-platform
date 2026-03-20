import { describe, it, expect } from 'vitest';
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
    expect(prompt).toMatch(/you are the dungeon master/i);
    expect(prompt).toMatch(/omniscient/i);
  });

  it('should include storytelling philosophy', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    expect(prompt).toMatch(/show.*don.t tell|sensory|body language/i);
  });

  it('should include selective reveal rules', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    // DM knows everything but chooses what to reveal
    expect(prompt).toMatch(/choose|reveal|observable|perceiv/i);
    expect(prompt).toMatch(/never.*inner thoughts|never.*reveal.*thinking/i);
  });

  it('should include voice and style guidelines', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    expect(prompt).toMatch(/second person/i);
    expect(prompt).toMatch(/you see|you notice|you hear/i);
    expect(prompt).toMatch(/no.*markdown|no.*bullet/i);
  });

  it('should include name gating rules', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    expect(prompt).toMatch(/never.*reveal.*name|only.*names.*learned/i);
  });

  it('should reference the player by name', () => {
    const prompt = buildDmConsciousnessPrompt({ playerName: 'Kael' });
    expect(prompt).toContain('Kael');
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
    expect(prompt).toContain("The Bottom's Up");
    expect(prompt).toContain('Warm lantern glow');
    expect(prompt).toContain('Fresh bread');
  });

  it('should include time of day when provided', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      worldContext: { timeOfDay: 'late evening' },
    });
    expect(prompt).toContain('late evening');
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
    expect(prompt).toContain('the halfling behind the bar');
    expect(prompt).toContain('content but watchful');
    expect(prompt).toContain('keep the tavern safe');
    expect(prompt).toContain('Wiping down the bar');
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
    expect(prompt).toContain('tense');
    expect(prompt).toContain('stolen goods');
    // DM should know this but only reveal through observable behavior
    expect(prompt).toMatch(/body language|micro-expression|observable/i);
  });

  // ── Target Clarity ────────────────────────────────────────────

  it('should include target clarity rules', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    // Narration must make it clear who is being addressed
    expect(prompt).toMatch(/who.*address|target|direct/i);
    expect(prompt).toMatch(/unambiguous|clear/i);
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
    expect(prompt).toContain('Gender: female');
    expect(prompt).toContain('Race: Halfling');
    expect(prompt).toContain('Build: Compact and sturdy');
    expect(prompt).toContain('Hair: Curly auburn');
    expect(prompt).toContain('Skin: Warm olive complexion');
    expect(prompt).toContain('Eyes: Dark brown');
    expect(prompt).toContain('Height: Short even for a halfling');
    expect(prompt).toContain('Attire: A practical dress');
    expect(prompt).toContain('wiping her hands on a worn apron');
    expect(prompt).toContain('leather-bound notebook');
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
    expect(prompt).toContain('Gender: male');
    expect(prompt).toContain('Race: Human');
    expect(prompt).toContain('Build: Lean');
    // Should NOT contain labels for missing fields
    expect(prompt).not.toMatch(/Hair:/);
    expect(prompt).not.toMatch(/Skin:/);
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
    expect(prompt).toContain('a figure in the shadows');
    expect(prompt).toContain('angry');
    expect(prompt).not.toMatch(/Gender:/);
    expect(prompt).not.toMatch(/Race:/);
  });

  // ── Backward Compatibility ──────────────────────────────────

  it('should produce valid output with minimal params', () => {
    const prompt = buildDmConsciousnessPrompt({ playerName: 'Test' });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(200);
  });

  it('should not crash with empty npcInnerStates', () => {
    const prompt = buildDmConsciousnessPrompt({
      ...minimalParams,
      npcInnerStates: [],
    });
    expect(typeof prompt).toBe('string');
  });

  it('should not crash with undefined worldContext', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    expect(typeof prompt).toBe('string');
  });

  // ── Perception Boundary Enforcement ───────────────────────────

  it('should include an explicit information boundary section', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    expect(prompt).toMatch(/INFORMATION BOUNDARY|PERCEPTION BOUNDARY/i);
  });

  it('should enumerate ALLOWED information categories', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    // Must explicitly state what IS allowed
    expect(prompt).toMatch(/ALLOWED|PERMITTED|you (may|can) describe/i);
    expect(prompt).toMatch(/physical appearance|visible|audible|sensory/i);
  });

  it('should enumerate FORBIDDEN information categories', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    // Must explicitly state what is FORBIDDEN
    expect(prompt).toMatch(/FORBIDDEN|NEVER|must not/i);
    expect(prompt).toMatch(/backstory|inner thoughts|motivations|private/i);
    // Name leak protection
    expect(prompt).toMatch(/name.*not.*learned|unearned name|name.*player.*hasn.t/i);
  });

  it('should include a perception test question', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    // DM should ask: "could the player character perceive this right now?"
    expect(prompt).toMatch(/could.*player.*perceive|five senses|observable.*right now/i);
  });

  it('should instruct correct pronoun usage from observable appearance', () => {
    const prompt = buildDmConsciousnessPrompt(minimalParams);
    // DM must use pronouns based on visible appearance, never from metadata
    expect(prompt).toMatch(/pronoun|gender.*appear|refer.*based on.*appear/i);
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
    expect(prompt).toContain('Part of the furniture');
    expect(prompt).toContain('Tolerates me');
    expect(prompt).toMatch(/familiar/i);
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
    expect(prompt).toMatch(/relationship|knows about|thinks about/i);
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
    expect(prompt).not.toMatch(/Thinks about:|Knows about:/);
  });
});
