import { describe, it, expect } from 'vitest'
import {
  NPC_PERSONALITIES,
  getNpc,
  hasNpc,
  getAllNpcKeys,
  getNpcsByType,
} from '../src/npcs/index.js'

const REQUIRED_TOP_FIELDS = ['templateKey', 'name', 'race', 'npcType', 'personality']
const VALID_NPC_TYPES = ['friendly', 'neutral', 'enemy']

describe('NPC_PERSONALITIES data integrity', () => {
  const keys = getAllNpcKeys()

  it('has at least 32 NPC personalities', () => {
    expect(keys.length).toBeGreaterThanOrEqual(32)
  })

  it.each(keys)('%s has required top-level fields', (key) => {
    const npc = NPC_PERSONALITIES[key]
    for (const field of REQUIRED_TOP_FIELDS) {
      expect(npc[field], `missing ${field}`).toBeDefined()
    }
  })

  it.each(keys)('%s templateKey matches registry key', (key) => {
    expect(NPC_PERSONALITIES[key].templateKey).toBe(key)
  })

  it.each(keys)('%s has non-empty name', (key) => {
    expect(typeof NPC_PERSONALITIES[key].name).toBe('string')
    expect(NPC_PERSONALITIES[key].name.length).toBeGreaterThan(0)
  })

  it.each(keys)('%s npcType is valid', (key) => {
    expect(VALID_NPC_TYPES).toContain(NPC_PERSONALITIES[key].npcType)
  })

  it.each(keys)('%s personality has voice and disposition', (key) => {
    const p = NPC_PERSONALITIES[key].personality
    expect(typeof p.voice).toBe('string')
    expect(typeof p.disposition).toBe('string')
  })
})

describe('NPC spot checks', () => {
  it('bree_millhaven is a friendly human', () => {
    const bree = getNpc('bree_millhaven')
    expect(bree.name).toBe('Bree')
    expect(bree.race).toBe('Human')
    expect(bree.npcType).toBe('friendly')
    expect(bree.consciousnessContext).toBeDefined()
    expect(bree.consciousnessContext.innerMonologue).toBeDefined()
  })

  it('zombie is an enemy', () => {
    const z = getNpc('zombie')
    expect(z.npcType).toBe('enemy')
  })

  it('goblin has personality and knowledge', () => {
    const g = getNpc('goblin')
    expect(g.personality).toBeDefined()
    expect(g.knowledge).toBeDefined()
  })
})

describe('NPC registry API', () => {
  it('getNpc returns NPC by key', () => {
    const npc = getNpc('bree_millhaven')
    expect(npc.name).toBe('Bree')
  })

  it('getNpc returns undefined for unknown', () => {
    expect(getNpc('nonexistent')).toBeUndefined()
  })

  it('hasNpc returns true for existing', () => {
    expect(hasNpc('bree_millhaven')).toBe(true)
  })

  it('hasNpc returns false for missing', () => {
    expect(hasNpc('nonexistent')).toBe(false)
  })

  it('getAllNpcKeys returns array of all keys', () => {
    const keys = getAllNpcKeys()
    expect(Array.isArray(keys)).toBe(true)
    expect(keys).toContain('bree_millhaven')
    expect(keys).toContain('zombie')
    expect(keys).toContain('lich')
  })

  it('getNpcsByType filters by npcType', () => {
    const friendlies = getNpcsByType('friendly')
    expect(friendlies.length).toBeGreaterThan(0)
    expect(friendlies.every(n => n.npcType === 'friendly')).toBe(true)
  })
})
