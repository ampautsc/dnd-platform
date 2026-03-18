import { describe, it, expect } from 'vitest';
import { SceneState } from '../../src/services/SceneState.js';

/**
 * SceneState Requirements:
 *
 * 1. Immutable — Object.isFrozen, all with*() return new instances
 * 2. Tracks participants (NPCs + players identically)
 * 3. Tracks initiative order (CHA-based, sorted)
 * 4. Tracks round number and turn index
 * 5. Append-only transcript of scene actions
 * 6. Status lifecycle: pending → active → ended
 * 7. pendingAction tracks which participant the engine waits on
 * 8. Helpers: currentParticipant, isPlayerTurn, activeParticipants
 */

function makeParticipants() {
  return [
    { id: 'npc_mira', name: 'Mira', chaMod: 2, isPlayer: false, templateKey: 'mira_barrelbottom' },
    { id: 'player_1', name: 'Thorn', chaMod: 1, isPlayer: true, templateKey: null },
    { id: 'npc_lell', name: 'Lell', chaMod: 3, isPlayer: false, templateKey: 'lell_sparrow' },
  ];
}

describe('SceneState', () => {
  it('should be frozen on construction', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('should store participants accessible by id', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    expect(state.getParticipant('npc_mira').name).toBe('Mira');
    expect(state.getParticipant('player_1').name).toBe('Thorn');
    expect(state.getParticipant('npc_lell').name).toBe('Lell');
    expect(state.getParticipant('unknown')).toBeUndefined();
  });

  it('should default to pending status, round 0, turnIndex 0', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    expect(state.status).toBe('pending');
    expect(state.round).toBe(0);
    expect(state.turnIndex).toBe(0);
    expect(state.transcript).toEqual([]);
    expect(state.initiativeOrder).toEqual([]);
  });

  // ── with*() methods return new instances ──────────────────────────

  it('withStatus returns a new SceneState', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withStatus('active');
    expect(s2).not.toBe(s1);
    expect(s2.status).toBe('active');
    expect(s1.status).toBe('pending');
    expect(Object.isFrozen(s2)).toBe(true);
  });

  it('withRound returns a new SceneState', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withRound(1);
    expect(s2.round).toBe(1);
    expect(s1.round).toBe(0);
  });

  it('withInitiativeOrder returns new SceneState with order set', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const order = ['npc_lell', 'npc_mira', 'player_1'];
    const rolls = new Map([
      ['npc_lell', { roll: 18, mod: 3, total: 21 }],
      ['npc_mira', { roll: 15, mod: 2, total: 17 }],
      ['player_1', { roll: 10, mod: 1, total: 11 }],
    ]);
    const s2 = s1.withInitiativeOrder(order, rolls);
    expect(s2.initiativeOrder).toEqual(order);
    expect(s2.initiativeRolls.get('npc_lell').total).toBe(21);
    expect(Object.isFrozen(s2.initiativeOrder)).toBe(true);
  });

  it('withTurnIndex returns new SceneState', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withTurnIndex(2);
    expect(s2.turnIndex).toBe(2);
    expect(s1.turnIndex).toBe(0);
  });

  it('withTranscriptEntry appends to transcript', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const entry = { id: 'te_1', participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Hello!', round: 1, turnIndex: 0, timestamp: Date.now() };
    const s2 = s1.withTranscriptEntry(entry);
    expect(s2.transcript).toHaveLength(1);
    expect(s2.transcript[0].content).toBe('Hello!');
    expect(s1.transcript).toHaveLength(0);
    expect(Object.isFrozen(s2.transcript)).toBe(true);

    // Append another
    const entry2 = { ...entry, id: 'te_2', content: 'Hi there!' };
    const s3 = s2.withTranscriptEntry(entry2);
    expect(s3.transcript).toHaveLength(2);
  });

  it('withPendingAction sets / clears pending participant', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withPendingAction('player_1');
    expect(s2.pendingAction).toBe('player_1');
    const s3 = s2.withPendingAction(null);
    expect(s3.pendingAction).toBeNull();
  });

  it('withEndReason sets reason and status to ended', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withEndReason('round_cap');
    expect(s2.endReason).toBe('round_cap');
    expect(s2.status).toBe('ended');
  });

  it('withWorldContext sets world context', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const wc = { location: 'Bottoms Up Tavern', timeOfDay: 'evening', tone: 'jovial' };
    const s2 = s1.withWorldContext(wc);
    expect(s2.worldContext.location).toBe('Bottoms Up Tavern');
    expect(s1.worldContext).toEqual({});
  });

  it('withMaxRounds sets the cap', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withMaxRounds(10);
    expect(s2.maxRounds).toBe(10);
  });

  // ── Helpers ────────────────────────────────────────────────────────

  it('currentParticipant returns the participant at current turnIndex', () => {
    const order = ['npc_lell', 'npc_mira', 'player_1'];
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() })
      .withInitiativeOrder(order, new Map())
      .withTurnIndex(1);
    expect(state.currentParticipant.id).toBe('npc_mira');
  });

  it('currentParticipant returns undefined when no initiative order', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    expect(state.currentParticipant).toBeUndefined();
  });

  it('isPlayerTurn is true only when current participant is a player', () => {
    const order = ['npc_lell', 'player_1', 'npc_mira'];
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() })
      .withInitiativeOrder(order, new Map());

    expect(state.withTurnIndex(0).isPlayerTurn).toBe(false);
    expect(state.withTurnIndex(1).isPlayerTurn).toBe(true);
    expect(state.withTurnIndex(2).isPlayerTurn).toBe(false);
  });

  it('allParticipants returns the full list', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    expect(state.allParticipants).toHaveLength(3);
  });

  it('participantCount returns the count', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    expect(state.participantCount).toBe(3);
  });

  it('toJSON returns a serializable snapshot', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() })
      .withStatus('active')
      .withRound(2);
    const json = state.toJSON();
    expect(json.id).toBe('scene_1');
    expect(json.status).toBe('active');
    expect(json.round).toBe(2);
    expect(Array.isArray(json.participants)).toBe(true);
    expect(Array.isArray(json.transcript)).toBe(true);
  });

  // ── Private Transcript (DM-only layer) ─────────────────────────────

  it('should default to empty privateTranscript', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    expect(state.privateTranscript).toEqual([]);
  });

  it('withPrivateTranscriptEntry appends to privateTranscript without touching transcript', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const entry = { id: 'pte_1', participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: '*inner thoughts* Hello!', round: 1, turnIndex: 0, timestamp: Date.now() };
    const s2 = s1.withPrivateTranscriptEntry(entry);
    expect(s2.privateTranscript).toHaveLength(1);
    expect(s2.privateTranscript[0].content).toBe('*inner thoughts* Hello!');
    expect(s2.transcript).toHaveLength(0); // public unchanged
    expect(s1.privateTranscript).toHaveLength(0); // immutable
    expect(Object.isFrozen(s2.privateTranscript)).toBe(true);
  });

  it('privateTranscript is preserved through clone operations', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const entry = { id: 'pte_1', participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'hello', round: 1, turnIndex: 0, timestamp: Date.now() };
    const s2 = s1.withPrivateTranscriptEntry(entry).withRound(2);
    expect(s2.privateTranscript).toHaveLength(1);
    expect(s2.round).toBe(2);
  });

  it('toJSON includes privateTranscript', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const entry = { id: 'pte_1', participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'hi', round: 1, turnIndex: 0, timestamp: Date.now() };
    const json = s1.withPrivateTranscriptEntry(entry).toJSON();
    expect(json.privateTranscript).toHaveLength(1);
  });

  // ── Remove Participant ─────────────────────────────────────────────

  it('withoutParticipant removes a participant and returns new instance', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withoutParticipant('npc_lell');
    expect(s2.participantCount).toBe(2);
    expect(s2.getParticipant('npc_lell')).toBeUndefined();
    expect(s1.participantCount).toBe(3); // immutable
  });
});
