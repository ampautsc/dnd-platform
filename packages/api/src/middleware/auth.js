/**
 * Auth middleware — extracts and verifies JWT from Authorization header
 */
export function createAuthMiddleware(authService) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
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
