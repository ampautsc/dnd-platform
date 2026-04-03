/**
 * StoryEngine service tests
 *
 * Requirements:
 * - tracks tension level (0-10) and narrative arc state
 * - starts at introduction with low tension
 * - pacing: records beats that automatically scale tension appropriately
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createStoryEngine } from '../../src/story/StoryEngine.js';

describe('StoryEngine', () => {
  it('starts at introduction phase with base tension', () => {
    const engine = createStoryEngine();
    const state = engine.getStoryState();
    
    assert.strictEqual(state.arc, 'introduction');
    assert.strictEqual(state.tension, 1);
  });

  it('increases tension and advances arc to rising_action on dramatic beats', () => {
    const engine = createStoryEngine();
    
    engine.recordBeat({ type: 'conflict.discovery' });
    let state = engine.getStoryState();
    
    assert.ok(state.tension > 1);
    assert.strictEqual(state.arc, 'rising_action');
  });
  
  it('caps tension at 10 and transitions to climax on critical beats', () => {
    const engine = createStoryEngine();
    
    engine.recordBeat({ type: 'conflict.discovery' });
    engine.recordBeat({ type: 'combat.start' });
    engine.recordBeat({ type: 'combat.critical' });
    
    let state = engine.getStoryState();
    assert.ok(state.tension <= 10);
    assert.strictEqual(state.arc, 'climax');
  });
});
