/**
 * Target Resolver — unit tests
 * Tests AoE target resolution: basic shapes, friendly fire, flying, edge cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAoETargets } from '../src/engine/targetResolver.js'

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function makeCombatant(overrides = {}) {
  return {
    name: overrides.name || 'Combatant',
    side: overrides.side || 'enemy',
    currentHP: overrides.currentHP ?? 20,
    maxHP: overrides.maxHP ?? 20,
    conditions: overrides.conditions || [],
    position: overrides.position || { x: 0, y: 0 },
    immuneCharmed: overrides.immuneCharmed || false,
    ...overrides,
  }
}

function makeCaster(overrides = {}) {
  return makeCombatant({ name: 'Caster', side: 'party', position: { x: 0, y: 0 }, ...overrides })
}

// ═══════════════════════════════════════════════════════════════════════════
// Basic target resolution
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveAoETargets — basic target resolution', () => {
  const cubeSpell = {
    name: 'Hypnotic Pattern',
    range: 120,
    targeting: { type: 'area', shape: 'cube', size: 30 },
  }

  it('returns enemies within the AoE', () => {
    const caster = makeCaster()
    const e1 = makeCombatant({ name: 'E1', position: { x: 10, y: 0 } })
    const e2 = makeCombatant({ name: 'E2', position: { x: 11, y: 0 } })
    const aoeCenter = { x: 10, y: 0 }

    const targets = resolveAoETargets(caster, cubeSpell, aoeCenter, [caster, e1, e2])
    assert.strictEqual(targets.length, 2)
    assert.ok(targets.includes(e1))
    assert.ok(targets.includes(e2))
  })

  it('excludes enemies outside the AoE radius', () => {
    const caster = makeCaster()
    const e1 = makeCombatant({ name: 'E1', position: { x: 10, y: 0 } })
    const e2 = makeCombatant({ name: 'Far', position: { x: 20, y: 0 } })
    const aoeCenter = { x: 10, y: 0 }

    const targets = resolveAoETargets(caster, cubeSpell, aoeCenter, [caster, e1, e2])
    assert.strictEqual(targets.length, 1)
    assert.ok(targets.includes(e1))
  })

  it('excludes the caster from AoE targets', () => {
    const caster = makeCaster({ position: { x: 10, y: 0 } })
    const e1 = makeCombatant({ name: 'E1', position: { x: 10, y: 0 } })
    const aoeCenter = { x: 10, y: 0 }

    const targets = resolveAoETargets(caster, cubeSpell, aoeCenter, [caster, e1])
    assert.strictEqual(targets.length, 1)
    assert.ok(targets.includes(e1))
    assert.ok(!targets.includes(caster))
  })

  it('excludes dead combatants', () => {
    const caster = makeCaster()
    const dead = makeCombatant({ name: 'Dead', position: { x: 10, y: 0 }, currentHP: 0 })
    const alive = makeCombatant({ name: 'Alive', position: { x: 10, y: 0 } })
    const aoeCenter = { x: 10, y: 0 }

    const targets = resolveAoETargets(caster, cubeSpell, aoeCenter, [caster, dead, alive])
    assert.strictEqual(targets.length, 1)
    assert.ok(targets.includes(alive))
  })

  it('returns empty array when no combatants in range', () => {
    const caster = makeCaster()
    const far = makeCombatant({ name: 'Far', position: { x: 50, y: 50 } })
    const aoeCenter = { x: 10, y: 0 }

    assert.strictEqual(resolveAoETargets(caster, cubeSpell, aoeCenter, [caster, far]).length, 0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Sphere (Fireball)
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveAoETargets — sphere (Fireball)', () => {
  const fireball = {
    name: 'Fireball',
    range: 150,
    targeting: { type: 'area', shape: 'sphere', radius: 20 },
  }

  it('includes enemies within 20ft sphere', () => {
    const caster = makeCaster()
    const e1 = makeCombatant({ name: 'E1', position: { x: 10, y: 0 } })
    const e2 = makeCombatant({ name: 'E2', position: { x: 14, y: 0 } })
    const e3 = makeCombatant({ name: 'Far', position: { x: 15, y: 0 } })
    const aoeCenter = { x: 10, y: 0 }

    const targets = resolveAoETargets(caster, fireball, aoeCenter, [caster, e1, e2, e3])
    assert.strictEqual(targets.length, 2)
    assert.ok(targets.includes(e1))
    assert.ok(targets.includes(e2))
    assert.ok(!targets.includes(e3))
  })

  it('can include allies in the AoE (friendly fire)', () => {
    const caster = makeCaster()
    const ally = makeCombatant({ name: 'Ally', side: 'party', position: { x: 10, y: 0 } })
    const enemy = makeCombatant({ name: 'E1', position: { x: 10, y: 0 } })
    const aoeCenter = { x: 10, y: 0 }
    const all = [caster, ally, enemy]

    // Default: excludeFriendly true — allies excluded
    const targets = resolveAoETargets(caster, fireball, aoeCenter, all)
    assert.ok(!targets.includes(ally))

    // With excludeFriendly false, allies included
    const allTargets = resolveAoETargets(caster, fireball, aoeCenter, all, { excludeFriendly: false })
    assert.ok(allTargets.includes(ally))
    assert.ok(allTargets.includes(enemy))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Cone (Cone of Cold)
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveAoETargets — cone (Cone of Cold)', () => {
  const coneOfCold = {
    name: 'Cone of Cold',
    range: 0,
    targeting: { type: 'area', shape: 'cone', length: 60 },
  }

  it('includes enemies within cone length from caster', () => {
    const caster = makeCaster({ position: { x: 0, y: 0 } })
    const close = makeCombatant({ name: 'Close', position: { x: 5, y: 0 } })
    const edge = makeCombatant({ name: 'Edge', position: { x: 12, y: 0 } })
    const far = makeCombatant({ name: 'Far', position: { x: 13, y: 0 } })
    const aoeCenter = { x: 0, y: 0 }

    const targets = resolveAoETargets(caster, coneOfCold, aoeCenter, [caster, close, edge, far])
    assert.strictEqual(targets.length, 2)
    assert.ok(targets.includes(close))
    assert.ok(targets.includes(edge))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Cylinder (Ice Storm)
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveAoETargets — cylinder (Ice Storm)', () => {
  const iceStorm = {
    name: 'Ice Storm',
    range: 300,
    targeting: { type: 'area', shape: 'cylinder', radius: 20, height: 40 },
  }

  it('includes enemies within cylinder radius', () => {
    const caster = makeCaster()
    const near = makeCombatant({ name: 'Near', position: { x: 10, y: 0 } })
    const edge = makeCombatant({ name: 'Edge', position: { x: 14, y: 0 } })
    const out = makeCombatant({ name: 'Out', position: { x: 15, y: 0 } })
    const aoeCenter = { x: 10, y: 0 }

    const targets = resolveAoETargets(caster, iceStorm, aoeCenter, [caster, near, edge, out])
    assert.strictEqual(targets.length, 2)
    assert.ok(targets.includes(near))
    assert.ok(targets.includes(edge))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveAoETargets — edge cases', () => {
  const cubeSpell = {
    name: 'Hypnotic Pattern',
    range: 120,
    targeting: { type: 'area', shape: 'cube', size: 30 },
  }

  it('handles combatants with missing position', () => {
    const caster = makeCaster()
    const noPos = makeCombatant({ name: 'NoPos' })
    delete noPos.position
    const aoeCenter = { x: 0, y: 0 }

    // Should not throw — defaults to (0,0)
    const targets = resolveAoETargets(caster, cubeSpell, aoeCenter, [caster, noPos])
    assert.ok(targets.length >= 0)
  })

  it('returns empty for wall-type spells (no auto-targeting)', () => {
    const wallSpell = {
      name: 'Wall of Force',
      range: 120,
      targeting: { type: 'area', shape: 'wall' },
    }
    const caster = makeCaster()
    const e1 = makeCombatant({ name: 'E1', position: { x: 5, y: 0 } })

    assert.strictEqual(resolveAoETargets(caster, wallSpell, { x: 5, y: 0 }, [caster, e1]).length, 0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Flying creatures
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveAoETargets — flying creatures', () => {
  it('Hypnotic Pattern (30ft cube) does NOT hit flying creature at same position', () => {
    const hp = {
      name: 'Hypnotic Pattern',
      range: 120,
      targeting: { type: 'area', shape: 'cube', size: 30 },
    }
    const caster = makeCaster()
    const flyingEnemy = makeCombatant({ name: 'FlyingEnemy', position: { x: 10, y: 0 }, flying: true })
    const groundEnemy = makeCombatant({ name: 'GroundEnemy', position: { x: 10, y: 0 } })

    const targets = resolveAoETargets(caster, hp, { x: 10, y: 0 }, [caster, flyingEnemy, groundEnemy])
    assert.ok(!targets.includes(flyingEnemy))
    assert.ok(targets.includes(groundEnemy))
  })

  it('Fireball (20ft sphere) does NOT hit flying creature', () => {
    const fb = {
      name: 'Fireball',
      range: 150,
      targeting: { type: 'area', shape: 'sphere', radius: 20 },
    }
    const caster = makeCaster()
    const flyingEnemy = makeCombatant({ name: 'FlyingEnemy', position: { x: 10, y: 0 }, flying: true })

    assert.strictEqual(resolveAoETargets(caster, fb, { x: 10, y: 0 }, [caster, flyingEnemy]).length, 0)
  })

  it('Cone of Cold (60ft cone) CAN hit flying creature', () => {
    const coc = {
      name: 'Cone of Cold',
      range: 0,
      targeting: { type: 'area', shape: 'cone', length: 60 },
    }
    const caster = makeCaster({ position: { x: 0, y: 0 } })
    const flyingEnemy = makeCombatant({ name: 'FlyingEnemy', position: { x: 8, y: 0 }, flying: true })

    const targets = resolveAoETargets(caster, coc, { x: 0, y: 0 }, [caster, flyingEnemy])
    assert.ok(targets.includes(flyingEnemy))
  })

  it('Ice Storm (cylinder 20r/40h) CAN hit flying creature within radius', () => {
    const is = {
      name: 'Ice Storm',
      range: 300,
      targeting: { type: 'area', shape: 'cylinder', radius: 20, height: 40 },
    }
    const caster = makeCaster()
    const flyingEnemy = makeCombatant({ name: 'FlyingEnemy', position: { x: 10, y: 0 }, flying: true })

    const targets = resolveAoETargets(caster, is, { x: 10, y: 0 }, [caster, flyingEnemy])
    assert.ok(targets.includes(flyingEnemy))
  })

  it('grounded creature is still hit normally even when others fly', () => {
    const fb = {
      name: 'Fireball',
      range: 150,
      targeting: { type: 'area', shape: 'sphere', radius: 20 },
    }
    const caster = makeCaster()
    const flyer = makeCombatant({ name: 'Flyer', position: { x: 10, y: 0 }, flying: true })
    const ground = makeCombatant({ name: 'Ground', position: { x: 10, y: 0 } })

    const targets = resolveAoETargets(caster, fb, { x: 10, y: 0 }, [caster, flyer, ground])
    assert.ok(!targets.includes(flyer))
    assert.ok(targets.includes(ground))
  })
})
