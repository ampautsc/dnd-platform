/**
 * GameState — Immutable combat state container for engine-v2.
 *
 * Holds all combatant data, round tracking, initiative order, and combat log.
 * All mutation methods return NEW GameState instances — the original is never modified.
 *
 * Design:
 *   - Combatants stored in a Map<id, object> for O(1) lookup
 *   - Structural sharing: unchanged combatants keep references
 *   - Deep-clone on public construction to prevent external mutation
 *   - All "with*" methods return new GameState instances
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

// ── GameState ────────────────────────────────────────────────────────────────

export class GameState {
  /**
   * @param {object}       init
   * @param {object[]|Map} init.combatants       - Array of creature objects or Map<id, creature>
   * @param {number}       [init.round=1]        - Current round number
   * @param {number}       [init.turnIndex=0]    - Index into initiativeOrder
   * @param {string[]}     [init.initiativeOrder] - Combatant IDs in turn order
   * @param {string[]}     [init.log]            - Combat log entries
   * @param {Map}          [init.corpses]        - Map<id, corpseData> for looted/lootable dead entities
   * @param {boolean}      [init._skipClone]     - Internal: skip deep-clone for structural sharing
   */
  constructor(init) {
    const {
      combatants,
      round = 1,
      turnIndex = 0,
      initiativeOrder = [],
      log = [],
      corpses = new Map(),
      _skipClone = false,
    } = init

    // Build the combatants Map
    if (combatants instanceof Map) {
      this._combatants = _skipClone
        ? new Map(combatants)
        : new Map(Array.from(combatants.entries()).map(([id, c]) => [id, deepClone(c)]))
    } else if (Array.isArray(combatants)) {
      this._combatants = new Map()
      for (const c of combatants) {
        if (!c.id) throw new Error('Every combatant must have an id')
        const clone = _skipClone ? c : deepClone(c)
        this._combatants.set(clone.id, clone)
      }
    } else {
      throw new Error('combatants must be an array or Map')
    }

    this._round = round
    this._turnIndex = turnIndex
    this._initiativeOrder = Object.freeze([...initiativeOrder])
    this._log = Object.freeze([...log])

    // Corpses Map<id, { position, name, loot, looted, templateKey }>
    if (corpses instanceof Map) {
      this._corpses = _skipClone
        ? new Map(corpses)
        : new Map(Array.from(corpses.entries()).map(([id, c]) => [id, deepClone(c)]))
    } else {
      this._corpses = new Map()
    }

    Object.freeze(this)
  }

  // ── Read Accessors ─────────────────────────────────────────────────────────

  get round() { return this._round }
  get turnIndex() { return this._turnIndex }
  get initiativeOrder() { return [...this._initiativeOrder] }
  get log() { return [...this._log] }
  get combatantCount() { return this._combatants.size }

  getCombatant(id) {
    return this._combatants.get(id) || null
  }

  getAllCombatants() {
    return Array.from(this._combatants.values())
  }

  getActiveCombatantId() {
    if (this._initiativeOrder.length === 0) return null
    return this._initiativeOrder[this._turnIndex] || null
  }

  getActiveCombatant() {
    const id = this.getActiveCombatantId()
    return id ? this.getCombatant(id) : null
  }

  getCombatantsBySide(side) {
    return this.getAllCombatants().filter(c => c.side === side)
  }

  getAliveCombatants() {
    return this.getAllCombatants().filter(c => c.currentHP > 0)
  }

  getAliveCombatantsBySide(side) {
    return this.getAllCombatants().filter(c => c.side === side && c.currentHP > 0)
  }

  isAlive(id) {
    const c = this.getCombatant(id)
    return c !== null && c.currentHP > 0
  }

  // ── Immutable Updates ──────────────────────────────────────────────────────

  withUpdatedCombatant(id, changes) {
    const old = this._combatants.get(id)
    if (!old) throw new Error(`Unknown combatant: ${id}`)

    const patch = typeof changes === 'function' ? changes(old) : changes
    const updated = { ...old, ...patch }

    const newMap = new Map(this._combatants)
    newMap.set(id, updated)

    return new GameState({
      combatants: newMap,
      round: this._round,
      turnIndex: this._turnIndex,
      initiativeOrder: this._initiativeOrder,
      log: this._log,
      corpses: this._corpses,
      _skipClone: true,
    })
  }

  withUpdatedCombatants(updates) {
    const newMap = new Map(this._combatants)
    for (const { id, changes } of updates) {
      const old = newMap.get(id)
      if (!old) throw new Error(`Unknown combatant: ${id}`)
      const patch = typeof changes === 'function' ? changes(old) : changes
      newMap.set(id, { ...old, ...patch })
    }

    return new GameState({
      combatants: newMap,
      round: this._round,
      turnIndex: this._turnIndex,
      initiativeOrder: this._initiativeOrder,
      log: this._log,
      corpses: this._corpses,
      _skipClone: true,
    })
  }

  withNextTurn() {
    let nextIndex = this._turnIndex + 1
    let nextRound = this._round
    if (nextIndex >= this._initiativeOrder.length) {
      nextIndex = 0
      nextRound++
    }

    return new GameState({
      combatants: this._combatants,
      round: nextRound,
      turnIndex: nextIndex,
      initiativeOrder: this._initiativeOrder,
      log: this._log,
      corpses: this._corpses,
      _skipClone: true,
    })
  }

  withLog(entry) {
    return new GameState({
      combatants: this._combatants,
      round: this._round,
      turnIndex: this._turnIndex,
      initiativeOrder: this._initiativeOrder,
      log: [...this._log, entry],
      corpses: this._corpses,
      _skipClone: true,
    })
  }

  withLogEntries(entries) {
    return new GameState({
      combatants: this._combatants,
      round: this._round,
      turnIndex: this._turnIndex,
      initiativeOrder: this._initiativeOrder,
      log: [...this._log, ...entries],
      corpses: this._corpses,
      _skipClone: true,
    })
  }

  withInitiativeOrder(order) {
    for (const id of order) {
      if (!this._combatants.has(id)) {
        throw new Error(`Initiative order contains unknown combatant: ${id}`)
      }
    }

    return new GameState({
      combatants: this._combatants,
      round: this._round,
      turnIndex: 0,
      initiativeOrder: order,
      log: this._log,
      corpses: this._corpses,
      _skipClone: true,
    })
  }

  withRound(round) {
    return new GameState({
      combatants: this._combatants,
      round,
      turnIndex: this._turnIndex,
      initiativeOrder: this._initiativeOrder,
      log: this._log,
      corpses: this._corpses,
      _skipClone: true,
    })
  }

  // ── Corpse Accessors ───────────────────────────────────────────────────

  getAllCorpses() {
    return Array.from(this._corpses.values())
  }

  getCorpse(id) {
    return this._corpses.get(id) || null
  }

  getUnlootedCorpses() {
    return this.getAllCorpses().filter(c => !c.looted)
  }

  // ── Corpse Mutations ──────────────────────────────────────────────────

  withCorpse(corpseData) {
    const newCorpses = new Map(this._corpses)
    newCorpses.set(corpseData.id, { ...corpseData, looted: false })

    return new GameState({
      combatants: this._combatants,
      round: this._round,
      turnIndex: this._turnIndex,
      initiativeOrder: this._initiativeOrder,
      log: this._log,
      corpses: newCorpses,
      _skipClone: true,
    })
  }

  withCorpseLooted(corpseId) {
    const corpse = this._corpses.get(corpseId)
    if (!corpse) return this

    const newCorpses = new Map(this._corpses)
    newCorpses.set(corpseId, {
      ...corpse,
      looted: true,
      loot: { items: [], currency: {} },
    })

    return new GameState({
      combatants: this._combatants,
      round: this._round,
      turnIndex: this._turnIndex,
      initiativeOrder: this._initiativeOrder,
      log: this._log,
      corpses: newCorpses,
      _skipClone: true,
    })
  }
}
