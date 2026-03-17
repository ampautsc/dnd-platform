/**
 * API Server Entry Point
 * 
 * Initializes the database, creates services, and starts the Express server.
 * Separated from app.js so tests can import the app without starting a listener.
 */
import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from './app.js';
import { createAuthService } from './services/AuthService.js';
import { createCharacterService } from './services/CharacterService.js';
import { initDatabase } from './models/database.js';

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-please!!';
const DB_PATH = process.env.DB_PATH || './data/dnd-platform.db';

// Ensure data directory exists
if (DB_PATH !== ':memory:') {
  mkdirSync(dirname(DB_PATH), { recursive: true });
}

// Initialize
const db = initDatabase(DB_PATH);
const authService = createAuthService({ secret: SECRET });
const characterService = createCharacterService(db);

const app = createApp({ authService, characterService, db });

app.listen(PORT, () => {
  console.log(`🎲 dnd-platform API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});

export default app;
