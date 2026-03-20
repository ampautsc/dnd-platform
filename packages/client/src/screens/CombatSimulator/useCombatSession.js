/**
 * useCombatSession — React hook managing the full combat lifecycle via REST API.
 *
 * Replaces useCombatTurn for server-driven combat. The server owns all state —
 * this hook is just the communication bridge + local state cache.
 *
 * No business logic — all rules enforced server-side.
 */

import { useState, useCallback, useRef } from 'react'
import * as api from './combatApi.js'

/**
 * @typedef {Object} CombatSessionState
 * @property {string|null}  sessionId
 * @property {Object|null}  gameState      - Serialized server GameState
 * @property {Object|null}  menu           - TurnMenu for active combatant
 * @property {string|null}  activeId       - Active combatant ID
 * @property {string}       activeName     - Active combatant name
 * @property {number}       round          - Current round number
 * @property {boolean}      isResolving    - Waiting for server response
 * @property {Object|null}  lastResult     - Last action resolution result
 * @property {Array}        lastRolls      - Last set of rolls for animation
 * @property {Array}        lastLogs       - Last set of combat log entries
 * @property {Object|null}  victory        - Victory info if combat ended
 * @property {string|null}  error          - Last error message
 * @property {string}       status         - 'idle' | 'active' | 'complete'
 */

export function useCombatSession() {
  const [sessionId, setSessionId]     = useState(null)
  const [gameState, setGameState]     = useState(null)
  const [menu, setMenu]               = useState(null)
  const [activeId, setActiveId]       = useState(null)
  const [activeName, setActiveName]   = useState('')
  const [round, setRound]             = useState(1)
  const [isResolving, setIsResolving] = useState(false)
  const [lastResult, setLastResult]   = useState(null)
  const [lastRolls, setLastRolls]     = useState([])
  const [lastLogs, setLastLogs]       = useState([])
  const [combatLog, setCombatLog]     = useState([])
  const [victory, setVictory]         = useState(null)
  const [error, setError]             = useState(null)
  const [status, setStatus]           = useState('idle')
  const [initiatives, setInitiatives] = useState([])
  const [inventory, setInventory]     = useState({ items: [], currency: {} })
  const [pendingRollRequest, setPendingRollRequest] = useState(null)

  // ── Stepped dice state ─────────────────────────────────────────────────
  // New architecture: actions pause and request dice step-by-step.
  // pendingDice = current dice tray to display (null = no pending dice)
  // diceHistory = all dice rolled so far in the current action chain
  const [pendingDice, setPendingDice]     = useState(null)
  const [diceHistory, setDiceHistory]     = useState([])
  const [ownerIsAi, setOwnerIsAi]         = useState(false)

  // Ref to avoid stale closure on sessionId
  const sessionIdRef = useRef(null)

  // ── Create Session ─────────────────────────────────────────────────────

  const createSession = useCallback(async (encounterConfig) => {
    setIsResolving(true)
    setError(null)
    try {
      const result = await api.createSession(encounterConfig)
      sessionIdRef.current = result.sessionId
      setSessionId(result.sessionId)
      setGameState(result.state)
      setMenu(result.menu)
      setInitiatives(result.initiatives || [])
      setRound(result.state.round)
      setStatus('active')

      // Determine active combatant
      const order = result.state.initiativeOrder
      const activeIdx = result.state.turnIndex
      const aid = order[activeIdx]
      setActiveId(aid)
      const activeCombatant = result.state.combatants.find(c => c.id === aid)
      setActiveName(activeCombatant?.name ?? '')

      // Initialize combat log from state
      setCombatLog(result.state.log || [])

      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsResolving(false)
    }
  }, [])

  // ── Submit Action Choice ───────────────────────────────────────────────

  const submitChoice = useCallback(async (choice) => {
    const sid = sessionIdRef.current
    if (!sid) throw new Error('No active session')

    setIsResolving(true)
    setError(null)
    try {
      const result = await api.submitChoice(sid, choice)

      setLastResult(result.result)
      setLastRolls(result.rolls || [])
      setLastLogs(result.logs || [])
      setCombatLog(prev => [...prev, ...(result.logs || [])])

      if (result.newState) {
        setGameState(result.newState)
        setRound(result.newState.round)
      }
      if (result.nextMenu) {
        setMenu(result.nextMenu)
      }
      if (result.inventory) {
        setInventory(result.inventory)
      }
      if (result.victory) {
        setVictory(result.victory)
        setStatus('complete')
      }

      setPendingRollRequest(null)

      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsResolving(false)
    }
  }, [])

  // ── Submit Action (Stepped Dice) ─────────────────────────────────────

  /**
   * Submit an action using the new stepped dice architecture.
   * If the action needs dice, sets pendingDice state for UI rendering.
   * Call provideDice() to supply the dice results.
   */
  const submitActionStepped = useCallback(async (choice) => {
    const sid = sessionIdRef.current
    if (!sid) throw new Error('No active session')

    setIsResolving(true)
    setError(null)
    setPendingDice(null)
    setDiceHistory([])
    try {
      const result = await api.submitActionStepped(sid, choice)

      if (result.done) {
        // Resolved in one shot
        setLastResult(result.result)
        setDiceHistory(result.diceRequests || [])
        setPendingDice(null)
        setOwnerIsAi(false)
        setIsResolving(false)

        // Refresh state from server
        await _refreshSession(sid)
        return result
      }

      // Paused — needs dice
      setPendingDice(result.pendingDice)
      setDiceHistory(result.diceRequests || [])
      setOwnerIsAi(!!result.ownerIsAi)
      // Leave isResolving true — waiting for dice
      return result
    } catch (err) {
      setError(err.message)
      setIsResolving(false)
      throw err
    }
  }, [])

  /**
   * Provide dice results for the pending dice request.
   * @param {Object} diceData - { seeds: [...] } for player, { auto: true } for AI
   */
  const provideDice = useCallback(async (diceData) => {
    const sid = sessionIdRef.current
    if (!sid) throw new Error('No active session')

    try {
      const result = await api.provideDice(sid, diceData)

      if (result.done) {
        // Action complete
        setLastResult(result.result)
        setDiceHistory(result.diceRequests || [])
        setPendingDice(null)
        setOwnerIsAi(false)
        setIsResolving(false)

        // Refresh state from server
        await _refreshSession(sid)
        return result
      }

      // More dice needed (e.g. damage after hit)
      setPendingDice(result.pendingDice)
      setDiceHistory(result.diceRequests || [])
      setOwnerIsAi(!!result.ownerIsAi)
      return result
    } catch (err) {
      setError(err.message)
      setPendingDice(null)
      setIsResolving(false)
      throw err
    }
  }, [])

  /** Internal helper to refresh session state after action resolves. */
  const _refreshSession = useCallback(async (sid) => {
    try {
      const sessionData = await api.getSession(sid)
      if (sessionData.state) {
        setGameState(sessionData.state)
        setRound(sessionData.state.round)
      }
      if (sessionData.status === 'complete') {
        setVictory(sessionData.victory || { over: true })
        setStatus('complete')
      }

      // Also refresh menu
      const menuData = await api.getMenu(sid)
      if (menuData.menu) setMenu(menuData.menu)
      if (menuData.activeId) setActiveId(menuData.activeId)
      if (menuData.activeName) setActiveName(menuData.activeName)
    } catch {
      // Non-critical — state may be slightly stale
    }
  }, [])

  // ── Commit-Reveal Roll Handshake ─────────────────────────────────────

  const requestRolls = useCallback(async (choice) => {
    const sid = sessionIdRef.current
    if (!sid) throw new Error('No active session')

    setIsResolving(true)
    setError(null)
    try {
      const result = await api.requestRolls(sid, choice)
      setPendingRollRequest(result)
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsResolving(false)
    }
  }, [])

  const confirmRolls = useCallback(async (clientSeed) => {
    const sid = sessionIdRef.current
    if (!sid) throw new Error('No active session')

    setIsResolving(true)
    setError(null)
    try {
      const result = await api.confirmRolls(sid, clientSeed)

      setLastResult(result.result)
      setLastRolls(result.rolls || [])
      setLastLogs(result.logs || [])
      setCombatLog(prev => [...prev, ...(result.logs || [])])

      if (result.newState) {
        setGameState(result.newState)
        setRound(result.newState.round)
      }
      if (result.nextMenu) {
        setMenu(result.nextMenu)
      }
      if (result.inventory) {
        setInventory(result.inventory)
      }
      if (result.victory) {
        setVictory(result.victory)
        setStatus('complete')
      }

      setPendingRollRequest(null)
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsResolving(false)
    }
  }, [])

  // ── End Turn ───────────────────────────────────────────────────────────

  const endTurn = useCallback(async () => {
    const sid = sessionIdRef.current
    if (!sid) throw new Error('No active session')

    setIsResolving(true)
    setError(null)
    try {
      const result = await api.endTurn(sid)

      setGameState(result.newState)
      setMenu(result.nextMenu)
      setActiveId(result.activeId)
      setActiveName(result.activeName)
      setRound(result.round)
      setLastResult(null)
      setLastRolls([])
      setLastLogs([])
      setCombatLog(prev => [...prev, ...(result.logs || [])])

      if (result.victory) {
        setVictory(result.victory)
        setStatus('complete')
      }

      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsResolving(false)
    }
  }, [])

  // ── Free Dice Roll ─────────────────────────────────────────────────────

  const rollFree = useCallback(async (notation) => {
    const sid = sessionIdRef.current
    if (!sid) throw new Error('No active session')

    try {
      const result = await api.rollFree(sid, notation)
      return result
    } catch (err) {
      setError(err.message)
      throw err
    }
  }, [])

  // ── Refresh Menu ───────────────────────────────────────────────────────

  const refreshMenu = useCallback(async () => {
    const sid = sessionIdRef.current
    if (!sid) return

    try {
      const result = await api.getMenu(sid)
      setMenu(result.menu)
      setActiveId(result.activeId)
      setActiveName(result.activeName)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  // ── Destroy Session ────────────────────────────────────────────────────

  const destroySession = useCallback(async () => {
    const sid = sessionIdRef.current
    if (sid) {
      try {
        await api.destroySession(sid)
      } catch {
        // Ignore errors on cleanup
      }
    }
    sessionIdRef.current = null
    setSessionId(null)
    setGameState(null)
    setMenu(null)
    setActiveId(null)
    setActiveName('')
    setRound(1)
    setStatus('idle')
    setVictory(null)
    setError(null)
    setLastResult(null)
    setLastRolls([])
    setLastLogs([])
    setCombatLog([])
    setInitiatives([])
    setInventory({ items: [], currency: {} })
    setPendingRollRequest(null)
    setPendingDice(null)
    setDiceHistory([])
    setOwnerIsAi(false)
  }, [])

  return {
    // State
    sessionId,
    gameState,
    menu,
    activeId,
    activeName,
    round,
    isResolving,
    lastResult,
    lastRolls,
    lastLogs,
    combatLog,
    victory,
    error,
    status,
    initiatives,
    inventory,
    pendingRollRequest,
    pendingDice,
    diceHistory,
    ownerIsAi,

    // Actions
    createSession,
    submitChoice,
    submitActionStepped,
    provideDice,
    requestRolls,
    confirmRolls,
    endTurn,
    rollFree,
    refreshMenu,
    destroySession,
  }
}
