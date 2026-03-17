/**
 * EncounterMemoryService — Per-NPC, per-session runtime memory.
 *
 * Tracks what has happened to an NPC during an encounter/session:
 *   - Entities they've interacted with
 *   - Trust levels toward specific entities
 *   - Emotional arc across multiple responses
 *   - Secrets that have been hinted at or revealed
 *   - Significant moments (high-drama events the NPC would remember)
 *   - Disposition shift (cumulative mood change toward the party)
 *
 * This is a pure in-memory service — no database, no Express, no side effects.
 * State is held in a Map keyed by `${sessionId}:${npcId}`.
 *
 * Architecture note: This service is QUERIED by the prompt builder and
 * UPDATED by the response service after each interaction.
 */

const REVEALED_FIELDS = [
    'appearance', 'disposition', 'backstory', 'voice',
    'motivations', 'fears', 'mannerisms', 'speechPatterns',
];

const ARRAY_FIELDS = ['motivations', 'fears', 'mannerisms', 'speechPatterns'];

/** Trigger event → trust/disposition heuristics */
const TRIGGER_EFFECTS = {
    player_addressed: { trustDelta: 0.05, dispositionDelta: 0.02, significantMoment: null },
    ally_died:        { trustDelta: -0.15, dispositionDelta: -0.2, momentTemplate: 'An ally fell in battle — $ENTITY was involved' },
    attacked:         { trustDelta: -0.25, dispositionDelta: -0.3, momentTemplate: '$ENTITY attacked me directly' },
    enemy_died:       { trustDelta: 0.1, dispositionDelta: 0.1, significantMoment: null },
    near_death:       { trustDelta: -0.1, dispositionDelta: -0.15, significantMoment: 'I was brought to the edge of death' },
    combat_end:       { trustDelta: 0.1, dispositionDelta: 0.05, significantMoment: null },
    discovery:        { trustDelta: 0.1, dispositionDelta: 0.08, significantMoment: null },
    combat_start:     { trustDelta: 0, dispositionDelta: 0, significantMoment: null },
};

export class EncounterMemoryService {
    constructor() {
        /** @type {Map<string, Object>} */
        this._store = new Map();
    }

    // ── Key helpers ────────────────────────────────────────────────

    _memKey(sessionId, npcId) {
        return `${sessionId || 'global'}:${npcId}`;
    }

    // ── Core API ───────────────────────────────────────────────────

    getMemory(sessionId, npcId, options = {}) {
        const key = this._memKey(sessionId, npcId);
        if (this._store.has(key)) {
            return this._store.get(key);
        }

        const defaultTrust = typeof options.defaultTrust === 'number' ? options.defaultTrust : 0.3;
        const now = Date.now();

        const memory = {
            npcId,
            sessionId,
            entitiesInteractedWith: [],
            trustLevels: {},
            emotionalArc: [],
            secretsRevealed: [],
            secretsHinted: [],
            significantMoments: [],
            currentMood: 'neutral',
            dispositionShift: 0,
            interactionCount: 0,
            revealedInfo: {
                appearance: null,
                disposition: null,
                backstory: null,
                voice: null,
                motivations: null,
                fears: null,
                mannerisms: null,
                speechPatterns: null,
            },
            defaultTrust,
            createdAt: now,
            lastUpdatedAt: now,
        };

        this._store.set(key, memory);
        return memory;
    }

    hasMemory(sessionId, npcId) {
        return this._store.has(this._memKey(sessionId, npcId));
    }

    // ── Trust management ───────────────────────────────────────────

    getTrust(sessionId, npcId, entityId) {
        const memory = this.getMemory(sessionId, npcId);
        if (entityId in memory.trustLevels) {
            return memory.trustLevels[entityId];
        }
        return memory.defaultTrust;
    }

    adjustTrust(sessionId, npcId, entityId, delta) {
        const memory = this.getMemory(sessionId, npcId);
        const current = entityId in memory.trustLevels
            ? memory.trustLevels[entityId]
            : memory.defaultTrust;

        const newTrust = Math.max(0, Math.min(1, current + delta));
        memory.trustLevels[entityId] = newTrust;
        memory.lastUpdatedAt = Date.now();
        return newTrust;
    }

    setTrust(sessionId, npcId, entityId, value) {
        const memory = this.getMemory(sessionId, npcId);
        memory.trustLevels[entityId] = Math.max(0, Math.min(1, value));
        memory.lastUpdatedAt = Date.now();
    }

    // ── Emotional arc tracking ─────────────────────────────────────

    recordEmotion(sessionId, npcId, emotionalState) {
        const memory = this.getMemory(sessionId, npcId);
        memory.emotionalArc.push(emotionalState);
        memory.currentMood = emotionalState;
        memory.lastUpdatedAt = Date.now();
    }

    getRecentEmotions(sessionId, npcId, n = 3) {
        const memory = this.getMemory(sessionId, npcId);
        return memory.emotionalArc.slice(-n);
    }

    // ── Significant moments ────────────────────────────────────────

    recordSignificantMoment(sessionId, npcId, description) {
        const memory = this.getMemory(sessionId, npcId);
        memory.significantMoments.push(description);
        memory.lastUpdatedAt = Date.now();
    }

    // ── Secrets tracking ───────────────────────────────────────────

    hintSecret(sessionId, npcId, secretKey) {
        const memory = this.getMemory(sessionId, npcId);
        if (!memory.secretsHinted.includes(secretKey)) {
            memory.secretsHinted.push(secretKey);
        }
        memory.lastUpdatedAt = Date.now();
    }

    revealSecret(sessionId, npcId, secretKey) {
        const memory = this.getMemory(sessionId, npcId);
        if (!memory.secretsRevealed.includes(secretKey)) {
            memory.secretsRevealed.push(secretKey);
        }
        memory.secretsHinted = memory.secretsHinted.filter(s => s !== secretKey);
        memory.lastUpdatedAt = Date.now();
    }

    isSecretRevealed(sessionId, npcId, secretKey) {
        const memory = this.getMemory(sessionId, npcId);
        return memory.secretsRevealed.includes(secretKey);
    }

    isSecretHinted(sessionId, npcId, secretKey) {
        const memory = this.getMemory(sessionId, npcId);
        return memory.secretsHinted.includes(secretKey);
    }

    // ── Revealed info (progressive character discovery) ────────────

    revealInfo(sessionId, npcId, field, value) {
        if (!REVEALED_FIELDS.includes(field)) return;
        const memory = this.getMemory(sessionId, npcId);

        if (ARRAY_FIELDS.includes(field)) {
            const incoming = Array.isArray(value) ? value : [value];
            const existing = memory.revealedInfo[field] || [];
            const merged = [...existing];
            for (const item of incoming) {
                if (!merged.includes(item)) merged.push(item);
            }
            memory.revealedInfo[field] = merged;
        } else {
            if (memory.revealedInfo[field] && value) {
                memory.revealedInfo[field] = `${memory.revealedInfo[field]} ${value}`;
            } else {
                memory.revealedInfo[field] = value;
            }
        }
        memory.lastUpdatedAt = Date.now();
    }

    getRevealedInfo(sessionId, npcId) {
        const memory = this.getMemory(sessionId, npcId);
        return { ...memory.revealedInfo };
    }

    // ── Interaction tracking ───────────────────────────────────────

    recordEntityInteraction(sessionId, npcId, entityId) {
        const memory = this.getMemory(sessionId, npcId);
        if (!memory.entitiesInteractedWith.includes(entityId)) {
            memory.entitiesInteractedWith.push(entityId);
        }
        memory.lastUpdatedAt = Date.now();
    }

    recordInteraction(sessionId, npcId) {
        const memory = this.getMemory(sessionId, npcId);
        memory.interactionCount += 1;
        memory.lastUpdatedAt = Date.now();
    }

    // ── Disposition shift ──────────────────────────────────────────

    adjustDisposition(sessionId, npcId, delta) {
        const memory = this.getMemory(sessionId, npcId);
        memory.dispositionShift = Math.max(-1, Math.min(1, memory.dispositionShift + delta));
        memory.lastUpdatedAt = Date.now();
        return memory.dispositionShift;
    }

    // ── Trigger-based trust inference ──────────────────────────────

    applyTriggerEffects(sessionId, npcId, triggerEvent, entityId) {
        const effects = TRIGGER_EFFECTS[triggerEvent] || { trustDelta: 0, dispositionDelta: 0, significantMoment: null };

        // Resolve moment template
        let significantMoment = effects.significantMoment || null;
        if (effects.momentTemplate) {
            significantMoment = effects.momentTemplate.replace('$ENTITY', entityId || 'someone');
        }

        if (entityId && effects.trustDelta !== 0) {
            this.adjustTrust(sessionId, npcId, entityId, effects.trustDelta);
        }
        if (effects.dispositionDelta !== 0) {
            this.adjustDisposition(sessionId, npcId, effects.dispositionDelta);
        }
        if (significantMoment) {
            this.recordSignificantMoment(sessionId, npcId, significantMoment);
        }

        return { trustDelta: effects.trustDelta, dispositionDelta: effects.dispositionDelta, significantMoment };
    }

    // ── Memory → prompt helper ─────────────────────────────────────

    buildMemorySummary(sessionId, npcId) {
        if (!this.hasMemory(sessionId, npcId)) return null;

        const memory = this.getMemory(sessionId, npcId);
        if (memory.interactionCount === 0) return null;

        const lines = [];

        // Emotional arc
        if (memory.emotionalArc.length > 1) {
            const recent = memory.emotionalArc.slice(-4);
            lines.push(`Your emotional journey this encounter: ${recent.join(' → ')}.`);
        }

        // Current mood vs disposition
        if (memory.currentMood && memory.currentMood !== 'neutral') {
            const dispWord = memory.dispositionShift > 0.1 ? 'warming to'
                : memory.dispositionShift < -0.1 ? 'cooling toward'
                : 'uncertain about';
            lines.push(`Your current mood is ${memory.currentMood}. You are ${dispWord} those around you.`);
        }

        // Trust toward specific entities
        const trustEntries = Object.entries(memory.trustLevels);
        if (trustEntries.length > 0) {
            const trustDescs = trustEntries.map(([entity, level]) => {
                const desc = level >= 0.7 ? 'trust significantly'
                    : level >= 0.5 ? 'are beginning to trust'
                    : level >= 0.3 ? 'are cautious about'
                    : level >= 0.15 ? 'distrust'
                    : 'deeply distrust';
                return `You ${desc} ${entity} (trust: ${level.toFixed(2)})`;
            });
            lines.push(trustDescs.join('. ') + '.');
        }

        // Significant moments
        if (memory.significantMoments.length > 0) {
            const recent = memory.significantMoments.slice(-3);
            lines.push(`Key moments you remember: ${recent.join('; ')}.`);
        }

        // Secrets state
        if (memory.secretsHinted.length > 0) {
            lines.push(`You have hinted at secrets about: ${memory.secretsHinted.join(', ')}.`);
        }
        if (memory.secretsRevealed.length > 0) {
            lines.push(`You have already revealed: ${memory.secretsRevealed.join(', ')} — do not repeat these revelations.`);
        }

        // Interaction count context
        if (memory.interactionCount >= 3) {
            lines.push(`This is your ${memory.interactionCount + 1}th exchange in this encounter. You have a history with these people now.`);
        }

        if (lines.length === 0) return null;
        return lines.join('\n');
    }

    // ── Session cleanup ────────────────────────────────────────────

    clearSessionMemory(sessionId) {
        for (const key of this._store.keys()) {
            if (key.startsWith(`${sessionId}:`)) {
                this._store.delete(key);
            }
        }
    }

    clearAllMemory() {
        this._store.clear();
    }
}
