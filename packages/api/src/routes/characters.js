/**
 * Character Routes
 * 
 * All routes require authentication (applied at app level).
 * 
 * GET    /api/characters       — list current user's characters
 * POST   /api/characters       — create a character
 * GET    /api/characters/:id   — get a specific character
 * PATCH  /api/characters/:id   — update a character
 * DELETE /api/characters/:id   — delete a character
 */
import { Router } from 'express';

export function createCharacterRoutes({ characterService }) {
  const router = Router();

  router.get('/', (req, res) => {
    const chars = characterService.getAllByUser(req.user.userId);
    res.json({ characters: chars });
  });

  router.post('/', (req, res) => {
    try {
      const char = characterService.create(req.user.userId, req.body);
      res.status(201).json({ character: char });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/:id', (req, res) => {
    const char = characterService.getById(req.params.id);
    if (!char) {
      return res.status(404).json({ error: 'Character not found' });
    }
    // Only return if owned by the requesting user
    if (char.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ character: char });
  });

  router.patch('/:id', (req, res) => {
    const existing = characterService.getById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Character not found' });
    }
    if (existing.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const updated = characterService.update(req.params.id, req.body);
    res.json({ character: updated });
  });

  router.delete('/:id', (req, res) => {
    const existing = characterService.getById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Character not found' });
    }
    if (existing.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    characterService.remove(req.params.id);
    res.status(204).end();
  });

  return router;
}
