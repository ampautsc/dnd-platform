import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
    assert.strictEqual(Object.isFrozen(state), true);
  });

  it('should store participants accessible by id', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    assert.strictEqual(state.getParticipant('npc_mira').name, 'Mira');
    assert.strictEqual(state.getParticipant('player_1').name, 'Thorn');
    assert.strictEqual(state.getParticipant('npc_lell').name, 'Lell');
    assert.strictEqual(state.getParticipant('unknown'), undefined);
  });

  it('should default to pending status, round 0, turnIndex 0', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    assert.strictEqual(state.status, 'pending');
    assert.strictEqual(state.round, 0);
    assert.strictEqual(state.turnIndex, 0);
    assert.deepStrictEqual(state.transcript, []);
    assert.deepStrictEqual(state.initiativeOrder, []);
  });

  // ── with*() methods return new instances ──────────────────────────

  it('withStatus returns a new SceneState', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withStatus('active');
    assert.notStrictEqual(s2, s1);
    assert.strictEqual(s2.status, 'active');
    assert.strictEqual(s1.status, 'pending');
    assert.strictEqual(Object.isFrozen(s2), true);
  });

  it('withRound returns a new SceneState', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withRound(1);
    assert.strictEqual(s2.round, 1);
    assert.strictEqual(s1.round, 0);
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
    assert.deepStrictEqual(s2.initiativeOrder, order);
    assert.strictEqual(s2.initiativeRolls.get('npc_lell').total, 21);
    assert.strictEqual(Object.isFrozen(s2.initiativeOrder), true);
  });

  it('withTurnIndex returns new SceneState', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withTurnIndex(2);
    assert.strictEqual(s2.turnIndex, 2);
    assert.strictEqual(s1.turnIndex, 0);
  });

  it('withTranscriptEntry appends to transcript', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const entry = { id: 'te_1', participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'Hello!', round: 1, turnIndex: 0, timestamp: Date.now() };
    const s2 = s1.withTranscriptEntry(entry);
    assert.strictEqual(s2.transcript.length, 1);
    assert.strictEqual(s2.transcript[0].content, 'Hello!');
    assert.strictEqual(s1.transcript.length, 0);
    assert.strictEqual(Object.isFrozen(s2.transcript), true);

    // Append another
    const entry2 = { ...entry, id: 'te_2', content: 'Hi there!' };
    const s3 = s2.withTranscriptEntry(entry2);
    assert.strictEqual(s3.transcript.length, 2);
  });

  it('withPendingAction sets / clears pending participant', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withPendingAction('player_1');
    assert.strictEqual(s2.pendingAction, 'player_1');
    const s3 = s2.withPendingAction(null);
    assert.strictEqual(s3.pendingAction, null);
  });

  it('withEndReason sets reason and status to ended', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withEndReason('round_cap');
    assert.strictEqual(s2.endReason, 'round_cap');
    assert.strictEqual(s2.status, 'ended');
  });

  it('withWorldContext sets world context', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const wc = { location: 'Bottoms Up Tavern', timeOfDay: 'evening', tone: 'jovial' };
    const s2 = s1.withWorldContext(wc);
    assert.strictEqual(s2.worldContext.location, 'Bottoms Up Tavern');
    assert.deepStrictEqual(s1.worldContext, {});
  });

  it('withMaxRounds sets the cap', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withMaxRounds(10);
    assert.strictEqual(s2.maxRounds, 10);
  });

  // ── Helpers ────────────────────────────────────────────────────────

  it('currentParticipant returns the participant at current turnIndex', () => {
    const order = ['npc_lell', 'npc_mira', 'player_1'];
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() })
      .withInitiativeOrder(order, new Map())
      .withTurnIndex(1);
    assert.strictEqual(state.currentParticipant.id, 'npc_mira');
  });

  it('currentParticipant returns undefined when no initiative order', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    assert.strictEqual(state.currentParticipant, undefined);
  });

  it('isPlayerTurn is true only when current participant is a player', () => {
    const order = ['npc_lell', 'player_1', 'npc_mira'];
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() })
      .withInitiativeOrder(order, new Map());

    assert.strictEqual(state.withTurnIndex(0).isPlayerTurn, false);
    assert.strictEqual(state.withTurnIndex(1).isPlayerTurn, true);
    assert.strictEqual(state.withTurnIndex(2).isPlayerTurn, false);
  });

  it('allParticipants returns the full list', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    assert.strictEqual(state.allParticipants.length, 3);
  });

  it('participantCount returns the count', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    assert.strictEqual(state.participantCount, 3);
  });

  it('toJSON returns a serializable snapshot', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() })
      .withStatus('active')
      .withRound(2);
    const json = state.toJSON();
    assert.strictEqual(json.id, 'scene_1');
    assert.strictEqual(json.status, 'active');
    assert.strictEqual(json.round, 2);
    assert.strictEqual(Array.isArray(json.participants), true);
    assert.strictEqual(Array.isArray(json.transcript), true);
  });

  // ── Private Transcript (DM-only layer) ─────────────────────────────

  it('should default to empty privateTranscript', () => {
    const state = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    assert.deepStrictEqual(state.privateTranscript, []);
  });

  it('withPrivateTranscriptEntry appends to privateTranscript without touching transcript', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const entry = { id: 'pte_1', participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: '*inner thoughts* Hello!', round: 1, turnIndex: 0, timestamp: Date.now() };
    const s2 = s1.withPrivateTranscriptEntry(entry);
    assert.strictEqual(s2.privateTranscript.length, 1);
    assert.strictEqual(s2.privateTranscript[0].content, '*inner thoughts* Hello!');
    assert.strictEqual(s2.transcript.length, 0); // public unchanged
    assert.strictEqual(s1.privateTranscript.length, 0); // immutable
    assert.strictEqual(Object.isFrozen(s2.privateTranscript), true);
  });

  it('privateTranscript is preserved through clone operations', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const entry = { id: 'pte_1', participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'hello', round: 1, turnIndex: 0, timestamp: Date.now() };
    const s2 = s1.withPrivateTranscriptEntry(entry).withRound(2);
    assert.strictEqual(s2.privateTranscript.length, 1);
    assert.strictEqual(s2.round, 2);
  });

  it('toJSON includes privateTranscript', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const entry = { id: 'pte_1', participantId: 'npc_mira', participantName: 'Mira', type: 'speech', content: 'hi', round: 1, turnIndex: 0, timestamp: Date.now() };
    const json = s1.withPrivateTranscriptEntry(entry).toJSON();
    assert.strictEqual(json.privateTranscript.length, 1);
  });

  // ── Remove Participant ─────────────────────────────────────────────

  it('withoutParticipant removes a participant and returns new instance', () => {
    const s1 = new SceneState({ id: 'scene_1', participants: makeParticipants() });
    const s2 = s1.withoutParticipant('npc_lell');
    assert.strictEqual(s2.participantCount, 2);
    assert.strictEqual(s2.getParticipant('npc_lell'), undefined);
    assert.strictEqual(s1.participantCount, 3); // immutable
  });
});
