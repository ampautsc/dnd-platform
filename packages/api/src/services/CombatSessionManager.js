/**
 * CombatSessionManager — Service layer for interactive combat sessions.
 *
 * Owns session lifecycle, delegates all combat logic to engine-v2.
 * No business logic here — just session CRUD + orchestration.
 *
 * In-memory session store — swappable to Redis/DB for cloud scaling.
 *
 * Design:
 *   - Each session holds an immutable GameState + metadata
 *   - All dice rolls are server-authoritative
 *   - Every action is validated through TurnMenu before execution
 *   - Results include individual roll values for client animation
 */

'use strict'

import { randomUUID } from 'crypto';
import { dice } from '@dnd-platform/combat';
import { mechanics as mech } from '@dnd-platform/combat';
import { GameState } from '@dnd-platform/combat';
import { TurnMenu } from '@dnd-platform/combat';
import { ActionResolver } from '@dnd-platform/combat';
import { createCreature, getTemplateKeys } from '@dnd-platform/content/creatures';
import { getSpell } from '@dnd-platform/content/spells';
import { EncounterRunnerV2 } from '@dnd-platform/combat';
const { processStartOfTurn, processEndOfTurnSaves } = EncounterRunnerV2;
const LootService = { generateLootForCreature: () => ({ items: [], currency: {} }), isLootEmpty: () => true };
const InventoryService = { createInventory: () => ({ items: [], currency: {} }), mergeLoot: (inv) => inv };

// ── Constants ────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 60 * 60 * 1000 // 1 hour idle timeout
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // check every 5 min

// ── Session Store ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CombatSession
 * @property {string}    id
 * @property {GameState} state
 * @property {Object}    encounterConfig  - Original config for reference
 * @property {Array}     actionHistory    - Log of all submitted actions + results
 * @property {Array}     narrativeEvents  - Queue of resolution steps for the LLM narrator
 * @property {number}    lastActivityAt   - Epoch ms for TTL
 * @property {string}    status           - 'active' | 'complete' | 'expired'
 */

/** @type {Map<string, CombatSession>} */
const sessions = new Map()

// Periodic cleanup of expired sessions
let _cleanupTimer = null

function startCleanup() {
  if (_cleanupTimer) return
  _cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [id, session] of sessions) {
      if (now - session.lastActivityAt > SESSION_TTL_MS) {
        session.status = 'expired'
        sessions.delete(id)
      }
    }
  }, CLEANUP_INTERVAL_MS)
  // Allow process to exit even if timer is running
  if (_cleanupTimer.unref) _cleanupTimer.unref()
}

function stopCleanup() {
  if (_cleanupTimer) {
    clearInterval(_cleanupTimer)
    _cleanupTimer = null
  }
}

// ── Initiative ───────────────────────────────────────────────────────────────

/**
 * Roll initiative for all combatants and set order in GameState.
 * Returns the new state with initiative order set.
 */
function rollInitiative(state) {
  const combatants = state.getAllCombatants()
  const initiatives = combatants.map(c => {
    const dexMod = c.dexMod ?? Math.floor(((c.dex ?? 10) - 10) / 2)
    const roll = dice.d20()
    return { id: c.id, total: roll + dexMod, roll, dexMod }
  })

  // Sort descending by total, then by dex mod as tiebreaker
  initiatives.sort((a, b) => b.total - a.total || b.dexMod - a.dexMod)
  const order = initiatives.map(i => i.id)

  let newState = state.withInitiativeOrder(order)

  // Log initiative results
  for (const init of initiatives) {
    const c = state.getCombatant(init.id)
    newState = newState.withLog(
      `${c.name} rolls initiative: d20(${init.roll}) + ${init.dexMod} = ${init.total}`
    )
  }

  // Set movement for first combatant
  const firstId = order[0]
  const first = newState.getCombatant(firstId)
  newState = newState.withUpdatedCombatant(firstId, {
    movementRemaining: first.speed || 30,
    usedAction: false,
    usedBonusAction: false,
    reactedThisRound: false,
  })

  return { state: newState, initiatives }
}

// ── Reset Between Turns ──────────────────────────────────────────────────────

/**
 * Reset turn-level state for a combatant at the start of their turn.
 */
function resetTurnState(state, combatantId) {
  const actor = state.getCombatant(combatantId)
  if (!actor) return state

  return state.withUpdatedCombatant(combatantId, {
    usedAction: false,
    usedBonusAction: false,
    movementRemaining: actor.speed || 30,
    reactedThisRound: false,
    bonusActionSpellCastThisTurn: false,
    multiattackWeaponsUsed: [],
    multiattackBiteTargetId: null,
  })
}

// ── Hex Position Helpers ────────────────────────────────────────────────────

/** Hex cube distance in feet (5 ft per hex). */
function hexDistFeet(posA, posB) {
  const dq = (posA.q ?? 0) - (posB.q ?? 0)
  const dr = (posA.r ?? 0) - (posB.r ?? 0)
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) * 5
}

/**
 * Compute the best hex to move to when approaching a target.
 * Moves up to `maxFeet` feet toward `toPos`, stopping one hex adjacent.
 * Returns `fromPos` unchanged when already adjacent or budget is 0.
 * Uses cube coordinate interpolation for smooth diagonal movement.
 */
function hexApproachPos(fromPos, toPos, maxFeet) {
  const fromQ = fromPos.q ?? 0, fromR = fromPos.r ?? 0
  const toQ   = toPos.q   ?? 0, toR   = toPos.r   ?? 0
  const dq = toQ - fromQ, dr = toR - fromR
  const hexDist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr))
  const maxHexes = Math.floor(maxFeet / 5)

  if (hexDist <= 1 || maxHexes === 0) return fromPos  // already adjacent or no budget

  const steps = Math.min(maxHexes, hexDist - 1)       // stop adjacent
  const t = steps / hexDist

  // Cube coordinate interpolation + canonical rounding
  const fx = dq * t, fz = dr * t, fy = -(fx + fz)
  let rx = Math.round(fx), ry = Math.round(fy), rz = Math.round(fz)
  const edx = Math.abs(rx - fx), edy = Math.abs(ry - fy), edz = Math.abs(rz - fz)
  if (edx > edy && edx > edz)    rx = -ry - rz
  else if (edy > edz)             ry = -rx - rz
  else                            rz = -rx - ry

  return { q: fromQ + rx, r: fromR + rz }
}

// ── AI Combat Turn Execution ─────────────────────────────────────────────────

/**
 * Run one AI combatant's full turn: move toward + attack or dash to close the gap.
 *
 * Perception range = 2× speed (double-dash).  Within that range the combatant:
 *   • Already adjacent   → attack.
 *   • Within move range  → move adjacent, then attack.
 *   • Within dash range  → Dash (spend action for extra speed), move adjacent.
 *   • Beyond perception  → do nothing.
 *
 * Mutates session.state. Returns new log lines produced during the turn.
 */
function runAiCombatantTurn(session, activeId) {
  const prevLogLen = session.state.log.length
  const actor = session.state.getCombatant(activeId)
  if (!actor || actor.currentHP <= 0) return []

  const speed         = actor.speed || 30
  const perceptionFt  = speed * 2                         // double-dash perception
  const weaponRangeFt = (actor.weapons?.[0]?.range) || 5  // default melee 5 ft

  // Find nearest living opponent
  const enemies = session.state.getAllCombatants()
    .filter(c => c.side !== actor.side && c.currentHP > 0)
  if (!enemies.length) return []

  let nearest = null, nearestDist = Infinity
  for (const e of enemies) {
    const d = hexDistFeet(actor.position, e.position)
    if (d < nearestDist) { nearest = e; nearestDist = d }
  }

  if (!nearest || nearestDist > perceptionFt) return []  // target beyond perception

  // ── Phase 1: Normal movement toward enemy ──────────────────────────────
  if (nearestDist > weaponRangeFt) {
    const actorNow = session.state.getCombatant(activeId)
    if ((actorNow.movementRemaining || 0) > 0) {
      const targetPos = hexApproachPos(
        actorNow.position, nearest.position, actorNow.movementRemaining
      )
      if (targetPos.q !== actorNow.position.q || targetPos.r !== actorNow.position.r) {
        const res = ActionResolver.resolve(session.state, activeId, {
          optionId: 'move-to', position: targetPos,
        })
        session.state = res.state
        processOpportunityAttacks(session, activeId, res.result.opportunityAttackTriggers || [])
      }
    }
  }

  // ── Phase 2: Action — attack if in range, otherwise Dash if needed ─────
  const actorAfterMove = session.state.getCombatant(activeId)
  const enemyNow       = session.state.getCombatant(nearest.id)
  const distAfterMove  = hexDistFeet(actorAfterMove.position, enemyNow.position)

  if (distAfterMove <= weaponRangeFt) {
    // In attack range — use the best available attack option.
    // Loop to handle distinct-weapon multiattack creatures (e.g. T-Rex: Bite then Tail).
    // Each iteration picks the best available attack, resolves it, then
    // re-checks the menu for remaining multiattack weapons.
    // Same-weapon multiattack (e.g. Brute ×2) is resolved in one shot via 'multiattack' type.
    let attacksResolved = 0
    const MAX_MULTIATTACK = 5 // safety cap
    while (attacksResolved < MAX_MULTIATTACK) {
      const actionMenu = TurnMenu.getMenu(session.state, activeId)
      // Prefer multiattack (same-weapon) if available, then individual attacks
      const attackOpt  = (actionMenu.actions || []).find(
        o => o.type === 'multiattack' && o.targetId === nearest.id
      ) || (actionMenu.actions || []).find(
        o => o.type === 'attack' && o.targetId === nearest.id
      ) || (actionMenu.actions || []).find(
        o => o.type === 'attack'
      )
      if (!attackOpt) break
      const res = ActionResolver.resolve(session.state, activeId, {
        optionId: attackOpt.optionId, targetId: attackOpt.targetId,
      })
      session.state = res.state
      attacksResolved++
      // If action is fully consumed, stop
      const updatedActor = session.state.getCombatant(activeId)
      if (updatedActor.usedAction) break
    }
  } else if (!actorAfterMove.usedAction && nearestDist <= speed * 2) {
    // Still out of range but Dash would help — target was in double-speed range
    const actionMenu = TurnMenu.getMenu(session.state, activeId)
    const dashOpt    = (actionMenu.actions || []).find(o => o.type === 'dash')
    if (dashOpt) {
      const dashRes = ActionResolver.resolve(session.state, activeId, {
        optionId: dashOpt.optionId,
      })
      session.state = dashRes.state

      // Move again with the boosted movement budget
      const actorAfterDash = session.state.getCombatant(activeId)
      const targetPos2 = hexApproachPos(
        actorAfterDash.position, enemyNow.position, actorAfterDash.movementRemaining
      )
      if (targetPos2.q !== actorAfterDash.position.q || targetPos2.r !== actorAfterDash.position.r) {
        const moveMenu2 = TurnMenu.getMenu(session.state, activeId)
        const moveOpt2  = (moveMenu2.movements || []).find(o => o.type === 'move')
        if (moveOpt2) {
          const moveRes = ActionResolver.resolve(session.state, activeId, {
            optionId: moveOpt2.optionId, position: targetPos2,
          })
          session.state = moveRes.state
          processOpportunityAttacks(session, activeId, moveRes.result.opportunityAttackTriggers || [])
        }
      }
    }
  }

  return session.state.log.slice(prevLogLen)
}

/**
 * Execute AI-controlled turns until the active combatant is a human player.
 * Mutates session.state. Returns all accumulated log lines.
 */
function executeAiTurns(session) {
  if (!session.aiProfileMap) return []

  const allLogs = []
  for (let guard = 0; guard < 20 && session.status === 'active'; guard++) {
    const activeId = session.state.getActiveCombatantId()
    if (!session.aiProfileMap[activeId]) break  // human's turn — stop

    // Start-of-turn upkeep for this AI combatant (concentration timer, etc.)
    const sotResult = processStartOfTurn(session.state, activeId)
    session.state = sotResult.state

    // Execute this AI combatant's decisions
    const turnLogs = runAiCombatantTurn(session, activeId)
    allLogs.push(...turnLogs)

    // End-of-turn saves for the AI combatant (Hold Person, Dragon Fear, etc.)
    const outgoingAi = session.state.getCombatant(activeId)
    if (outgoingAi && outgoingAi.currentHP > 0) {
      session.state = processEndOfTurnSaves(session.state, activeId)
    }

    // Advance to the next combatant (same logic as endTurn)
    let state = session.state.withNextTurn()
    let attempts = 0
    while (attempts < state.combatantCount) {
      const nextId = state.getActiveCombatantId()
      const next   = state.getCombatant(nextId)
      if (next && next.currentHP > 0) break
      state = state.withNextTurn()
      attempts++
    }
    const nextActiveId = state.getActiveCombatantId()
    state = resetTurnState(state, nextActiveId)
    session.state = state
    session.lastActivityAt = Date.now()

    // Process any new deaths into corpses
    processNewDeaths(session)

    const victory = checkVictory(session.state, session.explorationMode)
    if (victory.over) {
      session.status = 'complete'
    }
  }

  return allLogs
}

// ── Opportunity Attack Resolution ────────────────────────────────────────────

/**
 * Resolve opportunity attacks triggered by a move action.
 *
 * Both AI-controlled and player-controlled combatants automatically execute OAs
 * when an enemy leaves their melee reach (≤ 5 ft) without Disengaging.
 * Mutates session.state. Returns array of new log lines produced by the OAs.
 */
function processOpportunityAttacks(session, moverId, oaTriggers) {
  if (!oaTriggers?.length) return []

  const allLogs = []
  for (const reactorId of oaTriggers) {
    const reactor = session.state.getCombatant(reactorId)
    if (!reactor || reactor.currentHP <= 0 || reactor.reactedThisRound) continue

    const weapon = reactor.weapons?.[0]
    if (!weapon) continue

    const mover = session.state.getCombatant(moverId)
    if (!mover || mover.currentHP <= 0) continue

    const prevLogLen = session.state.log.length

    session.state = session.state.withLog(
      `  ⚡ ${reactor.name} makes an opportunity attack as ${mover.name} leaves their reach!`
    )

    // OA uses the reactor's REACTION, not their action.
    // _resolveAttack sets usedAction:true — restore it after the attack.
    const savedUsedAction = reactor.usedAction
    const attackOpt = {
      type: 'attack',
      optionId: 'opportunity-attack',
      category: 'reaction',
      weaponIndex: 0,
      weaponName: weapon.name,
      targetId: moverId,
      targetName: mover.name,
    }

    const atkRes = ActionResolver._resolveAttack(session.state, reactorId, attackOpt)
    session.state = atkRes.state.withUpdatedCombatant(reactorId, {
      usedAction: savedUsedAction,
      reactedThisRound: true,
    })

    allLogs.push(...session.state.log.slice(prevLogLen))
  }

  return allLogs
}

// ── Session CRUD ─────────────────────────────────────────────────────────────

/**
 * Create a new combat session from encounter configuration.
 *
 * @param {Object} config
 * @param {Array}  config.combatants - Array of combatant definitions:
 *   Each is either a { templateKey, overrides } for creatures.js templates,
 *   or a full creature object with { id, name, side, position, ... }
 * @returns {{ sessionId, state, menu, initiatives }}
 */
function createSession(config) {
  if (!config || !config.combatants || !Array.isArray(config.combatants)) {
    throw new Error('config.combatants array is required')
  }
  if (config.combatants.length < 2) {
    throw new Error('At least 2 combatants are required')
  }

  // Defensive reset: session creation/initiative must never depend on a
  // previously-seeded commit-reveal state from another action/session.
  dice.clearSeed()
  if (dice.getDiceMode() === 'seeded') {
    dice.setDiceMode('random')
  }

  // Build creature objects
  const combatants = config.combatants.map((c, i) => {
    if (c.templateKey) {
      // Create from template
      const creature = createCreature(c.templateKey, {
        id: c.id || `${c.templateKey}-${i}`,
        side: c.side || 'enemy',
        position: c.position || { x: i * 2, y: 0 },
        ...c.overrides,
      })
      // Attach templateKey for loot table lookup
      creature.templateKey = c.templateKey
      return creature
    }
    // Already a full creature object — validate minimum fields
    if (!c.id || !c.name || !c.side) {
      throw new Error(`Combatant at index ${i} must have id, name, and side`)
    }
    return c
  })

  // Create GameState
  let state = new GameState({ combatants })

  // Roll initiative
  const initResult = rollInitiative(state)
  state = initResult.state

  // Generate menu for the active combatant
  const activeId = state.getActiveCombatantId()
  const menu = TurnMenu.getMenu(state, activeId)

  const sessionId = randomUUID()
  const session = {
    id: sessionId,
    state,
    encounterConfig: config,
    actionHistory: [],
    narrativeEvents: [],
    lastActivityAt: Date.now(),
    status: 'active',
    testDiceQueue: config.testConfig?.diceQueue?.length ? [...config.testConfig.diceQueue] : undefined,
    aiProfileMap: config.aiConfig?.profileMap ?? null,
    explorationMode: config.explorationMode ?? false,
    inventory: InventoryService.createInventory(),
    pendingRollRequest: null,
  }

  sessions.set(sessionId, session)
  startCleanup()

  return {
    sessionId,
    state: serializeState(state),
    menu,
    initiatives: initResult.initiatives,
  }
}

/**
 * Get current session state.
 * @param {string} sessionId
 * @returns {{ state, activeId, round, status }}
 */
function getSession(sessionId) {
  const session = _getSession(sessionId)
  return {
    state: serializeState(session.state),
    activeId: session.state.getActiveCombatantId(),
    round: session.state.round,
    status: session.status,
    narrativeEvents: session.narrativeEvents || [],
    explorationMode: session.explorationMode,
    inventory: session.inventory,
    pendingRollRequest: session.pendingRollRequest
      ? {
          commitment: session.pendingRollRequest.commitment,
          activeId: session.pendingRollRequest.activeId,
          requestedAt: session.pendingRollRequest.requestedAt,
        }
      : null,
  }
}

/**
 * Get the turn menu for the active combatant.
 * @param {string} sessionId
 * @returns {{ menu, activeId, activeName }}
 */
function getMenu(sessionId) {
  const session = _getSession(sessionId)
  const activeId = session.state.getActiveCombatantId()
  const active = session.state.getCombatant(activeId)
  const menu = TurnMenu.getMenu(session.state, activeId)

  return {
    menu,
    activeId,
    activeName: active?.name ?? 'Unknown',
  }
}

function parseDiceNotation(notation) {
  if (typeof notation !== 'string') return null
  const m = notation.trim().match(/^(\d+)d(\d+)$/i)
  if (!m) return null
  return {
    notation: `${parseInt(m[1], 10)}d${parseInt(m[2], 10)}`,
    count: parseInt(m[1], 10),
    sides: parseInt(m[2], 10),
  }
}

function inferRollRequests(state, activeId, choice) {
  const menu = TurnMenu.getMenu(state, activeId)
  const allOptions = [
    ...(menu.actions || []),
    ...(menu.bonusActions || []),
    ...(menu.reactions || []),
    ...(menu.movements || []),
  ]
  const option = allOptions.find(o => o.optionId === choice.optionId)
  if (!option) return []

  const actor = state.getCombatant(activeId)
  const requests = []

  if (option.type === 'attack') {
    requests.push({ purpose: 'attack', notation: '1d20', count: 1, sides: 20 })
    const weapon = (actor.weapons || [])[option.weaponIndex || 0]
    const parsed = parseDiceNotation(weapon?.damageDice)
    if (parsed) requests.push({ purpose: 'damage', ...parsed })
  } else if (option.type === 'multiattack') {
    const attackCount = option.attackCount || actor.multiattack || 1
    requests.push({ purpose: 'attack', notation: `${attackCount}d20`, count: attackCount, sides: 20 })
    const weapon = (actor.weapons || [])[0]
    const parsed = parseDiceNotation(weapon?.damageDice)
    if (parsed) {
      requests.push({
        purpose: 'damage',
        notation: `${parsed.count * attackCount}d${parsed.sides}`,
        count: parsed.count * attackCount,
        sides: parsed.sides,
      })
    }
  } else if (option.type === 'spell' && option.spellName) {
    const spellDef = getSpell(option.spellName)
    if (spellDef?.attack) {
      requests.push({ purpose: 'attack', notation: '1d20', count: 1, sides: 20 })
    }
    const damageDice = spellDef?.damage?.dice
    const parsedDamage = parseDiceNotation(damageDice)
    if (parsedDamage) requests.push({ purpose: 'damage', ...parsedDamage })
    const healingDice = spellDef?.healing?.dice
    const parsedHealing = parseDiceNotation(healingDice)
    if (parsedHealing) requests.push({ purpose: 'healing', ...parsedHealing })
  } else if (option.type === 'breath_weapon') {
    const breathDice = actor.breathWeapon?.damage
    const parsed = parseDiceNotation(breathDice)
    if (parsed) requests.push({ purpose: 'damage', ...parsed })
  }

  return requests
}

function requestRolls(sessionId, choice) {
  const session = _getSession(sessionId)

  if (session.status !== 'active') {
    throw new Error(`Session is ${session.status}, cannot request rolls`)
  }

  const activeId = session.state.getActiveCombatantId()
  if (!activeId) {
    throw new Error('No active combatant')
  }

  TurnMenu.validateChoice(session.state, activeId, choice)

  const { serverSecret, commitment } = dice.generateCommitment()
  const rollRequests = inferRollRequests(session.state, activeId, choice)

  session.pendingRollRequest = {
    activeId,
    choice,
    serverSecret,
    commitment,
    requestedAt: Date.now(),
  }
  session.lastActivityAt = Date.now()

  return {
    commitment,
    rollRequests,
    activeId,
  }
}

/**
 * Submit a player's choice for the active combatant.
 *
 * @param {string} sessionId
 * @param {Object} choice - { optionId, targetId?, aoeCenter?, position? }
 * @returns {{ result, rolls, stateChanges, newState, nextMenu }}
 */
function submitChoice(sessionId, choice) {
  const session = _getSession(sessionId)

  if (session.status !== 'active') {
    throw new Error(`Session is ${session.status}, cannot submit choice`)
  }

  const activeId = session.state.getActiveCombatantId()
  if (!activeId) {
    throw new Error('No active combatant')
  }

  // Direct submissions invalidate any previously requested commit-reveal roll.
  session.pendingRollRequest = null

  // Capture the log length before resolution to get new log entries
  const prevLogLength = session.state.log.length

  // Load test dice queue if present (deterministic testing support)
  if (session.testDiceQueue?.length > 0) dice.setFixedRolls(session.testDiceQueue)

  // ActionResolver.resolve() does TurnMenu.validateChoice() internally
  const resolution = ActionResolver.resolve(session.state, activeId, choice)

  // Persist remaining queue and clean up global dice state
  if (session.testDiceQueue !== undefined) {
    session.testDiceQueue = dice.getRemainingFixedRolls()
    dice.clearFixedRolls()
  }

  // Extract roll information from the result
  const rolls = extractRolls(resolution.result)

  // Update session state (must happen before OA processing)
  session.state = resolution.state
  session.lastActivityAt = Date.now()

  // Process any opportunity attacks triggered by movement
  const oaTriggers = resolution.result.opportunityAttackTriggers || []
  processOpportunityAttacks(session, activeId, oaTriggers)

  // Process new deaths → create corpses with loot
  processNewDeaths(session)

  // If this was a loot action, merge the loot into player inventory
  if (resolution.result.type === 'loot_corpse' && resolution.result.loot) {
    session.inventory = InventoryService.mergeLoot(session.inventory, resolution.result.loot)
  }

  // Extract all new log entries (action logs + any OA logs + death logs)
  const newLogs = session.state.log.slice(prevLogLength)
  session.actionHistory.push({
    round: session.state.round,
    actorId: activeId,
    choice,
    result: resolution.result,
    rolls,
    timestamp: Date.now(),
  })

  // Check for victory
  const victory = checkVictory(session.state, session.explorationMode)
  if (victory.over) {
    session.status = 'complete'
  }

  // ── NPC Narrator Hook (non-blocking async) ──
  // Fire-and-forget: generates NPC dialogue for dramatic combat moments.
  // Narrations are appended to session.narrativeEvents and returned on the
  // next getSession() call.  Failures are logged but never block the action.
  try {
    // const CombatNarrator = null;
    // const prevState = session.actionHistory.length > 1
    //  ? null  // We only have the current state snapshot available
    //  : null
    // CombatNarrator.processStateTransition(
    //  sessionId,
    //  session.state, 
    //  session.state,
    //  activeId,
    //  resolution.result
    // ).then(narrations => {
    //  if (narrations && narrations.length) {
    //    session.narrativeEvents.push(...narrations)
    //  }
    // }).catch(err => {
    //  console.warn('[CombatNarrator] submitChoice hook error:', err.message)
    // })
  } catch (e) { /* narrator not available */ }

  // Generate next menu (same combatant — they may have more actions)
  const nextMenu = session.status === 'active'
    ? TurnMenu.getMenu(session.state, activeId)
    : null

  // Drain narrative events into the response so the UI gets them immediately
  const pendingNarrations = session.narrativeEvents.splice(0)

  return {
    result: resolution.result,
    rolls,
    logs: newLogs,
    newState: serializeState(session.state),
    nextMenu,
    victory: victory.over ? victory : null,
    inventory: session.inventory,
    narrations: pendingNarrations,
  }
}

function confirmRolls(sessionId, clientSeed) {
  const session = _getSession(sessionId)

  if (session.status !== 'active') {
    throw new Error(`Session is ${session.status}, cannot confirm rolls`)
  }

  const pending = session.pendingRollRequest
  if (!pending) {
    throw new Error('No pending roll request for this session')
  }

  const activeId = session.state.getActiveCombatantId()
  if (activeId !== pending.activeId) {
    session.pendingRollRequest = null
    throw new Error('Turn changed before roll confirmation; request rolls again')
  }

  if (clientSeed === undefined || clientSeed === null || clientSeed === '') {
    throw new Error('clientSeed is required')
  }

  const seedString = String(clientSeed)
  session.pendingRollRequest = null

  dice.applySeed(pending.serverSecret, seedString)
  try {
    const actionResult = submitChoice(sessionId, pending.choice)
    return {
      ...actionResult,
      fairness: {
        commitment: pending.commitment,
        serverSecret: pending.serverSecret,
        clientSeed: seedString,
        verified: dice.verifyCommitment(pending.serverSecret, pending.commitment),
      },
    }
  } finally {
    dice.clearSeed()
  }
}

/**
 * End the current combatant's turn and advance to the next.
 * @param {string} sessionId
 * @returns {{ newState, nextMenu, activeId, activeName, round, victory }}
 */
function endTurn(sessionId) {
  const session = _getSession(sessionId)

  if (session.status !== 'active') {
    throw new Error(`Session is ${session.status}, cannot end turn`)
  }

  let state = session.state

  // End-of-turn saves for the outgoing combatant (Hold Person, Dragon Fear, etc.)
  const outgoingId = state.getActiveCombatantId()
  const outgoing = state.getCombatant(outgoingId)
  if (outgoing && outgoing.currentHP > 0) {
    state = processEndOfTurnSaves(state, outgoingId)
  }

  // Advance to next turn
  state = state.withNextTurn()

  // Skip dead combatants
  let attempts = 0
  while (attempts < state.combatantCount) {
    const activeId = state.getActiveCombatantId()
    const active = state.getCombatant(activeId)
    if (active && active.currentHP > 0) break
    state = state.withNextTurn()
    attempts++
  }

  // Reset turn state for the new active combatant
  const activeId = state.getActiveCombatantId()
  state = resetTurnState(state, activeId)

  // Commit turn-advance state, then auto-run AI-controlled enemy turns
  session.state = state
  session.lastActivityAt = Date.now()
  const aiLogs = executeAiTurns(session)

  // Start-of-turn upkeep for the player who now has control
  // (AI combatants already had their upkeep inside executeAiTurns)
  {
    const finalActiveId = session.state.getActiveCombatantId()
    const sotResult = processStartOfTurn(session.state, finalActiveId)
    session.state = sotResult.state
  }

  // Process any new deaths from AI turns
  processNewDeaths(session)

  // Check for victory (AI may have finished combat)
  const victory = checkVictory(session.state, session.explorationMode)
  if (victory.over) {
    session.status = 'complete'
  }

  const finalActiveId = session.state.getActiveCombatantId()
  const finalActive   = session.state.getCombatant(finalActiveId)
  const nextMenu = session.status === 'active'
    ? TurnMenu.getMenu(session.state, finalActiveId)
    : null

  // Drain any narrative events accumulated during AI turns
  const pendingNarrations = session.narrativeEvents.splice(0)

  return {
    newState: serializeState(session.state),
    nextMenu,
    activeId: finalActiveId,
    activeName: finalActive?.name ?? 'Unknown',
    round: session.state.round,
    logs: aiLogs,
    victory: victory.over ? victory : null,
    narrations: pendingNarrations,
  }
}

/**
 * Free dice roll — not tied to any action, purely for the Roll Bar.
 * Server-authoritative: client never determines results.
 *
 * @param {string} sessionId
 * @param {string} notation - e.g. '1d20', '2d6', '4d8+3'
 * @returns {{ notation, values, modifier, total }}
 */
function rollFree(sessionId, notation) {
  // Validate session exists (to prevent unauthorized rolling)
  _getSession(sessionId)

  const match = notation.match(/^(\d+)d(\d+)([+-]\d+)?$/)
  if (!match) {
    throw new Error(`Invalid dice notation: "${notation}"`)
  }

  const count    = Math.min(parseInt(match[1], 10), 20) // cap at 20 dice
  const sides    = parseInt(match[2], 10)
  const modifier = match[3] ? parseInt(match[3], 10) : 0

  // Use the engine's dice module for consistency (respects average mode in tests)
  const dieFn = dice.dieFns[sides]
  let values
  if (dieFn) {
    values = dice.rollDice(count, dieFn)
  } else {
    // Fallback for non-standard die sizes (d100, etc.)
    values = []
    for (let i = 0; i < count; i++) {
      values.push(Math.floor(Math.random() * sides) + 1)
    }
  }

  const total = values.reduce((s, v) => s + v, 0) + modifier

  return { notation, values, modifier, total }
}

/**
 * Destroy a session.
 * @param {string} sessionId
 */
function destroySession(sessionId) {
  sessions.delete(sessionId)
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

function _getSession(sessionId) {
  const session = sessions.get(sessionId)
  if (!session) {
    const err = new Error(`Session not found: ${sessionId}`)
    err.code = 'SESSION_NOT_FOUND'
    throw err
  }
  if (session.status === 'expired') {
    sessions.delete(sessionId)
    const err = new Error(`Session expired: ${sessionId}`)
    err.code = 'SESSION_EXPIRED'
    throw err
  }
  return session
}

/**
 * Extract roll details from an ActionResolver result for client animation.
 * Each roll has: { purpose, notation, values, modifier, total }
 */
function extractRolls(result) {
  const rolls = []

  if (!result) return rolls

  switch (result.type) {
    case 'attack': {
      // Attack roll
      rolls.push({
        purpose: 'attack',
        notation: '1d20',
        values: [result.natural],
        modifier: result.attackerId ? 0 : 0,  // attackBonus is in the total
        total: result.roll,
        hit: result.hit,
        targetAC: result.targetAC,
      })
      // Damage roll (if hit)
      if (result.hit && result.damage > 0) {
        rolls.push({
          purpose: 'damage',
          notation: result.damageDice || 'damage',
          values: Array.isArray(result.damageRolls) ? result.damageRolls : [],
          modifier: 0,
          total: result.damage,
        })
      }
      break
    }

    case 'multiattack': {
      // Multiple attack + damage rolls
      if (result.attacks) {
        for (const atk of result.attacks) {
          rolls.push({
            purpose: 'attack',
            notation: '1d20',
            values: [atk.natural ?? atk.roll],
            modifier: 0,
            total: atk.roll ?? atk.total,
            hit: atk.hit,
          })
          if (atk.hit && atk.damage > 0) {
            rolls.push({
              purpose: 'damage',
              notation: atk.damageDice || 'damage',
              values: Array.isArray(atk.damageRolls) ? atk.damageRolls : [],
              modifier: 0,
              total: atk.damage,
            })
          }
        }
      }
      break
    }

    case 'spell': {
      // Spell attack roll
      if (result.attackRoll) {
        rolls.push({
          purpose: 'attack',
          notation: '1d20',
          values: [result.attackRoll.natural ?? result.attackRoll],
          modifier: 0,
          total: result.attackRoll.total ?? result.attackRoll,
          hit: result.hit,
        })
      }
      // Saving throw results
      if (result.saves) {
        for (const save of result.saves) {
          rolls.push({
            purpose: 'save',
            notation: '1d20',
            values: [save.roll ?? save.result],
            modifier: save.saveBonus ?? 0,
            total: save.total,
            success: save.success,
            targetName: save.targetName,
          })
        }
      }
      // Spell damage
      if (result.damage > 0) {
        rolls.push({
          purpose: 'damage',
          notation: result.damageDice || 'damage',
          values: Array.isArray(result.damageRolls) ? result.damageRolls : [],
          modifier: 0,
          total: result.damage,
        })
      }
      // Healing
      if (result.healing > 0) {
        rolls.push({
          purpose: 'healing',
          notation: result.healingDice || 'healing',
          values: Array.isArray(result.healingRolls) ? result.healingRolls : [],
          modifier: 0,
          total: result.healing,
        })
      }
      break
    }

    case 'breath_weapon':
    case 'dragon_fear': {
      if (result.saves) {
        for (const save of result.saves) {
          rolls.push({
            purpose: 'save',
            notation: '1d20',
            values: [save.roll ?? save.result],
            modifier: save.saveBonus ?? 0,
            total: save.total,
            success: save.success,
            targetName: save.targetName,
          })
        }
      }
      if (result.totalDamage > 0) {
        rolls.push({
          purpose: 'damage',
          notation: result.damageDice || 'damage',
          values: Array.isArray(result.damageRolls) ? result.damageRolls : [],
          modifier: 0,
          total: result.totalDamage,
        })
      }
      break
    }

    // No roll results for dodge, dash, disengage, move, etc.
    default:
      break
  }

  return rolls
}

/**
 * Serialize GameState for API responses.
 * Converts internal Map-based state to a plain JSON-safe object.
 */
function serializeState(state) {
  return {
    round: state.round,
    turnIndex: state.turnIndex,
    initiativeOrder: state.initiativeOrder,
    log: state.log,
    combatants: state.getAllCombatants().map(c => ({
      id: c.id,
      name: c.name,
      side: c.side,
      position: c.position,
      currentHP: c.currentHP,
      maxHP: c.maxHP,
      ac: c.ac,
      speed: c.speed,
      conditions: c.conditions || [],
      concentrating: c.concentrating,
      concentrationRoundsRemaining: c.concentrationRoundsRemaining || 0,
      flying: !!c.flying,
      // Turn economy
      usedAction: !!c.usedAction,
      usedBonusAction: !!c.usedBonusAction,
      movementRemaining: c.movementRemaining || 0,
      reactedThisRound: !!c.reactedThisRound,
      // Resources
      spellSlots: c.spellSlots || {},
      maxSlots: c.maxSlots || {},
      bardicInspiration: c.bardicInspiration || null,
      breathWeapon: c.breathWeapon || null,
      gemFlight: c.gemFlight || null,
      // Polymorph state
      polymorphedAs: c.polymorphedAs || null,
      // Display info
      type: c.type || 'humanoid',
      cr: c.cr,
      templateKey: c.templateKey || null,
      weapons: (c.weapons || []).map(w => ({
        name: w.name,
        attackBonus: w.attackBonus,
        damageDice: w.damageDice,
        damageBonus: w.damageBonus,
        damageType: w.damageType,
        type: w.type,
        range: w.range,
      })),
      cantrips: c.cantrips || [],
      spellsKnown: c.spellsKnown || [],
      // Stats (for display)
      str: c.str, dex: c.dex, con: c.con,
      int: c.int, wis: c.wis, cha: c.cha,
    })),
    // Corpses on the map (for rendering)
    corpses: state.getAllCorpses().map(c => ({
      id: c.id,
      name: c.name,
      position: c.position,
      templateKey: c.templateKey || null,
      looted: !!c.looted,
      hasLoot: !!(c.loot && (
        (c.loot.items && c.loot.items.length > 0) ||
        (c.loot.currency && Object.keys(c.loot.currency).length > 0)
      )),
    })),
  }
}

/**
 * Check if the combat is over.
 * In exploration mode, combat never auto-ends from victory — players must
 * manually destroy the session when they want to leave.
 */
function checkVictory(state, explorationMode = false) {
  if (explorationMode) return { over: false }

  const alive = state.getAliveCombatants()
  const sides = new Set(alive.map(c => c.side))

  if (sides.size <= 1) {
    const winner = sides.size === 1 ? [...sides][0] : 'none'
    return { over: true, winner }
  }

  return { over: false }
}

/**
 * Check for newly dead combatants and create corpses with generated loot.
 * Compares current state against known corpse IDs to find new deaths.
 * Mutates session.state by adding corpse entries.
 *
 * @param {CombatSession} session
 * @returns {string[]} Log entries for new deaths/corpses
 */
function processNewDeaths(session) {
  const logs = []
  const allCombatants = session.state.getAllCombatants()
  const existingCorpseIds = new Set(session.state.getAllCorpses().map(c => c.id))

  for (const c of allCombatants) {
    if (c.currentHP <= 0 && !existingCorpseIds.has(c.id)) {
      // Generate loot from creature's template key
      const templateKey = c.templateKey || c.type || c.id.replace(/-\d+$/, '')
      const loot = LootService.generateLootForCreature(templateKey)

      session.state = session.state.withCorpse({
        id: c.id,
        name: c.name,
        position: { ...c.position },
        templateKey,
        loot,
        looted: false,
      })

      if (!LootService.isLootEmpty(loot)) {
        logs.push(`💀 ${c.name} falls! Their corpse contains loot.`)
      } else {
        logs.push(`💀 ${c.name} falls!`)
      }
    }
  }

  // Add log entries to state
  if (logs.length > 0) {
    session.state = session.state.withLogEntries(logs)
  }

  return logs
}

/**
 * Get the player inventory for a session.
 * @param {string} sessionId
 * @returns {{ items: Array, currency: Object }}
 */
function getInventory(sessionId) {
  const session = _getSession(sessionId)
  return session.inventory
}

// ── Exports (Service API) ────────────────────────────────────────────────────

export {
  createSession,
  getSession,
  getMenu,
  requestRolls,
  confirmRolls,
  submitChoice,
  endTurn,
  rollFree,
  destroySession,
  getInventory,

  // For testing
  sessions as _sessions,
  serializeState as _serializeState,
  extractRolls as _extractRolls,
  checkVictory as _checkVictory,
  processNewDeaths as _processNewDeaths,
  stopCleanup as _stopCleanup,
}
