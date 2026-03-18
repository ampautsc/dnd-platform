/**
 * CharacterResponseService — Orchestrates NPC character responses.
 *
 * Responsibilities:
 *   1. Accept a provider (LLM or Mock) and context builder via constructor injection
 *   2. Build context from personality + game state, call provider
 *   3. On LLM failure → use pre-written fallback lines from personality record
 *   4. Track avoidRepetition per-session per-NPC
 *   5. Return a ResponseResult with text + metadata
 *
 * This is a pure service — no Express, no database, no direct external API calls.
 * All LLM interaction goes through the injected provider.
 */

const MAX_STORED_RESPONSES = 5;

/** Global fallback lines when personality has none for a trigger */
const GLOBAL_FALLBACK_LINES = {
    player_addressed: {
        enemy: ['...', 'Hmph.', 'Leave me be.'],
        friendly: ['Hello there.', 'Good to see you.'],
        neutral: ['Yes?', 'What is it?'],
        default: ['...'],
    },
    combat_start: {
        enemy: ['Prepare yourself!', 'You will regret this!'],
        friendly: ['Stand with me!', 'Together!'],
        default: ['To arms!'],
    },
    near_death: {
        enemy: ['This... isn\'t over...', 'No...'],
        friendly: ['I can\'t... hold on...', 'Go... without me...'],
        default: ['Not like this...'],
    },
    attacked: {
        enemy: ['You\'ll pay for that!', 'Fool!'],
        friendly: ['Watch your aim!', 'Careful!'],
        default: ['Ugh!'],
    },
    ally_died: {
        enemy: ['One less to worry about.', 'Weak.'],
        friendly: ['No! Fall back!', 'We must avenge them!'],
        default: ['...'],
    },
    combat_end: {
        enemy: ['This isn\'t over.', 'We\'ll meet again.'],
        friendly: ['We survived.', 'Is everyone alright?'],
        default: ['It\'s done.'],
    },
    default: {
        default: ['...'],
    },
};

export class CharacterResponseService {
    constructor({ provider, contextBuilder }) {
        if (!provider) throw new Error('CharacterResponseService requires a provider');
        if (!contextBuilder) throw new Error('CharacterResponseService requires a contextBuilder');

        this.provider = provider;
        this.contextBuilder = contextBuilder;

        /** @type {Map<string, string[]>} key: `${sessionId}:${npcId}` */
        this._recentResponseCache = new Map();
    }

    // ── Cache key helpers ──────────────────────────────────────────

    _recentKey(sessionId, npcId) {
        return `${sessionId || 'global'}:${npcId}`;
    }

    getRecentResponses(sessionId, npcId) {
        return this._recentResponseCache.get(this._recentKey(sessionId, npcId)) || [];
    }

    _recordResponse(sessionId, npcId, text) {
        const key = this._recentKey(sessionId, npcId);
        const prior = this._recentResponseCache.get(key) || [];
        const next = [...prior, text].slice(-MAX_STORED_RESPONSES);
        this._recentResponseCache.set(key, next);
    }

    clearSessionCache(sessionId) {
        for (const key of this._recentResponseCache.keys()) {
            if (key.startsWith(`${sessionId}:`)) {
                this._recentResponseCache.delete(key);
            }
        }
    }

    // ── Fallback line selection ────────────────────────────────────

    selectFallbackLine(personality, triggerEvent, avoidList = []) {
        let pool = null;

        // 1. Try personality record's custom fallbackLines first
        if (personality && personality.fallbackLines) {
            const stored = personality.fallbackLines instanceof Map
                ? personality.fallbackLines.get(triggerEvent)
                : personality.fallbackLines[triggerEvent];
            if (Array.isArray(stored) && stored.length > 0) {
                pool = stored;
            }
        }

        // 2. Fall back to global defaults
        if (!pool) {
            const eventTable = GLOBAL_FALLBACK_LINES[triggerEvent] || GLOBAL_FALLBACK_LINES.default;
            const npcType = personality?.npcType || 'enemy';
            pool = eventTable[npcType] || eventTable.default || ['...'];
        }

        // 3. Filter out recently used lines if possible
        const fresh = pool.filter(l => !avoidList.includes(l));
        const candidates = fresh.length > 0 ? fresh : pool;

        // 4. Pick deterministically
        return candidates[this._recentResponseCache.size % candidates.length];
    }

    // ── Main service method ────────────────────────────────────────

    /**
     * Generate a character response for an NPC given a context package.
     *
     * Two calling modes:
     *   1. Combat path: contextPackage has character/situationalContext/responseConstraints,
     *      context is built via contextBuilder.buildContext()
     *   2. Encounter path: options.systemPrompt + options.messages are provided,
     *      passed directly to the LLM provider (multi-turn conversation)
     *
     * @param {Object} contextPackage - { character, situationalContext, responseConstraints }
     * @param {Object} [options]
     * @param {string} [options.sessionId] - For repetition tracking cache key
     * @param {Object} [options.personality] - Personality record for fallback lines
     * @param {string} [options.systemPrompt] - Direct system prompt (encounter path)
     * @param {Array}  [options.messages] - Multi-turn messages array (encounter path)
     * @returns {Promise<ResponseResult>}
     */
    async generateResponse(contextPackage, options = {}) {
        const { sessionId, personality, systemPrompt, messages } = options;
        const { character, situationalContext, responseConstraints } = contextPackage;
        const start = Date.now();

        // Auto-populate avoidRepetition from session cache if not already set
        const cachedRecent = this.getRecentResponses(sessionId, character.id);
        const avoidList = responseConstraints.avoidRepetition.length > 0
            ? responseConstraints.avoidRepetition
            : cachedRecent;

        let text = null;
        let source = 'llm';

        // ── Attempt LLM call ───────────────────────────────────────
        try {
            let response;

            if (systemPrompt && Array.isArray(messages) && messages.length > 0) {
                // Encounter path: direct system prompt + multi-turn messages
                response = await this.provider.generateResponse({
                    systemPrompt,
                    messages,
                    npcId: character.id,
                    npcName: character.name,
                    maxTokens: responseConstraints.maxTokens,
                });
            } else {
                // Combat path: build context from personality + game state
                const gameState = {
                    currentScene: situationalContext.triggerEvent,
                    recentEvents: [],
                };
                const prompt = this.contextBuilder.buildContext(
                    personality || { name: character.name },
                    gameState
                );

                response = await this.provider.generateResponse({
                    prompt,
                    npcId: character.id,
                    npcName: character.name,
                    triggerEvent: situationalContext.triggerEvent,
                    maxTokens: responseConstraints.maxTokens,
                    avoidRepetition: avoidList,
                });
            }

            text = response?.text;

            // Validate response
            if (typeof text !== 'string' || text.trim() === '') {
                throw new Error('LLM returned empty response');
            }

            text = text.trim();
        } catch {
            // ── Fallback to pre-written lines ──────────────────────
            source = 'fallback';
            text = this.selectFallbackLine(personality, situationalContext.triggerEvent, avoidList);
        }

        // Record this response for future repetition avoidance
        if (sessionId) {
            this._recordResponse(sessionId, character.id, text);
        }

        return {
            text,
            source,
            npcId: character.id,
            npcName: character.name,
            triggerEvent: situationalContext.triggerEvent,
            format: responseConstraints.format,
            latencyMs: Date.now() - start,
        };
    }
}
