/**
 * PartyCoherenceMonitor — Contract Tests
 *
 * Requirements:
 * 1. updatePosition(playerId, position) — tracks current {x,y} position for a player
 * 2. getPosition(playerId) — returns the stored position or null
 * 3. evaluateAction(playerId, proposedPosition) — checks whether move would exceed
 *    the configured distance threshold from the party centroid (excluding the mover).
 *    Returns { allowed: true } or { allowed: false, warning, distanceFromParty, threshold }
 * 4. Distance is Euclidean. Threshold is configurable (default 30).
 * 5. Solo player (only one tracked) is always allowed — nothing to split from.
 * 6. confirmSplit(playerId) — player acknowledges the warning; returns { confirmed: true }
 * 7. getPartyPositions() returns a cloned map of all positions — mutations don't leak.
 * 8. clearPosition(playerId) removes a player from tracking.
 */
import { describe, it, expect } from 'vitest';
import { createPartyCoherenceMonitor } from '../../src/actions/PartyCoherenceMonitor.js';

describe('PartyCoherenceMonitor', () => {
  // ── Position tracking ──────────────────────────────────────────────

  it('stores and retrieves a player position', () => {
    const monitor = createPartyCoherenceMonitor();
    monitor.updatePosition('p1', { x: 0, y: 0 });

    expect(monitor.getPosition('p1')).toEqual({ x: 0, y: 0 });
  });

  it('returns null for an unknown player', () => {
    const monitor = createPartyCoherenceMonitor();

    expect(monitor.getPosition('unknown')).toBeNull();
  });

  it('overwrites position on repeated update', () => {
    const monitor = createPartyCoherenceMonitor();
    monitor.updatePosition('p1', { x: 0, y: 0 });
    monitor.updatePosition('p1', { x: 5, y: 5 });

    expect(monitor.getPosition('p1')).toEqual({ x: 5, y: 5 });
  });

  // ── evaluateAction ─────────────────────────────────────────────────

  it('allows move when within threshold of party centroid', () => {
    const monitor = createPartyCoherenceMonitor({ threshold: 30 });
    monitor.updatePosition('p1', { x: 0, y: 0 });
    monitor.updatePosition('p2', { x: 10, y: 0 });
    monitor.updatePosition('p3', { x: 0, y: 10 });

    // Centroid of p2+p3 (excluding p1) = (5, 5)
    // Proposed (10, 10) → distance from (5,5) = sqrt(50) ≈ 7.07 → within 30
    const result = monitor.evaluateAction('p1', { x: 10, y: 10 });
    expect(result.allowed).toBe(true);
  });

  it('rejects move that exceeds threshold from party centroid', () => {
    const monitor = createPartyCoherenceMonitor({ threshold: 10 });
    monitor.updatePosition('p1', { x: 0, y: 0 });
    monitor.updatePosition('p2', { x: 5, y: 0 });
    monitor.updatePosition('p3', { x: 0, y: 5 });

    // Centroid of p2+p3 = (2.5, 2.5)
    // Proposed (100, 100) → distance ≈ 137.9 → exceeds 10
    const result = monitor.evaluateAction('p1', { x: 100, y: 100 });

    expect(result.allowed).toBe(false);
    expect(result.warning).toMatch(/split/i);
    expect(result.distanceFromParty).toBeGreaterThan(10);
    expect(result.threshold).toBe(10);
  });

  it('always allows move for solo player (no party to split from)', () => {
    const monitor = createPartyCoherenceMonitor({ threshold: 5 });
    monitor.updatePosition('p1', { x: 0, y: 0 });

    const result = monitor.evaluateAction('p1', { x: 999, y: 999 });
    expect(result.allowed).toBe(true);
  });

  it('uses default threshold of 30 when none provided', () => {
    const monitor = createPartyCoherenceMonitor();
    monitor.updatePosition('p1', { x: 0, y: 0 });
    monitor.updatePosition('p2', { x: 0, y: 0 });

    // Moving 25 units away → within default 30
    const close = monitor.evaluateAction('p1', { x: 25, y: 0 });
    expect(close.allowed).toBe(true);

    // Moving 35 units away → exceeds default 30
    const far = monitor.evaluateAction('p1', { x: 35, y: 0 });
    expect(far.allowed).toBe(false);
    expect(far.threshold).toBe(30);
  });

  // ── confirmSplit ───────────────────────────────────────────────────

  it('confirmSplit returns confirmed acknowledgement', () => {
    const monitor = createPartyCoherenceMonitor();
    const result = monitor.confirmSplit('p1');

    expect(result).toEqual({ confirmed: true, playerId: 'p1' });
  });

  // ── getPartyPositions ──────────────────────────────────────────────

  it('returns cloned position map (no leaking internal state)', () => {
    const monitor = createPartyCoherenceMonitor();
    monitor.updatePosition('p1', { x: 1, y: 2 });
    monitor.updatePosition('p2', { x: 3, y: 4 });

    const positions = monitor.getPartyPositions();
    expect(positions).toEqual({
      p1: { x: 1, y: 2 },
      p2: { x: 3, y: 4 },
    });

    // Mutating returned object must not affect internal state
    positions.p1.x = 999;
    expect(monitor.getPosition('p1')).toEqual({ x: 1, y: 2 });
  });

  // ── clearPosition ─────────────────────────────────────────────────

  it('clearPosition removes the player from tracking', () => {
    const monitor = createPartyCoherenceMonitor();
    monitor.updatePosition('p1', { x: 0, y: 0 });
    monitor.clearPosition('p1');

    expect(monitor.getPosition('p1')).toBeNull();
  });

  // ── evaluateAction for untracked mover ─────────────────────────────

  it('treats untracked mover as allowed (no current position to compare)', () => {
    const monitor = createPartyCoherenceMonitor({ threshold: 5 });
    monitor.updatePosition('p2', { x: 0, y: 0 });

    const result = monitor.evaluateAction('unknown-player', { x: 999, y: 999 });
    expect(result.allowed).toBe(true);
  });
});
