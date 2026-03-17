export function createGameLog() {
  const events = [];

  return {
    record({ type, payload = {}, timestamp = new Date().toISOString() }) {
      events.push({ type, payload, timestamp });
      return events[events.length - 1];
    },

    getAll() {
      return [...events];
    },

    getSince(isoTimestamp) {
      const threshold = new Date(isoTimestamp).getTime();
      return events.filter((event) => new Date(event.timestamp).getTime() > threshold);
    },
  };
}
