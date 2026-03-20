/**
 * useDiceAnimation — Hook managing dice roll animations.
 *
 * Abstracts the animation engine behind a queue-based API. The caller feeds
 * server-determined roll results, and this hook plays them sequentially with
 * visual animations.
 *
 * Phase 1: CSS 3D-transform based animation (lightweight, zero dependencies).
 *          Each die face spins and lands on the server-determined value.
 * Phase 2: Swap in @3d-dice/dice-box for full physics simulation (same API).
 *
 * Animation protocol (zero-trust):
 *   1. Client submits action → enters 'awaiting' state
 *   2. Server returns rolls[] with predetermined values
 *   3. Each roll animates sequentially: spin → land on value → pause → next
 *   4. After all rolls complete → 'resolved' state
 */

import { useState, useCallback, useRef, useEffect } from 'react'

/** Duration of a single die roll animation in ms. */
const ROLL_DURATION = 1200
/** Pause between sequential rolls in ms. */
const ROLL_PAUSE = 400

/**
 * @typedef {Object} RollAnimation
 * @property {string}   purpose   - 'attack', 'damage', 'save', 'healing', 'free'
 * @property {string}   notation  - Dice notation e.g. '1d20', '2d6'
 * @property {number[]} values    - Server-determined individual die values
 * @property {number}   modifier  - Flat modifier
 * @property {number}   total     - Final total
 * @property {boolean}  [hit]     - For attack rolls
 * @property {boolean}  [success] - For saving throws
 */

/**
 * @typedef {'idle'|'awaiting'|'awaiting_input'|'rolling'|'resolved'} AnimationState
 */

export function useDiceAnimation() {
  const [state, setState]           = useState('idle')    // AnimationState
  const [currentRoll, setCurrentRoll] = useState(null)    // Currently animating roll
  const [rollQueue, setRollQueue]     = useState([])      // Queued rolls
  const [rollHistory, setRollHistory] = useState([])      // Completed rolls (last 20)
  const [activeDice, setActiveDice]   = useState([])      // Dice currently showing (for render)
  const [requestedRolls, setRequestedRolls] = useState([]) // Roll requests waiting for user input

  const queueRef = useRef([])
  const animatingRef = useRef(false)
  const onCompleteCallbackRef = useRef(null)

  // ── Process the queue sequentially ─────────────────────────────────────

  const processQueue = useCallback(async () => {
    if (animatingRef.current) return
    if (queueRef.current.length === 0) {
      setState('resolved')
      animatingRef.current = false
      // Fire completion callback
      if (onCompleteCallbackRef.current) {
        onCompleteCallbackRef.current()
        onCompleteCallbackRef.current = null
      }
      return
    }

    animatingRef.current = true
    setState('rolling')

    const roll = queueRef.current.shift()
    setRollQueue([...queueRef.current])
    setCurrentRoll(roll)

    // Build the active dice set for this roll
    const parsedDice = parseDiceNotation(roll.notation)
    const dice = (roll.values || []).map((value, i) => ({
      id: `${Date.now()}-${i}`,
      sides: parsedDice.sides,
      value,
      animating: true,
    }))
    setActiveDice(dice)

    // Wait for animation duration
    await sleep(ROLL_DURATION)

    // Land the dice
    setActiveDice(dice.map(d => ({ ...d, animating: false })))

    // Add to history
    setRollHistory(prev => {
      const updated = [roll, ...prev]
      return updated.slice(0, 20) // Keep last 20
    })

    // Brief pause before next roll
    await sleep(ROLL_PAUSE)

    setCurrentRoll(null)
    animatingRef.current = false

    // Continue processing
    processQueue()
  }, [])

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Queue multiple rolls for sequential animation (from action resolution).
   * @param {RollAnimation[]} rolls
   * @param {Function} [onComplete] - Called when all rolls finish animating
   */
  const queueRolls = useCallback((rolls, onComplete) => {
    if (!rolls || rolls.length === 0) {
      onComplete?.()
      return
    }

    queueRef.current = [...queueRef.current, ...rolls]
    setRollQueue([...queueRef.current])
    onCompleteCallbackRef.current = onComplete || null
    setState('rolling')
    processQueue()
  }, [processQueue])

  /**
   * Animate a single free roll (from the Roll Bar buttons).
   * @param {RollAnimation} roll
   * @param {Function} [onComplete]
   */
  const rollFree = useCallback((roll, onComplete) => {
    queueRolls([{ ...roll, purpose: 'free' }], onComplete)
  }, [queueRolls])

  /**
   * Enter the 'awaiting' state (action submitted, waiting for server).
   */
  const setAwaiting = useCallback(() => {
    setState('awaiting')
  }, [])

  /**
   * Enter interactive input mode while waiting for user press/release seed input.
   * @param {Array} rollRequests
   */
  const setAwaitingInput = useCallback((rollRequests = []) => {
    setRequestedRolls(Array.isArray(rollRequests) ? rollRequests : [])
    setState('awaiting_input')
  }, [])

  /**
   * Clear current requested roll hints after interactive input is complete/cancelled.
   */
  const clearRequestedRolls = useCallback(() => {
    setRequestedRolls([])
  }, [])

  /**
   * Clear animation state back to idle.
   */
  const reset = useCallback(() => {
    queueRef.current = []
    animatingRef.current = false
    onCompleteCallbackRef.current = null
    setState('idle')
    setCurrentRoll(null)
    setRollQueue([])
    setActiveDice([])
    setRequestedRolls([])
  }, [])

  const isAnimating = state === 'rolling' || state === 'awaiting' || state === 'awaiting_input'

  return {
    // State
    state,          // 'idle' | 'awaiting' | 'awaiting_input' | 'rolling' | 'resolved'
    isAnimating,
    currentRoll,    // The roll currently being animated
    rollQueue,      // Remaining rolls
    rollHistory,    // Completed rolls (most recent first)
    activeDice,     // Current dice on screen { id, sides, value, animating }
    requestedRolls,

    // Actions
    queueRolls,
    rollFree,
    setAwaiting,
    setAwaitingInput,
    clearRequestedRolls,
    reset,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseDiceNotation(notation) {
  const match = String(notation || '1d20').match(/^(\d+)d(\d+)([+-]\d+)?$/)
  if (!match) return { count: 1, sides: 20, modifier: 0 }
  return {
    count: parseInt(match[1], 10),
    sides: parseInt(match[2], 10),
    modifier: match[3] ? parseInt(match[3], 10) : 0,
  }
}
