/**
 * combatApi — Thin fetch wrapper for the Combat Sessions REST API.
 *
 * Single module for all combat HTTP calls. Easy to swap base URL
 * for cloud deployment or add auth headers later.
 *
 * No business logic — just fetch → JSON → return.
 */

const BASE = '/api/combat'

class CombatApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'CombatApiError'
    this.status = status
    this.body = body
  }
}

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== null) {
    opts.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, opts)
  } catch (networkErr) {
    throw new CombatApiError(`Network error: ${networkErr.message}`, 0, null)
  }

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '')
    throw new CombatApiError(
      `Server returned non-JSON response (${res.status}): ${text.slice(0, 120)}`,
      res.status,
      null,
    )
  }

  const json = await res.json()

  if (!res.ok) {
    throw new CombatApiError(
      json.error || `HTTP ${res.status}`,
      res.status,
      json,
    )
  }

  return json.data
}

// ── Session CRUD ─────────────────────────────────────────────────────────────

/**
 * Create a new combat session.
 * @param {{ combatants: Array }} config
 * @returns {Promise<{ sessionId, state, menu, initiatives }>}
 */
export function createSession(config) {
  return request('POST', '/sessions', config)
}

/**
 * Get current session state.
 * @param {string} sessionId
 * @returns {Promise<{ state, activeId, round, status }>}
 */
export function getSession(sessionId) {
  return request('GET', `/sessions/${sessionId}`)
}

/**
 * Get the turn menu for the active combatant.
 * @param {string} sessionId
 * @returns {Promise<{ menu, activeId, activeName }>}
 */
export function getMenu(sessionId) {
  return request('GET', `/sessions/${sessionId}/menu`)
}

/**
 * Start commit-reveal roll handshake for an action.
 * @param {string} sessionId
 * @param {{ optionId, targetId?, aoeCenter?, position?, beastFormName? }} choice
 * @returns {Promise<{ commitment: string, rollRequests: Array, activeId: string }>}
 */
export function requestRolls(sessionId, choice) {
  return request('POST', `/sessions/${sessionId}/roll-request`, choice)
}

/**
 * Confirm commit-reveal roll with a client-provided seed.
 * @param {string} sessionId
 * @param {string|number} clientSeed
 * @returns {Promise<{ result, rolls, logs, newState, nextMenu, victory, fairness }>} 
 */
export function confirmRolls(sessionId, clientSeed) {
  return request('POST', `/sessions/${sessionId}/confirm-rolls`, { clientSeed })
}

/**
 * Submit a combat action choice (legacy synchronous).
 * @param {string} sessionId
 * @param {{ optionId, targetId?, aoeCenter?, position? }} choice
 * @returns {Promise<{ result, rolls, logs, newState, nextMenu, victory }>}
 */
export function submitChoice(sessionId, choice) {
  return request('POST', `/sessions/${sessionId}/actions`, choice)
}

/**
 * Submit an action with STEPPED dice resolution.
 * Returns either { done: true, result } or { done: false, pendingDice, ownerIsAi }.
 * If pendingDice is returned, call provideDice() with seeds from user clicks.
 *
 * @param {string} sessionId
 * @param {{ optionId, targetId?, aoeCenter?, position? }} choice
 * @returns {Promise<StepResponse>}
 */
export function submitActionStepped(sessionId, choice) {
  return request('POST', `/sessions/${sessionId}/actions?stepped=true`, choice)
}

/**
 * Provide dice results for a pending dice request (stepped resolution).
 *
 * @param {string} sessionId
 * @param {Object} diceData - One of:
 *   { seeds: [number, ...] }  — Player: one seed per die from click event timestamps
 *   { auto: true }            — AI: server auto-rolls
 *   { rolls: [number, ...] }  — Testing: direct die values
 * @returns {Promise<StepResponse>} — { done, result?, pendingDice?, diceRequests }
 */
export function provideDice(sessionId, diceData) {
  return request('POST', `/sessions/${sessionId}/provide-dice`, diceData)
}

/**
 * End the current combatant's turn.
 * @param {string} sessionId
 * @returns {Promise<{ newState, nextMenu, activeId, activeName, round, victory }>}
 */
export function endTurn(sessionId) {
  return request('POST', `/sessions/${sessionId}/end-turn`)
}

/**
 * Free dice roll (not tied to an action).
 * @param {string} sessionId
 * @param {string} notation - e.g. '1d20', '2d6+3'
 * @returns {Promise<{ notation, values, modifier, total }>}
 */
export function rollFree(sessionId, notation) {
  return request('POST', `/sessions/${sessionId}/roll`, { notation })
}

/**
 * Get the player's inventory for a session.
 * @param {string} sessionId
 * @returns {Promise<{ items: Array, currency: Object }>}
 */
export function getInventory(sessionId) {
  return request('GET', `/sessions/${sessionId}/inventory`)
}

/**
 * Destroy a session.
 * @param {string} sessionId
 */
export function destroySession(sessionId) {
  return request('DELETE', `/sessions/${sessionId}`)
}

export { CombatApiError }
