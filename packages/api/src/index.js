/**
 * API Server Entry Point
 * 
 * Initializes the database, creates services, and starts the Express server.
 * Separated from app.js so tests can import the app without starting a listener.
 */
import dotenv from 'dotenv';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from monorepo root (two levels up from packages/api/src/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../../.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config(); // fallback to default search
}
import { createApp } from './app.js';
import { createAuthService } from './services/AuthService.js';
import { createCharacterService } from './services/CharacterService.js';
import { createEncounterController } from './services/EncounterController.js';
import { createSceneController } from './services/SceneController.js';
import { createRelationshipPersistence } from './services/RelationshipPersistence.js';
import { initDatabase } from './models/database.js';
import { createDmEngine, LLMProvider } from '@dnd-platform/dm';
import { getNpc } from '@dnd-platform/content/npcs';
import { getLocation } from '@dnd-platform/content/locations';

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

// DM engine — use real LLM provider if API key is available, otherwise MockProvider
const providerOptions = {};
if (process.env.ANTHROPIC_API_KEY) {
  providerOptions.provider = new LLMProvider({
    anthropicKey: process.env.ANTHROPIC_API_KEY,
  });
}

const dmEngine = createDmEngine({
  ...providerOptions,
  personalityLookup: (key) => getNpc(key) || null,
  locationLookup: (id) => getLocation(id) || null,
  relationshipRepoOptions: {
    persistenceAdapter: createRelationshipPersistence(db),
  },
});

// Seed NPC runtime context — Millhaven NPCs at their default locations
const runtime = dmEngine.runtimeContext;
const BOTTOMS_UP_REGULARS = {
  mira_barrelbottom:  { areaWithin: 'The Bar',         activity: 'Wiping down the bar while surveying the room',   mood: 'content but watchful' },
  fen_colby:          { areaWithin: 'The Bar',         activity: 'Leaning on the bar, watching people',            mood: 'cautious' },
};
for (const [npcId, state] of Object.entries(BOTTOMS_UP_REGULARS)) {
  runtime.setLocation(npcId, { locationId: 'bottoms_up', areaWithin: state.areaWithin, arrivedAt: '18:00' });
  runtime.setActivity(npcId, state.activity);
  runtime.setMood(npcId, state.mood);
}

const encounterController = createEncounterController(dmEngine.encounterSession);
const sceneController = createSceneController(dmEngine.sceneEngine, {
  locationLookup: (id) => getLocation(id) || null,
  personalityLookup: (key) => getNpc(key) || null,
});

const app = createApp({ authService, characterService, db, encounterController, sceneController });

app.listen(PORT, () => {
  console.log(`🎲 dnd-platform API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   LLM: ${process.env.ANTHROPIC_API_KEY ? 'Real provider' : 'Mock provider'}`);
});

export default app;
