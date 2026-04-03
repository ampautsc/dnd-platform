import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    TRIGGER_EVENT,
    NPC_TYPE,
    EMOTIONAL_STATE,
    RESPONSE_FORMAT,
    buildContextPackage,
    buildSystemPrompt,
    buildUserPrompt,
    getTokenModulation,
} from '../../src/llm/CharacterContextPackage.js';

/**
 * Requirements:
 * 1. Enums: TRIGGER_EVENT, NPC_TYPE, EMOTIONAL_STATE, RESPONSE_FORMAT are frozen objects
 * 2. buildContextPackage() validates required fields and returns normalized structure
 * 3. buildContextPackage() throws on missing character.id, character.name, character.race
 * 4. buildContextPackage() throws on invalid triggerEvent or emotionalState
 * 5. buildContextPackage() defaults optional fields (stats, knowledge, etc.)
 * 6. buildSystemPrompt() returns identity and response guidance sections
 * 7. buildUserPrompt() returns situational context with trigger/emotion/location
 * 8. getTokenModulation() returns higher multipliers for high-drama triggers
 */

function makeCharacter(overrides = {}) {
    return {
        id: 'npc-tharg',
        name: 'Tharg',
        race: 'Orc',
        npcType: 'enemy',
        personality: {
            voice: 'gruff',
            alignment: 'chaotic evil',
            disposition: 'hostile',
            backstory: 'A brutal orc warlord.',
            speechPatterns: ['speaks in third person'],
            motivations: ['domination'],
            fears: ['magic'],
            mannerisms: ['cracks knuckles'],
        },
        stats: { intelligence: 8, wisdom: 10, charisma: 14 },
        knowledge: { secretsHeld: ['knows where the treasure is'] },
        ...overrides,
    };
}

function makeSituation(overrides = {}) {
    return {
        triggerEvent: 'player_addressed',
        emotionalState: 'calm',
        combatState: { hpPercent: 80, conditions: [], recentActions: [] },
        worldContext: { location: 'dark dungeon', timeOfDay: 'midnight', tone: 'tense' },
        nearbyEntities: [],
        recentEvents: [],
        ...overrides,
    };
}

describe('CharacterContextPackage', () => {
    describe('enums', () => {
        it('should freeze TRIGGER_EVENT', () => {
            assert.strictEqual(Object.isFrozen(TRIGGER_EVENT), true);
            assert.strictEqual(TRIGGER_EVENT.COMBAT_START, 'combat_start');
            assert.strictEqual(TRIGGER_EVENT.PLAYER_ADDRESSED, 'player_addressed');
            assert.strictEqual(TRIGGER_EVENT.NEAR_DEATH, 'near_death');
        });

        it('should freeze NPC_TYPE', () => {
            assert.strictEqual(Object.isFrozen(NPC_TYPE), true);
            assert.strictEqual(NPC_TYPE.ENEMY, 'enemy');
            assert.strictEqual(NPC_TYPE.FRIENDLY, 'friendly');
        });

        it('should freeze EMOTIONAL_STATE', () => {
            assert.strictEqual(Object.isFrozen(EMOTIONAL_STATE), true);
            assert.strictEqual(EMOTIONAL_STATE.CALM, 'calm');
            assert.strictEqual(EMOTIONAL_STATE.ENRAGED, 'enraged');
        });

        it('should freeze RESPONSE_FORMAT', () => {
            assert.strictEqual(Object.isFrozen(RESPONSE_FORMAT), true);
            assert.strictEqual(RESPONSE_FORMAT.SPOKEN, 'spoken');
            assert.strictEqual(RESPONSE_FORMAT.THOUGHT, 'thought');
        });
    });

    describe('buildContextPackage', () => {
        it('should return a normalized context package with all sections', () => {
            const pkg = buildContextPackage(
                makeCharacter(),
                makeSituation(),
                { maxTokens: 80, format: 'spoken' }
            );

            assert.strictEqual(pkg.character.id, 'npc-tharg');
            assert.strictEqual(pkg.character.name, 'Tharg');
            assert.strictEqual(pkg.character.personality.voice, 'gruff');
            assert.strictEqual(pkg.character.stats.intelligence, 8);
            assert.strictEqual(pkg.situationalContext.triggerEvent, 'player_addressed');
            assert.strictEqual(pkg.responseConstraints.maxTokens, 80);
        });

        it('should throw on missing character.id', () => {
            assert.throws(() => buildContextPackage(
                { ...makeCharacter(), id: '' },
                makeSituation()
            ), /character.id/);
        });

        it('should throw on missing character.name', () => {
            assert.throws(() => buildContextPackage(
                { ...makeCharacter(), name: '' },
                makeSituation()
            ), /character.name/);
        });

        it('should throw on missing character.race', () => {
            assert.throws(() => buildContextPackage(
                { ...makeCharacter(), race: '' },
                makeSituation()
            ), /character.race/);
        });

        it('should throw on invalid triggerEvent', () => {
            assert.throws(() => buildContextPackage(
                makeCharacter(),
                { ...makeSituation(), triggerEvent: 'not_a_trigger' }
            ), /triggerEvent/);
        });

        it('should throw on invalid emotionalState', () => {
            assert.throws(() => buildContextPackage(
                makeCharacter(),
                { ...makeSituation(), emotionalState: 'not_a_state' }
            ), /emotionalState/);
        });

        it('should default stats to 10 when not provided', () => {
            const charNoStats = makeCharacter({ stats: {} });
            const pkg = buildContextPackage(charNoStats, makeSituation());

            assert.strictEqual(pkg.character.stats.intelligence, 10);
            assert.strictEqual(pkg.character.stats.wisdom, 10);
            assert.strictEqual(pkg.character.stats.charisma, 10);
        });

        it('should default maxTokens to 60', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            assert.strictEqual(pkg.responseConstraints.maxTokens, 60);
        });
    });

    describe('buildSystemPrompt', () => {
        it('should include character identity information', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildSystemPrompt(pkg);

            assert.ok(prompt.includes('Tharg'));
            assert.ok(prompt.includes('Orc'));
            assert.ok(prompt.includes('brutal orc warlord'));
            assert.ok(prompt.includes('chaotic evil'));
        });

        it('should include speech patterns and motivations', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildSystemPrompt(pkg);

            assert.ok(prompt.includes('speaks in third person'));
            assert.ok(prompt.includes('domination'));
        });

        it('should include response guidance', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildSystemPrompt(pkg);

            assert.ok(prompt.includes('RESPONSE GUIDANCE'));
            assert.ok(prompt.includes('Stay in character'));
        });

        it('should include secrets section when present', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildSystemPrompt(pkg);

            assert.ok(prompt.includes('KNOWLEDGE AND SECRETS'));
            assert.ok(prompt.includes('knows where the treasure is'));
        });
    });

    describe('buildUserPrompt', () => {
        it('should include trigger event and emotional state', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildUserPrompt(pkg);

            assert.ok(prompt.includes('PLAYER ADDRESSED'));
            assert.ok(prompt.includes('calm'));
        });

        it('should include location and time', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildUserPrompt(pkg);

            assert.ok(prompt.includes('dark dungeon'));
            assert.ok(prompt.includes('midnight'));
        });

        it('should include HP description', () => {
            const pkg = buildContextPackage(
                makeCharacter(),
                makeSituation({ combatState: { hpPercent: 20, conditions: ['poisoned'], recentActions: [] } })
            );
            const prompt = buildUserPrompt(pkg);

            assert.ok(prompt.includes('near death'));
            assert.ok(prompt.includes('poisoned'));
        });

        it('should include avoidRepetition when present', () => {
            const pkg = buildContextPackage(
                makeCharacter(),
                makeSituation(),
                { avoidRepetition: ['Die fool!', 'You dare?'] }
            );
            const prompt = buildUserPrompt(pkg);

            assert.ok(prompt.includes('Die fool!'));
            assert.ok(prompt.includes('You dare?'));
        });

        it('should end with respond-as instruction', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildUserPrompt(pkg);

            assert.ok(prompt.includes('Respond as Tharg now'));
        });
    });

    describe('getTokenModulation', () => {
        it('should return higher multiplier for near_death', () => {
            assert.ok(getTokenModulation('near_death') > 1.0);
        });

        it('should return higher multiplier for ally_died', () => {
            assert.ok(getTokenModulation('ally_died') > 1.0);
        });

        it('should return 1.0 for normal triggers', () => {
            assert.strictEqual(getTokenModulation('combat_start'), 1.0);
            assert.strictEqual(getTokenModulation('round_start'), 1.0);
        });

        it('should return 1.0 for unknown triggers', () => {
            assert.strictEqual(getTokenModulation('whatever'), 1.0);
        });
    });
});
