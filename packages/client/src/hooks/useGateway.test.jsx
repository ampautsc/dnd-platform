/**
 * useGateway hook tests
 *
 * Requirements:
 * - provides send() to dispatch client→server intents
 * - receives gateway events and updates state
 * - cleans up listeners on unmount
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { GatewayProvider, useGateway } from './useGateway.jsx';
import { MockGateway } from '../testing/MockGateway.js';

function wrapper(gateway) {
  return ({ children }) => (
    <GatewayProvider gateway={gateway}>{children}</GatewayProvider>
  );
}

describe('useGateway', () => {
  it('provides send() to dispatch intents', () => {
    const gw = new MockGateway();
    const { result } = renderHook(() => useGateway(), { wrapper: wrapper(gw) });

    act(() => result.current.send('joinSession', { code: 'ABCD' }));

    gw.assertSent('joinSession', p => p.code === 'ABCD');
  });

  it('receives gateway events via useEvent', () => {
    const gw = new MockGateway();
    const handler = vi.fn();
    const { result } = renderHook(() => {
      const ctx = useGateway();
      ctx.useEvent('sessionJoined', handler);
      return ctx;
    }, { wrapper: wrapper(gw) });

    act(() => gw.emit('sessionJoined', { sessionId: '123' }));

    expect(handler).toHaveBeenCalledWith({ sessionId: '123' });
  });

  it('cleans up listeners on unmount', () => {
    const gw = new MockGateway();
    const handler = vi.fn();
    const { unmount } = renderHook(() => {
      const ctx = useGateway();
      ctx.useEvent('sessionJoined', handler);
      return ctx;
    }, { wrapper: wrapper(gw) });

    unmount();

    // after unmount, the listener should be gone
    act(() => gw.emit('sessionJoined', { sessionId: '456' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('exposes the gateway instance', () => {
    const gw = new MockGateway();
    const { result } = renderHook(() => useGateway(), { wrapper: wrapper(gw) });

    expect(result.current.gateway).toBe(gw);
  });
});
