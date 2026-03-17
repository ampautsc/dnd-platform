export function createMessageRouter(handlers = {}) {
  return {
    route(envelope, context) {
      const handler = handlers[envelope.channel];
      if (!handler) {
        throw new Error(`Unknown channel: ${envelope.channel}`);
      }
      return handler(envelope, context);
    },
  };
}
