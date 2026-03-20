import { useState, useCallback } from 'react'

/**
 * useCombatTurn — Frontend turn & action budget manager.
 *
 * Tracks round, whose turn it is, and each combatant's per-turn budget
 * (movement, action, bonus action, reaction) plus persistent resources
 * (spell slots, class feature uses, concentration).
 *
 * All business rules live here. UI components just read state and call
 * the exposed functions.
 */
export function useCombatTurn({ onMoveRegistered = null, onActionRegistered = null } = {}) {
  const [round, setRound] = useState(1)
  const [turnIndex, setTurnIndex] = useState(0)
  const [initiativeOrder, setInitiativeOrder] = useState([])
  const [budgets, setBudgets] = useState({})

  /**
   * Start (or restart) an encounter.
   * entities: array of { id, name, side, speed, spellSlots?, classFeatures? }
   */
  const startEncounter = useCallback((entities) => {
    const players = entities.filter(e => e.side === 'player')
    const others  = entities.filter(e => e.side !== 'player')
    const order   = [...players, ...others].map(e => e.id)

    const initialBudgets = {}
    for (const e of entities) {
      const spd = e.speed ?? 30
      initialBudgets[e.id] = {
        // Per-turn resources (reset each turn)
        speed: spd,
        movementRemaining: spd,
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,

        // Persistent resources (survive across turns)
        spellSlots: e.spellSlots ? { ...e.spellSlots } : {},
        concentrating: null,        // spell id or null
        featureUses: {},            // featureId -> remaining uses
      }

      // Initialize feature uses from classFeatures array if provided
      if (e.classFeatures) {
        for (const f of e.classFeatures) {
          initialBudgets[e.id].featureUses[f.id] = f.uses ?? f.maxUses ?? 0
        }
      }
    }

    setInitiativeOrder(order)
    setBudgets(initialBudgets)
    setRound(1)
    setTurnIndex(0)
  }, [])

  const activeCombatantId = initiativeOrder[turnIndex] ?? null
  const getBudget = useCallback((id) => budgets[id] ?? null, [budgets])
  const activeBudget = budgets[activeCombatantId] ?? null

  // ── Movement ──────────────────────────────────────────────────────

  const consumeMovement = useCallback((id, feet, { fromQ, fromR, toQ, toR } = {}) => {
    const budget = budgets[id]
    if (!budget) return false
    if (budget.movementRemaining < feet) return false

    setBudgets(prev => ({
      ...prev,
      [id]: { ...prev[id], movementRemaining: prev[id].movementRemaining - feet },
    }))

    if (onMoveRegistered) onMoveRegistered(id, fromQ, fromR, toQ, toR, feet)
    return true
  }, [budgets, onMoveRegistered])

  // ── Actions ───────────────────────────────────────────────────────

  const useAction = useCallback((id) => {
    setBudgets(prev => ({
      ...prev,
      [id]: { ...prev[id], actionUsed: true },
    }))
  }, [])

  const useBonusAction = useCallback((id) => {
    setBudgets(prev => ({
      ...prev,
      [id]: { ...prev[id], bonusActionUsed: true },
    }))
  }, [])

  const useReaction = useCallback((id) => {
    setBudgets(prev => ({
      ...prev,
      [id]: { ...prev[id], reactionUsed: true },
    }))
  }, [])

  // ── Spell slots ──────────────────────────────────────────────────

  /** Expend a spell slot at the given level. Returns false if no slots remain. */
  const expendSpellSlot = useCallback((id, level) => {
    const budget = budgets[id]
    if (!budget) return false
    const remaining = budget.spellSlots[level] ?? 0
    if (remaining <= 0) return false

    setBudgets(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        spellSlots: { ...prev[id].spellSlots, [level]: prev[id].spellSlots[level] - 1 },
      },
    }))
    return true
  }, [budgets])

  // ── Concentration ────────────────────────────────────────────────

  const setConcentration = useCallback((id, spellId) => {
    setBudgets(prev => ({
      ...prev,
      [id]: { ...prev[id], concentrating: spellId },
    }))
  }, [])

  const dropConcentration = useCallback((id) => {
    setBudgets(prev => ({
      ...prev,
      [id]: { ...prev[id], concentrating: null },
    }))
  }, [])

  // ── Class features ───────────────────────────────────────────────

  /** Use a class feature charge. Returns false if no uses remain. */
  const useFeature = useCallback((id, featureId) => {
    const budget = budgets[id]
    if (!budget) return false
    const remaining = budget.featureUses[featureId] ?? 0
    if (remaining <= 0) return false

    setBudgets(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        featureUses: { ...prev[id].featureUses, [featureId]: prev[id].featureUses[featureId] - 1 },
      },
    }))
    return true
  }, [budgets])

  // ── Turn advancement ─────────────────────────────────────────────

  const endTurn = useCallback(() => {
    const nextIndex = (turnIndex + 1) % initiativeOrder.length
    const nextId = initiativeOrder[nextIndex]

    if (nextIndex === 0) setRound(r => r + 1)

    setBudgets(prev => {
      const existing = prev[nextId]
      if (!existing) return prev
      return {
        ...prev,
        [nextId]: {
          ...existing,
          movementRemaining: existing.speed,
          actionUsed: false,
          bonusActionUsed: false,
          reactionUsed: false,
        },
      }
    })

    setTurnIndex(nextIndex)
  }, [turnIndex, initiativeOrder])

  // ── Dash: double remaining movement ──────────────────────────────

  const useDash = useCallback((id) => {
    const budget = budgets[id]
    if (!budget || budget.actionUsed) return false

    setBudgets(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        actionUsed: true,
        movementRemaining: prev[id].movementRemaining + prev[id].speed,
      },
    }))
    return true
  }, [budgets])

  return {
    round,
    turnIndex,
    initiativeOrder,
    activeCombatantId,
    activeBudget,
    getBudget,
    startEncounter,
    consumeMovement,
    useAction,
    useBonusAction,
    useReaction,
    expendSpellSlot,
    setConcentration,
    dropConcentration,
    useFeature,
    useDash,
    endTurn,
  }
}
