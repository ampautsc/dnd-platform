/**
 * useGateway — React context + hook for gateway communication.
 *
 * Provides:
 * - send(intent, payload) — dispatch client→server intent
 * - useEvent(event, handler) — subscribe to server→client event (auto-cleanup)
 * - gateway — raw gateway instance
 */
import { createContext, useContext, useCallback, useEffect, useRef } from 'react';

const GatewayContext = createContext(null);

export function GatewayProvider({ gateway, children }) {
  return (
    <GatewayContext.Provider value={gateway}>
      {children}
    </GatewayContext.Provider>
  );
}

export function useGateway() {
  const gateway = useContext(GatewayContext);
  if (!gateway) {
    throw new Error('useGateway must be used within a GatewayProvider');
  }

  const send = useCallback(
    (intent, payload) => gateway.send(intent, payload),
    [gateway]
  );

  /**
   * Subscribe to a gateway event. Cleans up on unmount.
   * Must be called at hook top-level (follows rules of hooks).
   */
  function useEvent(event, handler) {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
      const listener = (payload) => handlerRef.current(payload);
      gateway.on(event, listener);
      return () => gateway.off(event, listener);
    }, [event]);
  }

  return { send, useEvent, gateway };
}
