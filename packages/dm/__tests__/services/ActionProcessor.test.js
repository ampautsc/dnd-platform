/**
 * ActionProcessor service tests
 *
 * Requirements:
 * - maps simple free-text actions to deterministic scene intents
 * - returns structured result with intent, requiresCheck, and narrationSeed
 * - defaults to "unknown" intent for unsupported actions
 */
import { describe, it, expect } from 'vitest';
import { createActionProcessor } from '../../src/services/ActionProcessor.js';

describe('ActionProcessor', () => {
  it('maps perception-like actions to investigate intent with a check', () => {
    const processor = createActionProcessor();
    const result = processor.process({ playerId: 'p1', text: 'I search for tracks in the mud' });

    expect(result.intent).toBe('investigate');
    expect(result.requiresCheck).toBe(true);
    expect(result.check).toEqual({ ability: 'wis', skill: 'perception', dc: 12 });
  });

  it('maps social actions to persuade intent', () => {
    const processor = createActionProcessor();
    const result = processor.process({ playerId: 'p1', text: 'I try to persuade the guard to let us pass' });

    expect(result.intent).toBe('persuade');
    expect(result.requiresCheck).toBe(true);
    expect(result.check).toEqual({ ability: 'cha', skill: 'persuasion', dc: 13 });
  });

  it('returns unknown intent for unsupported actions', () => {
    const processor = createActionProcessor();
    const result = processor.process({ playerId: 'p1', text: 'I do something bizarre and undefined' });

    expect(result.intent).toBe('unknown');
    expect(result.requiresCheck).toBe(false);
  });
});
