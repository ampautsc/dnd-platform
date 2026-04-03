/**
 * SceneManager service tests
 *
 * Requirements:
 * - initializes in 'exploration' scene by default
 * - supports transitioning to valid scene types (exploration, social, travel, combat, rest, shop)
 * - throws an error for invalid scene types
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSceneManager } from '../../src/story/SceneManager.js';

describe('SceneManager', () => {
  it('starts in exploration scene by default', () => {
    const manager = createSceneManager();
    assert.strictEqual(manager.getCurrentScene(), 'exploration');
  });

  it('transitions to a valid scene type', () => {
    const manager = createSceneManager();
    manager.transitionTo('combat');
    assert.strictEqual(manager.getCurrentScene(), 'combat');
  });

  it('throws on transition to an invalid scene type', () => {
    const manager = createSceneManager();
    assert.throws(() => manager.transitionTo('flying'), /UNKNOWN_SCENE_TYPE/);
  });
});
