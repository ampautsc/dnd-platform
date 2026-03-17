/**
 * PersonalityEvolutionService — Tracks permanent NPC personality changes across sessions.
 *
 * While EncounterMemoryService tracks WITHIN a session (trust, emotional arc, etc.),
 * PersonalityEvolutionService tracks ACROSS sessions — permanent shifts that accumulate
 * over the lifetime of a campaign.
 *
 * Tracks:
 *   - Character arc progression (where along their arc is this NPC?)
 *   - Permanent disposition shifts (has the NPC fundamentally changed toward the party?)
 *   - Triggered arc milestones (has the NPC experienced key events that advance their story?)
 *   - Cross-session relationship quality (are they becoming allies? enemies?)
 *   - Opinion mutations (has the NPC's opinion of others changed?)
 *
 * This is a pure in-memory service for now. A persistence adapter can be added later
 * to save evolution state to disk/DB between server restarts.
 *
 * Architecture: This service is QUERIED by the prompt builder and UPDATED by the
 * response service at the end of each encounter/session. It does not call external systems.
 *
 * @module PersonalityEvolutionService
 */

const MAX_PERSONAL_GROWTH = 20;

/**
 * @typedef {Object} EvolutionRecord
 * @property {string}   templateKey
 * @property {number}   arcStage            — 0.0 (arc start) to 1.0 (arc resolution)
 * @property {string[]} arcMilestones       — Descriptive strings of arc-advancing events
 * @property {number}   permanentDisposition — Cumulative permanent disposition shift [-1.0, +1.0]
 * @property {Object.<string, number>} relationshipQuality — entityId → quality [-1.0, +1.0]
 * @property {Object.<string, string>} opinionOverrides    — templateKey → current opinion
 * @property {string[]} personalGrowth      — Descriptive strings of NPC growth/change
 * @property {number}   encountersSurvived
 * @property {number}   createdAt
 * @property {number}   lastUpdatedAt
 */

export class PersonalityEvolutionService {
  constructor() {
    /** @type {Map<string, EvolutionRecord>} */
    this._store = new Map();
  }

  // ── Core API ──────────────────────────────────────────────────────────

  /**
   * Get or create the evolution record for an NPC.
   * @param {string} templateKey
   * @returns {EvolutionRecord|null}
   */
  getEvolution(templateKey) {
    if (!templateKey) return null;
    if (this._store.has(templateKey)) return this._store.get(templateKey);

    const now = Date.now();
    const record = {
      templateKey,
      arcStage: 0.0,
      arcMilestones: [],
      permanentDisposition: 0.0,
      relationshipQuality: {},
      opinionOverrides: {},
      personalGrowth: [],
      encountersSurvived: 0,
      createdAt: now,
      lastUpdatedAt: now,
    };

    this._store.set(templateKey, record);
    return record;
  }

  /**
   * Advance the NPC's character arc by a given amount.
   * Clamped to [0.0, 1.0].
   *
   * @param {string} templateKey
   * @param {number} delta
   * @param {string} [milestone]
   * @returns {EvolutionRecord|null}
   */
  advanceArc(templateKey, delta, milestone) {
    const record = this.getEvolution(templateKey);
    if (!record) return null;

    record.arcStage = clamp(record.arcStage + delta, 0, 1);
    if (milestone) {
      record.arcMilestones.push(milestone);
    }
    record.lastUpdatedAt = Date.now();
    return record;
  }

  /**
   * Shift the NPC's permanent disposition toward or away from the party.
   * Clamped to [-1.0, +1.0].
   *
   * @param {string} templateKey
   * @param {number} delta — Positive = warmer, negative = colder
   * @param {string} [reason]
   * @returns {EvolutionRecord|null}
   */
  shiftDisposition(templateKey, delta, reason) {
    const record = this.getEvolution(templateKey);
    if (!record) return null;

    record.permanentDisposition = clamp(record.permanentDisposition + delta, -1, 1);
    if (reason) {
      record.personalGrowth.push(reason);
    }
    record.lastUpdatedAt = Date.now();
    return record;
  }

  /**
   * Update the NPC's relationship quality with a specific entity.
   * Clamped to [-1.0, +1.0].
   *
   * @param {string} templateKey
   * @param {string} entityId
   * @param {number} delta
   * @returns {EvolutionRecord|null}
   */
  adjustRelationship(templateKey, entityId, delta) {
    const record = this.getEvolution(templateKey);
    if (!record) return null;

    const current = record.relationshipQuality[entityId] ?? 0;
    record.relationshipQuality[entityId] = clamp(current + delta, -1, 1);
    record.lastUpdatedAt = Date.now();
    return record;
  }

  /**
   * Override the NPC's opinion of another NPC.
   *
   * @param {string} templateKey
   * @param {string} targetKey
   * @param {string} opinion
   * @returns {EvolutionRecord|null}
   */
  setOpinionOverride(templateKey, targetKey, opinion) {
    const record = this.getEvolution(templateKey);
    if (!record) return null;

    record.opinionOverrides[targetKey] = opinion;
    record.lastUpdatedAt = Date.now();
    return record;
  }

  /**
   * Record that the NPC survived another encounter.
   *
   * @param {string} templateKey
   * @returns {EvolutionRecord|null}
   */
  recordEncounterSurvived(templateKey) {
    const record = this.getEvolution(templateKey);
    if (!record) return null;

    record.encountersSurvived++;
    record.lastUpdatedAt = Date.now();
    return record;
  }

  /**
   * Consolidate encounter memory into permanent evolution.
   * Called at end of a session/encounter to "crystallize" session-level
   * trust and disposition changes into permanent personality evolution.
   *
   * @param {string} templateKey
   * @param {Object} encounterMemory — From EncounterMemoryService
   * @param {Object} [options]
   * @param {number} [options.crystallizationRate=0.3]
   * @returns {EvolutionRecord|null}
   */
  crystallizeEncounter(templateKey, encounterMemory, options = {}) {
    const record = this.getEvolution(templateKey);
    if (!record || !encounterMemory) return null;

    const rate = typeof options.crystallizationRate === 'number'
      ? clamp(options.crystallizationRate, 0, 1)
      : 0.3;

    // Crystallize session disposition shift into permanent disposition
    if (typeof encounterMemory.dispositionShift === 'number' && encounterMemory.dispositionShift !== 0) {
      const permanentDelta = encounterMemory.dispositionShift * rate;
      record.permanentDisposition = clamp(record.permanentDisposition + permanentDelta, -1, 1);
    }

    // Crystallize trust changes into relationship quality
    if (encounterMemory.trustLevels) {
      const defaultTrust = encounterMemory.defaultTrust ?? 0.3;
      for (const [entityId, trustLevel] of Object.entries(encounterMemory.trustLevels)) {
        const trustDelta = trustLevel - defaultTrust;
        if (Math.abs(trustDelta) > 0.05) {
          const permanentDelta = trustDelta * rate;
          const current = record.relationshipQuality[entityId] ?? 0;
          record.relationshipQuality[entityId] = clamp(current + permanentDelta, -1, 1);
        }
      }
    }

    // Carry over significant moments as personal growth (max 2 per encounter)
    if (encounterMemory.significantMoments && encounterMemory.significantMoments.length > 0) {
      const moments = encounterMemory.significantMoments.slice(0, 2);
      record.personalGrowth.push(...moments);

      if (record.personalGrowth.length > MAX_PERSONAL_GROWTH) {
        record.personalGrowth = record.personalGrowth.slice(-MAX_PERSONAL_GROWTH);
      }
    }

    record.encountersSurvived++;
    record.lastUpdatedAt = Date.now();
    return record;
  }

  // ── Prompt Integration ────────────────────────────────────────────────

  /**
   * Build a natural-language summary of the NPC's permanent evolution
   * for injection into the LLM prompt.
   *
   * @param {string} templateKey
   * @param {Object} [personality]
   * @returns {string}
   */
  buildEvolutionSummary(templateKey, personality) {
    const record = this._store.get(templateKey);
    if (!record || (record.encountersSurvived === 0 && record.arcMilestones.length === 0)) {
      return '';
    }

    const lines = [];

    // Arc progression
    if (personality?.consciousnessContext?.characterArc && record.arcStage > 0) {
      const arc = personality.consciousnessContext.characterArc;
      const pct = Math.round(record.arcStage * 100);
      lines.push(`Character arc: "${arc.summary}" — ${pct}% progressed`);
      if (record.arcMilestones.length > 0) {
        const recent = record.arcMilestones.slice(-3);
        lines.push(`Recent arc moments: ${recent.join('; ')}`);
      }
    }

    // Permanent disposition
    if (Math.abs(record.permanentDisposition) > 0.05) {
      const direction = record.permanentDisposition > 0 ? 'warmer toward' : 'colder toward';
      const intensity = Math.abs(record.permanentDisposition);
      let desc;
      if (intensity > 0.6) desc = 'significantly';
      else if (intensity > 0.3) desc = 'notably';
      else desc = 'slightly';
      lines.push(`You have grown ${desc} ${direction} the adventuring party over time`);
    }

    // Personal growth
    if (record.personalGrowth.length > 0) {
      const recent = record.personalGrowth.slice(-3);
      lines.push(`Things that have shaped you: ${recent.join('; ')}`);
    }

    // Experience
    if (record.encountersSurvived > 1) {
      lines.push(`You have survived ${record.encountersSurvived} encounters with these adventurers`);
    }

    return lines.length > 0 ? lines.join('\n') : '';
  }

  /**
   * Build opinions context — merges base personality `opinionsAbout` with
   * any runtime opinion overrides from evolution.
   *
   * @param {string} templateKey
   * @param {Object} personality
   * @param {string[]} [nearbyNpcKeys]
   * @returns {string}
   */
  buildOpinionsContext(templateKey, personality, nearbyNpcKeys) {
    const opinions = personality?.consciousnessContext?.opinionsAbout || {};
    const record = this._store.get(templateKey);
    const overrides = record?.opinionOverrides || {};

    const mergedKeys = new Set([
      ...Object.keys(opinions),
      ...Object.keys(overrides),
    ]);

    if (mergedKeys.size === 0) return '';

    const relevantKeys = nearbyNpcKeys
      ? [...mergedKeys].filter(k => nearbyNpcKeys.includes(k))
      : [...mergedKeys];

    if (relevantKeys.length === 0) return '';

    const lines = relevantKeys.map(key => {
      const opinion = overrides[key] || opinions[key];
      return `About ${key}: ${opinion}`;
    });

    return lines.join('\n');
  }

  // ── Housekeeping ──────────────────────────────────────────────────────

  clearAll() {
    this._store.clear();
  }

  clearEvolution(templateKey) {
    this._store.delete(templateKey);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
