/**
 * Encounter Routes — REST API for NPC social encounter sessions.
 *
 * POST   /api/encounters          — create new encounter
 * GET    /api/encounters          — list encounters
 * GET    /api/encounters/:id      — get encounter state
 * POST   /api/encounters/:id/messages — send player message, get NPC response
 * POST   /api/encounters/:id/end  — end encounter
 */
import { Router } from 'express';

/**
 * Map EncounterSessionService error codes to HTTP status codes.
 */
const ERROR_STATUS = {
  INVALID_INPUT: 400,
  NPC_NOT_FOUND: 404,
  MAX_SESSIONS: 429,
  ENCOUNTER_NOT_FOUND: 404,
  ENCOUNTER_ENDED: 409,
};

export function createEncounterRoutes(encounterController) {
  const router = Router();

  // Create encounter
  router.post('/', async (req, res) => {
    try {
      const { npcTemplateKeys, playerName, worldContext } = req.body;
      const result = await encounterController.create({ npcTemplateKeys, playerName, worldContext });
      res.status(201).json(result);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    }
  });

  // List encounters
  router.get('/', (_req, res) => {
    try {
      const list = encounterController.list();
      res.json({ encounters: list });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get encounter state
  router.get('/:id', (req, res) => {
    try {
      const encounter = encounterController.get(req.params.id);
      res.json(encounter);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    }
  });

  // Send message
  router.post('/:id/messages', async (req, res) => {
    try {
      const { text, addressedTo } = req.body;
      const result = await encounterController.sendMessage(req.params.id, { text, addressedTo });
      res.json(result);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    }
  });

  // End encounter
  router.post('/:id/end', (req, res) => {
    try {
      const result = encounterController.end(req.params.id);
      res.json(result);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    }
  });

  return router;
}
