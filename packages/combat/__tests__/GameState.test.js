/**
 * GameState — unit tests
 *
 * Tests the immutable state container: construction, read accessors,
 * immutable update methods, edge cases, and error handling.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { GameState } from '../src/engine-v2/GameState.js'
import { makeCombatant, makeBard, makeEnemy, makeBrute } from './helpers.js'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────

describe('GameState — construction', () => {
  it('constructs from an array of combatants', () => {
    const state = new GameState({ combatants: [makeBard(), makeEnemy()] })
    expect(state.combatantCount).toBe(2)
    expect(state.round).toBe(1)
    expect(state.turnIndex).toBe(0)
  })

  it('constructs from a Map of combatants', () => {
    const bard = makeBard()
    const enemy = makeEnemy()
    const map = new Map([['bard1', bard], ['enemy1', enemy]])
    const state = new GameState({ combatants: map })

    expect(state.combatantCount).toBe(2)
    expect(state.getCombatant('bard1')).not.toBeNull()
  })

  it('deep-clones combatants on construction (no external mutation)', () => {
    const bard = makeBard()
    const state = new GameState({ combatants: [bard] })
    bard.currentHP = 0
    expect(state.getCombatant('bard1').currentHP).toBe(45)
  })

  it('defaults round=1, turnIndex=0, empty initiative + log', () => {
    const state = new GameState({ combatants: [makeCombatant()] })
    expect(state.round).toBe(1)
    expect(state.turnIndex).toBe(0)
    expect(state.initiativeOrder).toEqual([])
    expect(state.log).toEqual([])
  })

  it('accepts custom round, turnIndex, initiativeOrder, log', () => {
    const state = new GameState({
      combatants: [makeCombatant({ id: 'a' })],
      round: 3,
      turnIndex: 0,
      initiativeOrder: ['a'],
      log: ['Round 1 start'],
    })

    expect(state.round).toBe(3)
    expect(state.turnIndex).toBe(0)
    expect(state.initiativeOrder).toEqual(['a'])
    expect(state.log).toEqual(['Round 1 start'])
  })

  it('throws if combatant has no id', () => {
    expect(() => {
      new GameState({ combatants: [{ name: 'No ID', currentHP: 10 }] })
    }).toThrow(/must have an id/)
  })

  it('throws if combatants is neither array nor Map', () => {
    expect(() => {
      new GameState({ combatants: 'invalid' })
    }).toThrow(/must be an array or Map/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// READ ACCESSORS
// ─────────────────────────────────────────────────────────────────────────────

describe('GameState — read accessors', () => {
  let state

  beforeAll(() => {
    const bard = makeBard()
    const e1 = makeEnemy({ id: 'cf1', name: 'Cult Fanatic 1', position: { x: 4, y: 0 } })
    const e2 = makeEnemy({ id: 'cf2', name: 'Cult Fanatic 2', currentHP: 0, position: { x: 6, y: 0 } })

    state = new GameState({
      combatants: [bard, e1, e2],
      initiativeOrder: ['cf1', 'bard1', 'cf2'],
      round: 2,
      turnIndex: 1,
    })
  })

  it('getCombatant returns correct combatant', () => {
    const bard = state.getCombatant('bard1')
    expect(bard.name).toBe('Lore Bard')
    expect(bard.id).toBe('bard1')
  })

  it('getCombatant returns null for unknown ID', () => {
    expect(state.getCombatant('nonexistent')).toBeNull()
  })

  it('getAllCombatants returns all combatants', () => {
    expect(state.getAllCombatants().length).toBe(3)
  })

  it('getActiveCombatantId uses turnIndex into initiativeOrder', () => {
    expect(state.getActiveCombatantId()).toBe('bard1')
  })

  it('getActiveCombatant returns the creature object', () => {
    expect(state.getActiveCombatant().name).toBe('Lore Bard')
  })

  it('getActiveCombatantId returns null when no initiative order', () => {
    const empty = new GameState({ combatants: [makeCombatant()] })
    expect(empty.getActiveCombatantId()).toBeNull()
  })

  it('getCombatantsBySide filters correctly', () => {
    expect(state.getCombatantsBySide('party').length).toBe(1)
    expect(state.getCombatantsBySide('enemy').length).toBe(2)
  })

  it('getAliveCombatants excludes dead', () => {
    expect(state.getAliveCombatants().length).toBe(2)
  })

  it('getAliveCombatantsBySide combines both filters', () => {
    expect(state.getAliveCombatantsBySide('enemy').length).toBe(1)
    expect(state.getAliveCombatantsBySide('party').length).toBe(1)
  })

  it('isAlive returns true for living combatant', () => {
    expect(state.isAlive('bard1')).toBe(true)
  })

  it('isAlive returns false for dead combatant', () => {
    expect(state.isAlive('cf2')).toBe(false)
  })

  it('isAlive returns false for unknown ID', () => {
    expect(state.isAlive('ghost')).toBe(false)
  })

  it('initiativeOrder returns defensive copy', () => {
    const order1 = state.initiativeOrder
    const order2 = state.initiativeOrder
    expect(order1).not.toBe(order2)
    expect(order1).toEqual(order2)
  })

  it('log returns defensive copy', () => {
    const log1 = state.log
    const log2 = state.log
    expect(log1).not.toBe(log2)
    expect(log1).toEqual(log2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// IMMUTABLE UPDATES
// ─────────────────────────────────────────────────────────────────────────────

describe('GameState — withUpdatedCombatant', () => {
  it('returns new state with updated combatant', () => {
    const state = new GameState({ combatants: [makeBard()] })
    const next = state.withUpdatedCombatant('bard1', { currentHP: 20 })

    expect(next.getCombatant('bard1').currentHP).toBe(20)
    expect(state.getCombatant('bard1').currentHP).toBe(45)
  })

  it('accepts a function for changes', () => {
    const state = new GameState({ combatants: [makeBard()] })
    const next = state.withUpdatedCombatant('bard1', c => ({
      currentHP: c.currentHP - 10,
    }))
    expect(next.getCombatant('bard1').currentHP).toBe(35)
  })

  it('preserves other combatants', () => {
    const state = new GameState({ combatants: [makeBard(), makeEnemy()] })
    const next = state.withUpdatedCombatant('bard1', { currentHP: 10 })
    expect(next.getCombatant('enemy1').currentHP).toBe(33)
  })

  it('preserves round, turnIndex, initiative, log', () => {
    const state = new GameState({
      combatants: [makeBard()],
      round: 5,
      turnIndex: 0,
      initiativeOrder: ['bard1'],
      log: ['entry1'],
    })
    const next = state.withUpdatedCombatant('bard1', { usedAction: true })

    expect(next.round).toBe(5)
    expect(next.turnIndex).toBe(0)
    expect(next.initiativeOrder).toEqual(['bard1'])
    expect(next.log).toEqual(['entry1'])
  })

  it('throws for unknown combatant ID', () => {
    const state = new GameState({ combatants: [makeBard()] })
    expect(() => {
      state.withUpdatedCombatant('nobody', { currentHP: 0 })
    }).toThrow(/Unknown combatant/)
  })
})

describe('GameState — withUpdatedCombatants (batch)', () => {
  it('updates multiple combatants at once', () => {
    const state = new GameState({ combatants: [makeBard(), makeEnemy()] })
    const next = state.withUpdatedCombatants([
      { id: 'bard1', changes: { currentHP: 20 } },
      { id: 'enemy1', changes: { currentHP: 10 } },
    ])

    expect(next.getCombatant('bard1').currentHP).toBe(20)
    expect(next.getCombatant('enemy1').currentHP).toBe(10)
    expect(state.getCombatant('bard1').currentHP).toBe(45)
    expect(state.getCombatant('enemy1').currentHP).toBe(33)
  })

  it('supports function-based changes in batch', () => {
    const state = new GameState({ combatants: [makeBard(), makeEnemy()] })
    const next = state.withUpdatedCombatants([
      { id: 'bard1', changes: c => ({ currentHP: c.currentHP - 5 }) },
      { id: 'enemy1', changes: c => ({ currentHP: c.currentHP - 10 }) },
    ])

    expect(next.getCombatant('bard1').currentHP).toBe(40)
    expect(next.getCombatant('enemy1').currentHP).toBe(23)
  })
})

describe('GameState — withNextTurn', () => {
  it('advances turnIndex by 1', () => {
    const state = new GameState({
      combatants: [makeBard(), makeEnemy()],
      initiativeOrder: ['enemy1', 'bard1'],
      turnIndex: 0,
      round: 1,
    })
    const next = state.withNextTurn()
    expect(next.turnIndex).toBe(1)
    expect(next.round).toBe(1)
  })

  it('wraps around to 0 and increments round', () => {
    const state = new GameState({
      combatants: [makeBard(), makeEnemy()],
      initiativeOrder: ['enemy1', 'bard1'],
      turnIndex: 1,
      round: 1,
    })
    const next = state.withNextTurn()
    expect(next.turnIndex).toBe(0)
    expect(next.round).toBe(2)
  })

  it('original state is unchanged', () => {
    const state = new GameState({
      combatants: [makeBard()],
      initiativeOrder: ['bard1'],
      turnIndex: 0,
      round: 1,
    })
    const next = state.withNextTurn()
    expect(state.turnIndex).toBe(0)
    expect(state.round).toBe(1)
    expect(next.turnIndex).toBe(0)
    expect(next.round).toBe(2)
  })
})

describe('GameState — withLog / withLogEntries', () => {
  it('withLog appends a single entry', () => {
    const state = new GameState({ combatants: [makeCombatant()] })
    const next = state.withLog('Round 1 begins')

    expect(next.log).toEqual(['Round 1 begins'])
    expect(state.log).toEqual([])
  })

  it('withLogEntries appends multiple entries', () => {
    const state = new GameState({ combatants: [makeCombatant()], log: ['a'] })
    const next = state.withLogEntries(['b', 'c'])

    expect(next.log).toEqual(['a', 'b', 'c'])
    expect(state.log).toEqual(['a'])
  })
})

describe('GameState — withInitiativeOrder', () => {
  it('sets initiative order and resets turnIndex to 0', () => {
    const state = new GameState({
      combatants: [makeBard(), makeEnemy()],
      turnIndex: 1,
    })
    const next = state.withInitiativeOrder(['enemy1', 'bard1'])

    expect(next.initiativeOrder).toEqual(['enemy1', 'bard1'])
    expect(next.turnIndex).toBe(0)
  })

  it('throws if order contains unknown combatant ID', () => {
    const state = new GameState({ combatants: [makeBard()] })
    expect(() => {
      state.withInitiativeOrder(['bard1', 'ghost'])
    }).toThrow(/unknown combatant/)
  })
})

describe('GameState — withRound', () => {
  it('sets round number explicitly', () => {
    const state = new GameState({ combatants: [makeCombatant()] })
    const next = state.withRound(5)

    expect(next.round).toBe(5)
    expect(state.round).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// IMMUTABILITY GUARANTEES
// ─────────────────────────────────────────────────────────────────────────────

describe('GameState — immutability', () => {
  it('Object.freeze prevents adding properties to state', () => {
    const state = new GameState({ combatants: [makeCombatant()] })
    expect(() => {
      state.newProp = 'oops'
    }).toThrow()
  })

  it('chained updates produce independent snapshots', () => {
    const s0 = new GameState({ combatants: [makeBard()], initiativeOrder: ['bard1'] })
    const s1 = s0.withUpdatedCombatant('bard1', { currentHP: 40 })
    const s2 = s1.withUpdatedCombatant('bard1', { currentHP: 30 })
    const s3 = s0.withUpdatedCombatant('bard1', { currentHP: 20 })

    expect(s0.getCombatant('bard1').currentHP).toBe(45)
    expect(s1.getCombatant('bard1').currentHP).toBe(40)
    expect(s2.getCombatant('bard1').currentHP).toBe(30)
    expect(s3.getCombatant('bard1').currentHP).toBe(20)
  })

  it('withUpdatedCombatant does not mutate other combatant references', () => {
    const state = new GameState({ combatants: [makeBard(), makeEnemy()] })
    const next = state.withUpdatedCombatant('bard1', { currentHP: 10 })

    const origEnemy = state.getCombatant('enemy1')
    const nextEnemy = next.getCombatant('enemy1')
    expect(origEnemy.currentHP).toBe(nextEnemy.currentHP)
  })
})
