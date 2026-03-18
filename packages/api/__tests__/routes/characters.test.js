/**
 * Character Routes Tests
 * 
 * Requirements:
 * - GET    /api/characters     → 200, list user's characters
 * - POST   /api/characters     → 201, create character
 * - GET    /api/characters/:id → 200, get specific character
 * - PATCH  /api/characters/:id → 200, update character
 * - DELETE /api/characters/:id → 204, delete character
 * - All routes require auth (Bearer JWT)
 * - Users can only access their own characters (403 for others')
 * - 404 for non-existent characters
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/services/AuthService.js';
import { createCharacterService } from '../../src/services/CharacterService.js';
import { initDatabase, closeDatabase } from '../../src/models/database.js';

const TEST_SECRET = 'test-secret-key-at-least-32-chars-long!!';

describe('Character Routes', () => {
  let app, request, auth, db, characters;
  let user1Jwt, user2Jwt;

  beforeEach(async () => {
    db = initDatabase(':memory:');
    auth = createAuthService({ secret: TEST_SECRET });
    characters = createCharacterService(db);
    app = createApp({ authService: auth, characterService: characters, db });
    request = supertest(app);

    // Create two test users via the auth flow
    const link1 = await request.post('/api/auth/request-link').send({ email: 'user1@test.com' });
    const verify1 = await request.post('/api/auth/verify').send({ token: link1.body.token });
    user1Jwt = verify1.body.jwt;

    const link2 = await request.post('/api/auth/request-link').send({ email: 'user2@test.com' });
    const verify2 = await request.post('/api/auth/verify').send({ token: link2.body.token });
    user2Jwt = verify2.body.jwt;
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('POST /api/characters', () => {
    it('should create a character and return 201', async () => {
      const res = await request
        .post('/api/characters')
        .set('Authorization', `Bearer ${user1Jwt}`)
        .send({ name: 'Thorin', className: 'Fighter', level: 5 });

      expect(res.status).toBe(201);
      expect(res.body.character.name).toBe('Thorin');
      expect(res.body.character.className).toBe('Fighter');
      expect(res.body.character.level).toBe(5);
      expect(res.body.character.id).toBeTruthy();
    });

    it('should return 400 for missing name', async () => {
      const res = await request
        .post('/api/characters')
        .set('Authorization', `Bearer ${user1Jwt}`)
        .send({ className: 'Fighter' });

      expect(res.status).toBe(400);
    });

    it('should return 401 without auth (production mode)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const res = await request
        .post('/api/characters')
        .send({ name: 'Unauthorized' });

      expect(res.status).toBe(401);
      vi.unstubAllEnvs();
    });
  });

  describe('GET /api/characters', () => {
    it('should list only the authenticated user\'s characters', async () => {
      await request.post('/api/characters')
        .set('Authorization', `Bearer ${user1Jwt}`)
        .send({ name: 'User1 Char' });
      await request.post('/api/characters')
        .set('Authorization', `Bearer ${user2Jwt}`)
        .send({ name: 'User2 Char' });

      const res = await request
        .get('/api/characters')
        .set('Authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.characters).toHaveLength(1);
      expect(res.body.characters[0].name).toBe('User1 Char');
    });

    it('should return empty array for user with no characters', async () => {
      const res = await request
        .get('/api/characters')
        .set('Authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.characters).toEqual([]);
    });
  });

  describe('GET /api/characters/:id', () => {
    it('should return a character by id', async () => {
      const createRes = await request.post('/api/characters')
        .set('Authorization', `Bearer ${user1Jwt}`)
        .send({ name: 'Specific' });

      const res = await request
        .get(`/api/characters/${createRes.body.character.id}`)
        .set('Authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.character.name).toBe('Specific');
    });

    it('should return 404 for non-existent id', async () => {
      const res = await request
        .get('/api/characters/nonexistent-id')
        .set('Authorization', `Bearer ${user1Jwt}`);

      expect(res.status).toBe(404);
    });

    it('should return 403 when accessing another user\'s character', async () => {
      const createRes = await request.post('/api/characters')
        .set('Authorization', `Bearer ${user1Jwt}`)
        .send({ name: 'Private' });

      const res = await request
        .get(`/api/characters/${createRes.body.character.id}`)
        .set('Authorization', `Bearer ${user2Jwt}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/characters/:id', () => {
    it('should update character fields', async () => {
      const createRes = await request.post('/api/characters')
        .set('Authorization', `Bearer ${user1Jwt}`)
        .send({ name: 'Updatable', level: 1 });

      const res = await request
        .patch(`/api/characters/${createRes.body.character.id}`)
        .set('Authorization', `Bearer ${user1Jwt}`)
        .send({ level: 3, name: 'Renamed' });

      expect(res.status).toBe(200);
      expect(res.body.character.name).toBe('Renamed');
      expect(res.body.character.level).toBe(3);
    });

    it('should return 403 when updating another user\'s character', async () => {
      const createRes = await request.post('/api/characters')
        .set('Authorization', `Bearer ${user1Jwt}`)
        .send({ name: 'Not Yours' });

      const res = await request
        .patch(`/api/characters/${createRes.body.character.id}`)
        .set('Authorization', `Bearer ${user2Jwt}`)
        .send({ name: 'Stolen' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/characters/:id', () => {
    it('should delete a character and return 204', async () => {
      const createRes = await request.post('/api/characters')
        .set('Authorization', `Bearer ${user1Jwt}`)
        .send({ name: 'Doomed' });

      const deleteRes = await request
        .delete(`/api/characters/${createRes.body.character.id}`)
        .set('Authorization', `Bearer ${user1Jwt}`);

      expect(deleteRes.status).toBe(204);

      // Verify it's gone
      const getRes = await request
        .get(`/api/characters/${createRes.body.character.id}`)
        .set('Authorization', `Bearer ${user1Jwt}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 403 when deleting another user\'s character', async () => {
      const createRes = await request.post('/api/characters')
        .set('Authorization', `Bearer ${user1Jwt}`)
        .send({ name: 'Protected' });

      const res = await request
        .delete(`/api/characters/${createRes.body.character.id}`)
        .set('Authorization', `Bearer ${user2Jwt}`);

      expect(res.status).toBe(403);
    });
  });
});
