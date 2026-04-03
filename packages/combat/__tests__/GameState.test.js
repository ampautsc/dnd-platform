/**
 * GameState — unit tests
 *
 * Tests the immutable state container: construction, read accessors,
 * immutable update methods, edge cases, and error handling.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../src/engine-v2/GameState.js'
import { makeCombatant, makeBard, makeEnemy, makeBrute } from './helpers.js'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────

describe('GameState — construction', () => {
  it('constructs from an array of combatants', () => {
    const state = new GameState({ combatants: [makeBard(), makeEnemy()] })
    assert.strictEqual(state.combatantCount, 2)
    assert.strictEqual(state.round, 1)
    assert.strictEqual(state.turnIndex, 0)
  })

  it('constructs from a Map of combatants', () => {
    const bard = makeBard()
    const enemy = makeEnemy()
    const map = new Map([['bard1', bard], ['enemy1', enemy]])
    const state = new GameState({ combatants: map })

    assert.strictEqual(state.combatantCount, 2)
    assert.notStrictEqual(state.getCombatant('bard1'), null)
  })

  it('deep-clones combatants on construction (no external mutation)', () => {
    const bard = makeBard()
    const state = new GameState({ combatants: [bard] })
    bard.currentHP = 0
    assert.strictEqual(state.getCombatant('bard1').currentHP, 45)
  })

  it('defaults round=1, turnIndex=0, empty initiative + log', () => {
    const state = new GameState({ combatants: [makeCombatant()] })
    assert.strictEqual(state.round, 1)
    assert.strictEqual(state.turnIndex, 0)
    assert.deepStrictEqual(state.initiativeOrder, [])
    assert.deepStrictEqual(state.log, [])
  })

  it('accepts custom round, turnIndex, initiativeOrder, log', () => {
    const state = new GameState({
      combatants: [makeCombatant({ id: 'a' })],
      round: 3,
      turnIndex: 0,
      initiativeOrder: ['a'],
      log: ['Round 1 start'],
    })

    assert.strictEqual(state.round, 3)
    assert.strictEqual(state.turnIndex, 0)
    assert.deepStrictEqual(state.initiativeOrder, ['a'])
    assert.deepStrictEqual(state.log, ['Round 1 start'])
  })

  it('throws if combatant has no id', () => {
    assert.throws(() => {
      new GameState({ combatants: [{ name: 'No ID', currentHP: 10 }] })
    }, /must have an id/)
  })

  it('throws if combatants is neither array nor Map', () => {
    assert.throws(() => {
      new GameState({ combatants: 'invalid' })
    }, /must be an array or Map/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// READ ACCESSORS
// ─────────────────────────────────────────────────────────────────────────────

describe('GameState — read accessors', () => {
  let state

  before(() => {
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
    assert.strictEqual(bard.name, 'Lore Bard')
    assert.strictEqual(bard.id, 'bard1')
  })

  it('getCombatant returns null for unknown ID', () => {
    assert.strictEqual(state.getCombatant('nonexistent'), null)
  })

  it('getAllCombatants returns all combatants', () => {
    assert.strictEqual(state.getAllCombatants().length, 3)
  })

  it('getActiveCombatantId uses turnIndex into initiativeOrder', () => {
    assert.strictEqual(state.getActiveCombatantId(), 'bard1')
  })

  it('getActiveCombatant returns the creature object', () => {
    assert.strictEqual(state.getActiveCombatant().name, 'Lore Bard')
  })

  it('getActiveCombatantId returns null when no initiative order', () => {
    const empty = new GameState({ combatants: [makeCombatant()] })
    assert.strictEqual(empty.getActiveCombatantId(), null)
  })

  it('getCombatantsBySide filters correctly', () => {
    assert.strictEqual(state.getCombatantsBySide('party').length, 1)
    assert.strictEqual(state.getCombatantsBySide('enemy').length, 2)
  })

  it('getAliveCombatants excludes dead', () => {
    assert.strictEqual(state.getAliveCombatants().length, 2)
  })

  it('getAliveCombatantsBySide combines both filters', () => {
    assert.strictEqual(state.getAliveCombatantsBySide('enemy').length, 1)
    assert.strictEqual(state.getAliveCombatantsBySide('party').length, 1)
  })

  it('isAlive returns true for living combatant', () => {
    assert.strictEqual(state.isAlive('bard1'), true)
  })

  it('isAlive returns false for dead combatant', () => {
    assert.strictEqual(state.isAlive('cf2'), false)
  })

  it('isAlive returns false for unknown ID', () => {
    assert.strictEqual(state.isAlive('ghost'), false)
  })

  it('initiativeOrder returns defensive copy', () => {
    const order1 = state.initiativeOrder
    const order2 = state.initiativeOrder
    assert.notStrictEqual(order1, order2)
    assert.deepStrictEqual(order1, order2)
  })

  it('log returns defensive copy', () => {
    const log1 = state.log
    const log2 = state.log
    assert.notStrictEqual(log1, log2)
    assert.deepStrictEqual(log1, log2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// IMMUTABLE UPDATES
// ─────────────────────────────────────────────────────────────────────────────

describe('GameState — withUpdatedCombatant', () => {
  it('returns new state with updated combatant', () => {
    const state = new GameState({ combatants: [makeBard()] })
    const next = state.withUpdatedCombatant('bard1', { currentHP: 20 })

    assert.strictEqual(next.getCombatant('bard1').currentHP, 20)
    assert.strictEqual(state.getCombatant('bard1').currentHP, 45)
  })

  it('accepts a function for changes', () => {
    const state = new GameState({ combatants: [makeBard()] })
    const next = state.withUpdatedCombatant('bard1', c => ({
      currentHP: c.currentHP - 10,
    }))
    assert.strictEqual(next.getCombatant('bard1').currentHP, 35)
  })

  it('preserves other combatants', () => {
    const state = new GameState({ combatants: [makeBard(), makeEnemy()] })
    const next = state.withUpdatedCombatant('bard1', { currentHP: 10 })
    assert.strictEqual(next.getCombatant('enemy1').currentHP, 33)
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

    assert.strictEqual(next.round, 5)
    assert.strictEqual(next.turnIndex, 0)
    assert.deepStrictEqual(next.initiativeOrder, ['bard1'])
    assert.deepStrictEqual(next.log, ['entry1'])
  })

  it('throws for unknown combatant ID', () => {
    const state = new GameState({ combatants: [makeBard()] })
    assert.throws(() => {
      state.withUpdatedCombatant('nobody', { currentHP: 0 })
    }, /Unknown combatant/)
  })
})

describe('GameState — withUpdatedCombatants (batch)', () => {
  it('updates multiple combatants at once', () => {
    const state = new GameState({ combatants: [makeBard(), makeEnemy()] })
    const next = state.withUpdatedCombatants([
      { id: 'bard1', changes: { currentHP: 20 } },
      { id: 'enemy1', changes: { currentHP: 10 } },
    ])

    assert.strictEqual(next.getCombatant('bard1').currentHP, 20)
    assert.strictEqual(next.getCombatant('enemy1').currentHP, 10)
    assert.strictEqual(state.getCombatant('bard1').currentHP, 45)
    assert.strictEqual(state.getCombatant('enemy1').currentHP, 33)
  })

  it('supports function-based changes in batch', () => {
    const state = new GameState({ combatants: [makeBard(), makeEnemy()] })
    const next = state.withUpdatedCombatants([
      { id: 'bard1', changes: c => ({ currentHP: c.currentHP - 5 }) },
      { id: 'enemy1', changes: c => ({ currentHP: c.currentHP - 10 }) },
    ])

    assert.strictEqual(next.getCombatant('bard1').currentHP, 40)
    assert.strictEqual(next.getCombatant('enemy1').currentHP, 23)
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
    assert.strictEqual(next.turnIndex, 1)
    assert.strictEqual(next.round, 1)
  })

  it('wraps around to 0 and increments round', () => {
    const state = new GameState({
      combatants: [makeBard(), makeEnemy()],
      initiativeOrder: ['enemy1', 'bard1'],
      turnIndex: 1,
      round: 1,
    })
    const next = state.withNextTurn()
    assert.strictEqual(next.turnIndex, 0)
    assert.strictEqual(next.round, 2)
  })

  it('original state is unchanged', () => {
    const state = new GameState({
      combatants: [makeBard()],
      initiativeOrder: ['bard1'],
      turnIndex: 0,
      round: 1,
    })
    const next = state.withNextTurn()
    assert.strictEqual(state.turnIndex, 0)
    assert.strictEqual(state.round, 1)
    assert.strictEqual(next.turnIndex, 0)
    assert.strictEqual(next.round, 2)
  })
})

describe('GameState — withLog / withLogEntries', () => {
  it('withLog appends a single entry', () => {
    const state = new GameState({ combatants: [makeCombatant()] })
    const next = state.withLog('Round 1 begins')

    assert.deepStrictEqual(next.log, ['Round 1 begins'])
    assert.deepStrictEqual(state.log, [])
  })

  it('withLogEntries appends multiple entries', () => {
    const state = new GameState({ combatants: [makeCombatant()], log: ['a'] })
    const next = state.withLogEntries(['b', 'c'])

    assert.deepStrictEqual(next.log, ['a', 'b', 'c'])
    assert.deepStrictEqual(state.log, ['a'])
  })
})

describe('GameState — withInitiativeOrder', () => {
  it('sets initiative order and resets turnIndex to 0', () => {
    const state = new GameState({
      combatants: [makeBard(), makeEnemy()],
      turnIndex: 1,
    })
    const next = state.withInitiativeOrder(['enemy1', 'bard1'])

    assert.deepStrictEqual(next.initiativeOrder, ['enemy1', 'bard1'])
    assert.strictEqual(next.turnIndex, 0)
  })

  it('throws if order contains unknown combatant ID', () => {
    const state = new GameState({ combatants: [makeBard()] })
    assert.throws(() => {
      state.withInitiativeOrder(['bard1', 'ghost'])
    }, /unknown combatant/)
  })
})

describe('GameState — withRound', () => {
  it('sets round number explicitly', () => {
    const state = new GameState({ combatants: [makeCombatant()] })
    const next = state.withRound(5)

    assert.strictEqual(next.round, 5)
    assert.strictEqual(state.round, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// IMMUTABILITY GUARANTEES
// ─────────────────────────────────────────────────────────────────────────────

describe('GameState — immutability', () => {
  it('Object.freeze prevents adding properties to state', () => {
    const state = new GameState({ combatants: [makeCombatant()] })
    assert.throws(() => {
      state.newProp = 'oops'
    })
  })

  it('chained updates produce independent snapshots', () => {
    const s0 = new GameState({ combatants: [makeBard()], initiativeOrder: ['bard1'] })
    const s1 = s0.withUpdatedCombatant('bard1', { currentHP: 40 })
    const s2 = s1.withUpdatedCombatant('bard1', { currentHP: 30 })
    const s3 = s0.withUpdatedCombatant('bard1', { currentHP: 20 })

    assert.strictEqual(s0.getCombatant('bard1').currentHP, 45)
    assert.strictEqual(s1.getCombatant('bard1').currentHP, 40)
    assert.strictEqual(s2.getCombatant('bard1').currentHP, 30)
    assert.strictEqual(s3.getCombatant('bard1').currentHP, 20)
  })

  it('withUpdatedCombatant does not mutate other combatant references', () => {
    const state = new GameState({ combatants: [makeBard(), makeEnemy()] })
    const next = state.withUpdatedCombatant('bard1', { currentHP: 10 })

    const origEnemy = state.getCombatant('enemy1')
    const nextEnemy = next.getCombatant('enemy1')
    assert.strictEqual(origEnemy.currentHP, nextEnemy.currentHP)
  })
})
