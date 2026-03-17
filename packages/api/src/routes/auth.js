/**
 * Auth Routes
 * 
 * POST /api/auth/request-link — request a magic link for email login
 * POST /api/auth/verify — verify magic token, get JWT
 * GET  /api/auth/me — get current user profile (requires auth)
 */
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createAuthMiddleware } from '../middleware/auth.js';

export function createAuthRoutes({ authService, db }) {
  const router = Router();
  const requireAuth = createAuthMiddleware(authService);

  // Prepared statements
  const findUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const insertUser = db.prepare('INSERT INTO users (id, email) VALUES (?, ?)');
  const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');

  /**
   * POST /api/auth/request-link
   * Body: { email: string }
   * Response: { message, token, expiresAt }
   * 
   * In production, `token` would be sent via email, not returned in the response.
   * For development/testing, we return it directly.
   */
  router.post('/request-link', (req, res) => {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Find or create user
    let user = findUserByEmail.get(email);
    if (!user) {
      const id = uuidv4();
      insertUser.run(id, email);
      user = findUserByEmail.get(email);
    }

    // Generate magic token
    const { token, expiresAt } = authService.generateMagicToken(email);

    res.json({
      message: 'Magic link generated. Check your email.',
      token, // In production: send via email instead
      expiresAt,
    });
  });

  /**
   * POST /api/auth/verify
   * Body: { token: string }
   * Response: { jwt, user: { id, email, displayName } }
   */
  router.post('/verify', (req, res) => {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token is required' });
    }

    try {
      const { email } = authService.verifyMagicToken(token);
      const user = findUserByEmail.get(email);

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const jwt = authService.issueJwt(user.id, user.email);

      res.json({
        jwt,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
      });
    } catch (err) {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  });

  /**
   * GET /api/auth/me
   * Requires: Bearer JWT in Authorization header
   * Response: { user: { id, email, displayName } }
   */
  router.get('/me', requireAuth, (req, res) => {
    const user = findUserById.get(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    });
  });

  return router;
}
