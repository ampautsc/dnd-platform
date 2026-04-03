/**
 * AoE Geometry — unit tests
 * Pure geometry module: shapes, distances, cone arcs, flying altitude.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as geo from '../src/engine/aoeGeometry.js'

// ═══════════════════════════════════════════════════════════════════════════
// getEffectiveRadius
// ═══════════════════════════════════════════════════════════════════════════

describe('getEffectiveRadius', () => {
  it('returns half the side length for a cube', () => {
    assert.strictEqual(geo.getEffectiveRadius({ shape: 'cube', size: 30 }), 15)
  })

  it('returns the radius for a sphere', () => {
    assert.strictEqual(geo.getEffectiveRadius({ shape: 'sphere', radius: 20 }), 20)
  })

  it('returns the length for a cone', () => {
    assert.strictEqual(geo.getEffectiveRadius({ shape: 'cone', length: 60 }), 60)
  })

  it('returns the radius for a cylinder', () => {
    assert.strictEqual(geo.getEffectiveRadius({ shape: 'cylinder', radius: 20, height: 40 }), 20)
  })

  it('returns 0 for a wall', () => {
    assert.strictEqual(geo.getEffectiveRadius({ shape: 'wall' }), 0)
  })

  it('returns 0 for unknown shape', () => {
    assert.strictEqual(geo.getEffectiveRadius({ shape: 'hexagon' }), 0)
  })

  it('returns 0 for null/undefined', () => {
    assert.strictEqual(geo.getEffectiveRadius(null), 0)
    assert.strictEqual(geo.getEffectiveRadius(undefined), 0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// isInAoE — point within AoE centered at a given location
// ═══════════════════════════════════════════════════════════════════════════

describe('isInAoE — cube', () => {
  const targeting = { shape: 'cube', size: 30 } // 15ft effective radius

  it('includes point at the center', () => {
    assert.strictEqual(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, targeting), true)
  })

  it('includes point within range (Chebyshev)', () => {
    assert.strictEqual(geo.isInAoE({ x: 8, y: 5 }, { x: 5, y: 5 }, targeting), true)
  })

  it('excludes point outside range', () => {
    assert.strictEqual(geo.isInAoE({ x: 9, y: 5 }, { x: 5, y: 5 }, targeting), false)
  })

  it('includes diagonal at max range', () => {
    assert.strictEqual(geo.isInAoE({ x: 8, y: 8 }, { x: 5, y: 5 }, targeting), true)
  })

  it('excludes diagonal past max range', () => {
    assert.strictEqual(geo.isInAoE({ x: 9, y: 9 }, { x: 5, y: 5 }, targeting), false)
  })
})

describe('isInAoE — sphere', () => {
  const targeting = { shape: 'sphere', radius: 20 }

  it('includes point at center', () => {
    assert.strictEqual(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, targeting), true)
  })

  it('includes point at max radius (4 squares × 5ft = 20ft)', () => {
    assert.strictEqual(geo.isInAoE({ x: 9, y: 5 }, { x: 5, y: 5 }, targeting), true)
  })

  it('excludes point beyond radius', () => {
    assert.strictEqual(geo.isInAoE({ x: 10, y: 5 }, { x: 5, y: 5 }, targeting), false)
  })
})

describe('isInAoE — cone', () => {
  const targeting = { shape: 'cone', length: 60 }

  it('includes point within length (Chebyshev)', () => {
    assert.strictEqual(geo.isInAoE({ x: 12, y: 0 }, { x: 0, y: 0 }, targeting), true)
  })

  it('excludes point beyond length', () => {
    assert.strictEqual(geo.isInAoE({ x: 13, y: 0 }, { x: 0, y: 0 }, targeting), false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// isInCone — directional cone with angular check
// ═══════════════════════════════════════════════════════════════════════════

describe('isInCone — directional cone (ground targets)', () => {
  const targeting = { shape: 'cone', length: 15 }
  const caster = { x: 0, y: 0 }

  it('includes target directly along aim axis', () => {
    assert.strictEqual(geo.isInAoE({ x: 2, y: 0 }, { x: 3, y: 0 }, targeting, { casterPosition: caster }), true)
  })

  it('includes target at max cone length', () => {
    assert.strictEqual(geo.isInAoE({ x: 3, y: 0 }, { x: 3, y: 0 }, targeting, { casterPosition: caster }), true)
  })

  it('excludes target beyond cone length', () => {
    assert.strictEqual(geo.isInAoE({ x: 4, y: 0 }, { x: 3, y: 0 }, targeting, { casterPosition: caster }), false)
  })

  it('includes target within cone arc (at half-angle boundary)', () => {
    assert.strictEqual(geo.isInAoE({ x: 2, y: 1 }, { x: 3, y: 0 }, targeting, { casterPosition: caster }), true)
  })

  it('excludes target outside cone arc (45°)', () => {
    assert.strictEqual(geo.isInAoE({ x: 1, y: 1 }, { x: 3, y: 0 }, targeting, { casterPosition: caster }), false)
  })

  it('excludes target behind the caster', () => {
    assert.strictEqual(geo.isInAoE({ x: -2, y: 0 }, { x: 3, y: 0 }, targeting, { casterPosition: caster }), false)
  })

  it('includes target at cone origin', () => {
    assert.strictEqual(geo.isInAoE({ x: 0, y: 0 }, { x: 3, y: 0 }, targeting, { casterPosition: caster }), true)
  })

  it('works with diagonal aim (NE direction)', () => {
    assert.strictEqual(geo.isInAoE({ x: 2, y: 2 }, { x: 3, y: 3 }, targeting, { casterPosition: caster }), true)
    assert.strictEqual(geo.isInAoE({ x: 2, y: 1 }, { x: 3, y: 3 }, targeting, { casterPosition: caster }), true)
    assert.strictEqual(geo.isInAoE({ x: 3, y: 0 }, { x: 3, y: 3 }, targeting, { casterPosition: caster }), false)
  })

  it('matches DMG grid template for 15ft cone going east', () => {
    const aim = { x: 3, y: 0 }
    const inCone = [
      { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
      { x: 2, y: 1 }, { x: 2, y: -1 },
      { x: 3, y: 1 }, { x: 3, y: -1 },
    ]
    const outOfCone = [
      { x: 1, y: 1 }, { x: 1, y: -1 }, { x: 4, y: 0 },
    ]
    for (const pos of inCone) {
      assert.strictEqual(geo.isInAoE(pos, aim, targeting, { casterPosition: caster }), true)
    }
    for (const pos of outOfCone) {
      assert.strictEqual(geo.isInAoE(pos, aim, targeting, { casterPosition: caster }), false)
    }
  })
})

describe('isInCone — flying targets', () => {
  it('60ft cone includes flying target within 3D range and cone arc', () => {
    const targeting = { shape: 'cone', length: 60 }
    assert.strictEqual(geo.isInAoE({ x: 10, y: 0 }, { x: 12, y: 0 }, targeting,
      { flying: true, casterPosition: { x: 0, y: 0 } }), true)
  })

  it('15ft cone cannot reach flying target (altitude too high)', () => {
    const targeting = { shape: 'cone', length: 15 }
    assert.strictEqual(geo.isInAoE({ x: 0, y: 0 }, { x: 3, y: 0 }, targeting,
      { flying: true, casterPosition: { x: 0, y: 0 } }), false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeOptimalConeDirection
// ═══════════════════════════════════════════════════════════════════════════

describe('computeOptimalConeDirection', () => {
  it('picks direction capturing the most enemies', () => {
    const caster = { position: { x: 0, y: 0 } }
    const enemies = [
      { position: { x: 2, y: 0 } },
      { position: { x: 3, y: 0 } },
      { position: { x: 0, y: -3 } },
    ]
    const result = geo.computeOptimalConeDirection(caster, enemies, 15)
    assert.ok(result)
    assert.strictEqual(result.estimatedCount, 2)
  })

  it('returns null when no enemies provided', () => {
    assert.strictEqual(geo.computeOptimalConeDirection({ position: { x: 0, y: 0 } }, [], 15), null)
  })

  it('returns null when all enemies are at caster position', () => {
    const caster = { position: { x: 0, y: 0 } }
    assert.strictEqual(geo.computeOptimalConeDirection(caster, [{ position: { x: 0, y: 0 } }], 15), null)
  })

  it('aim point is the enemy position that defines the best direction', () => {
    const caster = { position: { x: 0, y: 0 } }
    const result = geo.computeOptimalConeDirection(caster, [{ position: { x: 3, y: 0 } }], 15)
    assert.deepStrictEqual(result.center, { x: 3, y: 0 })
    assert.strictEqual(result.estimatedCount, 1)
  })
})

describe('isInAoE — cone backward compat (no casterPosition)', () => {
  const targeting = { shape: 'cone', length: 60 }

  it('falls back to 360° distance check without casterPosition', () => {
    assert.strictEqual(geo.isInAoE({ x: 12, y: 0 }, { x: 0, y: 0 }, targeting), true)
    assert.strictEqual(geo.isInAoE({ x: 13, y: 0 }, { x: 0, y: 0 }, targeting), false)
  })
})

describe('isInAoE — cylinder', () => {
  const targeting = { shape: 'cylinder', radius: 20, height: 40 }

  it('includes point at the radius boundary', () => {
    assert.strictEqual(geo.isInAoE({ x: 4, y: 0 }, { x: 0, y: 0 }, targeting), true)
  })

  it('excludes point beyond radius', () => {
    assert.strictEqual(geo.isInAoE({ x: 5, y: 0 }, { x: 0, y: 0 }, targeting), false)
  })
})

describe('isInAoE — wall', () => {
  it('always returns false (wall requires special handling)', () => {
    assert.strictEqual(geo.isInAoE({ x: 0, y: 0 }, { x: 0, y: 0 }, { shape: 'wall' }), false)
  })
})

describe('isInAoE — edge cases', () => {
  it('returns false for null targeting', () => {
    assert.strictEqual(geo.isInAoE({ x: 0, y: 0 }, { x: 0, y: 0 }, null), false)
  })

  it('handles missing position fields gracefully', () => {
    assert.strictEqual(geo.isInAoE({}, {}, { shape: 'sphere', radius: 20 }), true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// isInAoE — flying creatures (3D altitude)
// ═══════════════════════════════════════════════════════════════════════════

describe('isInAoE — flying creatures (cube)', () => {
  it('flying creature outside 30ft cube', () => {
    assert.strictEqual(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, { shape: 'cube', size: 30 }, { flying: true }), false)
  })

  it('flying creature inside 60ft cube', () => {
    assert.strictEqual(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, { shape: 'cube', size: 60 }, { flying: true }), true)
  })

  it('flying creature outside 60ft cube when also horizontally far', () => {
    assert.strictEqual(geo.isInAoE({ x: 12, y: 5 }, { x: 5, y: 5 }, { shape: 'cube', size: 60 }, { flying: true }), false)
  })

  it('grounded creature still works with flying: false', () => {
    assert.strictEqual(geo.isInAoE({ x: 8, y: 5 }, { x: 5, y: 5 }, { shape: 'cube', size: 30 }, { flying: false }), true)
  })
})

describe('isInAoE — flying creatures (sphere)', () => {
  it('Fireball (20ft sphere) cannot reach flying creature at 30ft altitude', () => {
    assert.strictEqual(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, { shape: 'sphere', radius: 20 }, { flying: true }), false)
  })

  it('40ft sphere can reach flying creature directly above', () => {
    assert.strictEqual(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, { shape: 'sphere', radius: 40 }, { flying: true }), true)
  })

  it('Fireball cannot reach flying creature even 1 square away', () => {
    assert.strictEqual(geo.isInAoE({ x: 6, y: 5 }, { x: 5, y: 5 }, { shape: 'sphere', radius: 20 }, { flying: true }), false)
  })
})

describe('isInAoE — flying creatures (cone)', () => {
  it('15ft breath weapon cone cannot reach flying creature', () => {
    assert.strictEqual(geo.isInAoE({ x: 0, y: 0 }, { x: 0, y: 0 }, { shape: 'cone', length: 15 }, { flying: true }), false)
  })

  it('60ft Cone of Cold can reach flying creature at moderate distance', () => {
    assert.strictEqual(geo.isInAoE({ x: 10, y: 0 }, { x: 0, y: 0 }, { shape: 'cone', length: 60 }, { flying: true }), true)
  })

  it('60ft cone cannot reach flying creature at max horizontal', () => {
    assert.strictEqual(geo.isInAoE({ x: 11, y: 0 }, { x: 0, y: 0 }, { shape: 'cone', length: 60 }, { flying: true }), false)
  })
})

describe('isInAoE — flying creatures (cylinder)', () => {
  it('Ice Storm (20ft radius, 40ft height) hits flying creature', () => {
    assert.strictEqual(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, { shape: 'cylinder', radius: 20, height: 40 }, { flying: true }), true)
  })

  it('cylinder with insufficient height misses flying creature', () => {
    assert.strictEqual(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, { shape: 'cylinder', radius: 20, height: 20 }, { flying: true }), false)
  })

  it('cylinder misses flying creature outside horizontal radius', () => {
    assert.strictEqual(geo.isInAoE({ x: 10, y: 5 }, { x: 5, y: 5 }, { shape: 'cylinder', radius: 20, height: 40 }, { flying: true }), false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// canAoEReachFlying
// ═══════════════════════════════════════════════════════════════════════════

describe('canAoEReachFlying', () => {
  it('30ft cube cannot reach flying altitude', () => {
    assert.strictEqual(geo.canAoEReachFlying({ shape: 'cube', size: 30 }), false)
  })
  it('60ft cube can reach flying altitude', () => {
    assert.strictEqual(geo.canAoEReachFlying({ shape: 'cube', size: 60 }), true)
  })
  it('20ft sphere cannot reach', () => {
    assert.strictEqual(geo.canAoEReachFlying({ shape: 'sphere', radius: 20 }), false)
  })
  it('30ft sphere can reach', () => {
    assert.strictEqual(geo.canAoEReachFlying({ shape: 'sphere', radius: 30 }), true)
  })
  it('15ft cone cannot reach', () => {
    assert.strictEqual(geo.canAoEReachFlying({ shape: 'cone', length: 15 }), false)
  })
  it('60ft cone can reach', () => {
    assert.strictEqual(geo.canAoEReachFlying({ shape: 'cone', length: 60 }), true)
  })
  it('40ft-high cylinder can reach', () => {
    assert.strictEqual(geo.canAoEReachFlying({ shape: 'cylinder', radius: 20, height: 40 }), true)
  })
  it('20ft-high cylinder cannot reach', () => {
    assert.strictEqual(geo.canAoEReachFlying({ shape: 'cylinder', radius: 20, height: 20 }), false)
  })
  it('null targeting returns false', () => {
    assert.strictEqual(geo.canAoEReachFlying(null), false)
  })
  it('wall returns false', () => {
    assert.strictEqual(geo.canAoEReachFlying({ shape: 'wall' }), false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeOptimalCenter
// ═══════════════════════════════════════════════════════════════════════════

describe('computeOptimalCenter', () => {
  it('returns centroid when within casting range', () => {
    const caster = { position: { x: 0, y: 0 } }
    const enemies = [{ position: { x: 8, y: 0 } }, { position: { x: 10, y: 0 } }]
    const result = geo.computeOptimalCenter(caster, enemies, 120, 20)
    assert.deepStrictEqual(result, { x: 9, y: 0 })
  })

  it('falls back to closest enemy when centroid out of range', () => {
    const caster = { position: { x: 0, y: 0 } }
    const enemies = [{ position: { x: 20, y: 0 } }, { position: { x: 30, y: 0 } }]
    const result = geo.computeOptimalCenter(caster, enemies, 60, 20)
    assert.deepStrictEqual(result, { x: 20, y: 0 })
  })

  it('returns caster position for self-origin spells (range 0)', () => {
    const caster = { position: { x: 5, y: 3 } }
    const result = geo.computeOptimalCenter(caster, [{ position: { x: 6, y: 3 } }], 0, 60)
    assert.deepStrictEqual(result, { x: 5, y: 3 })
  })

  it('handles enemies with no position', () => {
    const caster = { position: { x: 0, y: 0 } }
    const result = geo.computeOptimalCenter(caster, [{}], 120, 20)
    assert.deepStrictEqual(result, { x: 0, y: 0 })
  })

  it('returns null when no enemies', () => {
    assert.strictEqual(geo.computeOptimalCenter({ position: { x: 0, y: 0 } }, [], 120, 20), null)
  })
})
