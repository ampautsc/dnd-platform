export function createRoom(sessionId, options = {}) {
  const eventBufferSize = options.eventBufferSize ?? 100;
  const membersByUserId = new Map();
  const eventBuffer = [];

  return {
    sessionId,

    joinMember(member) {
      membersByUserId.set(member.userId, { ...member });
    },

    leaveMember(userId) {
      membersByUserId.delete(userId);
    },

    getMembers() {
      return Array.from(membersByUserId.values());
    },

    addEvent(event) {
      eventBuffer.push({ ...event });
      if (eventBuffer.length > eventBufferSize) {
        eventBuffer.shift();
      }
    },

    getBufferedEvents() {
      return [...eventBuffer];
    },

    getEventsSince(isoTimestamp) {
      const threshold = new Date(isoTimestamp).getTime();
      return eventBuffer.filter((event) => new Date(event.timestamp).getTime() > threshold);
    },
  };
}
