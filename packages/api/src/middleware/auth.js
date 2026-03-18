/**
 * Auth middleware — extracts and verifies JWT from Authorization header.
 * Dev bypass: when NODE_ENV is not 'production' and no Authorization header
 * is present, auto-injects a dev user so the app works without login.
 */
export function createAuthMiddleware(authService) {
  return (req, res, next) => {
    const header = req.headers.authorization;

    // Dev bypass — auto-inject dev user when no auth header in non-production
    if (!header || !header.startsWith('Bearer ')) {
      if (process.env.NODE_ENV !== 'production') {
        req.user = { userId: 'dev-user', email: 'dev@localhost' };
        return next();
      }
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = header.slice(7);
    try {
      const claims = authService.verifyJwt(token);
      req.user = claims;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
