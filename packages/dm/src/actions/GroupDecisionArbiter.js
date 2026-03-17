function cloneDecision(decision) {
  return {
    ...decision,
    options: decision.options.map(option => ({ ...option })),
    playerIds: [...decision.playerIds],
    votes: { ...decision.votes },
  };
}

function invalidInput() {
  throw new Error('INVALID_INPUT');
}

export function createGroupDecisionArbiter(options = {}) {
  const nowFn = options.nowFn || (() => Date.now());
  const defaultTimeoutMs = Number.isInteger(options.defaultTimeoutMs) ? options.defaultTimeoutMs : 60_000;
  const decisions = new Map();

  function startDecision(input) {
    const {
      decisionId,
      sessionId,
      prompt,
      options: decisionOptions,
      playerIds,
      timeoutMs = defaultTimeoutMs,
    } = input || {};

    if (!decisionId || !sessionId || !prompt || !Array.isArray(decisionOptions) || decisionOptions.length === 0 || !Array.isArray(playerIds) || playerIds.length === 0) {
      invalidInput();
    }

    const optionIds = new Set();
    for (const option of decisionOptions) {
      if (!option || !option.id) invalidInput();
      optionIds.add(option.id);
    }

    const createdAt = nowFn();
    const decision = {
      decisionId,
      sessionId,
      prompt,
      options: decisionOptions.map(option => ({ ...option })),
      optionIds,
      playerIds: [...playerIds],
      votes: {},
      status: 'open',
      outcome: null,
      winnerOptionId: null,
      createdAt,
      deadlineAt: createdAt + timeoutMs,
      resolvedAt: null,
    };

    decisions.set(decisionId, decision);
    return cloneDecision(decision);
  }

  function getDecisionOrThrow(decisionId) {
    const decision = decisions.get(decisionId);
    if (!decision) throw new Error('DECISION_NOT_FOUND');
    return decision;
  }

  function closeExpired(decision) {
    if (decision.status !== 'open') return;
    if (nowFn() <= decision.deadlineAt) return;

    decision.status = 'closed';
    decision.outcome = 'timeout';
    decision.winnerOptionId = null;
    decision.resolvedAt = nowFn();
  }

  function castVote(decisionId, vote) {
    const decision = getDecisionOrThrow(decisionId);
    closeExpired(decision);

    if (decision.status !== 'open') throw new Error('DECISION_CLOSED');

    const { playerId, optionId } = vote || {};
    if (!playerId || !optionId) invalidInput();
    if (!decision.playerIds.includes(playerId)) throw new Error('PLAYER_NOT_ELIGIBLE');
    if (!decision.optionIds.has(optionId)) throw new Error('INVALID_OPTION');

    decision.votes[playerId] = optionId;
    return cloneDecision(decision);
  }

  function resolveDecision(decisionId) {
    const decision = getDecisionOrThrow(decisionId);

    if (decision.status !== 'open') {
      return cloneDecision(decision);
    }

    const counts = {};
    for (const option of decision.options) {
      counts[option.id] = 0;
    }

    for (const optionId of Object.values(decision.votes)) {
      if (counts[optionId] !== undefined) {
        counts[optionId] += 1;
      }
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const [topOptionId, topCount] = sorted[0] || [null, 0];

    let outcome = 'no_votes';
    let winnerOptionId = null;

    if (topCount > 0) {
      const tiedTop = sorted.filter(([, count]) => count === topCount);
      if (tiedTop.length > 1) {
        outcome = 'tie';
      } else {
        outcome = 'majority';
        winnerOptionId = topOptionId;
      }
    }

    decision.status = 'closed';
    decision.outcome = outcome;
    decision.winnerOptionId = winnerOptionId;
    decision.resolvedAt = nowFn();

    return cloneDecision(decision);
  }

  function getDecision(decisionId) {
    const decision = getDecisionOrThrow(decisionId);
    closeExpired(decision);
    return cloneDecision(decision);
  }

  return {
    startDecision,
    castVote,
    resolveDecision,
    getDecision,
  };
}
