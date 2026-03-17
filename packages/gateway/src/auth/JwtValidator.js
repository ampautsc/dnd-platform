import jwt from 'jsonwebtoken';

/**
 * Validate and normalize gateway JWT claims.
 * @param {string} token
 * @param {string} secret
 * @returns {{ userId: string, email: string }}
 */
export function validateJwt(token, secret) {
  if (!token) {
    throw new Error('JWT token is required');
  }
  if (!secret) {
    throw new Error('JWT secret is required');
  }

  try {
    const decoded = jwt.verify(token, secret);
    return {
      userId: decoded.userId,
      email: decoded.email,
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('JWT expired');
    }
    throw new Error('Invalid JWT');
  }
}
