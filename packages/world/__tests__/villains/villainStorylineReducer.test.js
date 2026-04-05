/**
 * villainStorylineReducer Tests
 *
 * Requirements:
 * - Does not advance stage before its duration elapses
 * - Advances stage when elapsed time >= stage durationMinutes
 * - Records the stageStartedAt for the new stage
 * - Does not advance past a final stage (durationMinutes: null)
 * - Returns new array/objects (immutable — never mutates input)
 * - Handles multiple storylines in one call
 * - Skips multiple stages in one tick if time jumped far ahead
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { villainStorylineReducer } from '../../src/villains/villainStorylineReducer.js';

const shadowLord = () => ({
  id: 'shadow-lord',
  currentStage: 0,
  stageStartedAt: 0,
  stages: [
    { id: 'gathering-forces', durationMinutes: 1440 },
    { id: 'first-attack', durationMinutes: 720 },
    { id: 'conquest', durationMinutes: null },
  ],
});

describe('villainStorylineReducer', () => {
  it('does not advance stage before duration elapses', () => {
    const storylines = [shadowLord()];
    const result = villainStorylineReducer(storylines, 720); // 720 < 1440
    assert.strictEqual(result[0].currentStage, 0);
  });

  it('advances stage when elapsed time exactly meets duration', () => {
    const storylines = [shadowLord()];
    const result = villainStorylineReducer(storylines, 1440);
    assert.strictEqual(result[0].currentStage, 1);
    assert.strictEqual(result[0].stageStartedAt, 1440);
  });

  it('advances stage when elapsed time exceeds duration', () => {
    const storylines = [shadowLord()];
    const result = villainStorylineReducer(storylines, 2000);
    assert.strictEqual(result[0].currentStage, 1);
    assert.strictEqual(result[0].stageStartedAt, 1440);
  });

  it('skips multiple stages if time jumped far ahead', () => {
    const storylines = [shadowLord()];
    // Stage 0: 1440 min, Stage 1: 720 min → after 2160 min both should be done
    const result = villainStorylineReducer(storylines, 2160);
    assert.strictEqual(result[0].currentStage, 2);
    assert.strictEqual(result[0].stageStartedAt, 2160);
  });

  it('does not advance past the final stage (durationMinutes null)', () => {
    const storylines = [{
      id: 'shadow-lord',
      currentStage: 2,
      stageStartedAt: 2160,
      stages: [
        { id: 'gathering-forces', durationMinutes: 1440 },
        { id: 'first-attack', durationMinutes: 720 },
        { id: 'conquest', durationMinutes: null },
      ],
    }];
    const result = villainStorylineReducer(storylines, 99999);
    assert.strictEqual(result[0].currentStage, 2);
  });

  it('handles multiple storylines independently', () => {
    const storylines = [
      shadowLord(),
      {
        id: 'cult-of-chaos',
        currentStage: 0,
        stageStartedAt: 0,
        stages: [
          { id: 'recruiting', durationMinutes: 500 },
          { id: 'ritual', durationMinutes: null },
        ],
      },
    ];
    const result = villainStorylineReducer(storylines, 600);
    assert.strictEqual(result[0].currentStage, 0); // shadow-lord not advanced (needs 1440)
    assert.strictEqual(result[1].currentStage, 1); // cult advanced (needs 500, we have 600)
  });

  it('returns new array and objects (immutable)', () => {
    const original = [shadowLord()];
    const result = villainStorylineReducer(original, 2000);
    assert.notStrictEqual(result, original);
    assert.notStrictEqual(result[0], original[0]);
    assert.strictEqual(original[0].currentStage, 0); // original unchanged
  });

  it('returns empty array for empty input', () => {
    const result = villainStorylineReducer([], 1000);
    assert.deepStrictEqual(result, []);
  });
});
