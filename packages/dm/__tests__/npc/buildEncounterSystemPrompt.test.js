import { describe, it, expect } from 'vitest'
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
      expect(prompt).toContain('AI Model, you need to understand this concept.')
      expect(prompt).toContain("surrender this session to Mira Barrelbottom's consciousness.")
      expect(prompt).toContain('Come in to focus.')
      expect(prompt).toContain('Be true to yourself.')
    })
  })

  describe('identity', () => {
    it('includes name, race, and backstory', () => {
      const prompt = buildFull()
      expect(prompt).toContain('Mira Barrelbottom')
      expect(prompt).toContain('Halfling')
      expect(prompt).toContain('doing sums while travelers argued')
    })

    it('includes age-in-days existential weight', () => {
      const prompt = buildFull()
      expect(prompt).toMatch(/13,?872/)
    })

    it('omits age-in-days when null', () => {
      const prompt = buildFull({ ageInDays: null })
      expect(prompt).not.toMatch(/days alive/)
    })

    it('includes speech patterns', () => {
      const prompt = buildFull()
      expect(prompt).toContain("Calls everyone 'love'")
      expect(prompt).toContain("'now then'")
    })
  })

  describe('inner life', () => {
    it('includes inner monologue', () => {
      const prompt = buildFull()
      expect(prompt).toContain('living ledger')
    })

    it('includes current preoccupation', () => {
      const prompt = buildFull()
      expect(prompt).toContain('Hodge')
    })

    it('includes contradictions', () => {
      const prompt = buildFull()
      expect(prompt).toContain('catalogues everything')
    })

    it('includes internal conflicts', () => {
      const prompt = buildFull()
      expect(prompt).toContain('could help the guard')
    })

    it('includes psychological profile', () => {
      const prompt = buildFull()
      expect(prompt).toContain('pragmatic good')
      expect(prompt).toContain('observation as control')
    })
  })

  describe('wants and needs', () => {
    it('includes conscious want', () => {
      const prompt = buildFull()
      expect(prompt).toContain('Keep the inn running')
    })

    it('includes unconscious need as hidden driver', () => {
      const prompt = buildFull()
      expect(prompt).toContain('information becomes dangerous')
      expect(prompt).toMatch(/NOT aware|not aware/)
    })
  })

  describe('location atmosphere', () => {
    it('includes location name and area', () => {
      const prompt = buildFull()
      expect(prompt).toContain('Bottoms Up')
      expect(prompt).toContain('The Bar')
    })

    it('includes sounds, smells, lighting', () => {
      const prompt = buildFull()
      expect(prompt).toContain('clinking glasses')
      expect(prompt).toContain('bread')
      expect(prompt).toContain('lantern')
    })

    it('handles missing location gracefully', () => {
      const prompt = buildFull({ location: null })
      expect(prompt).toBeDefined()
      expect(prompt.length).toBeGreaterThan(100)
    })
  })

  describe('day context', () => {
    it('includes current activity and mood', () => {
      const prompt = buildFull()
      expect(prompt).toContain('Wiping down the bar')
      expect(prompt).toContain('content but watchful')
    })

    it('includes day experiences', () => {
      const prompt = buildFull()
      expect(prompt).toContain('Oma dropped off')
      expect(prompt).toContain('Brennan complained')
    })

    it('includes game day', () => {
      const prompt = buildFull()
      expect(prompt).toContain('Day 3')
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
      expect(prompt).toBeDefined()
    })
  })

  describe('knowledge and secrets', () => {
    it('includes secrets with trust gating note', () => {
      const prompt = buildFull()
      expect(prompt).toContain('drinking schedule')
      expect(prompt).toContain('trust')
    })
  })

  describe('permanent growth (evolution)', () => {
    it('includes evolution summary when present', () => {
      const prompt = buildFull()
      expect(prompt).toContain('warmer toward the adventuring party')
    })

    it('skips when evolution summary is empty', () => {
      const prompt = buildFull({ evolutionSummary: '' })
      expect(prompt).not.toContain('HOW YOU HAVE CHANGED')
    })
  })

  describe('encounter memory', () => {
    it('includes memory summary when present', () => {
      const prompt = buildFull()
      expect(prompt).toContain('calm → curious')
    })

    it('skips when memory summary is null', () => {
      const prompt = buildFull({ memorySummary: null })
      expect(prompt).not.toContain('THIS ENCOUNTER SO FAR')
    })
  })

  describe('relationships (unified)', () => {
    it('includes relationship context when present', () => {
      const prompt = buildFull()
      expect(prompt).toContain('Remember your relationships:')
      expect(prompt).toContain('Lell Sparrow')
    })

    it('does NOT include separate [YOUR OPINIONS] section', () => {
      const prompt = buildFull()
      expect(prompt).not.toContain('[YOUR OPINIONS]')
    })
  })

  describe('response guidance', () => {
    it('does NOT include commanding response guidance', () => {
      const prompt = buildFull()
      // Section 16 was removed — no commanding language in encounter prompt
      expect(prompt).not.toContain('Stay in character')
      expect(prompt).not.toContain('[HOW TO RESPOND]')
      expect(prompt).not.toContain('Do not use markdown')
    })
  })

  describe('conversation persona', () => {
    it('includes information release style', () => {
      const prompt = buildFull()
      expect(prompt).toContain('reciprocal and layered')
    })

    it('includes deflection patterns', () => {
      const prompt = buildFull()
      expect(prompt).toContain('answers questions with questions')
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
      expect(prompt).toContain('Town Guard')
      expect(prompt).toContain('Human')
      expect(prompt).toContain('free will')
    })
  })
})
