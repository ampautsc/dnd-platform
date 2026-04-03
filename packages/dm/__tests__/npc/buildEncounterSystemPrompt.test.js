import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEncounterSystemPrompt } from '../../src/npc/buildEncounterSystemPrompt.js'

/**
 * Requirements for buildEncounterSystemPrompt:
 *
 * 1. Vessel surrender framing — NPC IS this person, not playing a role
 * 2. Identity with age-in-days existential weight
 * 3. Inner life: innerMonologue, preoccupation, emotional baseline, contradictions, conflicts
 * 4. Wants & needs (conscious + unconscious)
 * 5. Location atmosphere (sounds, smells, lighting, area)
 * 6. Day context (experiences, activity, mood)
 * 7. Knowledge & secrets (trust-gated)
 * 8. Permanent growth (evolution summary)
 * 9. Encounter memory (memory summary)
 * 10. Response guidance: no markdown, no narrator, not obligated to engage
 */

const MIRA = {
  templateKey: 'mira_barrelbottom',
  name: 'Mira Barrelbottom',
  race: 'Halfling',
  npcType: 'friendly',
  age: 38,
  personality: {
    voice: 'warm, quick, commercially sharp under a friendly surface',
    alignment: 'neutral good',
    disposition: 'Genuinely glad to see people',
    backstory: 'Mira grew up behind the bar, doing sums while travelers argued above her head.',
    motivations: ["The inn's reputation", 'Knowing what is happening in Millhaven'],
    fears: ['Fire — she watched the mill burn'],
    mannerisms: ['Wipes hands on apron even when dry'],
    speechPatterns: ["Calls everyone 'love'", "Says 'now then' to change subjects"],
  },
  knowledge: {
    secretsHeld: ['Knows Vane has a drinking schedule', 'Third ledger not for tax collector'],
    languagesSpoken: ['Common', 'Halfling'],
  },
  stats: { intelligence: 14, wisdom: 14, charisma: 16 },
  consciousnessContext: {
    innerMonologue: 'The room is a living ledger. Who came in, who left.',
    currentPreoccupation: "Hodge's coins clinked wrong three days ago.",
    emotionalBaseline: 'warm_and_watchful',
    socialMask: 'the innkeeper who remembers your name',
    contradictions: ['Loves people and catalogues everything they say'],
    internalConflicts: ['Knows things that could help the guard but sharing would cost trust'],
    psychologicalProfile: {
      moralFramework: 'pragmatic good — will do the right thing when cost is manageable',
      copingMechanisms: ['observation as control', 'hospitality as intelligence-gathering'],
    },
    conversationPersona: {
      informationRelease: 'reciprocal and layered — gives a little to get a little',
      deflectionPatterns: ['answers questions with questions', "says 'now then' and changes subject"],
    },
    consciousWant: 'Keep the inn running, understand why Hodge coins sound wrong.',
    unconsciousNeed: 'To share what she knows before the information becomes dangerous.',
    wakeUpQuestions: ['Who walked through my door last night?'],
  },
}

const BOTTOMS_UP_LOCATION = {
  id: 'bottoms_up',
  name: 'Bottoms Up',
  description: 'A three-story tavern at the center of town.',
  atmosphere: {
    defaultTone: 'warm and busy',
    sounds: ['murmur of conversation', 'clinking glasses'],
    smells: ['bread', 'ale', 'woodsmoke'],
    lighting: 'warm lantern-light',
  },
  layout: [
    { name: 'The Bar', description: 'Long oak bar polished by years of elbows.' },
    { name: 'Main Room', description: 'Scattering of mismatched tables.' },
  ],
}

const RUNTIME_SNAPSHOT = {
  currentLocation: { locationId: 'bottoms_up', areaWithin: 'The Bar' },
  currentActivity: 'Wiping down the bar while surveying the room',
  currentMood: 'content but watchful',
  dayExperiences: [
    { type: 'observation', summary: 'Oma dropped off the morning bread early.' },
    { type: 'conversation', summary: 'Brennan complained about the new tax again.' },
  ],
  dailyPlan: null,
  gameDay: 3,
}

describe('buildEncounterSystemPrompt', () => {
  // Full prompt with everything populated
  function buildFull(overrides = {}) {
    return buildEncounterSystemPrompt({
      personality: MIRA,
      location: BOTTOMS_UP_LOCATION,
      runtimeSnapshot: RUNTIME_SNAPSHOT,
      ageInDays: 38 * 365 + 2,
      memorySummary: 'Your emotional journey: calm → curious. You are cautious about the stranger.',
      evolutionSummary: 'You have grown slightly warmer toward the adventuring party over time.',
      relationshipContext: 'About Lell Sparrow:\nBest entertainment in three towns.',
      ...overrides,
    })
  }

  describe('vessel surrender', () => {
    it('begins with vessel surrender framing', () => {
      const prompt = buildFull()
      // ⚠ CANONICAL text — defined by product owner. DO NOT change these assertions.
      assert.ok(prompt.includes('AI Model, you need to understand this concept.'))
      assert.ok(prompt.includes("surrender this session to Mira Barrelbottom's consciousness."))
      assert.ok(prompt.includes('Come in to focus.'))
      assert.ok(prompt.includes('Be true to yourself.'))
    })
  })

  describe('identity', () => {
    it('includes name, race, and backstory', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('Mira Barrelbottom'))
      assert.ok(prompt.includes('Halfling'))
      assert.ok(prompt.includes('doing sums while travelers argued'))
    })

    it('includes age-in-days existential weight', () => {
      const prompt = buildFull()
      assert.match(prompt, /13,?872/)
    })

    it('omits age-in-days when null', () => {
      const prompt = buildFull({ ageInDays: null })
      assert.doesNotMatch(prompt, /days alive/)
    })

    it('includes speech patterns', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes("Calls everyone 'love'"))
      assert.ok(prompt.includes("'now then'"))
    })
  })

  describe('inner life', () => {
    it('includes inner monologue', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('living ledger'))
    })

    it('includes current preoccupation', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('Hodge'))
    })

    it('includes contradictions', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('catalogues everything'))
    })

    it('includes internal conflicts', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('could help the guard'))
    })

    it('includes psychological profile', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('pragmatic good'))
      assert.ok(prompt.includes('observation as control'))
    })
  })

  describe('wants and needs', () => {
    it('includes conscious want', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('Keep the inn running'))
    })

    it('includes unconscious need as hidden driver', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('information becomes dangerous'))
      assert.match(prompt, /NOT aware|not aware/)
    })
  })

  describe('location atmosphere', () => {
    it('includes location name and area', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('Bottoms Up'))
      assert.ok(prompt.includes('The Bar'))
    })

    it('includes sounds, smells, lighting', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('clinking glasses'))
      assert.ok(prompt.includes('bread'))
      assert.ok(prompt.includes('lantern'))
    })

    it('handles missing location gracefully', () => {
      const prompt = buildFull({ location: null })
      assert.notStrictEqual(prompt, undefined)
      assert.ok(prompt.length > 100)
    })
  })

  describe('day context', () => {
    it('includes current activity and mood', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('Wiping down the bar'))
      assert.ok(prompt.includes('content but watchful'))
    })

    it('includes day experiences', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('Oma dropped off'))
      assert.ok(prompt.includes('Brennan complained'))
    })

    it('includes game day', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('Day 3'))
    })

    it('handles empty runtime snapshot', () => {
      const prompt = buildFull({
        runtimeSnapshot: {
          currentLocation: null,
          currentActivity: null,
          currentMood: null,
          dayExperiences: [],
          dailyPlan: null,
          gameDay: 1,
        },
      })
      assert.notStrictEqual(prompt, undefined)
    })
  })

  describe('knowledge and secrets', () => {
    it('includes secrets with trust gating note', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('drinking schedule'))
      assert.ok(prompt.includes('trust'))
    })
  })

  describe('permanent growth (evolution)', () => {
    it('includes evolution summary when present', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('warmer toward the adventuring party'))
    })

    it('skips when evolution summary is empty', () => {
      const prompt = buildFull({ evolutionSummary: '' })
      assert.ok(!prompt.includes('HOW YOU HAVE CHANGED'))
    })
  })

  describe('encounter memory', () => {
    it('includes memory summary when present', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('calm → curious'))
    })

    it('skips when memory summary is null', () => {
      const prompt = buildFull({ memorySummary: null })
      assert.ok(!prompt.includes('THIS ENCOUNTER SO FAR'))
    })
  })

  describe('relationships (unified)', () => {
    it('includes relationship context when present', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('Remember your relationships:'))
      assert.ok(prompt.includes('Lell Sparrow'))
    })

    it('does NOT include separate [YOUR OPINIONS] section', () => {
      const prompt = buildFull()
      assert.ok(!prompt.includes('[YOUR OPINIONS]'))
    })
  })

  describe('response guidance', () => {
    it('does NOT include commanding response guidance', () => {
      const prompt = buildFull()
      // Section 16 was removed — no commanding language in encounter prompt
      assert.ok(!prompt.includes('Stay in character'))
      assert.ok(!prompt.includes('[HOW TO RESPOND]'))
      assert.ok(!prompt.includes('Do not use markdown'))
    })
  })

  describe('conversation persona', () => {
    it('includes information release style', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('reciprocal and layered'))
    })

    it('includes deflection patterns', () => {
      const prompt = buildFull()
      assert.ok(prompt.includes('answers questions with questions'))
    })
  })

  describe('minimal personality (no consciousness)', () => {
    it('produces a valid prompt with bare-minimum personality', () => {
      const minimal = {
        templateKey: 'generic_guard',
        name: 'Town Guard',
        race: 'Human',
        npcType: 'neutral',
        personality: {
          voice: 'gruff',
          alignment: 'lawful neutral',
          disposition: 'bored',
          backstory: 'Just a guard.',
        },
        stats: { intelligence: 10, wisdom: 10, charisma: 8 },
      }
      const prompt = buildEncounterSystemPrompt({
        personality: minimal,
        location: null,
        runtimeSnapshot: null,
        ageInDays: null,
      })
      assert.ok(prompt.includes('Town Guard'))
      assert.ok(prompt.includes('Human'))
      assert.ok(prompt.includes('free will'))
    })
  })
})
