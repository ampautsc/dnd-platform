/**
 * Auth Middleware Tests
 *
 * Requirements:
 * - Auth middleware rejects requests without Authorization header (production)
 * - Auth middleware rejects invalid tokens
 * - Auth middleware sets req.user for valid tokens
 * - Dev bypass: when NODE_ENV !== 'production' and no header, auto-injects dev user
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAuthMiddleware } from '../../src/middleware/auth.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

describe('Auth Middleware', () => {
  const fakeAuthService = {
    verifyJwt: vi.fn(),
  };

  beforeEach(() => {
    vi.unstubAllEnvs();
    fakeAuthService.verifyJwt.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should reject requests without Authorization header in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const middleware = createAuthMiddleware(fakeAuthService);
    const req = { headers: {} };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should set req.user for valid tokens', () => {
    vi.stubEnv('NODE_ENV', 'production');
    fakeAuthService.verifyJwt.mockReturnValue({ userId: 'user-123', email: 'test@example.com' });
    const middleware = createAuthMiddleware(fakeAuthService);
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(req.user).toEqual({ userId: 'user-123', email: 'test@example.com' });
    expect(next).toHaveBeenCalled();
  });

  it('should auto-inject dev user when NODE_ENV is not production and no header', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const middleware = createAuthMiddleware(fakeAuthService);
    const req = { headers: {} };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(req.user).toEqual({ userId: 'dev-user', email: 'dev@localhost' });
    expect(next).toHaveBeenCalled();
    expect(fakeAuthService.verifyJwt).not.toHaveBeenCalled();
  });

  it('should still validate tokens in dev mode when Authorization header is provided', () => {
    vi.stubEnv('NODE_ENV', 'development');
    fakeAuthService.verifyJwt.mockReturnValue({ userId: 'real-user', email: 'real@example.com' });
    const middleware = createAuthMiddleware(fakeAuthService);
    const req = { headers: { authorization: 'Bearer real-token' } };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(req.user).toEqual({ userId: 'real-user', email: 'real@example.com' });
    expect(fakeAuthService.verifyJwt).toHaveBeenCalledWith('real-token');
  });

  it('should default to dev bypass when NODE_ENV is not set', () => {
    vi.stubEnv('NODE_ENV', '');
    const middleware = createAuthMiddleware(fakeAuthService);
    const req = { headers: {} };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(req.user.userId).toBe('dev-user');
    expect(next).toHaveBeenCalled();
  });
});
