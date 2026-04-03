import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NpcRuntimeContext } from '../../src/npc/NpcRuntimeContext.js'

describe('NpcRuntimeContext', () => {
  let ctx

  beforeEach(() => {
    ctx = new NpcRuntimeContext()
  })

  describe('constructor', () => {
    it('accepts optional gameDay', () => {
      const c = new NpcRuntimeContext({ gameDay: 5 })
      assert.strictEqual(c.getGameDay(), 5)
    })

    it('defaults gameDay to 1', () => {
      assert.strictEqual(ctx.getGameDay(), 1)
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
      assert.strictEqual(snap.currentLocation.locationId, 'bottoms_up')
      assert.strictEqual(snap.currentLocation.areaWithin, 'The Bar')
    })
  })

  describe('setActivity', () => {
    it('stores current activity', () => {
      ctx.setActivity('mira_barrelbottom', 'Wiping down the bar while surveying the room')
      const snap = ctx.getSnapshot('mira_barrelbottom')
      assert.strictEqual(snap.currentActivity, 'Wiping down the bar while surveying the room')
    })
  })

  describe('setMood', () => {
    it('stores current mood', () => {
      ctx.setMood('mira_barrelbottom', 'content but watchful')
      const snap = ctx.getSnapshot('mira_barrelbottom')
      assert.strictEqual(snap.currentMood, 'content but watchful')
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
      assert.strictEqual(snap.dayExperiences.length, 2)
      assert.strictEqual(snap.dayExperiences[0].type, 'observation')
      assert.deepStrictEqual(snap.dayExperiences[1].participants, ['brennan_holt'])
    })

    it('timestamps experiences automatically', () => {
      ctx.recordExperience('mira_barrelbottom', {
        type: 'event',
        summary: 'A stranger walked in.',
      })
      const snap = ctx.getSnapshot('mira_barrelbottom')
      assert.notStrictEqual(snap.dayExperiences[0].timestamp, undefined)
    })
  })

  describe('getExperiencesSoFar', () => {
    it('returns empty array for unknown NPC', () => {
      assert.deepStrictEqual(ctx.getExperiencesSoFar('nobody'), [])
    })

    it('returns recorded experiences in order', () => {
      ctx.recordExperience('fen_colby', { type: 'event', summary: 'Woke up with a headache.' })
      ctx.recordExperience('fen_colby', { type: 'observation', summary: 'The docks smell worse than usual.' })
      ctx.recordExperience('fen_colby', { type: 'event', summary: 'Walked to Bottoms Up.' })
      const exps = ctx.getExperiencesSoFar('fen_colby')
      assert.strictEqual(exps.length, 3)
      assert.match(exps[0].summary, /headache/)
      assert.match(exps[2].summary, /Bottoms Up/)
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
      assert.strictEqual(snap.dayExperiences.length, 1)
      assert.strictEqual(snap.dailyPlan, null)
    })

    it('returns defaults for unknown NPC', () => {
      const snap = ctx.getSnapshot('nobody')
      assert.strictEqual(snap.currentLocation, null)
      assert.strictEqual(snap.currentActivity, null)
      assert.strictEqual(snap.currentMood, null)
      assert.deepStrictEqual(snap.dayExperiences, [])
      assert.strictEqual(snap.dailyPlan, null)
      assert.strictEqual(snap.gameDay, 1)
    })
  })

  describe('computeAgeInDays', () => {
    it('computes age * 365 for a personality with age', () => {
      assert.strictEqual(ctx.computeAgeInDays({ age: 38 }), 38 * 365 + 1 - 1)
      // gameDay 1: lived age*365 + (gameDay-1) = age*365
    })

    it('returns null when personality has no age', () => {
      assert.strictEqual(ctx.computeAgeInDays({}), null)
      assert.strictEqual(ctx.computeAgeInDays({ name: 'Test' }), null)
    })

    it('accounts for game day progression', () => {
      const c = new NpcRuntimeContext({ gameDay: 10 })
      // age*365 + (gameDay - 1) additional days
      assert.strictEqual(c.computeAgeInDays({ age: 38 }), 38 * 365 + 9)
    })
  })

  describe('advanceDay', () => {
    it('increments game day', () => {
      ctx.advanceDay()
      assert.strictEqual(ctx.getGameDay(), 2)
    })

    it('clears all day experiences', () => {
      ctx.recordExperience('mira_barrelbottom', { type: 'event', summary: 'Something.' })
      ctx.advanceDay()
      assert.deepStrictEqual(ctx.getExperiencesSoFar('mira_barrelbottom'), [])
    })

    it('preserves location and activity across day advance', () => {
      ctx.setLocation('mira_barrelbottom', { locationId: 'bottoms_up' })
      ctx.setActivity('mira_barrelbottom', 'Sleeping')
      ctx.advanceDay()
      const snap = ctx.getSnapshot('mira_barrelbottom')
      assert.strictEqual(snap.currentLocation.locationId, 'bottoms_up')
      assert.strictEqual(snap.currentActivity, 'Sleeping')
    })
  })

  describe('clearNpc', () => {
    it('removes all runtime state for an NPC', () => {
      ctx.setLocation('mira_barrelbottom', { locationId: 'bottoms_up' })
      ctx.recordExperience('mira_barrelbottom', { type: 'event', summary: 'Test' })
      ctx.clearNpc('mira_barrelbottom')
      const snap = ctx.getSnapshot('mira_barrelbottom')
      assert.strictEqual(snap.currentLocation, null)
      assert.deepStrictEqual(snap.dayExperiences, [])
    })
  })
})
