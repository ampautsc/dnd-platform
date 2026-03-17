/**
 * SceneManager service tests
 *
 * Requirements:
 * - initializes in 'exploration' scene by default
 * - supports transitioning to valid scene types (exploration, social, travel, combat, rest, shop)
 * - throws an error for invalid scene types
 */
import { describe, it, expect } from 'vitest';
import { createSceneManager } from '../../src/story/SceneManager.js';

describe('SceneManager', () => {
  it('starts in exploration scene by default', () => {
    const manager = createSceneManager();
    expect(manager.getCurrentScene()).toBe('exploration');
  });

  it('transitions to a valid scene type', () => {
    const manager = createSceneManager();
    manager.transitionTo('combat');
    expect(manager.getCurrentScene()).toBe('combat');
  });

  it('throws on transition to an invalid scene type', () => {
    const manager = createSceneManager();
    expect(() => manager.transitionTo('flying')).toThrow(/UNKNOWN_SCENE_TYPE/);
  });
});
