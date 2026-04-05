/**
 * AuthService Tests
 * 
 * Requirements:
 * - generateMagicToken(email) → returns { token, expiresAt } with a signed, time-limited token
 * - verifyMagicToken(token) → returns { email, expiresAt } if valid, throws if expired/invalid
 * - issueJwt(userId, email) → returns a signed JWT string with userId, email claims
 * - verifyJwt(token) → returns decoded { userId, email } if valid, throws if expired/invalid
 * - Magic tokens expire after a configurable TTL (default 15 minutes)
 * - JWTs expire after a configurable TTL (default 7 days)
 * - All functions are pure (no DB, no HTTP)
 * - Tokens use HMAC-SHA256 signing
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMagicToken,
  verifyMagicToken,
  issueJwt,
  verifyJwt,
  createAuthService,
} from '../../src/services/AuthService.js';

const TEST_SECRET = 'test-secret-key-at-least-32-chars-long!!';

describe('AuthService', () => {
  let auth;

  beforeEach(() => {
    auth = createAuthService({ secret: TEST_SECRET });
  });

  describe('generateMagicToken', () => {
    it('should return an object with token and expiresAt', () => {
      const result = auth.generateMagicToken('player@example.com');
      assert.notStrictEqual(result['token'], undefined);
      assert.notStrictEqual(result['expiresAt'], undefined);
      assert.strictEqual(typeof result.token, 'string');
      assert.ok(result.token.length > 0);
    });

    it('should produce different tokens for the same email on successive calls', () => {
      const a = auth.generateMagicToken('player@example.com');
      const b = auth.generateMagicToken('player@example.com');
      assert.notStrictEqual(a.token, b.token);
    });

    it('should set expiresAt to ~15 minutes from now by default', () => {
      const before = Date.now();
      const result = auth.generateMagicToken('player@example.com');
      const after = Date.now();
      const fifteenMin = 15 * 60 * 1000;
      assert.ok(result.expiresAt >= before + fifteenMin - 1000);
      assert.ok(result.expiresAt <= after + fifteenMin + 1000);
    });

    it('should accept a custom TTL', () => {
      const customAuth = createAuthService({ secret: TEST_SECRET, magicTokenTtl: 5 * 60 * 1000 });
      const before = Date.now();
      const result = customAuth.generateMagicToken('player@example.com');
      const fiveMin = 5 * 60 * 1000;
      assert.ok(result.expiresAt >= before + fiveMin - 1000);
      assert.ok(result.expiresAt <= before + fiveMin + 2000);
    });
  });

  describe('verifyMagicToken', () => {
    it('should return { email, expiresAt } for a valid token', () => {
      const { token } = auth.generateMagicToken('player@example.com');
      const result = auth.verifyMagicToken(token);
      assert.strictEqual(result.email, 'player@example.com');
      assert.strictEqual(typeof result.expiresAt, 'number');
    });

    it('should throw for a tampered token', () => {
      const { token } = auth.generateMagicToken('player@example.com');
      const tampered = token.slice(0, -4) + 'XXXX';
      assert.throws(() => auth.verifyMagicToken(tampered));
    });

    it('should throw for an expired token', () => {
      // Create an auth service with 0ms TTL so token is immediately expired
      const expiredAuth = createAuthService({ secret: TEST_SECRET, magicTokenTtl: 0 });
      const { token } = expiredAuth.generateMagicToken('player@example.com');
      assert.throws(() => expiredAuth.verifyMagicToken(token), /expired/i);
    });

    it('should throw for a token signed with a different secret', () => {
      const otherAuth = createAuthService({ secret: 'other-secret-key-at-least-32-chars!!' });
      const { token } = otherAuth.generateMagicToken('player@example.com');
      assert.throws(() => auth.verifyMagicToken(token));
    });
  });

  describe('issueJwt', () => {
    it('should return a non-empty string', () => {
      const jwt = auth.issueJwt('user-123', 'player@example.com');
      assert.strictEqual(typeof jwt, 'string');
      assert.ok(jwt.length > 0);
    });

    it('should produce a token with three dot-separated parts', () => {
      const jwt = auth.issueJwt('user-123', 'player@example.com');
      assert.strictEqual(jwt.split('.').length, 3);
    });

    it('should encode userId and email in the payload', () => {
      const jwt = auth.issueJwt('user-123', 'player@example.com');
      const decoded = auth.verifyJwt(jwt);
      assert.strictEqual(decoded.userId, 'user-123');
      assert.strictEqual(decoded.email, 'player@example.com');
    });
  });

  describe('verifyJwt', () => {
    it('should return decoded claims for a valid token', () => {
      const jwt = auth.issueJwt('user-456', 'dm@example.com');
      const decoded = auth.verifyJwt(jwt);
      assert.strictEqual(decoded.userId, 'user-456');
      assert.strictEqual(decoded.email, 'dm@example.com');
    });

    it('should throw for a tampered JWT', () => {
      const jwt = auth.issueJwt('user-456', 'dm@example.com');
      const tampered = jwt.slice(0, -4) + 'XXXX';
      assert.throws(() => auth.verifyJwt(tampered));
    });

    it('should throw for an expired JWT', () => {
      const expiredAuth = createAuthService({ secret: TEST_SECRET, jwtTtl: '0s' });
      const jwt = expiredAuth.issueJwt('user-456', 'dm@example.com');
      // JWT with 0s TTL should be expired immediately
      assert.throws(() => expiredAuth.verifyJwt(jwt), /expired/i);
    });

    it('should throw for a JWT signed with a different secret', () => {
      const otherAuth = createAuthService({ secret: 'other-secret-key-at-least-32-chars!!' });
      const jwt = otherAuth.issueJwt('user-456', 'dm@example.com');
      assert.throws(() => auth.verifyJwt(jwt));
    });
  });

  describe('createAuthService', () => {
    it('should throw if no secret is provided', () => {
      assert.throws(() => createAuthService({}), /secret/i);
      assert.throws(() => createAuthService({ secret: '' }), /secret/i);
    });
  });
});
