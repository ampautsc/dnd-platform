/**
 * Scenario Simulation Harness Tests (vitest)
 *
 * Tests the combat simulation harness that:
 *   - Defines 8 encounter scenarios matching evaluate-scenarios.js
 *   - Runs N simulations per scenario using the combat engine
 *   - Aggregates results (win rate, avg rounds, HP remaining, etc.)
 */

import { describe, it, beforeEach, expect } from 'vitest'
import * as dice from '../src/engine/dice.js'
import {
  SCENARIOS,
  MONSTER_PROFILES,
  createScenarioCombatants,
  simulateScenario,
  simulateAllScenarios,
} from '../src/scenarioHarness.js'


// ═══════════════════════════════════════════════════════════════════════════
// MOCK BUILD — replicates a populated Mongoose lean doc
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
// SCENARIO DEFINITION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('SCENARIOS definitions', () => {
  it('has exactly 8 scenarios', () => {
    expect(SCENARIOS.length).toBe(8)
  })

  const expectedIds = [
    'undead-swarm', 'werewolf-pack', 'cult-fanatics', 'dragon-assault',
    'frost-giant-smash', 'lich-encounter', 'archmage-duel', 'mixed-encounter',
  ]

  for (const id of expectedIds) {
    it(`has scenario '${id}'`, () => {
      const s = SCENARIOS.find(s => s.id === id)
      expect(s).toBeTruthy()
      expect(s.name).toBeTruthy()
      expect(s.foes.length).toBeGreaterThan(0)
    })
  }

  it('all foe entries have template, count, and profile', () => {
    for (const scenario of SCENARIOS) {
      for (const foe of scenario.foes) {
        expect(foe.template).toBeTruthy()
        expect(typeof foe.count).toBe('number')
        expect(foe.count).toBeGreaterThan(0)
        expect(foe.profile).toBeTruthy()
      }
    }
  })

  it('all profiles referenced in scenarios are valid AI profiles', () => {
    const validProfiles = new Set(Object.values(MONSTER_PROFILES))
    for (const scenario of SCENARIOS) {
      for (const foe of scenario.foes) {
        expect(validProfiles.has(foe.profile)).toBe(true)
      }
    }
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// COMBATANT CREATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('createScenarioCombatants', () => {
  it('creates bard + correct number of enemies for undead-swarm', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')
    const combatants = createScenarioCombatants(build, scenario)

    // 1 bard + 4 zombie + 4 skeleton + 2 ghoul = 11
    expect(combatants.length).toBe(11)

    const bard = combatants.find(c => c.side === 'party')
    expect(bard).toBeTruthy()
    expect(bard.class).toBe('Lore Bard')

    const enemies = combatants.filter(c => c.side === 'enemy')
    expect(enemies.length).toBe(10)
  })

  it('creates bard + 1 dragon for dragon-assault', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'dragon-assault')
    const combatants = createScenarioCombatants(build, scenario)
    expect(combatants.length).toBe(2) // 1 bard + 1 dragon

    const dragon = combatants.find(c => c.side === 'enemy')
    expect(dragon.breathWeapon).toBeTruthy()
  })

  it('assigns unique IDs to all combatants', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'mixed-encounter')
    const combatants = createScenarioCombatants(build, scenario)

    const ids = combatants.map(c => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('positions enemies on the right side of the battlefield', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')
    const combatants = createScenarioCombatants(build, scenario)

    const bard = combatants.find(c => c.side === 'party')
    const enemies = combatants.filter(c => c.side === 'enemy')

    expect(bard.position.x).toBeLessThan(enemies[0].position.x)
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION TESTS (deterministic with average dice)
// ═══════════════════════════════════════════════════════════════════════════

describe('simulateScenario — single run', () => {
  beforeEach(() => {
    dice.setDiceMode('average')
  })

  it('returns result with expected shape', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')

    const result = simulateScenario(build, scenario, { numRuns: 1, verbose: false })

    expect(result).toBeTruthy()
    expect(result.scenarioId).toBe('undead-swarm')
    expect(result.scenarioName).toBe(scenario.name)
    expect(result.numRuns).toBe(1)
    expect(typeof result.winRate).toBe('number')
    expect(result.winRate).toBeGreaterThanOrEqual(0)
    expect(result.winRate).toBeLessThanOrEqual(1)
    expect(typeof result.avgRounds).toBe('number')
    expect(result.avgRounds).toBeGreaterThan(0)
    expect(typeof result.avgBardHpPct).toBe('number')
    expect(result.avgBardHpPct).toBeGreaterThanOrEqual(0)
    expect(result.avgBardHpPct).toBeLessThanOrEqual(1)
    expect(Array.isArray(result.runs)).toBe(true)
    expect(result.runs.length).toBe(1)
  })

  it('each run has winner, rounds, and analytics', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    const result = simulateScenario(build, scenario, { numRuns: 1, verbose: false })
    const run = result.runs[0]

    expect(run.winner).toBeTruthy()
    expect(run.rounds).toBeGreaterThan(0)
    expect(Array.isArray(run.analytics)).toBe(true)
    expect(run.analytics.length).toBeGreaterThan(0)
  })
})

describe('simulateScenario — aggregation', () => {
  beforeEach(() => {
    dice.setDiceMode('average')
  })

  it('win rate is between 0 and 1', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')

    const result = simulateScenario(build, scenario, { numRuns: 3, verbose: false })
    expect(result.winRate).toBeGreaterThanOrEqual(0)
    expect(result.winRate).toBeLessThanOrEqual(1)
    expect(result.numRuns).toBe(3)
  })

  it('average rounds equals actual rounds for deterministic single run', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'undead-swarm')

    const result = simulateScenario(build, scenario, { numRuns: 1, verbose: false })
    expect(result.avgRounds).toBe(result.runs[0].rounds)
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// FULL SUITE — all 8 scenarios run without crashing
// ═══════════════════════════════════════════════════════════════════════════

describe('simulateAllScenarios — smoke test', () => {
  beforeEach(() => {
    dice.setDiceMode('average')
  })

  it('runs all 8 scenarios and returns aggregated results', () => {
    const build = mockBuild()

    const results = simulateAllScenarios(build, { numRuns: 1, verbose: false })

    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBe(8)

    for (const r of results) {
      expect(r.scenarioId).toBeTruthy()
      expect(r.scenarioName).toBeTruthy()
      expect(typeof r.winRate).toBe('number')
      expect(typeof r.avgRounds).toBe('number')
      expect(typeof r.avgBardHpPct).toBe('number')
    }
  })

  it('returns results keyed by scenario id', () => {
    const build = mockBuild()
    const results = simulateAllScenarios(build, { numRuns: 1, verbose: false })

    const ids = results.map(r => r.scenarioId)
    expect(ids).toContain('undead-swarm')
    expect(ids).toContain('lich-encounter')
    expect(ids).toContain('dragon-assault')
    expect(ids).toContain('mixed-encounter')
  })
})


// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISTIC CONSISTENCY (average dice should give same result twice)
// ═══════════════════════════════════════════════════════════════════════════

describe('simulateScenario — determinism', () => {
  it('average dice mode produces identical results for same scenario', () => {
    const build = mockBuild()
    const scenario = SCENARIOS.find(s => s.id === 'werewolf-pack')

    dice.setDiceMode('average')
    const r1 = simulateScenario(build, scenario, { numRuns: 1, verbose: false })

    dice.setDiceMode('average')
    const r2 = simulateScenario(build, scenario, { numRuns: 1, verbose: false })

    expect(r1.runs[0].winner).toBe(r2.runs[0].winner)
    expect(r1.runs[0].rounds).toBe(r2.runs[0].rounds)
  })
})
