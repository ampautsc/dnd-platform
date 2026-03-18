/**
 * SceneState — Immutable state container for initiative-based social scenes.
 *
 * Modeled on combat's GameState: all mutation methods return new instances.
 * Object.freeze(this) in constructor. No side effects.
 *
 * Participants are NPCs and player characters, treated identically.
 * The `isPlayer` flag is internal bookkeeping for the engine to know when
 * to wait for input vs. auto-resolve via LLM. It is NEVER exposed in prompts.
 *
 * @module SceneState
 */

export class SceneState {
  /**
   * @param {Object} params
   * @param {string} params.id — unique scene ID
   * @param {Array<{ id, name, chaMod, isPlayer, templateKey }>} params.participants
   * @param {string[]}  [params.initiativeOrder=[]]
   * @param {Map}       [params.initiativeRolls=new Map()]
   * @param {number}    [params.round=0]
   * @param {number}    [params.turnIndex=0]
   * @param {Array}     [params.transcript=[]]
   * @param {Array}     [params.privateTranscript=[]]
   * @param {string}    [params.status='pending']
   * @param {string|null} [params.endReason=null]
   * @param {number}    [params.maxRounds=20]
   * @param {Object}    [params.worldContext={}]
   * @param {string|null} [params.pendingAction=null]
   * @param {number}      [params.createdAt=Date.now()]
   */
  constructor({
    id,
    participants,
    initiativeOrder = [],
    initiativeRolls = new Map(),
    round = 0,
    turnIndex = 0,
    transcript = [],
    privateTranscript = [],
    status = 'pending',
    endReason = null,
    maxRounds = 20,
    worldContext = {},
    pendingAction = null,
    createdAt = Date.now(),
  }) {
    this._id = id;
    this._participants = new Map(participants.map(p => [p.id, { ...p }]));
    this._initiativeOrder = Object.freeze([...initiativeOrder]);
    this._initiativeRolls = new Map(initiativeRolls);
    this._round = round;
    this._turnIndex = turnIndex;
    this._transcript = Object.freeze([...transcript]);
    this._privateTranscript = Object.freeze([...privateTranscript]);
    this._status = status;
    this._endReason = endReason;
    this._maxRounds = maxRounds;
    this._worldContext = { ...worldContext };
    this._pendingAction = pendingAction;
    this._createdAt = createdAt;

    Object.freeze(this);
  }

  // ── Getters ─────────────────────────────────────────────────────

  get id() { return this._id; }
  get initiativeOrder() { return this._initiativeOrder; }
  get initiativeRolls() { return this._initiativeRolls; }
  get round() { return this._round; }
  get turnIndex() { return this._turnIndex; }
  get transcript() { return this._transcript; }
  get privateTranscript() { return this._privateTranscript; }
  get status() { return this._status; }
  get endReason() { return this._endReason; }
  get maxRounds() { return this._maxRounds; }
  get worldContext() { return this._worldContext; }
  get pendingAction() { return this._pendingAction; }
  get createdAt() { return this._createdAt; }

  getParticipant(id) { return this._participants.get(id); }

  get allParticipants() {
    return [...this._participants.values()];
  }

  get participantCount() {
    return this._participants.size;
  }

  get currentParticipant() {
    if (this._initiativeOrder.length === 0) return undefined;
    return this._participants.get(this._initiativeOrder[this._turnIndex]);
  }

  get isPlayerTurn() {
    return this.currentParticipant?.isPlayer === true;
  }

  // ── Immutable mutation methods ──────────────────────────────────

  /** @returns {SceneState} */
  _clone(overrides = {}) {
    return new SceneState({
      id: this._id,
      participants: this.allParticipants,
      initiativeOrder: [...this._initiativeOrder],
      initiativeRolls: new Map(this._initiativeRolls),
      round: this._round,
      turnIndex: this._turnIndex,
      transcript: [...this._transcript],
      privateTranscript: [...this._privateTranscript],
      status: this._status,
      endReason: this._endReason,
      maxRounds: this._maxRounds,
      worldContext: { ...this._worldContext },
      pendingAction: this._pendingAction,
      createdAt: this._createdAt,
      ...overrides,
    });
  }

  withStatus(status) {
    return this._clone({ status });
  }

  withRound(round) {
    return this._clone({ round });
  }

  withInitiativeOrder(order, rolls) {
    return this._clone({ initiativeOrder: order, initiativeRolls: rolls });
  }

  withTurnIndex(turnIndex) {
    return this._clone({ turnIndex });
  }

  withTranscriptEntry(entry) {
    return this._clone({ transcript: [...this._transcript, entry] });
  }

  withPrivateTranscriptEntry(entry) {
    return this._clone({ privateTranscript: [...this._privateTranscript, entry] });
  }

  withoutParticipant(participantId) {
    return this._clone({
      participants: this.allParticipants.filter(p => p.id !== participantId),
    });
  }

  withPendingAction(participantId) {
    return this._clone({ pendingAction: participantId });
  }

  withEndReason(reason) {
    return this._clone({ endReason: reason, status: 'ended' });
  }

  withWorldContext(worldContext) {
    return this._clone({ worldContext });
  }

  withMaxRounds(maxRounds) {
    return this._clone({ maxRounds });
  }

  // ── Serialization ───────────────────────────────────────────────

  toJSON() {
    return {
      id: this._id,
      participants: this.allParticipants,
      initiativeOrder: [...this._initiativeOrder],
      initiativeRolls: Object.fromEntries(this._initiativeRolls),
      round: this._round,
      turnIndex: this._turnIndex,
      transcript: [...this._transcript],
      privateTranscript: [...this._privateTranscript],
      status: this._status,
      endReason: this._endReason,
      maxRounds: this._maxRounds,
      worldContext: { ...this._worldContext },
      pendingAction: this._pendingAction,
      createdAt: this._createdAt,
    };
  }
}
