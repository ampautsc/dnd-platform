/**
 * Scene Routes — REST API for initiative-based social scenes.
 *
 * POST   /api/scenes            — create new scene
 * GET    /api/scenes            — list scenes
 * GET    /api/scenes/:id        — get scene state
 * POST   /api/scenes/:id/start  — roll initiative, begin scene
 * POST   /api/scenes/:id/action — submit participant action
 * POST   /api/scenes/:id/end    — end scene
 */
import { Router } from 'express';

const ERROR_STATUS = {
  INVALID_INPUT: 400,
  SCENE_NOT_FOUND: 404,
  MAX_SESSIONS: 429,
  SCENE_ENDED: 409,
  NOT_YOUR_TURN: 409,
};

export function createSceneRoutes(sceneController) {
  const router = Router();

  // Create scene at a named location (convenience — builds participants from regulars)
  router.post('/at-location', async (req, res) => {
    try {
      const { locationId, playerName, playerChaMod } = req.body;
      const result = await sceneController.createAtLocation({ locationId, playerName, playerChaMod });
      res.status(201).json(result);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    }
  });

  // Create scene
  router.post('/', (req, res) => {
    try {
      const { participants, worldContext, maxRounds } = req.body;
      const result = sceneController.create({ participants, worldContext, maxRounds });
      res.status(201).json(result);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    }
  });

  // List scenes
  router.get('/', (_req, res) => {
    try {
      const list = sceneController.list();
      res.json({ scenes: list });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get scene state
  router.get('/:id', (req, res) => {
    try {
      const scene = sceneController.get(req.params.id);
      res.json(scene);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    }
  });

  // Start scene (roll initiative, auto-advance NPC turns)
  router.post('/:id/start', async (req, res) => {
    try {
      const result = await sceneController.start(req.params.id);
      res.json(result);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    }
  });

  // Submit action
  router.post('/:id/action', async (req, res) => {
    try {
      const { participantId, type, content } = req.body;
      const result = await sceneController.submitAction(req.params.id, participantId, { type, content });
      res.json(result);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    }
  });

  // End scene
  router.post('/:id/end', (req, res) => {
    try {
      const { reason } = req.body || {};
      const result = sceneController.end(req.params.id, reason);
      res.json(result);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    }
  });

  return router;
}
