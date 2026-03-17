import { describe, it, expect, beforeEach } from 'vitest';
import { createGroupDecisionArbiter } from '../../src/actions/GroupDecisionArbiter.js';

/**
 * GroupDecisionArbiter Requirements:
 *
 * 1. startDecision({ decisionId, sessionId, prompt, options, playerIds, timeoutMs? })
 *    a. creates an open decision with deadline
 *    b. throws INVALID_INPUT for missing decisionId/options/playerIds
 *
 * 2. castVote(decisionId, { playerId, optionId })
 *    a. records one vote per player (latest vote replaces previous)
 *    b. throws DECISION_NOT_FOUND for unknown decision
 *    c. throws DECISION_CLOSED after resolution/timeout
 *    d. throws PLAYER_NOT_ELIGIBLE if voter is not in playerIds
 *    e. throws INVALID_OPTION if optionId is unknown
 *
 * 3. resolveDecision(decisionId, { now? })
 *    a. resolves to majority winner when one option has most votes
 *    b. resolves tie when top vote counts are equal
 *    c. resolves no_votes when no votes were cast
 *    d. marks status as closed and stores resolvedAt
 *
 * 4. timeout behavior
 *    a. resolveDecision closes expired open decisions (using injected nowFn)
 */

describe('GroupDecisionArbiter', () => {
  let now;
  let arbiter;

  beforeEach(() => {
    now = 1000;
    arbiter = createGroupDecisionArbiter({ nowFn: () => now, defaultTimeoutMs: 30_000 });
  });

  it('starts a decision with open status and deadline', () => {
    const decision = arbiter.startDecision({
      decisionId: 'd1',
      sessionId: 's1',
      prompt: 'Where should we go?',
      options: [
        { id: 'forest', label: 'Forest' },
        { id: 'town', label: 'Town' },
      ],
      playerIds: ['p1', 'p2', 'p3'],
    });

    expect(decision.status).toBe('open');
    expect(decision.deadlineAt).toBe(31_000);
    expect(decision.votes).toEqual({});
  });

  it('throws INVALID_INPUT for missing required start fields', () => {
    expect(() => arbiter.startDecision({ decisionId: '', options: [], playerIds: [] })).toThrow(/INVALID_INPUT/);
  });

  it('records votes and allows replacing previous vote', () => {
    arbiter.startDecision({
      decisionId: 'd1',
      sessionId: 's1',
      prompt: 'Where should we go?',
      options: [
        { id: 'forest', label: 'Forest' },
        { id: 'town', label: 'Town' },
      ],
      playerIds: ['p1', 'p2'],
    });

    arbiter.castVote('d1', { playerId: 'p1', optionId: 'forest' });
    arbiter.castVote('d1', { playerId: 'p1', optionId: 'town' });

    const decision = arbiter.getDecision('d1');
    expect(decision.votes).toEqual({ p1: 'town' });
  });

  it('throws DECISION_NOT_FOUND for unknown decision', () => {
    expect(() => arbiter.castVote('missing', { playerId: 'p1', optionId: 'x' })).toThrow(/DECISION_NOT_FOUND/);
  });

  it('throws PLAYER_NOT_ELIGIBLE for non-member voter', () => {
    arbiter.startDecision({
      decisionId: 'd1',
      sessionId: 's1',
      prompt: 'Where should we go?',
      options: [{ id: 'forest', label: 'Forest' }],
      playerIds: ['p1'],
    });

    expect(() => arbiter.castVote('d1', { playerId: 'p2', optionId: 'forest' })).toThrow(/PLAYER_NOT_ELIGIBLE/);
  });

  it('throws INVALID_OPTION for unknown optionId', () => {
    arbiter.startDecision({
      decisionId: 'd1',
      sessionId: 's1',
      prompt: 'Where should we go?',
      options: [{ id: 'forest', label: 'Forest' }],
      playerIds: ['p1'],
    });

    expect(() => arbiter.castVote('d1', { playerId: 'p1', optionId: 'town' })).toThrow(/INVALID_OPTION/);
  });

  it('resolves to majority winner', () => {
    arbiter.startDecision({
      decisionId: 'd1',
      sessionId: 's1',
      prompt: 'Where should we go?',
      options: [
        { id: 'forest', label: 'Forest' },
        { id: 'town', label: 'Town' },
      ],
      playerIds: ['p1', 'p2', 'p3'],
    });

    arbiter.castVote('d1', { playerId: 'p1', optionId: 'forest' });
    arbiter.castVote('d1', { playerId: 'p2', optionId: 'forest' });
    arbiter.castVote('d1', { playerId: 'p3', optionId: 'town' });

    const result = arbiter.resolveDecision('d1');
    expect(result.outcome).toBe('majority');
    expect(result.winnerOptionId).toBe('forest');
    expect(result.status).toBe('closed');
    expect(result.resolvedAt).toBe(1000);
  });

  it('resolves tie when top vote counts match', () => {
    arbiter.startDecision({
      decisionId: 'd1',
      sessionId: 's1',
      prompt: 'Where should we go?',
      options: [
        { id: 'forest', label: 'Forest' },
        { id: 'town', label: 'Town' },
      ],
      playerIds: ['p1', 'p2'],
    });

    arbiter.castVote('d1', { playerId: 'p1', optionId: 'forest' });
    arbiter.castVote('d1', { playerId: 'p2', optionId: 'town' });

    const result = arbiter.resolveDecision('d1');
    expect(result.outcome).toBe('tie');
    expect(result.winnerOptionId).toBeNull();
  });

  it('resolves no_votes when none cast', () => {
    arbiter.startDecision({
      decisionId: 'd1',
      sessionId: 's1',
      prompt: 'Where should we go?',
      options: [{ id: 'forest', label: 'Forest' }],
      playerIds: ['p1'],
    });

    const result = arbiter.resolveDecision('d1');
    expect(result.outcome).toBe('no_votes');
    expect(result.winnerOptionId).toBeNull();
  });

  it('prevents votes after decision is closed', () => {
    arbiter.startDecision({
      decisionId: 'd1',
      sessionId: 's1',
      prompt: 'Where should we go?',
      options: [{ id: 'forest', label: 'Forest' }],
      playerIds: ['p1'],
    });

    arbiter.resolveDecision('d1');
    expect(() => arbiter.castVote('d1', { playerId: 'p1', optionId: 'forest' })).toThrow(/DECISION_CLOSED/);
  });

  it('allows resolving after timeout using nowFn', () => {
    arbiter.startDecision({
      decisionId: 'd1',
      sessionId: 's1',
      prompt: 'Where should we go?',
      options: [{ id: 'forest', label: 'Forest' }],
      playerIds: ['p1'],
      timeoutMs: 500,
    });

    now = 2_000;
    const result = arbiter.resolveDecision('d1');
    expect(result.status).toBe('closed');
    expect(result.resolvedAt).toBe(2_000);
  });
});
