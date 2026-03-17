/**
 * useApi hook tests
 *
 * Requirements:
 * - provides get() and post() methods
 * - methods delegate to the provided api instance
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ApiProvider, useApi } from './useApi.jsx';
import { MockApi } from '../testing/MockApi.js';

function wrapper(api) {
  return ({ children }) => (
    <ApiProvider api={api}>{children}</ApiProvider>
  );
}

describe('useApi', () => {
  it('provides get() that delegates to api instance', async () => {
    const api = new MockApi({ '/api/test': { ok: true } });
    const { result } = renderHook(() => useApi(), { wrapper: wrapper(api) });

    const res = await result.current.get('/api/test');
    expect(res).toEqual({ ok: true });
  });

  it('provides post() that delegates to api instance', async () => {
    const api = new MockApi({ '/api/sessions/join': { sessionId: 'abc' } });
    const { result } = renderHook(() => useApi(), { wrapper: wrapper(api) });

    const res = await result.current.post('/api/sessions/join', { code: 'ABCD' });
    expect(res).toEqual({ sessionId: 'abc' });
  });

  it('exposes the api instance', () => {
    const api = new MockApi();
    const { result } = renderHook(() => useApi(), { wrapper: wrapper(api) });

    expect(result.current.api).toBe(api);
  });
});
