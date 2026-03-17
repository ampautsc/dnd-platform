/**
 * PartyCoherenceMonitor
 *
 * Tracks party member positions and detects when a proposed action would
 * split the party beyond a configurable distance threshold.
 */

function euclideanDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function centroidOf(positions) {
  const n = positions.length;
  if (n === 0) return null;
  const sum = positions.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / n, y: sum.y / n };
}

export function createPartyCoherenceMonitor(options = {}) {
  const threshold = typeof options.threshold === 'number' ? options.threshold : 30;
  const positions = new Map();

  function updatePosition(playerId, position) {
    positions.set(playerId, { x: position.x, y: position.y });
  }

  function getPosition(playerId) {
    const pos = positions.get(playerId);
    if (!pos) return null;
    return { x: pos.x, y: pos.y };
  }

  function clearPosition(playerId) {
    positions.delete(playerId);
  }

  function getPartyPositions() {
    const result = {};
    for (const [id, pos] of positions) {
      result[id] = { x: pos.x, y: pos.y };
    }
    return result;
  }

  function evaluateAction(playerId, proposedPosition) {
    // Untracked mover — no baseline position, can't determine split
    if (!positions.has(playerId)) {
      return { allowed: true };
    }

    // Collect other party members' positions (excluding the mover)
    const others = [];
    for (const [id, pos] of positions) {
      if (id !== playerId) {
        others.push(pos);
      }
    }

    // Solo player → always allowed (nothing to split from)
    if (others.length === 0) {
      return { allowed: true };
    }

    const partyCentroid = centroidOf(others);
    const dist = euclideanDistance(proposedPosition, partyCentroid);

    if (dist <= threshold) {
      return { allowed: true };
    }

    return {
      allowed: false,
      warning: `Moving here would split the party. You would be ${dist.toFixed(1)} units from the group (threshold: ${threshold}).`,
      distanceFromParty: dist,
      threshold,
    };
  }

  function confirmSplit(playerId) {
    return { confirmed: true, playerId };
  }

  return {
    updatePosition,
    getPosition,
    clearPosition,
    getPartyPositions,
    evaluateAction,
    confirmSplit,
  };
}
