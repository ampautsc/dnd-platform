/**
 * Auth Routes Tests
 * 
 * Requirements:
 * - POST /api/auth/request-link { email } → 200 with { message, expiresAt }
 *   (stores magic token in users table, creates user if needed)
 * - POST /api/auth/verify { token } → 200 with { jwt, user }
 *   (verifies magic token, issues JWT, returns user profile)
 * - GET /api/auth/me → 200 with { user } (requires Bearer JWT)
 * - Invalid/missing tokens → 401
 * - Missing email → 400
 */
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/services/AuthService.js';
import { createCharacterService } from '../../src/services/CharacterService.js';
import { initDatabase, closeDatabase } from '../../src/models/database.js';

const TEST_SECRET = 'test-secret-key-at-least-32-chars-long!!';

describe('Auth Routes', () => {
  let app;
  let request;
  let auth;
  let db;

  beforeEach(() => {
    db = initDatabase(':memory:');
    auth = createAuthService({ secret: TEST_SECRET });
    const characters = createCharacterService(db);
    app = createApp({ authService: auth, characterService: characters, db });
    request = supertest(app);
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('POST /api/auth/request-link', () => {
    it('should return 200 with a message and expiresAt', async () => {
      const res = await request
        .post('/api/auth/request-link')
        .send({ email: 'player@example.com' });

      assert.strictEqual(res.status, 200);
      assert.match(res.body.message, /magic link/i);
      assert.ok(res.body.expiresAt);
      // In a real app this would send an email; for now we return the token for testing
      assert.ok(res.body.token);
    });

    it('should create a user record if email is new', async () => {
      await request
        .post('/api/auth/request-link')
        .send({ email: 'newuser@example.com' });

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get('newuser@example.com');
      assert.ok(user);
      assert.strictEqual(user.email, 'newuser@example.com');
    });

    it('should reuse existing user if email exists', async () => {
      await request.post('/api/auth/request-link').send({ email: 'same@example.com' });
      await request.post('/api/auth/request-link').send({ email: 'same@example.com' });

      const users = db.prepare('SELECT * FROM users WHERE email = ?').all('same@example.com');
      assert.strictEqual(users.length, 1);
    });

    it('should return 400 if email is missing', async () => {
      const res = await request
        .post('/api/auth/request-link')
        .send({});

      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /email/i);
    });
  });

  describe('POST /api/auth/verify', () => {
    it('should return 200 with jwt and user for a valid token', async () => {
      // First, request a magic link
      const linkRes = await request
        .post('/api/auth/request-link')
        .send({ email: 'player@example.com' });

      const res = await request
        .post('/api/auth/verify')
        .send({ token: linkRes.body.token });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.jwt);
      assert.ok(res.body.user);
      assert.strictEqual(res.body.user.email, 'player@example.com');
      assert.ok(res.body.user.id);
    });

    it('should return 401 for an invalid token', async () => {
      const res = await request
        .post('/api/auth/verify')
        .send({ token: 'garbage-token' });

      assert.strictEqual(res.status, 401);
    });

    it('should return 400 if token is missing', async () => {
      const res = await request
        .post('/api/auth/verify')
        .send({});

      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /token/i);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user profile for valid JWT', async () => {
      // Create user + get JWT
      const linkRes = await request
        .post('/api/auth/request-link')
        .send({ email: 'me@example.com' });
      const verifyRes = await request
        .post('/api/auth/verify')
        .send({ token: linkRes.body.token });

      const res = await request
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${verifyRes.body.jwt}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.email, 'me@example.com');
      assert.ok(res.body.user.id);
    });

    it('should return 401 without Authorization header (production mode)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const res = await request.get('/api/auth/me');
      assert.strictEqual(res.status, 401);
      vi.unstubAllEnvs();
    });

    it('should return 401 with invalid JWT', async () => {
      const res = await request
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.here');
      assert.strictEqual(res.status, 401);
    });
  });
});
