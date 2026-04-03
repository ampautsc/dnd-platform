/**
 * Encounter Runner — unit tests
 * Tests the generic combat loop, initiative, victory conditions,
 * turn processing, and action resolution.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as dice from '../src/engine/dice.js'
import * as mech from '../src/engine/mechanics.js'
import { createCreature } from '@dnd-platform/content/creatures'
import * as runner from '../src/engine/encounterRunner.js'

before(() => dice.setDiceMode('average'))
after(() => dice.setDiceMode('random'))

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function makeBard() {
  return createCreature('gem_dragonborn_lore_bard_8')
}

function makeFanatic(index = 1) {
  return createCreature('cult_fanatic', {
    name: `Cult Fanatic ${index}`,
    id: `cult_fanatic_${index}`,
    position: { x: index * 2, y: 6 },
  })
}

// Simple AI: always attack nearest enemy with weapon
function simpleAttackAI(combatant, allCombatants, round, log) {
  const enemies = allCombatants.filter(c => c.side !== combatant.side && mech.isAlive(c))
  if (enemies.length === 0) return null
  const target = enemies[0]

  if (combatant.multiattack > 0) {
    return {
      reasoning: 'Multiattack nearest enemy',
      action: { type: 'multiattack', target },
    }
  }

  return {
    reasoning: 'Attack nearest enemy',
    action: { type: 'attack', target, weapon: combatant.weapon },
  }
}

// Passive AI: does nothing (for testing turn processing)
function passiveAI() {
  return { reasoning: 'Doing nothing' }
}

// ═══════════════════════════════════════════════════════════════════════════
// rollInitiative
// ═══════════════════════════════════════════════════════════════════════════

describe('rollInitiative', () => {
  it('returns all combatants sorted by total', () => {
    const combatants = [makeBard(), makeFanatic(1), makeFanatic(2)]
    const result = runner.rollInitiative(combatants)
    assert.strictEqual(result.length, 3)
    // In average mode all d20 = 10.5, so sorted by DEX mod
    assert.strictEqual(result.every(r => typeof r.total === 'number'), true)
  })

  it('includes roll, mod, and total', () => {
    const result = runner.rollInitiative([makeBard()])
    assert.strictEqual(result[0].roll, 10.5)
    assert.strictEqual(result[0].mod, 2) // bard DEX mod
    assert.strictEqual(result[0].total, 12.5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// resetTurnState
// ═══════════════════════════════════════════════════════════════════════════

describe('resetTurnState', () => {
  it('resets action/bonus/movement flags', () => {
    const c = makeBard()
    c.usedAction = true
    c.usedBonusAction = true
    c.movementRemaining = 0
    c.reactedThisRound = true

    runner.resetTurnState(c)

    assert.strictEqual(c.usedAction, false)
    assert.strictEqual(c.usedBonusAction, false)
    assert.strictEqual(c.movementRemaining, c.speed)
    assert.strictEqual(c.reactedThisRound, false)
  })

  it('clears vm_disadvantage', () => {
    const c = makeFanatic()
    c.conditions.push('vm_disadvantage')
    runner.resetTurnState(c)
    assert.strictEqual(c.conditions.includes('vm_disadvantage'), false)
  })

  it('clears dodging from previous turn', () => {
    const c = makeBard()
    c.conditions.push('dodging')
    runner.resetTurnState(c)
    assert.strictEqual(c.conditions.includes('dodging'), false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// processStartOfTurn
// ═══════════════════════════════════════════════════════════════════════════

describe('processStartOfTurn', () => {
  it('reduces gem flight duration', () => {
    const bard = makeBard()
    bard.gemFlight.active = true
    bard.gemFlight.roundsRemaining = 2
    bard.flying = true
    const log = []

    runner.processStartOfTurn(bard, [bard], log)
    assert.strictEqual(bard.gemFlight.roundsRemaining, 1)
    assert.strictEqual(bard.flying, true)
  })

  it('ends gem flight when duration expires', () => {
    const bard = makeBard()
    bard.gemFlight.active = true
    bard.gemFlight.roundsRemaining = 1
    bard.flying = true
    const log = []

    runner.processStartOfTurn(bard, [bard], log)
    assert.strictEqual(bard.gemFlight.active, false)
    assert.strictEqual(bard.flying, false)
  })

  it('decrement concentration timer and break when expired', () => {
    const bard = makeBard()
    bard.concentrating = 'Hold Person'
    bard.concentrationRoundsRemaining = 1
    const f1 = makeFanatic(1)
    f1.conditions.push('paralyzed')
    const log = []

    runner.processStartOfTurn(bard, [bard, f1], log)
    assert.strictEqual(bard.concentrating, null)
    assert.strictEqual(f1.conditions.includes('paralyzed'), false)
  })

  it('handles falling when paralyzed and flying', () => {
    const bard = makeBard()
    bard.flying = true
    bard.gemFlight.active = true
    bard.conditions.push('paralyzed')
    const log = []

    runner.processStartOfTurn(bard, [bard], log)
    assert.strictEqual(bard.flying, false)
    assert.strictEqual(bard.conditions.includes('prone'), true)
    // Took falling damage (2d6 average = 7)
    assert.ok(bard.currentHP < 67)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// processEndOfTurnSaves
// ═══════════════════════════════════════════════════════════════════════════

describe('processEndOfTurnSaves', () => {
  it('paralyzed creature gets WIS save vs Hold Person', () => {
    const bard = makeBard()
    bard.concentrating = 'Hold Person'
    bard.spellSaveDC = 15
    const f1 = makeFanatic(1)
    f1.conditions.push('paralyzed')
    const log = []

    // f1 WIS save: 10.5 + 1 = 11.5 < 15 → FAIL, still paralyzed
    runner.processEndOfTurnSaves(f1, [bard, f1], log)
    assert.strictEqual(f1.conditions.includes('paralyzed'), true)
    assert.strictEqual(log.some(l => l.includes('FAIL')), true)
  })

  it('paralyzed creature breaks free on successful save', () => {
    const f1 = makeFanatic(1)
    f1.concentrating = 'Hold Person'
    f1.spellSaveDC = 5  // very low DC
    const bard = makeBard()
    bard.conditions.push('paralyzed')
    const log = []

    // bard WIS save: 10.5 + 1 = 11.5 >= 5 → SUCCESS
    runner.processEndOfTurnSaves(bard, [f1, bard], log)
    assert.strictEqual(bard.conditions.includes('paralyzed'), false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// checkVictory
// ═══════════════════════════════════════════════════════════════════════════

describe('checkVictory', () => {
  it('party wins when all enemies dead', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.currentHP = 0
    const result = runner.checkVictory([bard, f1], 1)
    assert.strictEqual(result.over, true)
    assert.strictEqual(result.winner, 'party')
  })

  it('enemy wins when party dead', () => {
    const bard = makeBard()
    bard.currentHP = 0
    const f1 = makeFanatic(1)
    const result = runner.checkVictory([bard, f1], 1)
    assert.strictEqual(result.over, true)
    assert.strictEqual(result.winner, 'enemy')
  })

  it('combat continues when both sides alive', () => {
    const result = runner.checkVictory([makeBard(), makeFanatic(1)], 1)
    assert.strictEqual(result.over, false)
  })

  it('incapacitation at round 15+ is a stalemate (draw), not a win', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.conditions.push('charmed_hp', 'incapacitated')
    const result = runner.checkVictory([bard, f1], 15)
    assert.strictEqual(result.over, true)
    assert.strictEqual(result.winner, 'draw')
  })

  it('combat continues if enemies incapacitated but < 15 rounds', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.conditions.push('charmed_hp', 'incapacitated')
    const result = runner.checkVictory([bard, f1], 10)
    assert.strictEqual(result.over, false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// resolveWeaponAttack
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveWeaponAttack', () => {
  it('deals damage on hit', () => {
    const f1 = makeFanatic(1)
    const bard = makeBard()
    bard.ac = 10 // make hittable
    // Place within melee range (5ft)
    f1.position = { x: 0, y: 0 }
    bard.position = { x: 1, y: 0 }
    const log = []

    runner.resolveWeaponAttack(f1, { target: bard, weapon: f1.weapon }, [f1, bard], log)
    // Dagger: +4 attack, average 10.5 + 4 = 14.5 vs AC 10 → HIT
    // 1d4 + 2 average = 2.5 + 2 = 4.5
    assert.ok(bard.currentHP < 67)
    assert.strictEqual(f1.attacksMade, 1)
    assert.strictEqual(f1.attacksHit, 1)
  })

  it('misses when total < AC', () => {
    const f1 = makeFanatic(1)
    const bard = makeBard()
    // Dagger +4, average 10.5 + 4 = 14.5 vs AC 20 → MISS
    bard.ac = 20
    // Place within melee range (5ft)
    f1.position = { x: 0, y: 0 }
    bard.position = { x: 1, y: 0 }
    const log = []

    runner.resolveWeaponAttack(f1, { target: bard, weapon: f1.weapon }, [f1, bard], log)
    assert.strictEqual(bard.currentHP, 67)
    assert.strictEqual(f1.attacksHit, 0)
  })

  it('grants advantage when attacker is invisible', () => {
    const bard = makeBard()
    bard.conditions.push('invisible')
    const f1 = makeFanatic(1)
    // Place within melee range
    bard.position = { x: 0, y: 0 }
    f1.position = { x: 1, y: 0 }
    const log = []

    runner.resolveWeaponAttack(bard, { target: f1, weapon: bard.weapon }, [bard, f1], log)
    // In average mode advantage/disadvantage don't change value, but the mechanic is exercised
    assert.strictEqual(bard.attacksMade, 1)
  })

  it('grants advantage and auto-crit vs paralyzed within 5ft', () => {
    const f1 = makeFanatic(1)
    const bard = makeBard()
    bard.conditions.push('paralyzed')
    bard.ac = 10
    // Position them within 5ft
    f1.position = { x: 0, y: 0 }
    bard.position = { x: 1, y: 0 }
    const log = []

    runner.resolveWeaponAttack(f1, { target: bard, weapon: f1.weapon }, [f1, bard], log)
    // Should hit with crit damage (doubled dice)
    assert.strictEqual(log.some(l => l.includes('CRITICAL') || l.includes('HIT')), true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// resolveBreathWeapon
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveBreathWeapon', () => {
  it('deals damage to targets and decrements uses', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    const log = []

    runner.resolveBreathWeapon(bard, { targets: [f1] }, [bard, f1], log)
    // DC 14 DEX save, f1 DEX +2, average 10.5 + 2 = 12.5 < 14 → FAIL, full damage
    // 2d10 average = 11
    assert.strictEqual(f1.currentHP, 33 - 11)
    assert.strictEqual(bard.breathWeapon.uses, 2)
  })

  it('resolves targets from aoeCenter using geometry engine', () => {
    const bard = createCreature('gem_dragonborn_lore_bard_8', { position: { x: 0, y: 0 } })
    const f1 = createCreature('cult_fanatic', { id: 'cf1', name: 'CF1', position: { x: 2, y: 0 } }) // 10ft — within 15ft cone
    const f2 = createCreature('cult_fanatic', { id: 'cf2', name: 'CF2', position: { x: 5, y: 0 } }) // 25ft — outside 15ft cone
    const log = []

    // aoeCenter is caster position (self-origin cone)
    runner.resolveBreathWeapon(bard, { aoeCenter: { x: 0, y: 0 } }, [bard, f1, f2], log)

    assert.strictEqual(bard.breathWeapon.uses, 2)
    // f1 should take damage (within cone), f2 should not (outside cone)
    assert.ok(f1.currentHP < 33)
    assert.strictEqual(f2.currentHP, 33)
  })

  it('falls back to action.targets when no aoeCenter', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    const f2 = makeFanatic(2)
    const log = []

    // Legacy path: explicit targets array
    runner.resolveBreathWeapon(bard, { targets: [f1] }, [bard, f1, f2], log)
    assert.ok(f1.currentHP < 33)
    assert.strictEqual(f2.currentHP, 33)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// resolveShakeAwake
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveShakeAwake', () => {
  it('removes charmed_hp and incapacitated', () => {
    const f1 = makeFanatic(1)
    const f2 = makeFanatic(2)
    f2.conditions.push('charmed_hp', 'incapacitated')
    const log = []

    runner.resolveShakeAwake(f1, { target: f2 }, log)
    assert.deepStrictEqual(f2.conditions, [])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// runEncounter — full integration test
// ═══════════════════════════════════════════════════════════════════════════

describe('runEncounter — party vs enemies with simple AI', () => {
  it('runs a complete encounter and returns a result', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.currentHP = 5 // low HP to end fast

    const result = runner.runEncounter({
      combatants: [bard, f1],
      getDecision: simpleAttackAI,
      maxRounds: 10,
      verbose: false,
    })

    assert.strictEqual(['party', 'enemy', 'draw'].includes(result.winner), true)
    assert.ok(result.rounds >= 1)
    assert.strictEqual(Array.isArray(result.log), true)
    assert.strictEqual(Array.isArray(result.analytics), true)
    assert.strictEqual(result.analytics.length, 2)
  })

  it('party wins when fanatic has 1 HP', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.currentHP = 1

    const result = runner.runEncounter({
      combatants: [bard, f1],
      getDecision: simpleAttackAI,
      maxRounds: 10,
      verbose: false,
    })

    // Crossbow 1d8+2 avg = 6.5, should kill 1 HP target in round 1
    assert.strictEqual(result.winner, 'party')
    assert.strictEqual(result.rounds, 1)
  })

  it('ends as draw after maxRounds if no one dies', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    // Both have high HP and low damage with passive AI

    const result = runner.runEncounter({
      combatants: [bard, f1],
      getDecision: passiveAI,
      maxRounds: 3,
      verbose: false,
    })

    assert.strictEqual(result.winner, 'draw')
    assert.strictEqual(result.rounds, 3)
  })
})

describe('runEncounter — spell casting integration', () => {
  it('bard can cast Hypnotic Pattern via spell decision', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    const f2 = makeFanatic(2)

    function hpAI(combatant, allCombatants, round) {
      if (combatant.side === 'party' && round === 1) {
        const enemies = allCombatants.filter(c => c.side === 'enemy')
        return {
          reasoning: 'Cast HP on all enemies',
          action: { type: 'cast_spell', spell: 'Hypnotic Pattern', level: 3, targets: enemies },
        }
      }
      return passiveAI()
    }

    const result = runner.runEncounter({
      combatants: [bard, f1, f2],
      getDecision: hpAI,
      maxRounds: 12,
      verbose: false,
    })

    // After HP, fanatics should be charmed (though with Dark Devotion advantage, they still fail DC 15)
    // In average mode: 10.5 (adv) + 1 = 11.5 < 15 → both fail
    // Incapacitation is now a stalemate (draw), not a win
    assert.strictEqual(result.winner, 'draw')
  })

  it('bard can cast Hypnotic Pattern with aoeCenter (engine-resolved targets)', () => {
    const bard = makeBard()
    bard.position = { x: 0, y: 0 }
    const f1 = makeFanatic(1)
    f1.position = { x: 5, y: 0 }   // 25ft from origin
    const f2 = makeFanatic(2)
    f2.position = { x: 6, y: 0 }   // 30ft from origin

    function hpAI(combatant, allCombatants, round) {
      if (combatant.side === 'party' && round === 1) {
        return {
          reasoning: 'Cast HP centered on enemies',
          // AI declares intent: spell + center point. Engine resolves WHO is affected.
          action: { type: 'cast_spell', spell: 'Hypnotic Pattern', level: 3, aoeCenter: { x: 5, y: 0 } },
        }
      }
      return passiveAI()
    }

    const result = runner.runEncounter({
      combatants: [bard, f1, f2],
      getDecision: hpAI,
      maxRounds: 12,
      verbose: false,
    })

    // Both fanatics within 15ft (cube half-side) of center (5,0)
    // f1 at (5,0) = 0ft from center, f2 at (6,0) = 5ft from center
    assert.strictEqual(result.winner, 'draw')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// buildAnalytics
// ═══════════════════════════════════════════════════════════════════════════

describe('buildAnalytics', () => {
  it('produces per-combatant stats', () => {
    const bard = makeBard()
    bard.totalDamageDealt = 25
    bard.attacksMade = 5
    bard.attacksHit = 3

    const analytics = runner.buildAnalytics([bard])
    assert.strictEqual(analytics[0].name, bard.name)
    assert.strictEqual(analytics[0].damageDealt, 25)
    assert.strictEqual(analytics[0].hitRate, 60)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// resolveDragonFear
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveDragonFear', () => {
  it('applies frightened condition on failed WIS save', () => {
    const bard = makeBard() // has dragonFear resource
    const f1 = makeFanatic(1)
    // f1 WIS save: 10.5 + 1 = 11.5 < 15 (DC) → FAIL → frightened
    const log = []

    runner.resolveDragonFear(bard, { targets: [f1] }, [bard, f1], log)
    assert.strictEqual(f1.conditions.includes('frightened'), true)
    assert.strictEqual(bard.dragonFear.uses, 0)
    assert.strictEqual(log.some(l => l.includes('FRIGHTENED')), true)
  })

  it('does not apply frightened when target succeeds WIS save', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.saves.wis = 20 // guaranteed success
    const log = []

    runner.resolveDragonFear(bard, { targets: [f1] }, [bard, f1], log)
    assert.strictEqual(f1.conditions.includes('frightened'), false)
    assert.strictEqual(log.some(l => l.includes('SUCCESS')), true)
  })

  it('skips targets already frightened', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.conditions.push('frightened')
    const log = []

    runner.resolveDragonFear(bard, { targets: [f1] }, [bard, f1], log)
    // Still 1 'frightened' condition, not doubled
    assert.strictEqual(f1.conditions.filter(c => c === 'frightened').length, 1)
    assert.strictEqual(log.some(l => l.includes('Already frightened')), true)
  })

  it('skips targets immune to frightened', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.immunities = { conditions: ['frightened'] }
    const log = []

    runner.resolveDragonFear(bard, { targets: [f1] }, [bard, f1], log)
    assert.strictEqual(f1.conditions.includes('frightened'), false)
    assert.strictEqual(log.some(l => l.includes('Immune')), true)
  })

  it('does nothing when no Dragon Fear uses remain', () => {
    const bard = makeBard()
    bard.dragonFear.uses = 0
    const f1 = makeFanatic(1)
    const log = []

    runner.resolveDragonFear(bard, { targets: [f1] }, [bard, f1], log)
    assert.strictEqual(f1.conditions.includes('frightened'), false)
    assert.strictEqual(log.some(l => l.includes('no uses remaining')), true)
  })

  it('resolves targets from aoeCenter using geometry engine', () => {
    const bard = createCreature('gem_dragonborn_lore_bard_8', { position: { x: 0, y: 0 } })
    const f1 = createCreature('cult_fanatic', { id: 'cf1', name: 'CF1', position: { x: 4, y: 0 } }) // 20ft — within 30ft cone
    const f2 = createCreature('cult_fanatic', { id: 'cf2', name: 'CF2', position: { x: 8, y: 0 } }) // 40ft — outside 30ft cone
    const log = []

    runner.resolveDragonFear(bard, { aoeCenter: { x: 0, y: 0 } }, [bard, f1, f2], log)

    assert.strictEqual(bard.dragonFear.uses, 0)
    // f1 within 30ft cone — should be targeted (frightened on fail)
    assert.strictEqual(f1.conditions.includes('frightened'), true)
    // f2 outside 30ft cone — should NOT be targeted
    assert.strictEqual(f2.conditions.includes('frightened'), false)
  })

  it('engine-resolved targeting skips flying creature for 15ft breath cone', () => {
    const bard = createCreature('gem_dragonborn_lore_bard_8', { position: { x: 0, y: 0 } })
    const f1 = createCreature('cult_fanatic', { id: 'cf1', name: 'CF1', position: { x: 2, y: 0 } }) // 10ft, grounded
    const f2 = createCreature('cult_fanatic', { id: 'cf2', name: 'CF2', position: { x: 2, y: 0 } }) // same pos, flying
    f2.flying = true
    const log = []

    // Breath weapon uses 15ft cone — can't reach 30ft altitude
    runner.resolveBreathWeapon(bard, { aoeCenter: { x: 0, y: 0 } }, [bard, f1, f2], log)
    assert.ok(f1.currentHP < 33)
    assert.strictEqual(f2.currentHP, 33)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// processEndOfTurnSaves — Dragon Fear frightened repeat save
// ═══════════════════════════════════════════════════════════════════════════

describe('processEndOfTurnSaves — Dragon Fear frightened', () => {
  it('frightened creature makes WIS save at end of turn', () => {
    const bard = makeBard() // has dragonFear with dc: 15
    const f1 = makeFanatic(1)
    f1.conditions.push('frightened')
    const log = []

    // f1 WIS save: 10.5 + 1 = 11.5 < 15 → FAIL → stays frightened
    runner.processEndOfTurnSaves(f1, [bard, f1], log)
    assert.strictEqual(f1.conditions.includes('frightened'), true)
    assert.strictEqual(log.some(l => l.includes('Dragon Fear')), true)
  })

  it('frightened creature breaks free on successful save', () => {
    const bard = makeBard()
    bard.dragonFear.dc = 5 // very low DC
    const f1 = makeFanatic(1)
    f1.conditions.push('frightened')
    const log = []

    // f1 WIS save: 10.5 + 1 = 11.5 >= 5 → SUCCESS
    runner.processEndOfTurnSaves(f1, [bard, f1], log)
    assert.strictEqual(f1.conditions.includes('frightened'), false)
    assert.strictEqual(log.some(l => l.includes('no longer frightened')), true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// runEncounter — positionSnapshots tracking
// ═══════════════════════════════════════════════════════════════════════════

describe('runEncounter — positionSnapshots', () => {
  it('includes positionSnapshots in result', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.currentHP = 1 // dies in round 1

    const result = runner.runEncounter({
      combatants: [bard, f1],
      getDecision: simpleAttackAI,
      maxRounds: 5,
      verbose: false,
    })

    assert.strictEqual(Array.isArray(result.positionSnapshots), true)
    assert.ok(result.positionSnapshots.length >= 2) // start + at least 1 round end
  })

  it('initial snapshot has round 0 and all combatants', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.currentHP = 1

    const result = runner.runEncounter({
      combatants: [bard, f1],
      getDecision: simpleAttackAI,
      maxRounds: 5,
      verbose: false,
    })

    const startSnap = result.positionSnapshots[0]
    assert.strictEqual(startSnap.round, 0)
    assert.strictEqual(startSnap.phase, 'start')
    assert.strictEqual(startSnap.combatants.length, 2)
  })

  it('snapshots include HP, conditions, and position', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    f1.currentHP = 1

    const result = runner.runEncounter({
      combatants: [bard, f1],
      getDecision: simpleAttackAI,
      maxRounds: 5,
      verbose: false,
    })

    const snap = result.positionSnapshots[0]
    const bardSnap = snap.combatants.find(c => c.side === 'party')
    assert.strictEqual(typeof bardSnap.currentHP, 'number')
    assert.strictEqual(typeof bardSnap.maxHP, 'number')
    assert.strictEqual(Array.isArray(bardSnap.conditions), true)
    assert.strictEqual(typeof bardSnap.position, 'object')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// BUG FIX: Incapacitated creatures get end-of-turn saves
// ═══════════════════════════════════════════════════════════════════════════

describe('runEncounter — incapacitated creatures get end-of-turn saves', () => {
  it('paralyzed bard gets WIS save at end of each turn', () => {
    const bard = makeBard()
    bard.conditions.push('paralyzed')
    bard.position = { x: 0, y: 0 }

    // Fanatic is concentrating on Hold Person
    const f1 = makeFanatic(1)
    f1.concentrating = 'Hold Person'
    f1.spellSaveDC = 1 // very low DC so bard breaks free easily
    f1.position = { x: 1, y: 0 }

    const result = runner.runEncounter({
      combatants: [bard, f1],
      getDecision: simpleAttackAI,
      maxRounds: 5,
      verbose: false,
    })

    // Bard should have broken free via end-of-turn save (DC 1, average roll is 10.5)
    const logText = result.log.join('\n')
    assert.ok(logText.includes('WIS save vs Hold Person'))
    assert.ok(logText.includes('SUCCESS'))
    assert.strictEqual(bard.conditions.includes('paralyzed'), false)
  })

  it('incapacitated creature turn is skipped but saves still happen', () => {
    const bard = makeBard()
    bard.conditions.push('paralyzed')
    bard.position = { x: 0, y: 0 }

    const f1 = makeFanatic(1)
    f1.concentrating = 'Hold Person'
    f1.spellSaveDC = 99 // impossibly high DC so bard stays paralyzed
    f1.position = { x: 1, y: 0 }

    const result = runner.runEncounter({
      combatants: [bard, f1],
      getDecision: simpleAttackAI,
      maxRounds: 3,
      verbose: false,
    })

    const logText = result.log.join('\n')
    assert.ok(logText.includes('is incapacitated'))
    assert.ok(logText.includes('WIS save vs Hold Person'))
    assert.ok(logText.includes('FAIL'))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// BUG FIX: Weapon range enforcement
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveWeaponAttack — range enforcement', () => {
  it('blocks melee attack when target is out of range', () => {
    const f1 = makeFanatic(1)
    const bard = makeBard()
    bard.ac = 10
    // Place 30ft apart (6 squares)
    f1.position = { x: 0, y: 0 }
    bard.position = { x: 6, y: 0 }
    const log = []

    const hpBefore = bard.currentHP
    runner.resolveWeaponAttack(f1, { target: bard, weapon: f1.weapon }, [f1, bard], log)
    assert.strictEqual(bard.currentHP, hpBefore)
    assert.strictEqual(log.some(l => l.includes("can't reach")), true)
  })

  it('allows melee attack when target is within 5ft', () => {
    const f1 = makeFanatic(1)
    const bard = makeBard()
    bard.ac = 10
    f1.position = { x: 0, y: 0 }
    bard.position = { x: 1, y: 0 } // 5ft
    const log = []

    runner.resolveWeaponAttack(f1, { target: bard, weapon: f1.weapon }, [f1, bard], log)
    assert.ok(bard.currentHP < 67)
  })

  it('allows ranged attack at distance using weapon range', () => {
    const bard = makeBard()
    const f1 = makeFanatic(1)
    // Give bard a ranged weapon
    const crossbow = { name: 'Light Crossbow', attackBonus: 5, damageDice: '1d8', damageBonus: 2, range: 80, type: 'ranged' }
    bard.position = { x: 0, y: 0 }
    f1.position = { x: 10, y: 0 } // 50ft
    f1.ac = 5 // make hittable
    const log = []

    runner.resolveWeaponAttack(bard, { target: f1, weapon: crossbow }, [bard, f1], log)
    assert.ok(f1.currentHP < f1.maxHP)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// BUG FIX: Movement uses creature speed
// ═══════════════════════════════════════════════════════════════════════════

describe('runEncounter — movement uses creature speed', () => {
  it('creature moves more than 1 square per turn', () => {
    const bard = makeBard()
    bard.position = { x: 0, y: 0 }
    bard.speed = 30 // 6 squares

    const f1 = makeFanatic(1)
    f1.position = { x: 10, y: 0 } // 50ft away
    f1.currentHP = 1

    // AI that always moves toward and attacks
    function moveAndAttackAI(combatant, allCombatants) {
      const enemies = allCombatants.filter(c => c.side !== combatant.side && mech.isAlive(c))
      if (enemies.length === 0) return null
      return {
        reasoning: 'Move and attack',
        movement: { type: 'move_toward', target: enemies[0] },
        action: { type: 'attack', target: enemies[0], weapon: combatant.weapon },
      }
    }

    const result = runner.runEncounter({
      combatants: [bard, f1],
      getDecision: moveAndAttackAI,
      maxRounds: 1,
      verbose: false,
    })

    // After one round, bard should have moved 6 squares (speed 30 / 5 = 6), not just 1
    assert.ok(bard.position.x >= 6)
  })
})
