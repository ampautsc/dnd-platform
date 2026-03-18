import { describe, it, expect } from 'vitest';
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
    expect(result.type).toBe('speech');
    expect(result.content).toBe('"Hello there!"');
  });

  it('should parse [ACT] with content', () => {
    const result = parseNpcAction('[ACT] *wipes the bar*');
    expect(result.type).toBe('act');
    expect(result.content).toBe('*wipes the bar*');
  });

  it('should parse [OBSERVE]', () => {
    const result = parseNpcAction('[OBSERVE] *watches the room*');
    expect(result.type).toBe('observe');
    expect(result.content).toBe('*watches the room*');
  });

  it('should parse [PASS]', () => {
    const result = parseNpcAction('[PASS]');
    expect(result.type).toBe('pass');
    expect(result.content).toBe('');
  });

  it('should parse [LEAVE]', () => {
    const result = parseNpcAction('[LEAVE] *stands and walks out*');
    expect(result.type).toBe('leave');
    expect(result.content).toBe('*stands and walks out*');
  });

  it('should infer speech from plain text', () => {
    const result = parseNpcAction('Hello there!');
    expect(result.type).toBe('speech');
    expect(result.content).toBe('Hello there!');
  });

  it('should infer act from asterisk-wrapped text', () => {
    const result = parseNpcAction('*nods quietly*');
    expect(result.type).toBe('act');
    expect(result.content).toBe('*nods quietly*');
  });

  it('should infer pass from empty text', () => {
    const result = parseNpcAction('');
    expect(result.type).toBe('pass');
    expect(result.content).toBe('');
  });

  // ── Target extraction (new behavior) ──────────────────────────

  it('should have target: null when no [TO:] is present', () => {
    const result = parseNpcAction('[SPEAK] "Hello!"');
    expect(result.target).toBeNull();
  });

  it('should extract target from [TO: name] after action type', () => {
    const result = parseNpcAction('[SPEAK][TO: the halfling behind the bar] "Long night, or early morning?"');
    expect(result.type).toBe('speech');
    expect(result.target).toBe('the halfling behind the bar');
    expect(result.content).toBe('"Long night, or early morning?"');
  });

  it('should extract target from [TO: name] with space between brackets', () => {
    const result = parseNpcAction('[SPEAK] [TO: the quiet man at the bar] "Another round?"');
    expect(result.type).toBe('speech');
    expect(result.target).toBe('the quiet man at the bar');
    expect(result.content).toBe('"Another round?"');
  });

  it('should extract target for ACT actions', () => {
    const result = parseNpcAction('[ACT][TO: the dragonborn] *slides a drink across the bar*');
    expect(result.type).toBe('act');
    expect(result.target).toBe('the dragonborn');
    expect(result.content).toBe('*slides a drink across the bar*');
  });

  it('should be case-insensitive for [TO:]', () => {
    const result = parseNpcAction('[SPEAK][to: Aldric] "Welcome back!"');
    expect(result.type).toBe('speech');
    expect(result.target).toBe('Aldric');
  });

  it('should handle [TO: room] for general address', () => {
    const result = parseNpcAction('[SPEAK][TO: the room] "Last call!"');
    expect(result.type).toBe('speech');
    expect(result.target).toBe('the room');
  });

  it('should have target: null for inferred actions (no brackets)', () => {
    const result = parseNpcAction('Hello there!');
    expect(result.target).toBeNull();
  });

  it('should handle OBSERVE with no target', () => {
    const result = parseNpcAction('[OBSERVE] *watches the door*');
    expect(result.target).toBeNull();
  });

  it('should handle PASS with no target', () => {
    const result = parseNpcAction('[PASS]');
    expect(result.target).toBeNull();
  });
});
