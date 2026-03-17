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
import { describe, it, expect, beforeEach } from 'vitest';
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
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('expiresAt');
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(0);
    });

    it('should produce different tokens for the same email on successive calls', () => {
      const a = auth.generateMagicToken('player@example.com');
      const b = auth.generateMagicToken('player@example.com');
      expect(a.token).not.toBe(b.token);
    });

    it('should set expiresAt to ~15 minutes from now by default', () => {
      const before = Date.now();
      const result = auth.generateMagicToken('player@example.com');
      const after = Date.now();
      const fifteenMin = 15 * 60 * 1000;
      expect(result.expiresAt).toBeGreaterThanOrEqual(before + fifteenMin - 1000);
      expect(result.expiresAt).toBeLessThanOrEqual(after + fifteenMin + 1000);
    });

    it('should accept a custom TTL', () => {
      const customAuth = createAuthService({ secret: TEST_SECRET, magicTokenTtl: 5 * 60 * 1000 });
      const before = Date.now();
      const result = customAuth.generateMagicToken('player@example.com');
      const fiveMin = 5 * 60 * 1000;
      expect(result.expiresAt).toBeGreaterThanOrEqual(before + fiveMin - 1000);
      expect(result.expiresAt).toBeLessThanOrEqual(before + fiveMin + 2000);
    });
  });

  describe('verifyMagicToken', () => {
    it('should return { email, expiresAt } for a valid token', () => {
      const { token } = auth.generateMagicToken('player@example.com');
      const result = auth.verifyMagicToken(token);
      expect(result.email).toBe('player@example.com');
      expect(typeof result.expiresAt).toBe('number');
    });

    it('should throw for a tampered token', () => {
      const { token } = auth.generateMagicToken('player@example.com');
      const tampered = token.slice(0, -4) + 'XXXX';
      expect(() => auth.verifyMagicToken(tampered)).toThrow();
    });

    it('should throw for an expired token', () => {
      // Create an auth service with 0ms TTL so token is immediately expired
      const expiredAuth = createAuthService({ secret: TEST_SECRET, magicTokenTtl: 0 });
      const { token } = expiredAuth.generateMagicToken('player@example.com');
      expect(() => expiredAuth.verifyMagicToken(token)).toThrow(/expired/i);
    });

    it('should throw for a token signed with a different secret', () => {
      const otherAuth = createAuthService({ secret: 'other-secret-key-at-least-32-chars!!' });
      const { token } = otherAuth.generateMagicToken('player@example.com');
      expect(() => auth.verifyMagicToken(token)).toThrow();
    });
  });

  describe('issueJwt', () => {
    it('should return a non-empty string', () => {
      const jwt = auth.issueJwt('user-123', 'player@example.com');
      expect(typeof jwt).toBe('string');
      expect(jwt.length).toBeGreaterThan(0);
    });

    it('should produce a token with three dot-separated parts', () => {
      const jwt = auth.issueJwt('user-123', 'player@example.com');
      expect(jwt.split('.')).toHaveLength(3);
    });

    it('should encode userId and email in the payload', () => {
      const jwt = auth.issueJwt('user-123', 'player@example.com');
      const decoded = auth.verifyJwt(jwt);
      expect(decoded.userId).toBe('user-123');
      expect(decoded.email).toBe('player@example.com');
    });
  });

  describe('verifyJwt', () => {
    it('should return decoded claims for a valid token', () => {
      const jwt = auth.issueJwt('user-456', 'dm@example.com');
      const decoded = auth.verifyJwt(jwt);
      expect(decoded.userId).toBe('user-456');
      expect(decoded.email).toBe('dm@example.com');
    });

    it('should throw for a tampered JWT', () => {
      const jwt = auth.issueJwt('user-456', 'dm@example.com');
      const tampered = jwt.slice(0, -4) + 'XXXX';
      expect(() => auth.verifyJwt(tampered)).toThrow();
    });

    it('should throw for an expired JWT', () => {
      const expiredAuth = createAuthService({ secret: TEST_SECRET, jwtTtl: '0s' });
      const jwt = expiredAuth.issueJwt('user-456', 'dm@example.com');
      // JWT with 0s TTL should be expired immediately
      expect(() => expiredAuth.verifyJwt(jwt)).toThrow(/expired/i);
    });

    it('should throw for a JWT signed with a different secret', () => {
      const otherAuth = createAuthService({ secret: 'other-secret-key-at-least-32-chars!!' });
      const jwt = otherAuth.issueJwt('user-456', 'dm@example.com');
      expect(() => auth.verifyJwt(jwt)).toThrow();
    });
  });

  describe('createAuthService', () => {
    it('should throw if no secret is provided', () => {
      expect(() => createAuthService({})).toThrow(/secret/i);
      expect(() => createAuthService({ secret: '' })).toThrow(/secret/i);
    });
  });
});
