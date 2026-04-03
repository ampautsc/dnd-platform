/**
 * JwtValidator Tests
 * 
 * Requirements:
 * - validateJwt(token, secret) returns decoded claims for valid token
 * - throws on missing token
 * - throws on missing secret
 * - throws on invalid token
 * - throws on expired token
 * - returns standardized claims: { userId, email }
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import jwt from 'jsonwebtoken';
import { validateJwt } from '../../src/auth/JwtValidator.js';

const SECRET = 'gateway-test-secret-32-chars-minimum!!';

describe('JwtValidator', () => {
  it('returns standardized claims for a valid token', () => {
    const token = jwt.sign({ userId: 'u1', email: 'u1@test.com' }, SECRET, { expiresIn: '1h' });
    const claims = validateJwt(token, SECRET);
    assert.deepStrictEqual(claims, { userId: 'u1', email: 'u1@test.com' });
  });

  it('throws when token is missing', () => {
    assert.throws(() => validateJwt('', SECRET), /token/i);
  });

  it('throws when secret is missing', () => {
    const token = jwt.sign({ userId: 'u1', email: 'u1@test.com' }, SECRET, { expiresIn: '1h' });
    assert.throws(() => validateJwt(token, ''), /secret/i);
  });

  it('throws on invalid token', () => {
    assert.throws(() => validateJwt('invalid.token', SECRET), /invalid/i);
  });

  it('throws on expired token', () => {
    const token = jwt.sign({ userId: 'u1', email: 'u1@test.com' }, SECRET, { expiresIn: '0s' });
    assert.throws(() => validateJwt(token, SECRET), /expired/i);
  });
});
