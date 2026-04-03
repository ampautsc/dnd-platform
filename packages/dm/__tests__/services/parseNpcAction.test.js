import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseNpcAction } from '../../src/services/SceneEngine.js';

/**
 * parseNpcAction Requirements:
 *
 * 1. Extracts bracket-prefixed action type: [SPEAK], [ACT], [OBSERVE], [PASS], [LEAVE]
 * 2. Returns { type, content, target }
 * 3. Extracts [TO: name] target when present
 * 4. Target is null when no [TO:] prefix
 * 5. Handles combined format: [SPEAK][TO: the halfling behind the bar] "Hello!"
 * 6. Handles target in ACT actions
 * 7. Falls back to inference when no brackets
 * 8. Target extraction is case-insensitive
 */

describe('parseNpcAction', () => {
  // ── Existing behavior (backward compat) ───────────────────────

  it('should parse [SPEAK] with content', () => {
    const result = parseNpcAction('[SPEAK] "Hello there!"');
    assert.strictEqual(result.type, 'speech');
    assert.strictEqual(result.content, '"Hello there!"');
  });

  it('should parse [ACT] with content', () => {
    const result = parseNpcAction('[ACT] *wipes the bar*');
    assert.strictEqual(result.type, 'act');
    assert.strictEqual(result.content, '*wipes the bar*');
  });

  it('should parse [OBSERVE]', () => {
    const result = parseNpcAction('[OBSERVE] *watches the room*');
    assert.strictEqual(result.type, 'observe');
    assert.strictEqual(result.content, '*watches the room*');
  });

  it('should parse [PASS]', () => {
    const result = parseNpcAction('[PASS]');
    assert.strictEqual(result.type, 'pass');
    assert.strictEqual(result.content, '');
  });

  it('should parse [LEAVE]', () => {
    const result = parseNpcAction('[LEAVE] *stands and walks out*');
    assert.strictEqual(result.type, 'leave');
    assert.strictEqual(result.content, '*stands and walks out*');
  });

  it('should infer speech from plain text', () => {
    const result = parseNpcAction('Hello there!');
    assert.strictEqual(result.type, 'speech');
    assert.strictEqual(result.content, 'Hello there!');
  });

  it('should infer act from asterisk-wrapped text', () => {
    const result = parseNpcAction('*nods quietly*');
    assert.strictEqual(result.type, 'act');
    assert.strictEqual(result.content, '*nods quietly*');
  });

  it('should infer pass from empty text', () => {
    const result = parseNpcAction('');
    assert.strictEqual(result.type, 'pass');
    assert.strictEqual(result.content, '');
  });

  // ── Target extraction (new behavior) ──────────────────────────

  it('should have target: null when no [TO:] is present', () => {
    const result = parseNpcAction('[SPEAK] "Hello!"');
    assert.strictEqual(result.target, null);
  });

  it('should extract target from [TO: name] after action type', () => {
    const result = parseNpcAction('[SPEAK][TO: the halfling behind the bar] "Long night, or early morning?"');
    assert.strictEqual(result.type, 'speech');
    assert.strictEqual(result.target, 'the halfling behind the bar');
    assert.strictEqual(result.content, '"Long night, or early morning?"');
  });

  it('should extract target from [TO: name] with space between brackets', () => {
    const result = parseNpcAction('[SPEAK] [TO: the quiet man at the bar] "Another round?"');
    assert.strictEqual(result.type, 'speech');
    assert.strictEqual(result.target, 'the quiet man at the bar');
    assert.strictEqual(result.content, '"Another round?"');
  });

  it('should extract target for ACT actions', () => {
    const result = parseNpcAction('[ACT][TO: the dragonborn] *slides a drink across the bar*');
    assert.strictEqual(result.type, 'act');
    assert.strictEqual(result.target, 'the dragonborn');
    assert.strictEqual(result.content, '*slides a drink across the bar*');
  });

  it('should be case-insensitive for [TO:]', () => {
    const result = parseNpcAction('[SPEAK][to: Aldric] "Welcome back!"');
    assert.strictEqual(result.type, 'speech');
    assert.strictEqual(result.target, 'Aldric');
  });

  it('should handle [TO: room] for general address', () => {
    const result = parseNpcAction('[SPEAK][TO: the room] "Last call!"');
    assert.strictEqual(result.type, 'speech');
    assert.strictEqual(result.target, 'the room');
  });

  it('should have target: null for inferred actions (no brackets)', () => {
    const result = parseNpcAction('Hello there!');
    assert.strictEqual(result.target, null);
  });

  it('should handle OBSERVE with no target', () => {
    const result = parseNpcAction('[OBSERVE] *watches the door*');
    assert.strictEqual(result.target, null);
  });

  it('should handle PASS with no target', () => {
    const result = parseNpcAction('[PASS]');
    assert.strictEqual(result.target, null);
  });
});
