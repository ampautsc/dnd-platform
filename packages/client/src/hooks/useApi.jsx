/**
 * useApi — React context + hook for REST API communication.
 *
 * Provides:
 * - get(path) — GET request
 * - post(path, body) — POST request
 * - api — raw api instance
 */
import { createContext, useContext, useCallback } from 'react';

const ApiContext = createContext(null);

export function ApiProvider({ api, children }) {
  return (
    <ApiContext.Provider value={api}>
      {children}
    </ApiContext.Provider>
  );
}

export function useApi() {
  const api = useContext(ApiContext);
  if (!api) {
    throw new Error('useApi must be used within an ApiProvider');
  }

  const get = useCallback(
    (path) => api.get(path),
    [api]
  );

  const post = useCallback(
    (path, body) => api.post(path, body),
    [api]
  );

  return { get, post, api };
}
