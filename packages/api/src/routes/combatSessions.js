/**
 * Combat Sessions REST API — Express router.
 *
 * Pure API layer — no business logic here.
 * All combat rules delegated to CombatSessionManager service.
 * Stepped dice resolution via StepResolver.
 *
 * New architecture: actions return dice requests step-by-step.
 * Player dice require seeds from click events (one seed per die).
 * Enemy dice are auto-rolled and displayed for transparency.
 *
 * Endpoints:
 *   POST   /api/combat/sessions              - Create session
 *   GET    /api/combat/sessions/:id           - Get session state
 *   GET    /api/combat/sessions/:id/menu      - Get turn menu
 *   POST   /api/combat/sessions/:id/actions   - Submit choice (stepped resolution)
 *   POST   /api/combat/sessions/:id/provide-dice - Provide dice results/seeds
 *   POST   /api/combat/sessions/:id/roll-request - Legacy: commit-reveal roll
 *   POST   /api/combat/sessions/:id/confirm-rolls - Legacy: confirm roll seed
 *   POST   /api/combat/sessions/:id/end-turn  - End turn
 *   POST   /api/combat/sessions/:id/roll      - Free dice roll
 *   DELETE /api/combat/sessions/:id           - Destroy session
 */

'use strict'

import { Router } from 'express';
import * as manager from '../services/CombatSessionManager.js';
import { StepResolver, dice } from '@dnd-platform/combat';

const router = Router();

// ── Error handler ────────────────────────────────────────────────────────────

function handleError(res, err) {
  if (err.code === 'SESSION_NOT_FOUND' || err.code === 'SESSION_EXPIRED') {
    return res.status(404).json({ error: err.message })
  }
  if (err.message.startsWith('Invalid choice:') ||
      err.message.includes('is required') ||
      err.message.includes('must have') ||
      err.message.startsWith('Invalid dice notation') ||
      err.message.startsWith('No pending roll request') ||
      err.message.startsWith('Turn changed before roll confirmation')) {
    return res.status(400).json({ error: err.message })
  }
  console.error('[CombatAPI]', err)
  return res.status(500).json({ error: err.message })
}

// ── POST /sessions — Create a new combat session ─────────────────────────────

router.post('/sessions', (req, res) => {
  try {
    const result = manager.createSession(req.body)
    return res.status(201).json({ data: result })
  } catch (err) {
    return handleError(res, err)
  }
})

// ── GET /sessions/:id — Get session state ────────────────────────────────────

router.get('/sessions/:id', (req, res) => {
  try {
    const result = manager.getSession(req.params.id)
    return res.json({ data: result })
  } catch (err) {
    return handleError(res, err)
  }
})

// ── GET /sessions/:id/menu — Get turn menu for active combatant ──────────────

router.get('/sessions/:id/menu', (req, res) => {
  try {
    const result = manager.getMenu(req.params.id)
    return res.json({ data: result })
  } catch (err) {
    return handleError(res, err)
  }
})

// ── POST /sessions/:id/roll-request — Start commit-reveal roll handshake ───

router.post('/sessions/:id/roll-request', (req, res) => {
  try {
    const result = manager.requestRolls(req.params.id, req.body)
    return res.json({ data: result })
  } catch (err) {
    return handleError(res, err)
  }
})

// ── POST /sessions/:id/confirm-rolls — Submit client seed, resolve action ──

router.post('/sessions/:id/confirm-rolls', (req, res) => {
  try {
    const { clientSeed } = req.body || {}
    const result = manager.confirmRolls(req.params.id, clientSeed)
    return res.json({ data: result })
  } catch (err) {
    return handleError(res, err)
  }
})

// ── POST /sessions/:id/actions — Submit a choice (STEPPED resolution) ───────
//
// Uses StepResolver for step-by-step dice requests.
// If the action needs dice, returns { done: false, pendingDice, diceRequests }
// Client then calls /provide-dice to continue.
// Falls back to synchronous CombatSessionManager.submitChoice for legacy compat.

router.post('/sessions/:id/actions', (req, res) => {
  try {
    const sessionId = req.params.id
    const choice = req.body
    const { stepped } = req.query // ?stepped=true to use new StepResolver

    if (stepped !== 'true') {
      // Legacy path: synchronous resolution
      const result = manager.submitChoice(sessionId, choice)
      return res.json({ data: result })
    }

    // ── New stepped path ──────────────────────────────────────────────────
    const internalSession = manager._sessions.get(sessionId)
    if (!internalSession) {
      return res.status(404).json({ error: 'Session not found' })
    }
    if (internalSession.status !== 'active') {
      return res.status(409).json({ error: `Session is ${internalSession.status}` })
    }

    const activeId = internalSession.state.getActiveCombatantId()
    if (!activeId) {
      return res.status(409).json({ error: 'No active combatant' })
    }

    const stepResult = StepResolver.beginResolve(internalSession.state, activeId, choice)

    if (stepResult.done) {
      // Resolved in one shot (no dice needed)
      internalSession.state = stepResult.state
      internalSession.lastActivityAt = Date.now()
      return res.json({
        data: {
          done: true,
          result: stepResult.result,
          diceRequests: stepResult.diceRequests,
        },
      })
    }

    // Paused — needs dice
    internalSession.pendingStepContext = stepResult.context
    internalSession.lastActivityAt = Date.now()

    const diceOwner = stepResult.pendingDice.owner
    const ownerIsAi = !!internalSession.aiProfileMap?.[diceOwner]

    return res.json({
      data: {
        done: false,
        pendingDice: stepResult.pendingDice,
        diceRequests: stepResult.diceRequests,
        ownerIsAi,
      },
    })
  } catch (err) {
    return handleError(res, err)
  }
})

// ── POST /sessions/:id/provide-dice — Provide dice for pending request ───────
//
// For player dice: { seeds: [number, ...] } — one seed per die from click events
// For AI dice:     { auto: true } — server auto-rolls
// For testing:     { rolls: [number, ...] } — direct die values
//
// Returns either { done: true, result } or { done: false, pendingDice } if
// more dice are needed (e.g. damage after attack hit, concentration save).

router.post('/sessions/:id/provide-dice', (req, res) => {
  try {
    const sessionId = req.params.id
    const internalSession = manager._sessions.get(sessionId)

    if (!internalSession) {
      return res.status(404).json({ error: 'Session not found' })
    }

    if (!internalSession.pendingStepContext) {
      return res.status(400).json({ error: 'No pending dice request' })
    }

    const context = internalSession.pendingStepContext
    const { seeds, auto, rolls } = req.body

    let diceResult

    if (rolls && Array.isArray(rolls)) {
      // Direct values (testing)
      diceResult = { rolls }
    } else if (auto) {
      // Auto-roll for AI
      const spec = _getDiceSpecFromContext(context)
      diceResult = { rolls: _autoRollDice(spec) }
    } else if (seeds && Array.isArray(seeds)) {
      // Player seeds → deterministic roll
      const spec = _getDiceSpecFromContext(context)
      diceResult = { rolls: _rollFromSeeds(seeds, spec) }
    } else {
      return res.status(400).json({ error: 'Provide seeds, rolls, or auto:true' })
    }

    const stepResult = StepResolver.continueResolve(context, diceResult)
    internalSession.pendingStepContext = null

    if (stepResult.done) {
      internalSession.state = stepResult.state
      internalSession.lastActivityAt = Date.now()
      return res.json({
        data: {
          done: true,
          result: stepResult.result,
          diceRequests: stepResult.diceRequests,
        },
      })
    }

    // More dice needed
    internalSession.pendingStepContext = stepResult.context
    internalSession.lastActivityAt = Date.now()

    const diceOwner = stepResult.pendingDice.owner
    const ownerIsAi = !!internalSession.aiProfileMap?.[diceOwner]

    return res.json({
      data: {
        done: false,
        pendingDice: stepResult.pendingDice,
        diceRequests: stepResult.diceRequests,
        ownerIsAi,
      },
    })
  } catch (err) {
    return handleError(res, err)
  }
})

// ── POST /sessions/:id/end-turn — End the current turn ──────────────────────

router.post('/sessions/:id/end-turn', (req, res) => {
  try {
    const result = manager.endTurn(req.params.id)
    return res.json({ data: result })
  } catch (err) {
    return handleError(res, err)
  }
})

// ── POST /sessions/:id/roll — Free dice roll ────────────────────────────────

router.post('/sessions/:id/roll', (req, res) => {
  try {
    const { notation } = req.body || {}
    if (!notation) {
      return res.status(400).json({ error: 'notation is required (e.g. "1d20", "2d6+3")' })
    }
    const result = manager.rollFree(req.params.id, notation)
    return res.json({ data: result })
  } catch (err) {
    return handleError(res, err)
  }
})

// ── DELETE /sessions/:id — Destroy session ───────────────────────────────────

router.delete('/sessions/:id', (req, res) => {
  try {
    manager.destroySession(req.params.id)
    return res.json({ data: { message: 'Session destroyed' } })
  } catch (err) {
    return handleError(res, err)
  }
})
// ── GET /sessions/:id/inventory — Get player inventory ───────────────────

router.get('/sessions/:id/inventory', (req, res) => {
  try {
    const result = manager.getInventory(req.params.id)
    return res.json({ data: result })
  } catch (err) {
    return handleError(res, err)
  }
})

// ── Dice Helpers (for stepped resolution) ────────────────────────────────────

/**
 * Extract dice specification from step context for auto-rolling / seed conversion.
 * @param {Object} context - StepResolver context
 * @returns {Array<{sides: number, count: number}>}
 */
function _getDiceSpecFromContext(context) {
  const phase = context.phase
  const acc = context.accumulated || {}

  if (phase === 'attack_roll' || phase === 'spell_attack_roll') {
    const adv = acc.advDisadv || {}
    const count = (adv.hasAdv !== adv.hasDisadv) ? 2 : 1
    return [{ sides: 20, count }]
  }

  if (phase === 'damage' || phase === 'multi_damage' || phase === 'breath_damage' || phase === 'spell_damage') {
    const weapon = acc.weapon
    const attackRoll = acc.currentAttackRoll || acc.attackRoll || {}
    if (weapon && weapon.damageDice) {
      const match = weapon.damageDice.match(/^(\d+)d(\d+)$/)
      if (match) {
        const count = parseInt(match[1], 10) * (attackRoll.isCrit ? 2 : 1)
        return [{ sides: parseInt(match[2], 10), count }]
      }
    }
    return [{ sides: 6, count: 1 }]
  }

  if (phase === 'concentration_save' || phase === 'multi_con_save') {
    return [{ sides: 20, count: acc.conSaveAdvantage ? 2 : 1 }]
  }

  return [{ sides: 20, count: 1 }]
}

/** Auto-roll dice using Math.random() (for AI combatants). */
function _autoRollDice(diceSpec) {
  const rolls = []
  for (const { sides, count } of diceSpec) {
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1)
    }
  }
  return rolls
}

/** Convert player seeds → die results using dice.rollFromSeed(). */
function _rollFromSeeds(seeds, diceSpec) {
  const rolls = []
  let idx = 0
  for (const { sides, count } of diceSpec) {
    for (let i = 0; i < count; i++) {
      const seed = seeds[idx++] || Date.now() + idx
      rolls.push(dice.rollFromSeed(seed, sides))
    }
  }
  return rolls
}

export default router;
