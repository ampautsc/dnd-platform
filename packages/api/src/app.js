/**
 * Express application factory
 * 
 * Creates a configured Express app with all middleware and routes.
 * Separated from server.listen() so supertest can import the app directly.
 * 
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.authService - AuthService instance
 * @param {Object} deps.characterService - CharacterService instance
 * @param {import('better-sqlite3').Database} deps.db - Database instance
 */
import express from 'express';
import cors from 'cors';
import { createAuthRoutes } from './routes/auth.js';
import { createCharacterRoutes } from './routes/characters.js';
import { createContentRoutes } from './routes/content.js';
import { createAuthMiddleware } from './middleware/auth.js';

export function createApp(deps) {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Auth middleware factory
  const requireAuth = createAuthMiddleware(deps.authService);

  // Routes
  app.use('/api/auth', createAuthRoutes(deps));
  app.use('/api/characters', requireAuth, createCharacterRoutes(deps));
  app.use('/api/content', createContentRoutes());

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
