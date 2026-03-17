/**
 * AuthService — Pure authentication logic
 * 
 * No database, no HTTP. Just token generation and verification.
 * Uses HMAC-SHA256 for magic link tokens and jsonwebtoken for JWTs.
 */
import jwt from 'jsonwebtoken';
import { createHmac, randomBytes } from 'node:crypto';

const DEFAULT_MAGIC_TOKEN_TTL = 15 * 60 * 1000; // 15 minutes
const DEFAULT_JWT_TTL = '7d';

/**
 * Creates an AuthService instance bound to a secret key.
 * 
 * @param {Object} options
 * @param {string} options.secret - HMAC/JWT signing secret (required, non-empty)
 * @param {number} [options.magicTokenTtl] - Magic token TTL in ms (default: 15 min)
 * @param {string} [options.jwtTtl] - JWT TTL as a zeit/ms string (default: '7d')
 * @returns {Object} AuthService methods
 */
export function createAuthService({ secret, magicTokenTtl, jwtTtl } = {}) {
  if (!secret) {
    throw new Error('AuthService requires a secret key');
  }

  const magicTtl = magicTokenTtl ?? DEFAULT_MAGIC_TOKEN_TTL;
  const jwtTtlValue = jwtTtl ?? DEFAULT_JWT_TTL;

  return {
    generateMagicToken: (email) => generateMagicToken(email, secret, magicTtl),
    verifyMagicToken: (token) => verifyMagicToken(token, secret),
    issueJwt: (userId, email) => issueJwt(userId, email, secret, jwtTtlValue),
    verifyJwt: (token) => verifyJwt(token, secret),
  };
}

/**
 * Generate a signed magic link token for the given email.
 * Token format: base64url(payload).base64url(signature)
 * Payload: JSON { email, nonce, expiresAt }
 */
export function generateMagicToken(email, secret, ttl = DEFAULT_MAGIC_TOKEN_TTL) {
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + ttl;

  const payload = JSON.stringify({ email, nonce, expiresAt });
  const payloadB64 = Buffer.from(payload).toString('base64url');

  const signature = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  return {
    token: `${payloadB64}.${signature}`,
    expiresAt,
  };
}

/**
 * Verify a magic link token. Returns decoded { email, expiresAt } or throws.
 */
export function verifyMagicToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid magic token format');
  }

  const [payloadB64, providedSig] = parts;

  // Verify signature
  const expectedSig = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  if (providedSig !== expectedSig) {
    throw new Error('Invalid magic token signature');
  }

  // Decode payload
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

  // Check expiry
  if (Date.now() >= payload.expiresAt) {
    throw new Error('Magic token expired');
  }

  return { email: payload.email, expiresAt: payload.expiresAt };
}

/**
 * Issue a JWT with userId and email claims.
 */
export function issueJwt(userId, email, secret, ttl = DEFAULT_JWT_TTL) {
  return jwt.sign({ userId, email }, secret, { expiresIn: ttl });
}

/**
 * Verify a JWT and return decoded claims { userId, email }.
 */
export function verifyJwt(token, secret) {
  try {
    const decoded = jwt.verify(token, secret);
    return { userId: decoded.userId, email: decoded.email };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new Error('JWT expired');
    }
    throw new Error(`Invalid JWT: ${err.message}`);
  }
}
