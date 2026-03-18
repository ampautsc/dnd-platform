/**
 * NpcRuntimeContext — mutable per-NPC state that lives outside core character data.
 *
 * Core character data (personality, backstory, stats) lives in content/ and is immutable.
 * This service tracks what each NPC is doing RIGHT NOW: where they are, what activity
 * they're engaged in, their current mood, and what has happened to them today.
 *
 * Phase 1: In-memory only. Phase 2: persisted across sessions.
 */
export class NpcRuntimeContext {
  #npcs = new Map()
  #gameDay

  /**
   * @param {object} [options]
   * @param {number} [options.gameDay=1] - Current day of the campaign
   */
  constructor(options = {}) {
    this.#gameDay = options.gameDay ?? 1
  }

  // --- Mutators ---

  /**
   * @param {string} npcId
   * @param {{ locationId: string, areaWithin?: string, arrivedAt?: string }} location
   */
  setLocation(npcId, location) {
    this.#ensure(npcId).currentLocation = { ...location }
  }

  /** @param {string} npcId @param {string} activity */
  setActivity(npcId, activity) {
    this.#ensure(npcId).currentActivity = activity
  }

  /** @param {string} npcId @param {string} mood */
  setMood(npcId, mood) {
    this.#ensure(npcId).currentMood = mood
  }

  /**
   * @param {string} npcId
   * @param {{ type: string, summary: string, participants?: string[] }} experience
   */
  recordExperience(npcId, experience) {
    this.#ensure(npcId).dayExperiences.push({
      ...experience,
      timestamp: Date.now(),
    })
  }

  // --- Queries ---

  /** @param {string} npcId @returns {object[]} */
  getExperiencesSoFar(npcId) {
    return this.#get(npcId)?.dayExperiences ?? []
  }

  /** @returns {number} */
  getGameDay() {
    return this.#gameDay
  }

  /**
   * Full runtime snapshot for prompt building.
   * @param {string} npcId
   * @returns {{ currentLocation, currentActivity, currentMood, dayExperiences, dailyPlan, gameDay }}
   */
  getSnapshot(npcId) {
    const record = this.#get(npcId)
    return {
      currentLocation: record?.currentLocation ?? null,
      currentActivity: record?.currentActivity ?? null,
      currentMood: record?.currentMood ?? null,
      dayExperiences: record?.dayExperiences ? [...record.dayExperiences] : [],
      dailyPlan: record?.dailyPlan ?? null,
      gameDay: this.#gameDay,
    }
  }

  /**
   * Compute total days alive for existential weight in prompt.
   * @param {{ age?: number }} personality - NPC personality data with optional age
   * @returns {number|null}
   */
  computeAgeInDays(personality) {
    if (personality?.age == null) return null
    return personality.age * 365 + (this.#gameDay - 1)
  }

  // --- Day lifecycle ---

  /** Advance to the next day: clears day experiences, increments day counter. */
  advanceDay() {
    this.#gameDay++
    for (const record of this.#npcs.values()) {
      record.dayExperiences = []
    }
  }

  /** Remove all runtime state for an NPC. */
  clearNpc(npcId) {
    this.#npcs.delete(npcId)
  }

  // --- Private helpers ---

  #ensure(npcId) {
    if (!this.#npcs.has(npcId)) {
      this.#npcs.set(npcId, {
        currentLocation: null,
        currentActivity: null,
        currentMood: null,
        dayExperiences: [],
        dailyPlan: null,
      })
    }
    return this.#npcs.get(npcId)
  }

  #get(npcId) {
    return this.#npcs.get(npcId)
  }
}
