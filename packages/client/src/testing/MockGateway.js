/**
 * MockGateway
 *
 * Simulates the WebSocket gateway for tests and local dev.
 * Matches the real socket.on/send interface.
 */
export class MockGateway {
  constructor() {
    this.listeners = new Map();
    this.sent = [];
  }

  /** Register a listener for a server→client event */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  /** Remove a listener */
  off(event, handler) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      this.listeners.set(event, handlers.filter(h => h !== handler));
    }
  }

  /** Emit a server→client event (for test control) */
  emit(event, payload) {
    const handlers = this.listeners.get(event) || [];
    for (const handler of handlers) {
      handler(payload);
    }
  }

  /** Send a client→server intent (captured for assertions) */
  send(intent, payload) {
    this.sent.push({ intent, payload });
  }

  /** Assert an intent was sent (for test assertions) */
  assertSent(intent, matchFn) {
    const match = this.sent.find(
      s => s.intent === intent && (!matchFn || matchFn(s.payload))
    );
    if (!match) {
      throw new Error(
        `Expected intent "${intent}" not found. Sent: ${JSON.stringify(this.sent)}`
      );
    }
    return match;
  }

  /** Get all sent intents of a given type */
  getSent(intent) {
    return this.sent.filter(s => s.intent === intent);
  }

  /** Clear sent history */
  clearSent() {
    this.sent = [];
  }
}
