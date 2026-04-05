/**
 * Health Check & App-Level Tests
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/services/AuthService.js';
import { createCharacterService } from '../../src/services/CharacterService.js';
import { initDatabase, closeDatabase } from '../../src/models/database.js';

const TEST_SECRET = 'test-secret-key-at-least-32-chars-long!!';

describe('App', () => {
  let request;

  beforeEach(() => {
    const db = initDatabase(':memory:');
    const auth = createAuthService({ secret: TEST_SECRET });
    const characters = createCharacterService(db);
    const app = createApp({ authService: auth, characterService: characters, db });
    request = supertest(app);
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const res = await request.get('/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.timestamp);
    });
  });

  describe('404 handler', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request.get('/api/nonexistent');
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.error, 'Not found');
    });
  });
});
