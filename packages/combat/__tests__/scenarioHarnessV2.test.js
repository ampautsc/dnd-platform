/**
 * Scenario Simulation Harness V2 — Integration Tests (vitest)
 *
 * Verifies that the v2 harness (immutable zero-trust engine):
 *   1. Produces results in the same shape as the v1 harness
 *   2. Uses GameState + v2 EncounterRunner + TacticsAdapter
 *   3. All simulations complete without errors
 *   4. Result values are within valid ranges
 *   5. Runs all 8 scenarios with a real build
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as dice from '../src/engine/dice.js'
import {
  SCENARIOS,
  MONSTER_PROFILES,
  createScenarioState,
  simulateScenario,
  simulateAllScenarios,
} from '../src/scenarioHarnessV2.js'
import { GameState } from '../src/engine-v2/GameState.js'
import {
  SCENARIOS as V1_SCENARIOS,
  MONSTER_PROFILES as V1_MONSTER_PROFILES,
} from '../src/scenarioHarness.js'


// ═══════════════════════════════════════════════════════════════════════════
// MOCK BUILD — same as v1 harness tests for apples-to-apples comparison
// ═══════════════════════════════════════════════════════════════════════════

function mockBuild() {
  return {
    _id: 'build-test-iron',
    name: 'Gem Dragonborn — Iron Concentration',
    level: 8,
    baseStats: { str: 8, dex: 14, con: 14, int: 8, wis: 12, cha: 16 },
    speciesAsi: [
      { stat: 'CHA', bonus: 2 },
      { stat: 'CON', bonus: 1 },
    ],
    species: {
      name: 'Gem Dragonborn',
      creatureType: 'Humanoid',
      size: ['Medium'],
      speed: { walk: 30 },
      hasFlight: true,
      darkvision: 60,
      resistances: [],
      conditionImmunities: [],
      naturalArmorAC: null,
      traitList: [
        { name: 'Gem Ancestry', description: 'Force damage type.' },
        { name: 'Breath Weapon', description: '15ft cone, 2d8 force, DEX save.' },
        { name: 'Draconic Resistance', description: 'Resistance to force damage.' },
        { name: 'Psionic Mind', description: 'Telepathy 30ft.' },
        { name: 'Gem Flight', description: 'PB/long rest, 1 minute.' },
      ],
    },
    levelChoices: [
      {
        level: 4, type: 'feat',
        feat: {
          name: 'War Caster', isHalfFeat: false,
          grantsAdvConSaves: true, grantsProfConSaves: false,
          grantsArmorProficiency: null, bonusSpells: [],
        },
        halfFeatStat: null,
      },
      {
        level: 8, type: 'feat',
        feat: {
          name: 'Resilient (CON)', isHalfFeat: true,
          grantsAdvConSaves: false, grantsProfConSaves: true,
          grantsArmorProficiency: null, bonusSpells: [],
        },
        halfFeatStat: 'CON',
      },
    ],
    items: [
      { name: 'Bracers of Defense', acBonus: 2, saveBonus: 0, spellDcBonus: 0, spellAttackBonus: 0, requiresNoArmor: true, imposesCharmDisadvantage: false },
      { name: 'Cloak of Protection', acBonus: 1, saveBonus: 1, spellDcBonus: 0, spellAttackBonus: 0, requiresNoArmor: false, imposesCharmDisadvantage: false },
    ],
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// STATE CREATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('createScenarioState — v2', () => {
  it('returns a GameState + profileMap', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')
    const { state, profileMap } = createScenarioState(build, scenario)

    assert.ok(state instanceof GameState)
    assert.strictEqual(typeof profileMap, 'object')
  })

  it('GameState has correct number of combatants for undead-swarm', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')
    const { state } = createScenarioState(build, scenario)

    // 1 bard + 4 zombie + 4 skeleton + 2 ghoul = 11
    assert.strictEqual(state.combatantCount, 11)
  })

  it('bard is party side, enemies are enemy side', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'dragon-assault')
    const { state } = createScenarioState(build, scenario)

    const bard = state.getCombatant('bard-0')
    assert.ok(bard)
    assert.strictEqual(bard.side, 'party')

    const all = state.getAllCombatants()
    const enemies = all.filter(c => c.side === 'enemy')
    assert.strictEqual(enemies.length, 1)
    assert.strictEqual(enemies[0].id.startsWith('young_red_dragon'), true)
  })

  it('profileMap maps bard to lore_bard', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'dragon-assault')
    const { profileMap } = createScenarioState(build, scenario)

    assert.strictEqual(profileMap['bard-0'], 'lore_bard')
  })

  it('profileMap maps every enemy to a valid profile', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'mixed-encounter')
    const { state, profileMap } = createScenarioState(build, scenario)

    const enemies = state.getAllCombatants().filter(c => c.side === 'enemy')
    for (const enemy of enemies) {
      assert.ok(profileMap[enemy.id])
    }
  })

  it('all combatant IDs are unique', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'mixed-encounter')
    const { state } = createScenarioState(build, scenario)

    const all = state.getAllCombatants()
    const ids = all.map(c => c.id)
    const unique = new Set(ids)
    assert.strictEqual(unique.size, ids.length)
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION RESULT SHAPE — must match v1 harness format
// ═══════════════════════════════════════════════════════════════════════════

describe('simulateScenario v2 — result shape', () => {
  beforeEach(() => {
    dice.setDiceMode('average')
  })

  it('returns result with expected shape', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')

    const result = simulateScenario(build, scenario, { numRuns: 1 })

    assert.ok(result)
    assert.strictEqual(result.scenarioId, 'undead-swarm')
    assert.strictEqual(result.scenarioName, scenario.name)
    assert.strictEqual(result.numRuns, 1)
    assert.strictEqual(typeof result.winRate, 'number')
    assert.strictEqual(typeof result.avgRounds, 'number')
    assert.strictEqual(typeof result.avgBardHpPct, 'number')
    assert.strictEqual(Array.isArray(result.runs), true)
    assert.strictEqual(result.runs.length, 1)
  })

  it('each run has winner, rounds, bardHpPct, analytics', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 1 })
    const run = result.runs[0]

    assert.ok(['party', 'enemy', 'draw'].includes(run.winner))
    assert.strictEqual(typeof run.rounds, 'number')
    assert.ok(run.rounds >= 1)
    assert.ok(run.rounds <= 20)
    assert.strictEqual(typeof run.bardHpPct, 'number')
    assert.ok(run.bardHpPct >= 0)
    assert.ok(run.bardHpPct <= 1)
    assert.strictEqual(Array.isArray(run.analytics), true)
    assert.ok(run.analytics.length > 0)
  })

  it('analytics entries have expected fields', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 1 })
    const analytic = result.runs[0].analytics[0]

    assert.strictEqual(typeof analytic.id, 'string')
    assert.strictEqual(typeof analytic.name, 'string')
    assert.strictEqual(typeof analytic.side, 'string')
    assert.strictEqual(typeof analytic.survived, 'boolean')
    assert.strictEqual(typeof analytic.finalHP, 'number')
    assert.strictEqual(typeof analytic.maxHP, 'number')
    assert.strictEqual(typeof analytic.damageDealt, 'number')
    assert.strictEqual(typeof analytic.attacksMade, 'number')
    assert.strictEqual(typeof analytic.hitRate, 'number')
    assert.strictEqual(typeof analytic.spellsCast, 'number')
  })

  it('first N runs include combat log and positionSnapshots', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 3, logRuns: 2 })

    // First 2 runs should have logs
    assert.strictEqual(Array.isArray(result.runs[0].log), true)
    assert.ok(result.runs[0].log.length > 0)
    assert.strictEqual(Array.isArray(result.runs[0].positionSnapshots), true)

    assert.strictEqual(Array.isArray(result.runs[1].log), true)

    // Third run should NOT have log
    assert.strictEqual(result.runs[2].log, undefined)
  })

  it('winRate is between 0 and 1', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 3 })
    assert.ok(result.winRate >= 0)
    assert.ok(result.winRate <= 1)
  })

  it('bardHpPct is between 0 and 1', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 3 })
    assert.ok(result.avgBardHpPct >= 0)
    assert.ok(result.avgBardHpPct <= 1)
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// FULL SIMULATION — ALL 8 SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

describe('simulateAllScenarios v2 — all 8 scenarios', () => {
  beforeEach(() => {
    dice.setDiceMode('average')
  })

  it('runs all 8 scenarios and returns valid results', () => {
    const build = mockBuild()
    const results = simulateAllScenarios(build, { numRuns: 1 })

    assert.strictEqual(results.length, 8)

    const expectedIds = [
      'undead-swarm', 'werewolf-pack', 'cult-fanatics', 'dragon-assault',
      'frost-giant-smash', 'lich-encounter', 'archmage-duel', 'mixed-encounter',
    ]

    for (const id of expectedIds) {
      const r = results.find(r => r.scenarioId === id)
      assert.ok(r)
      assert.strictEqual(r.numRuns, 1)
      assert.strictEqual(r.runs.length, 1)
    }
  })

  it('each scenario produces a winner (no crashes)', () => {
    const build = mockBuild()
    const results = simulateAllScenarios(build, { numRuns: 1 })

    for (const r of results) {
      const run = r.runs[0]
      assert.ok(['party', 'enemy', 'draw'].includes(run.winner))
    }
  })

  it('encounters run within round limits', () => {
    const build = mockBuild()
    const results = simulateAllScenarios(build, { numRuns: 1 })

    for (const r of results) {
      const run = r.runs[0]
      assert.ok(run.rounds >= 1)
      assert.ok(run.rounds <= 20)
    }
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// CONSISTENCY — V2 USES SAME SCENARIOS AS V1
// ═══════════════════════════════════════════════════════════════════════════

describe('v2 harness — scenario consistency', () => {
  it('uses the same SCENARIOS as v1 harness', () => {
    assert.strictEqual(SCENARIOS, V1_SCENARIOS)
  })

  it('uses the same MONSTER_PROFILES as v1 harness', () => {
    assert.strictEqual(MONSTER_PROFILES, V1_MONSTER_PROFILES)
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// MULTIPLE RUNS — AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════

describe('simulateScenario v2 — multiple runs aggregation', () => {
  beforeEach(() => {
    dice.setDiceMode('average')
  })

  it('aggregates correctly across multiple runs', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')

    const result = simulateScenario(build, scenario, { numRuns: 5 })

    assert.strictEqual(result.numRuns, 5)
    assert.strictEqual(result.runs.length, 5)

    // With average dice all runs should produce identical results
    const winners = new Set(result.runs.map(r => r.winner))
    assert.strictEqual(winners.size, 1)
  })

  it('avgRounds is the mean of all runs', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 3 })

    const manualAvg = result.runs.reduce((s, r) => s + r.rounds, 0) / result.runs.length
    assert.ok(Math.abs(result.avgRounds - manualAvg) < 0.2)
  })
})
