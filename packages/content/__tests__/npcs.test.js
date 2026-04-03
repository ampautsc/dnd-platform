import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NPC_PERSONALITIES,
  getNpc,
  hasNpc,
  getAllNpcKeys,
  getNpcsByType,
} from '../src/npcs/index.js'

const REQUIRED_TOP_FIELDS = ['templateKey', 'name', 'race', 'npcType', 'personality']
const VALID_NPC_TYPES = ['friendly', 'neutral', 'enemy']
const REQUIRED_APPEARANCE_FIELDS = ['build', 'distinguishingFeatures', 'typicalAttire']

describe('NPC_PERSONALITIES data integrity', () => {
  const keys = getAllNpcKeys()

  it('has at least 32 NPC personalities', () => {
    assert.ok(keys.length >= 32)
  })

  for (const key of keys) {
    it(`${key} has required top-level fields`, () => {
    const npc = NPC_PERSONALITIES[key]
    for (const field of REQUIRED_TOP_FIELDS) {
      assert.notStrictEqual(npc[field], undefined, `missing ${field}`)
    }
    });
  }

  for (const key of keys) {
    it(`${key} templateKey matches registry key`, () => {
    assert.strictEqual(NPC_PERSONALITIES[key].templateKey, key)
    });
  }

  for (const key of keys) {
    it(`${key} has non-empty name`, () => {
    assert.strictEqual(typeof NPC_PERSONALITIES[key].name, 'string')
    assert.ok(NPC_PERSONALITIES[key].name.length > 0)
    });
  }

  for (const key of keys) {
    it(`${key} npcType is valid`, () => {
    assert.ok(VALID_NPC_TYPES.includes(NPC_PERSONALITIES[key].npcType))
    });
  }

  for (const key of keys) {
    it(`${key} personality has voice and disposition`, () => {
    const p = NPC_PERSONALITIES[key].personality
    assert.strictEqual(typeof p.voice, 'string')
    assert.strictEqual(typeof p.disposition, 'string')
    });
  }

  // Appearance is optional, but when present must have required subfields
  const keysWithAppearance = keys.filter(k => NPC_PERSONALITIES[k].appearance)
  if (keysWithAppearance.length > 0) {
    for (const key of keysWithAppearance) {
      it(`${key} appearance has required subfields`, () => {
      const a = NPC_PERSONALITIES[key].appearance
      for (const field of REQUIRED_APPEARANCE_FIELDS) {
        assert.notStrictEqual(a[field], undefined, `appearance.${field} missing on ${key}`)
      }
      assert.strictEqual(typeof a.build, 'string')
      assert.strictEqual(Array.isArray(a.distinguishingFeatures), true)
      assert.ok(a.distinguishingFeatures.length > 0)
      assert.strictEqual(typeof a.typicalAttire, 'string')
      });
    }
  }
})

describe('NPC spot checks', () => {
  it('bree_millhaven is a friendly human', () => {
    const bree = getNpc('bree_millhaven')
    assert.strictEqual(bree.name, 'Bree')
    assert.strictEqual(bree.race, 'Human')
    assert.strictEqual(bree.npcType, 'friendly')
    assert.notStrictEqual(bree.consciousnessContext, undefined)
    assert.notStrictEqual(bree.consciousnessContext.innerMonologue, undefined)
  })

  it('zombie is an enemy', () => {
    const z = getNpc('zombie')
    assert.strictEqual(z.npcType, 'enemy')
  })

  it('goblin has personality and knowledge', () => {
    const g = getNpc('goblin')
    assert.notStrictEqual(g.personality, undefined)
    assert.notStrictEqual(g.knowledge, undefined)
  })
})

describe('NPC registry API', () => {
  it('getNpc returns NPC by key', () => {
    const npc = getNpc('bree_millhaven')
    assert.strictEqual(npc.name, 'Bree')
  })

  it('getNpc returns undefined for unknown', () => {
    assert.strictEqual(getNpc('nonexistent'), undefined)
  })

  it('hasNpc returns true for existing', () => {
    assert.strictEqual(hasNpc('bree_millhaven'), true)
  })

  it('hasNpc returns false for missing', () => {
    assert.strictEqual(hasNpc('nonexistent'), false)
  })

  it('getAllNpcKeys returns array of all keys', () => {
    const keys = getAllNpcKeys()
    assert.strictEqual(Array.isArray(keys), true)
    assert.ok(keys.includes('bree_millhaven'))
    assert.ok(keys.includes('zombie'))
    assert.ok(keys.includes('lich'))
  })

  it('getNpcsByType filters by npcType', () => {
    const friendlies = getNpcsByType('friendly')
    assert.ok(friendlies.length > 0)
    assert.strictEqual(friendlies.every(n => n.npcType === 'friendly'), true)
  })
})
