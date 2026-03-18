import { describe, it, expect, beforeEach } from 'vitest'
import { NpcRuntimeContext } from '../../src/npc/NpcRuntimeContext.js'

describe('NpcRuntimeContext', () => {
  let ctx

  beforeEach(() => {
    ctx = new NpcRuntimeContext()
  })

  describe('constructor', () => {
    it('accepts optional gameDay', () => {
      const c = new NpcRuntimeContext({ gameDay: 5 })
      expect(c.getGameDay()).toBe(5)
    })

    it('defaults gameDay to 1', () => {
      expect(ctx.getGameDay()).toBe(1)
    })
  })

  describe('setLocation / getSnapshot', () => {
    it('stores location for an NPC', () => {
      ctx.setLocation('mira_barrelbottom', {
        locationId: 'bottoms_up',
        areaWithin: 'The Bar',
        arrivedAt: '8:00',
      })
      const snap = ctx.getSnapshot('mira_barrelbottom')
      expect(snap.currentLocation.locationId).toBe('bottoms_up')
      expect(snap.currentLocation.areaWithin).toBe('The Bar')
    })
  })

  describe('setActivity', () => {
    it('stores current activity', () => {
      ctx.setActivity('mira_barrelbottom', 'Wiping down the bar while surveying the room')
      const snap = ctx.getSnapshot('mira_barrelbottom')
      expect(snap.currentActivity).toBe('Wiping down the bar while surveying the room')
    })
  })

  describe('setMood', () => {
    it('stores current mood', () => {
      ctx.setMood('mira_barrelbottom', 'content but watchful')
      const snap = ctx.getSnapshot('mira_barrelbottom')
      expect(snap.currentMood).toBe('content but watchful')
    })
  })

  describe('recordExperience', () => {
    it('appends to day experiences', () => {
      ctx.recordExperience('mira_barrelbottom', {
        type: 'observation',
        summary: 'Oma dropped off the morning bread basket early today.',
      })
      ctx.recordExperience('mira_barrelbottom', {
        type: 'conversation',
        summary: 'Brennan complained about the new tax again while nursing an ale.',
        participants: ['brennan_holt'],
      })
      const snap = ctx.getSnapshot('mira_barrelbottom')
      expect(snap.dayExperiences).toHaveLength(2)
      expect(snap.dayExperiences[0].type).toBe('observation')
      expect(snap.dayExperiences[1].participants).toEqual(['brennan_holt'])
    })

    it('timestamps experiences automatically', () => {
      ctx.recordExperience('mira_barrelbottom', {
        type: 'event',
        summary: 'A stranger walked in.',
      })
      const snap = ctx.getSnapshot('mira_barrelbottom')
      expect(snap.dayExperiences[0].timestamp).toBeDefined()
    })
  })

  describe('getExperiencesSoFar', () => {
    it('returns empty array for unknown NPC', () => {
      expect(ctx.getExperiencesSoFar('nobody')).toEqual([])
    })

    it('returns recorded experiences in order', () => {
      ctx.recordExperience('fen_colby', { type: 'event', summary: 'Woke up with a headache.' })
      ctx.recordExperience('fen_colby', { type: 'observation', summary: 'The docks smell worse than usual.' })
      ctx.recordExperience('fen_colby', { type: 'event', summary: 'Walked to Bottoms Up.' })
      const exps = ctx.getExperiencesSoFar('fen_colby')
      expect(exps).toHaveLength(3)
      expect(exps[0].summary).toMatch(/headache/)
      expect(exps[2].summary).toMatch(/Bottoms Up/)
    })
  })

  describe('getSnapshot', () => {
    it('returns full runtime state for an NPC', () => {
      ctx.setLocation('mira_barrelbottom', { locationId: 'bottoms_up', areaWithin: 'The Bar' })
      ctx.setActivity('mira_barrelbottom', 'Pouring ale')
      ctx.setMood('mira_barrelbottom', 'cheerful')
      ctx.recordExperience('mira_barrelbottom', { type: 'event', summary: 'Opened the tavern.' })

      const snap = ctx.getSnapshot('mira_barrelbottom')
      expect(snap).toEqual(expect.objectContaining({
        currentLocation: expect.objectContaining({ locationId: 'bottoms_up' }),
        currentActivity: 'Pouring ale',
        currentMood: 'cheerful',
        gameDay: 1,
      }))
      expect(snap.dayExperiences).toHaveLength(1)
      expect(snap.dailyPlan).toBeNull()
    })

    it('returns defaults for unknown NPC', () => {
      const snap = ctx.getSnapshot('nobody')
      expect(snap.currentLocation).toBeNull()
      expect(snap.currentActivity).toBeNull()
      expect(snap.currentMood).toBeNull()
      expect(snap.dayExperiences).toEqual([])
      expect(snap.dailyPlan).toBeNull()
      expect(snap.gameDay).toBe(1)
    })
  })

  describe('computeAgeInDays', () => {
    it('computes age * 365 for a personality with age', () => {
      expect(ctx.computeAgeInDays({ age: 38 })).toBe(38 * 365 + 1 - 1)
      // gameDay 1: lived age*365 + (gameDay-1) = age*365
    })

    it('returns null when personality has no age', () => {
      expect(ctx.computeAgeInDays({})).toBeNull()
      expect(ctx.computeAgeInDays({ name: 'Test' })).toBeNull()
    })

    it('accounts for game day progression', () => {
      const c = new NpcRuntimeContext({ gameDay: 10 })
      // age*365 + (gameDay - 1) additional days
      expect(c.computeAgeInDays({ age: 38 })).toBe(38 * 365 + 9)
    })
  })

  describe('advanceDay', () => {
    it('increments game day', () => {
      ctx.advanceDay()
      expect(ctx.getGameDay()).toBe(2)
    })

    it('clears all day experiences', () => {
      ctx.recordExperience('mira_barrelbottom', { type: 'event', summary: 'Something.' })
      ctx.advanceDay()
      expect(ctx.getExperiencesSoFar('mira_barrelbottom')).toEqual([])
    })

    it('preserves location and activity across day advance', () => {
      ctx.setLocation('mira_barrelbottom', { locationId: 'bottoms_up' })
      ctx.setActivity('mira_barrelbottom', 'Sleeping')
      ctx.advanceDay()
      const snap = ctx.getSnapshot('mira_barrelbottom')
      expect(snap.currentLocation.locationId).toBe('bottoms_up')
      expect(snap.currentActivity).toBe('Sleeping')
    })
  })

  describe('clearNpc', () => {
    it('removes all runtime state for an NPC', () => {
      ctx.setLocation('mira_barrelbottom', { locationId: 'bottoms_up' })
      ctx.recordExperience('mira_barrelbottom', { type: 'event', summary: 'Test' })
      ctx.clearNpc('mira_barrelbottom')
      const snap = ctx.getSnapshot('mira_barrelbottom')
      expect(snap.currentLocation).toBeNull()
      expect(snap.dayExperiences).toEqual([])
    })
  })
})
