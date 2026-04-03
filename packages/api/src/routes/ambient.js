/**
 * Ambient Routes — REST API for ambient NPC reactions.
 *
 * POST /api/ambient/utterance — evaluate NPC reactions to player speech at a location
 */
import { Router } from 'express';

const ERROR_STATUS = {
  INVALID_INPUT: 400,
  LOCATION_NOT_FOUND: 404,
  RATE_LIMITED: 429,
};

export function createAmbientRoutes(ambientController) {
  const router = Router();

  /**
   * POST /api/ambient/utterance
   * Body: { locationId: string, utterance: string, speakerName?: string }
   * Returns: { reactions: Array, responses: Array, locationName: string }
   */
  router.post('/utterance', async (req, res) => {
    try {
      const { locationId, utterance, speakerName } = req.body;
      const result = await ambientController.processUtterance({ locationId, utterance, speakerName });
      res.json(result);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    }
  });

  return router;
}
