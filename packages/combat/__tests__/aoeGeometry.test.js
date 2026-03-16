/**
 * AoE Geometry — unit tests
 * Pure geometry module: shapes, distances, cone arcs, flying altitude.
 */

import { describe, it, expect } from 'vitest'
import * as geo from '../src/engine/aoeGeometry.js'

// ═══════════════════════════════════════════════════════════════════════════
// getEffectiveRadius
// ═══════════════════════════════════════════════════════════════════════════

describe('getEffectiveRadius', () => {
  it('returns half the side length for a cube', () => {
    expect(geo.getEffectiveRadius({ shape: 'cube', size: 30 })).toBe(15)
  })

  it('returns the radius for a sphere', () => {
    expect(geo.getEffectiveRadius({ shape: 'sphere', radius: 20 })).toBe(20)
  })

  it('returns the length for a cone', () => {
    expect(geo.getEffectiveRadius({ shape: 'cone', length: 60 })).toBe(60)
  })

  it('returns the radius for a cylinder', () => {
    expect(geo.getEffectiveRadius({ shape: 'cylinder', radius: 20, height: 40 })).toBe(20)
  })

  it('returns 0 for a wall', () => {
    expect(geo.getEffectiveRadius({ shape: 'wall' })).toBe(0)
  })

  it('returns 0 for unknown shape', () => {
    expect(geo.getEffectiveRadius({ shape: 'hexagon' })).toBe(0)
  })

  it('returns 0 for null/undefined', () => {
    expect(geo.getEffectiveRadius(null)).toBe(0)
    expect(geo.getEffectiveRadius(undefined)).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// isInAoE — point within AoE centered at a given location
// ═══════════════════════════════════════════════════════════════════════════

describe('isInAoE — cube', () => {
  const targeting = { shape: 'cube', size: 30 } // 15ft effective radius

  it('includes point at the center', () => {
    expect(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, targeting)).toBe(true)
  })

  it('includes point within range (Chebyshev)', () => {
    expect(geo.isInAoE({ x: 8, y: 5 }, { x: 5, y: 5 }, targeting)).toBe(true)
  })

  it('excludes point outside range', () => {
    expect(geo.isInAoE({ x: 9, y: 5 }, { x: 5, y: 5 }, targeting)).toBe(false)
  })

  it('includes diagonal at max range', () => {
    expect(geo.isInAoE({ x: 8, y: 8 }, { x: 5, y: 5 }, targeting)).toBe(true)
  })

  it('excludes diagonal past max range', () => {
    expect(geo.isInAoE({ x: 9, y: 9 }, { x: 5, y: 5 }, targeting)).toBe(false)
  })
})

describe('isInAoE — sphere', () => {
  const targeting = { shape: 'sphere', radius: 20 }

  it('includes point at center', () => {
    expect(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, targeting)).toBe(true)
  })

  it('includes point at max radius (4 squares × 5ft = 20ft)', () => {
    expect(geo.isInAoE({ x: 9, y: 5 }, { x: 5, y: 5 }, targeting)).toBe(true)
  })

  it('excludes point beyond radius', () => {
    expect(geo.isInAoE({ x: 10, y: 5 }, { x: 5, y: 5 }, targeting)).toBe(false)
  })
})

describe('isInAoE — cone', () => {
  const targeting = { shape: 'cone', length: 60 }

  it('includes point within length (Chebyshev)', () => {
    expect(geo.isInAoE({ x: 12, y: 0 }, { x: 0, y: 0 }, targeting)).toBe(true)
  })

  it('excludes point beyond length', () => {
    expect(geo.isInAoE({ x: 13, y: 0 }, { x: 0, y: 0 }, targeting)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// isInCone — directional cone with angular check
// ═══════════════════════════════════════════════════════════════════════════

describe('isInCone — directional cone (ground targets)', () => {
  const targeting = { shape: 'cone', length: 15 }
  const caster = { x: 0, y: 0 }

  it('includes target directly along aim axis', () => {
    expect(geo.isInAoE({ x: 2, y: 0 }, { x: 3, y: 0 }, targeting, { casterPosition: caster })).toBe(true)
  })

  it('includes target at max cone length', () => {
    expect(geo.isInAoE({ x: 3, y: 0 }, { x: 3, y: 0 }, targeting, { casterPosition: caster })).toBe(true)
  })

  it('excludes target beyond cone length', () => {
    expect(geo.isInAoE({ x: 4, y: 0 }, { x: 3, y: 0 }, targeting, { casterPosition: caster })).toBe(false)
  })

  it('includes target within cone arc (at half-angle boundary)', () => {
    expect(geo.isInAoE({ x: 2, y: 1 }, { x: 3, y: 0 }, targeting, { casterPosition: caster })).toBe(true)
  })

  it('excludes target outside cone arc (45°)', () => {
    expect(geo.isInAoE({ x: 1, y: 1 }, { x: 3, y: 0 }, targeting, { casterPosition: caster })).toBe(false)
  })

  it('excludes target behind the caster', () => {
    expect(geo.isInAoE({ x: -2, y: 0 }, { x: 3, y: 0 }, targeting, { casterPosition: caster })).toBe(false)
  })

  it('includes target at cone origin', () => {
    expect(geo.isInAoE({ x: 0, y: 0 }, { x: 3, y: 0 }, targeting, { casterPosition: caster })).toBe(true)
  })

  it('works with diagonal aim (NE direction)', () => {
    expect(geo.isInAoE({ x: 2, y: 2 }, { x: 3, y: 3 }, targeting, { casterPosition: caster })).toBe(true)
    expect(geo.isInAoE({ x: 2, y: 1 }, { x: 3, y: 3 }, targeting, { casterPosition: caster })).toBe(true)
    expect(geo.isInAoE({ x: 3, y: 0 }, { x: 3, y: 3 }, targeting, { casterPosition: caster })).toBe(false)
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
      expect(geo.isInAoE(pos, aim, targeting, { casterPosition: caster })).toBe(true)
    }
    for (const pos of outOfCone) {
      expect(geo.isInAoE(pos, aim, targeting, { casterPosition: caster })).toBe(false)
    }
  })
})

describe('isInCone — flying targets', () => {
  it('60ft cone includes flying target within 3D range and cone arc', () => {
    const targeting = { shape: 'cone', length: 60 }
    expect(geo.isInAoE({ x: 10, y: 0 }, { x: 12, y: 0 }, targeting,
      { flying: true, casterPosition: { x: 0, y: 0 } })).toBe(true)
  })

  it('15ft cone cannot reach flying target (altitude too high)', () => {
    const targeting = { shape: 'cone', length: 15 }
    expect(geo.isInAoE({ x: 0, y: 0 }, { x: 3, y: 0 }, targeting,
      { flying: true, casterPosition: { x: 0, y: 0 } })).toBe(false)
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
    expect(result).toBeTruthy()
    expect(result.estimatedCount).toBe(2)
  })

  it('returns null when no enemies provided', () => {
    expect(geo.computeOptimalConeDirection({ position: { x: 0, y: 0 } }, [], 15)).toBeNull()
  })

  it('returns null when all enemies are at caster position', () => {
    const caster = { position: { x: 0, y: 0 } }
    expect(geo.computeOptimalConeDirection(caster, [{ position: { x: 0, y: 0 } }], 15)).toBeNull()
  })

  it('aim point is the enemy position that defines the best direction', () => {
    const caster = { position: { x: 0, y: 0 } }
    const result = geo.computeOptimalConeDirection(caster, [{ position: { x: 3, y: 0 } }], 15)
    expect(result.center).toEqual({ x: 3, y: 0 })
    expect(result.estimatedCount).toBe(1)
  })
})

describe('isInAoE — cone backward compat (no casterPosition)', () => {
  const targeting = { shape: 'cone', length: 60 }

  it('falls back to 360° distance check without casterPosition', () => {
    expect(geo.isInAoE({ x: 12, y: 0 }, { x: 0, y: 0 }, targeting)).toBe(true)
    expect(geo.isInAoE({ x: 13, y: 0 }, { x: 0, y: 0 }, targeting)).toBe(false)
  })
})

describe('isInAoE — cylinder', () => {
  const targeting = { shape: 'cylinder', radius: 20, height: 40 }

  it('includes point at the radius boundary', () => {
    expect(geo.isInAoE({ x: 4, y: 0 }, { x: 0, y: 0 }, targeting)).toBe(true)
  })

  it('excludes point beyond radius', () => {
    expect(geo.isInAoE({ x: 5, y: 0 }, { x: 0, y: 0 }, targeting)).toBe(false)
  })
})

describe('isInAoE — wall', () => {
  it('always returns false (wall requires special handling)', () => {
    expect(geo.isInAoE({ x: 0, y: 0 }, { x: 0, y: 0 }, { shape: 'wall' })).toBe(false)
  })
})

describe('isInAoE — edge cases', () => {
  it('returns false for null targeting', () => {
    expect(geo.isInAoE({ x: 0, y: 0 }, { x: 0, y: 0 }, null)).toBe(false)
  })

  it('handles missing position fields gracefully', () => {
    expect(geo.isInAoE({}, {}, { shape: 'sphere', radius: 20 })).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// isInAoE — flying creatures (3D altitude)
// ═══════════════════════════════════════════════════════════════════════════

describe('isInAoE — flying creatures (cube)', () => {
  it('flying creature outside 30ft cube', () => {
    expect(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, { shape: 'cube', size: 30 }, { flying: true })).toBe(false)
  })

  it('flying creature inside 60ft cube', () => {
    expect(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, { shape: 'cube', size: 60 }, { flying: true })).toBe(true)
  })

  it('flying creature outside 60ft cube when also horizontally far', () => {
    expect(geo.isInAoE({ x: 12, y: 5 }, { x: 5, y: 5 }, { shape: 'cube', size: 60 }, { flying: true })).toBe(false)
  })

  it('grounded creature still works with flying: false', () => {
    expect(geo.isInAoE({ x: 8, y: 5 }, { x: 5, y: 5 }, { shape: 'cube', size: 30 }, { flying: false })).toBe(true)
  })
})

describe('isInAoE — flying creatures (sphere)', () => {
  it('Fireball (20ft sphere) cannot reach flying creature at 30ft altitude', () => {
    expect(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, { shape: 'sphere', radius: 20 }, { flying: true })).toBe(false)
  })

  it('40ft sphere can reach flying creature directly above', () => {
    expect(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, { shape: 'sphere', radius: 40 }, { flying: true })).toBe(true)
  })

  it('Fireball cannot reach flying creature even 1 square away', () => {
    expect(geo.isInAoE({ x: 6, y: 5 }, { x: 5, y: 5 }, { shape: 'sphere', radius: 20 }, { flying: true })).toBe(false)
  })
})

describe('isInAoE — flying creatures (cone)', () => {
  it('15ft breath weapon cone cannot reach flying creature', () => {
    expect(geo.isInAoE({ x: 0, y: 0 }, { x: 0, y: 0 }, { shape: 'cone', length: 15 }, { flying: true })).toBe(false)
  })

  it('60ft Cone of Cold can reach flying creature at moderate distance', () => {
    expect(geo.isInAoE({ x: 10, y: 0 }, { x: 0, y: 0 }, { shape: 'cone', length: 60 }, { flying: true })).toBe(true)
  })

  it('60ft cone cannot reach flying creature at max horizontal', () => {
    expect(geo.isInAoE({ x: 11, y: 0 }, { x: 0, y: 0 }, { shape: 'cone', length: 60 }, { flying: true })).toBe(false)
  })
})

describe('isInAoE — flying creatures (cylinder)', () => {
  it('Ice Storm (20ft radius, 40ft height) hits flying creature', () => {
    expect(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, { shape: 'cylinder', radius: 20, height: 40 }, { flying: true })).toBe(true)
  })

  it('cylinder with insufficient height misses flying creature', () => {
    expect(geo.isInAoE({ x: 5, y: 5 }, { x: 5, y: 5 }, { shape: 'cylinder', radius: 20, height: 20 }, { flying: true })).toBe(false)
  })

  it('cylinder misses flying creature outside horizontal radius', () => {
    expect(geo.isInAoE({ x: 10, y: 5 }, { x: 5, y: 5 }, { shape: 'cylinder', radius: 20, height: 40 }, { flying: true })).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// canAoEReachFlying
// ═══════════════════════════════════════════════════════════════════════════

describe('canAoEReachFlying', () => {
  it('30ft cube cannot reach flying altitude', () => {
    expect(geo.canAoEReachFlying({ shape: 'cube', size: 30 })).toBe(false)
  })
  it('60ft cube can reach flying altitude', () => {
    expect(geo.canAoEReachFlying({ shape: 'cube', size: 60 })).toBe(true)
  })
  it('20ft sphere cannot reach', () => {
    expect(geo.canAoEReachFlying({ shape: 'sphere', radius: 20 })).toBe(false)
  })
  it('30ft sphere can reach', () => {
    expect(geo.canAoEReachFlying({ shape: 'sphere', radius: 30 })).toBe(true)
  })
  it('15ft cone cannot reach', () => {
    expect(geo.canAoEReachFlying({ shape: 'cone', length: 15 })).toBe(false)
  })
  it('60ft cone can reach', () => {
    expect(geo.canAoEReachFlying({ shape: 'cone', length: 60 })).toBe(true)
  })
  it('40ft-high cylinder can reach', () => {
    expect(geo.canAoEReachFlying({ shape: 'cylinder', radius: 20, height: 40 })).toBe(true)
  })
  it('20ft-high cylinder cannot reach', () => {
    expect(geo.canAoEReachFlying({ shape: 'cylinder', radius: 20, height: 20 })).toBe(false)
  })
  it('null targeting returns false', () => {
    expect(geo.canAoEReachFlying(null)).toBe(false)
  })
  it('wall returns false', () => {
    expect(geo.canAoEReachFlying({ shape: 'wall' })).toBe(false)
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
    expect(result).toEqual({ x: 9, y: 0 })
  })

  it('falls back to closest enemy when centroid out of range', () => {
    const caster = { position: { x: 0, y: 0 } }
    const enemies = [{ position: { x: 20, y: 0 } }, { position: { x: 30, y: 0 } }]
    const result = geo.computeOptimalCenter(caster, enemies, 60, 20)
    expect(result).toEqual({ x: 20, y: 0 })
  })

  it('returns caster position for self-origin spells (range 0)', () => {
    const caster = { position: { x: 5, y: 3 } }
    const result = geo.computeOptimalCenter(caster, [{ position: { x: 6, y: 3 } }], 0, 60)
    expect(result).toEqual({ x: 5, y: 3 })
  })

  it('handles enemies with no position', () => {
    const caster = { position: { x: 0, y: 0 } }
    const result = geo.computeOptimalCenter(caster, [{}], 120, 20)
    expect(result).toEqual({ x: 0, y: 0 })
  })

  it('returns null when no enemies', () => {
    expect(geo.computeOptimalCenter({ position: { x: 0, y: 0 } }, [], 120, 20)).toBeNull()
  })
})
