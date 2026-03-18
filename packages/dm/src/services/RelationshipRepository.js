/**
 * RelationshipRepository — Persistent memory for relationships between entities.
 *
 * Stores bidirectional relationships between any two entities (NPC↔player, NPC↔NPC).
 * Each relationship tracks: recognition tier, display label, narrative memories,
 * emotional valence, encounter count, and timestamps.
 *
 * Pure in-memory by default. Accepts an optional persistence adapter for DB backing.
 * The adapter interface:
 *   - save(subjectId, targetId, data)   → persists one relationship
 *   - load(subjectId, targetId)         → returns one relationship or null
 *   - loadAll()                         → returns all relationships as array
 *
 * Architecture: This is a data layer. No LLM calls, no HTTP, no game logic.
 * MemorySynthesizer populates it; prompt builders read from it.
 *
 * @module RelationshipRepository
 */

export const RECOGNITION_TIERS = ['stranger', 'recognized', 'acquaintance', 'familiar'];
export const SIGNIFICANCE_LEVELS = ['trivial', 'minor', 'notable', 'major', 'life-changing'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tierIndex(tier) {
  const idx = RECOGNITION_TIERS.indexOf(tier);
  if (idx === -1) throw new Error(`Invalid recognition tier: "${tier}"`);
  return idx;
}

function valenceDescription(valence) {
  if (valence >= 0.5) return 'warm and positive';
  if (valence >= 0.2) return 'mildly favorable';
  if (valence > -0.2) return 'neutral';
  if (valence > -0.5) return 'somewhat cool';
  return 'cold and negative';
}

export class RelationshipRepository {
  /**
   * @param {Object} [options]
   * @param {Object} [options.persistenceAdapter] — { save, load, loadAll }
   */
  constructor(options = {}) {
    /** @type {Map<string, Object>} keyed by "subjectId::targetId" */
    this._store = new Map();
    this._adapter = options.persistenceAdapter || null;
  }

  // ── Key helper ──────────────────────────────────────────────────

  _key(subjectId, targetId) {
    return `${subjectId}::${targetId}`;
  }

  // ── Core CRUD ───────────────────────────────────────────────────

  /**
   * Get an existing relationship or null.
   */
  getRelationship(subjectId, targetId) {
    const key = this._key(subjectId, targetId);
    return this._store.get(key) || null;
  }

  /**
   * Get an existing relationship, or create a default one.
   * Checks the persistence adapter if not found in memory.
   */
  getOrCreateRelationship(subjectId, targetId) {
    const key = this._key(subjectId, targetId);

    if (this._store.has(key)) {
      return this._store.get(key);
    }

    // Check persistence adapter
    if (this._adapter && typeof this._adapter.load === 'function') {
      const loaded = this._adapter.load(subjectId, targetId);
      if (loaded) {
        this._store.set(key, loaded);
        return loaded;
      }
    }

    const now = new Date().toISOString();
    const rel = {
      subjectId,
      targetId,
      recognitionTier: 'stranger',
      displayLabel: null,
      opinion: null,
      memories: [],
      emotionalValence: 0,
      encounterCount: 0,
      lastEncounter: null,
      createdAt: now,
    };

    this._store.set(key, rel);
    return rel;
  }

  // ── Recognition Tiers ───────────────────────────────────────────

  /**
   * Promote a relationship to a higher recognition tier.
   * Cannot demote. Cannot skip tiers — if the requested tier is 2+ above current,
   * advances by exactly one step.
   */
  promoteTier(subjectId, targetId, newTier) {
    tierIndex(newTier); // validate
    const rel = this.getOrCreateRelationship(subjectId, targetId);
    const currentIdx = tierIndex(rel.recognitionTier);
    const requestedIdx = tierIndex(newTier);

    if (requestedIdx <= currentIdx) return rel; // no demotion

    // Advance by one step if trying to skip
    const nextIdx = Math.min(currentIdx + 1, RECOGNITION_TIERS.length - 1);
    rel.recognitionTier = RECOGNITION_TIERS[nextIdx];
    this._persist(subjectId, targetId);
    return rel;
  }

  // ── Display Labels ──────────────────────────────────────────────

  /**
   * Set the appearance-based display label for a relationship.
   */
  setDisplayLabel(subjectId, targetId, label) {
    const rel = this.getOrCreateRelationship(subjectId, targetId);
    rel.displayLabel = label;
    this._persist(subjectId, targetId);
  }

  /**
   * Get the appropriate display name for an entity, based on recognition.
   * - stranger/recognized: use displayLabel (falls back to realName)
   * - acquaintance/familiar: use realName
   */
  getDisplayName(subjectId, targetId, realName) {
    const rel = this.getRelationship(subjectId, targetId);
    if (!rel) return realName;

    const idx = tierIndex(rel.recognitionTier);
    // acquaintance (2) and familiar (3) know the name
    if (idx >= 2) return realName;

    // stranger/recognized use display label
    return rel.displayLabel || realName;
  }

  // ── Memory Recording ────────────────────────────────────────────

  /**
   * Record a narrative memory from an encounter.
   *
   * @param {string} subjectId
   * @param {string} targetId
   * @param {Object} memory
   * @param {string} memory.summary — Narrative paragraph
   * @param {string} [memory.significance='minor'] — trivial|minor|notable|major|life-changing
   */
  recordMemory(subjectId, targetId, memory) {
    const significance = memory.significance || 'minor';
    if (!SIGNIFICANCE_LEVELS.includes(significance)) {
      throw new Error(`Invalid significance level: "${significance}". Must be one of: ${SIGNIFICANCE_LEVELS.join(', ')}`);
    }

    const rel = this.getOrCreateRelationship(subjectId, targetId);
    rel.memories.push({
      summary: memory.summary,
      significance,
      date: new Date().toISOString(),
    });
    rel.encounterCount++;
    rel.lastEncounter = new Date().toISOString();
    this._persist(subjectId, targetId);
  }

  // ── Emotional Valence ───────────────────────────────────────────

  /**
   * Adjust emotional valence. Clamped to [-1, 1].
   */
  adjustValence(subjectId, targetId, delta) {
    const rel = this.getOrCreateRelationship(subjectId, targetId);
    rel.emotionalValence = clamp(rel.emotionalValence + delta, -1, 1);
    this._persist(subjectId, targetId);
  }

  // ── Opinion ─────────────────────────────────────────────────────

  /**
   * Set or update the opinion text for a relationship.
   */
  setOpinion(subjectId, targetId, opinion) {
    const rel = this.getOrCreateRelationship(subjectId, targetId);
    rel.opinion = opinion;
    this._persist(subjectId, targetId);
  }

  // ── Bulk Queries ────────────────────────────────────────────────

  /**
   * Get all relationships where subjectId is the given entity.
   */
  getRelationshipsForSubject(subjectId) {
    const results = [];
    for (const rel of this._store.values()) {
      if (rel.subjectId === subjectId) results.push(rel);
    }
    return results;
  }

  /**
   * Get all relationships where targetId is the given entity.
   */
  getRelationshipsAbout(targetId) {
    const results = [];
    for (const rel of this._store.values()) {
      if (rel.targetId === targetId) results.push(rel);
    }
    return results;
  }

  /**
   * Get all relationships between a set of scene participants.
   */
  getSceneRelationships(participantIds) {
    const set = new Set(participantIds);
    const results = [];
    for (const rel of this._store.values()) {
      if (set.has(rel.subjectId) && set.has(rel.targetId)) {
        results.push(rel);
      }
    }
    return results;
  }

  // ── Memory Context for Prompts ──────────────────────────────────

  /**
   * Format relationship data into a narrative string for prompt injection.
   * Returns null if no relationship exists.
   */
  getMemoryContext(subjectId, targetId) {
    const rel = this.getRelationship(subjectId, targetId);
    if (!rel) return null;

    const lines = [];

    // Opinion prose first — the consciousness's own voice
    if (rel.opinion) {
      lines.push(rel.opinion);
    }

    // Structured relationship metadata
    lines.push(`Recognition: ${rel.recognitionTier}`);
    lines.push(`Feeling toward them: ${valenceDescription(rel.emotionalValence)}`);
    if (rel.encounterCount > 0) {
      lines.push(`Encounters: ${rel.encounterCount}`);
    }

    if (rel.memories.length > 0) {
      lines.push('Memories:');
      // Most recent memories first, limited to last 5 for token economy
      const recentMemories = rel.memories.slice(-5);
      for (const mem of recentMemories) {
        lines.push(`- [${mem.significance}] ${mem.summary}`);
      }
    }

    return lines.join('\n');
  }

  // ── Pre-seeding ─────────────────────────────────────────────────

  /**
   * Seed a pre-existing relationship (e.g., NPCs who already know each other).
   * Will NOT overwrite an existing dynamic relationship.
   */
  seedRelationship(data) {
    const key = this._key(data.subjectId, data.targetId);
    if (this._store.has(key)) return; // don't overwrite dynamic data

    const now = new Date().toISOString();
    this._store.set(key, {
      subjectId: data.subjectId,
      targetId: data.targetId,
      recognitionTier: data.recognitionTier || 'stranger',
      displayLabel: data.displayLabel || null,
      opinion: data.opinion !== undefined ? data.opinion : null,
      memories: data.memories || [],
      emotionalValence: data.emotionalValence || 0,
      encounterCount: data.encounterCount || 0,
      lastEncounter: data.lastEncounter || null,
      createdAt: data.createdAt || now,
    });
  }

  /**
   * Seed relationships from a personality's opinionsAbout data.
   * Each opinion target becomes a 'familiar' relationship with the opinion text.
   * Will NOT overwrite existing dynamic relationships.
   *
   * @param {Object} personality — NPC personality data (must have templateKey)
   */
  seedFromPersonality(personality) {
    const subjectId = personality.templateKey;
    if (!subjectId) return;

    const opinions = personality?.consciousnessContext?.opinionsAbout || {};
    for (const [targetId, opinion] of Object.entries(opinions)) {
      this.seedRelationship({
        subjectId,
        targetId,
        recognitionTier: 'familiar',
        opinion,
      });
    }
  }

  /**
   * Build unified relationship context for prompt injection.
   * Combines opinion prose + structured data for each scene participant.
   *
   * @param {string} subjectId — The NPC whose perspective we're building
   * @param {Array<{id: string, templateKey: string, name: string}>} participants
   * @returns {string} Formatted relationship context or ''
   */
  buildRelationshipContext(subjectId, participants) {
    const parts = [];
    for (const other of participants) {
      const targetId = other.templateKey || other.id;
      const ctx = this.getMemoryContext(subjectId, targetId);
      if (!ctx) continue;
      const displayName = this.getDisplayName(subjectId, targetId, other.name);
      parts.push(`About ${displayName}:\n${ctx}`);
    }
    return parts.join('\n\n');
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  clearAll() {
    this._store.clear();
  }

  // ── Persistence ─────────────────────────────────────────────────

  _persist(subjectId, targetId) {
    if (!this._adapter || typeof this._adapter.save !== 'function') return;
    const rel = this.getRelationship(subjectId, targetId);
    if (rel) {
      this._adapter.save(subjectId, targetId, { ...rel });
    }
  }
}
