const VALID_TRANSITIONS = {
  lobby: ['intro'],
  intro: ['play'],
  play: ['wrap'],
  wrap: [],
};

export function createSessionManager() {
  const sessions = new Map();

  return {
    createSession({ sessionId, campaignId }) {
      const session = {
        id: sessionId,
        campaignId,
        state: 'lobby',
        updatedAt: new Date().toISOString(),
      };
      sessions.set(sessionId, session);
      return { ...session };
    },

    getSession(sessionId) {
      const session = sessions.get(sessionId);
      return session ? { ...session } : null;
    },

    transition(sessionId, nextState) {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error('SESSION_NOT_FOUND');
      }

      const allowed = VALID_TRANSITIONS[session.state] ?? [];
      if (!allowed.includes(nextState)) {
        throw new Error(`SESSION_TRANSITION_INVALID: ${session.state} -> ${nextState}`);
      }

      const updated = {
        ...session,
        state: nextState,
        updatedAt: new Date().toISOString(),
      };
      sessions.set(sessionId, updated);
      return { ...updated };
    },
  };
}
