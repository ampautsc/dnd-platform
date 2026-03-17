/**
 * StoryEngine service tests
 *
 * Requirements:
 * - tracks tension level (0-10) and narrative arc state
 * - starts at introduction with low tension
 * - pacing: records beats that automatically scale tension appropriately
 */
import { describe, it, expect } from 'vitest';
import { createStoryEngine } from '../../src/story/StoryEngine.js';

describe('StoryEngine', () => {
  it('starts at introduction phase with base tension', () => {
    const engine = createStoryEngine();
    const state = engine.getStoryState();
    
    expect(state.arc).toBe('introduction');
    expect(state.tension).toBe(1);
  });

  it('increases tension and advances arc to rising_action on dramatic beats', () => {
    const engine = createStoryEngine();
    
    engine.recordBeat({ type: 'conflict.discovery' });
    let state = engine.getStoryState();
    
    expect(state.tension).toBeGreaterThan(1);
    expect(state.arc).toBe('rising_action');
  });
  
  it('caps tension at 10 and transitions to climax on critical beats', () => {
    const engine = createStoryEngine();
    
    engine.recordBeat({ type: 'conflict.discovery' });
    engine.recordBeat({ type: 'combat.start' });
    engine.recordBeat({ type: 'combat.critical' });
    
    let state = engine.getStoryState();
    expect(state.tension).toBeLessThanOrEqual(10);
    expect(state.arc).toBe('climax');
  });
});
