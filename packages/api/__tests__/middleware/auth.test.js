/**
 * Auth Middleware Tests
 *
 * Requirements:
 * - Auth middleware rejects requests without Authorization header (production)
 * - Auth middleware rejects invalid tokens
 * - Auth middleware sets req.user for valid tokens
 * - Dev bypass: when NODE_ENV !== 'production' and no header, auto-injects dev user
 */
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthMiddleware } from '../../src/middleware/auth.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

describe('Auth Middleware', () => {
  const fakeAuthService = {
    verifyJwt: mock.fn(),
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
    const next = mock.fn();

    middleware(req, res, next);

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(next.mock.calls.length, 0);
  });

  it('should set req.user for valid tokens', () => {
    vi.stubEnv('NODE_ENV', 'production');
    fakeAuthService.verifyJwt.mockReturnValue({ userId: 'user-123', email: 'test@example.com' });
    const middleware = createAuthMiddleware(fakeAuthService);
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    const next = mock.fn();

    middleware(req, res, next);

    assert.deepStrictEqual(req.user, { userId: 'user-123', email: 'test@example.com' });
    assert.ok(next.mock.calls.length > 0);
  });

  it('should auto-inject dev user when NODE_ENV is not production and no header', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const middleware = createAuthMiddleware(fakeAuthService);
    const req = { headers: {} };
    const res = mockRes();
    const next = mock.fn();

    middleware(req, res, next);

    assert.deepStrictEqual(req.user, { userId: 'dev-user', email: 'dev@localhost' });
    assert.ok(next.mock.calls.length > 0);
    assert.strictEqual(fakeAuthService.verifyJwt.mock.calls.length, 0);
  });

  it('should still validate tokens in dev mode when Authorization header is provided', () => {
    vi.stubEnv('NODE_ENV', 'development');
    fakeAuthService.verifyJwt.mockReturnValue({ userId: 'real-user', email: 'real@example.com' });
    const middleware = createAuthMiddleware(fakeAuthService);
    const req = { headers: { authorization: 'Bearer real-token' } };
    const res = mockRes();
    const next = mock.fn();

    middleware(req, res, next);

    assert.deepStrictEqual(req.user, { userId: 'real-user', email: 'real@example.com' });
    assert.deepStrictEqual(fakeAuthService.verifyJwt.mock.calls.at(-1).arguments, ['real-token']);
  });

  it('should default to dev bypass when NODE_ENV is not set', () => {
    vi.stubEnv('NODE_ENV', '');
    const middleware = createAuthMiddleware(fakeAuthService);
    const req = { headers: {} };
    const res = mockRes();
    const next = mock.fn();

    middleware(req, res, next);

    assert.strictEqual(req.user.userId, 'dev-user');
    assert.ok(next.mock.calls.length > 0);
  });
});
