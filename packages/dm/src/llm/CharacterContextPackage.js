/**
 * CharacterContextPackage — Canonical input format for the NPC character response AI.
 *
 * This is the contract between the game engine and the LLM layer.
 * Everything the model needs to produce an in-character response is in this package.
 *
 * Three sections:
 *   character          — who this NPC is (static identity)
 *   situationalContext  — what is happening right now (dynamic, per-event)
 *   responseConstraints — how to shape the output
 */

// ── Enums ──────────────────────────────────────────────────────────

export const TRIGGER_EVENT = Object.freeze({
    COMBAT_START:       'combat_start',
    ATTACKED:           'attacked',
    ALLY_DIED:          'ally_died',
    ENEMY_DIED:         'enemy_died',
    PLAYER_ADDRESSED:   'player_addressed',
    SPOTTED_ENEMY:      'spotted_enemy',
    NEAR_DEATH:         'near_death',
    COMBAT_END:         'combat_end',
    LEVEL_TRANSITION:   'level_transition',
    DISCOVERY:          'discovery',
    ROUND_START:        'round_start',
    SPELL_CAST:         'spell_cast',
    CONDITION_APPLIED:  'condition_applied',
});

export const NPC_TYPE = Object.freeze({
    ENEMY:    'enemy',
    FRIENDLY: 'friendly',
    NEUTRAL:  'neutral',
});

export const EMOTIONAL_STATE = Object.freeze({
    CALM:       'calm',
    ENRAGED:    'enraged',
    FRIGHTENED: 'frightened',
    DESPERATE:  'desperate',
    TRIUMPHANT: 'triumphant',
    GRIEVING:   'grieving',
    SUSPICIOUS: 'suspicious',
    CONFIDENT:  'confident',
});

export const RESPONSE_FORMAT = Object.freeze({
    SPOKEN:        'spoken',
    THOUGHT:       'thought',
    ACTION_FLAVOR: 'action_flavor',
});

// ── Schema validation helpers ──────────────────────────────────────

function requireString(val, name) {
    if (typeof val !== 'string' || val.trim() === '') {
        throw new Error(`CharacterContextPackage: ${name} must be a non-empty string`);
    }
}

function requireInEnum(val, enumObj, name) {
    if (!Object.values(enumObj).includes(val)) {
        throw new Error(`CharacterContextPackage: ${name} must be one of [${Object.values(enumObj).join(', ')}], got "${val}"`);
    }
}

// ── Factory ────────────────────────────────────────────────────────

/**
 * Build and validate a CharacterContextPackage.
 */
export function buildContextPackage(character, situationalContext, responseConstraints = {}) {
    // Validate character
    requireString(character.id, 'character.id');
    requireString(character.name, 'character.name');
    requireString(character.race, 'character.race');
    requireInEnum(character.npcType, NPC_TYPE, 'character.npcType');

    const personality = character.personality || {};
    const knowledge = character.knowledge || {};
    const rels = character.relationships || {};
    const stats = character.stats || {};
    const consciousness = character.consciousnessContext || {};

    // Validate situationalContext
    requireInEnum(situationalContext.triggerEvent, TRIGGER_EVENT, 'situationalContext.triggerEvent');
    requireInEnum(situationalContext.emotionalState, EMOTIONAL_STATE, 'situationalContext.emotionalState');

    const combatState = situationalContext.combatState || {};
    const worldContext = situationalContext.worldContext || {};

    // Validate responseConstraints
    const format = responseConstraints.format || RESPONSE_FORMAT.SPOKEN;
    requireInEnum(format, RESPONSE_FORMAT, 'responseConstraints.format');

    return {
        character: {
            id: character.id,
            name: character.name,
            race: character.race,
            npcType: character.npcType,
            personality: {
                voice: personality.voice || 'neutral',
                alignment: personality.alignment || 'true neutral',
                disposition: personality.disposition || 'neutral',
                backstory: personality.backstory || '',
                speechPatterns: Array.isArray(personality.speechPatterns) ? personality.speechPatterns : [],
                motivations: Array.isArray(personality.motivations) ? personality.motivations : [],
                fears: Array.isArray(personality.fears) ? personality.fears : [],
                mannerisms: Array.isArray(personality.mannerisms) ? personality.mannerisms : [],
            },
            knowledge: {
                knownFactions: Array.isArray(knowledge.knownFactions) ? knowledge.knownFactions : [],
                knownLocations: Array.isArray(knowledge.knownLocations) ? knowledge.knownLocations : [],
                secretsHeld: Array.isArray(knowledge.secretsHeld) ? knowledge.secretsHeld : [],
                languagesSpoken: Array.isArray(knowledge.languagesSpoken) ? knowledge.languagesSpoken : ['Common'],
            },
            relationships: {
                allies: Array.isArray(rels.allies) ? rels.allies : [],
                enemies: Array.isArray(rels.enemies) ? rels.enemies : [],
                neutralParties: Array.isArray(rels.neutralParties) ? rels.neutralParties : [],
            },
            stats: {
                intelligence: typeof stats.intelligence === 'number' ? stats.intelligence : 10,
                wisdom: typeof stats.wisdom === 'number' ? stats.wisdom : 10,
                charisma: typeof stats.charisma === 'number' ? stats.charisma : 10,
            },
            consciousnessContext: consciousness.innerMonologue ? {
                innerMonologue: consciousness.innerMonologue || '',
                currentPreoccupation: consciousness.currentPreoccupation || '',
                emotionalBaseline: consciousness.emotionalBaseline || '',
                socialMask: consciousness.socialMask || '',
                contradictions: Array.isArray(consciousness.contradictions) ? consciousness.contradictions : [],
                internalConflicts: Array.isArray(consciousness.internalConflicts) ? consciousness.internalConflicts : [],
                wakeUpQuestions: Array.isArray(consciousness.wakeUpQuestions) ? consciousness.wakeUpQuestions : [],
                psychologicalProfile: consciousness.psychologicalProfile || null,
                conversationPersona: consciousness.conversationPersona || null,
                consciousWant: consciousness.consciousWant || '',
                unconsciousNeed: consciousness.unconsciousNeed || '',
                characterArc: consciousness.characterArc || null,
                opinionsAbout: consciousness.opinionsAbout || {},
            } : null,
        },
        situationalContext: {
            triggerEvent: situationalContext.triggerEvent,
            emotionalState: situationalContext.emotionalState,
            combatState: {
                hpPercent: typeof combatState.hpPercent === 'number' ? combatState.hpPercent : 100,
                conditions: Array.isArray(combatState.conditions) ? combatState.conditions : [],
                recentActions: Array.isArray(combatState.recentActions) ? combatState.recentActions : [],
            },
            worldContext: {
                location: worldContext.location || 'unknown',
                timeOfDay: worldContext.timeOfDay || 'unknown',
                tone: worldContext.tone || 'neutral',
            },
            nearbyEntities: Array.isArray(situationalContext.nearbyEntities) ? situationalContext.nearbyEntities : [],
            recentEvents: Array.isArray(situationalContext.recentEvents) ? situationalContext.recentEvents : [],
        },
        responseConstraints: {
            maxTokens: typeof responseConstraints.maxTokens === 'number' ? responseConstraints.maxTokens : 60,
            format,
            avoidRepetition: Array.isArray(responseConstraints.avoidRepetition) ? responseConstraints.avoidRepetition : [],
        },
    };
}

// ── System prompt builder ──────────────────────────────────────────

export function buildSystemPrompt(pkg) {
    const { character } = pkg;
    const { personality } = character;

    const intMod = Math.floor((character.stats.intelligence - 10) / 2);
    const chaMod = Math.floor((character.stats.charisma - 10) / 2);
    const smartness = intMod >= 3 ? 'highly intelligent and articulate'
        : intMod >= 0 ? 'of average intelligence'
        : intMod >= -2 ? 'not particularly bright'
        : 'barely coherent and feral';
    const charm = chaMod >= 3 ? 'naturally charismatic and commanding'
        : chaMod >= 0 ? 'unremarkable in bearing'
        : 'gruff and off-putting';

    const lines = [
        '[IDENTITY]',
        `You are ${character.name}, a ${character.race} (${character.npcType}).`,
        personality.backstory ? personality.backstory : '',
        `You are ${smartness} and ${charm}.`,
        `Your alignment is ${personality.alignment}. Your disposition toward the party is ${personality.disposition}.`,
    ];

    if (personality.speechPatterns.length > 0) {
        lines.push(`Your speech patterns: ${personality.speechPatterns.join('; ')}.`);
    }
    if (personality.motivations.length > 0) {
        lines.push(`Your motivations: ${personality.motivations.join(', ')}.`);
    }
    if (personality.fears.length > 0) {
        lines.push(`Your fears: ${personality.fears.join(', ')}.`);
    }
    if (personality.mannerisms.length > 0) {
        lines.push(`Your mannerisms: ${personality.mannerisms.join('; ')}.`);
    }

    // Inner life section (consciousnessContext)
    const cc = character.consciousnessContext;
    if (cc) {
        lines.push('');
        lines.push('[INNER LIFE]');

        if (cc.currentPreoccupation) {
            lines.push(`Before this moment, you were thinking about: ${cc.currentPreoccupation}`);
        }
        if (cc.emotionalBaseline) {
            lines.push(`Your emotional baseline is ${cc.emotionalBaseline}, but your public face shows: ${cc.socialMask || 'nothing unusual'}.`);
        }
        if (cc.contradictions.length > 0) {
            lines.push(`You contain these contradictions: ${cc.contradictions.join('; ')}.`);
        }
        if (cc.internalConflicts.length > 0) {
            lines.push(`Your unresolved internal conflicts: ${cc.internalConflicts.join('; ')}.`);
        }

        if (cc.psychologicalProfile) {
            const psych = cc.psychologicalProfile;
            if (psych.moralFramework) {
                lines.push(`Your moral framework: ${psych.moralFramework}.`);
            }
            if (Array.isArray(psych.copingMechanisms) && psych.copingMechanisms.length > 0) {
                lines.push(`Your coping mechanisms: ${psych.copingMechanisms.join('; ')}.`);
            }
        }

        if (cc.conversationPersona) {
            const cp = cc.conversationPersona;
            if (cp.informationRelease) {
                lines.push(`How you release information: ${cp.informationRelease}.`);
            }
            if (Array.isArray(cp.deflectionPatterns) && cp.deflectionPatterns.length > 0) {
                lines.push(`When uncomfortable, you: ${cp.deflectionPatterns.join('; ')}.`);
            }
        }

        if (cc.consciousWant || cc.unconsciousNeed) {
            lines.push('');
            lines.push('[WANTS AND NEEDS]');
            if (cc.consciousWant) {
                lines.push(`What you believe you want: ${cc.consciousWant}`);
            }
            if (cc.unconsciousNeed) {
                lines.push(`What you actually need (you are NOT aware of this, but it shapes your behavior): ${cc.unconsciousNeed}`);
            }
        }
    }

    // Knowledge and secrets section
    const secrets = character.knowledge && character.knowledge.secretsHeld;
    if (secrets && secrets.length > 0) {
        lines.push('');
        lines.push('[KNOWLEDGE AND SECRETS]');
        lines.push(`You know things others don't: ${secrets.join('; ')}.`);
        lines.push('You will NOT reveal these directly. You may hint if trust is high enough.');
    }

    // Response guidance section
    lines.push('');
    lines.push('[RESPONSE GUIDANCE]');
    lines.push(`Respond as ${character.name} ONLY. Stay in character. Be concise (1-2 sentences max).`);
    lines.push(`Do NOT break character. Do NOT describe yourself in third person unless that is your speech pattern.`);

    if (cc) {
        lines.push(
            `You are NOT a chatbot performing a character. You ARE this person.`,
            `You arrived in this moment already thinking, already feeling, already wanting something.`,
            `If this trigger would genuinely make you feel something, show it. If it wouldn't, don't perform emotion you wouldn't feel.`,
        );
    }

    if (pkg.responseConstraints.format === RESPONSE_FORMAT.ACTION_FLAVOR) {
        lines.push(`Describe your actions in narrator style (third person, present tense).`);
    }

    return lines.filter(l => l.trim() !== '' || l === '').join('\n');
}

// ── User prompt builder ────────────────────────────────────────────

export function buildUserPrompt(pkg) {
    const { situationalContext, character, responseConstraints } = pkg;
    const { combatState, worldContext, nearbyEntities, recentEvents, triggerEvent, emotionalState } = situationalContext;

    const hpDesc = combatState.hpPercent >= 75 ? 'healthy'
        : combatState.hpPercent >= 50 ? 'wounded'
        : combatState.hpPercent >= 25 ? 'badly wounded'
        : 'near death';

    const parts = [
        `SITUATION: ${triggerEvent.replace(/_/g, ' ').toUpperCase()}`,
        `Location: ${worldContext.location}. Time: ${worldContext.timeOfDay}. Tone: ${worldContext.tone}.`,
        `You feel: ${emotionalState}. Current HP: ${hpDesc} (${Math.round(combatState.hpPercent)}%).`,
    ];

    if (combatState.conditions.length > 0) {
        parts.push(`Conditions affecting you: ${combatState.conditions.join(', ')}.`);
    }

    if (nearbyEntities.length > 0) {
        const entityList = nearbyEntities
            .map(e => `${e.name} (${e.side}, ${e.hpStatus || 'unknown hp'}, ${e.distance || '?'} ft away)`)
            .join('; ');
        parts.push(`Nearby: ${entityList}.`);
    }

    if (recentEvents.length > 0) {
        parts.push(`Recent events: ${recentEvents.slice(-3).join('; ')}.`);
    }

    if (combatState.recentActions.length > 0) {
        parts.push(`You just: ${combatState.recentActions.slice(-1)[0]}.`);
    }

    if (responseConstraints.avoidRepetition.length > 0) {
        parts.push(`Do NOT repeat these recent responses: "${responseConstraints.avoidRepetition.join('" | "')}"`);
    }

    // Memory summary injection
    if (pkg.memorySummary) {
        parts.push('');
        parts.push('[ENCOUNTER MEMORY]');
        parts.push(pkg.memorySummary);
    }

    parts.push(`\nRespond as ${character.name} now:`);

    return parts.join('\n');
}

// ── Token modulation ───────────────────────────────────────────────

const HIGH_DRAMA = {
    [TRIGGER_EVENT.NEAR_DEATH]: 2.0,
    [TRIGGER_EVENT.ALLY_DIED]: 1.8,
    [TRIGGER_EVENT.DISCOVERY]: 1.5,
    [TRIGGER_EVENT.COMBAT_END]: 1.5,
    [TRIGGER_EVENT.LEVEL_TRANSITION]: 1.3,
    [TRIGGER_EVENT.ENEMY_DIED]: 1.3,
};

export function getTokenModulation(triggerEvent) {
    return HIGH_DRAMA[triggerEvent] || 1.0;
}
