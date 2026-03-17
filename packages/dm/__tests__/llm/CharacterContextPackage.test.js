import { describe, it, expect } from 'vitest';
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
            expect(Object.isFrozen(TRIGGER_EVENT)).toBe(true);
            expect(TRIGGER_EVENT.COMBAT_START).toBe('combat_start');
            expect(TRIGGER_EVENT.PLAYER_ADDRESSED).toBe('player_addressed');
            expect(TRIGGER_EVENT.NEAR_DEATH).toBe('near_death');
        });

        it('should freeze NPC_TYPE', () => {
            expect(Object.isFrozen(NPC_TYPE)).toBe(true);
            expect(NPC_TYPE.ENEMY).toBe('enemy');
            expect(NPC_TYPE.FRIENDLY).toBe('friendly');
        });

        it('should freeze EMOTIONAL_STATE', () => {
            expect(Object.isFrozen(EMOTIONAL_STATE)).toBe(true);
            expect(EMOTIONAL_STATE.CALM).toBe('calm');
            expect(EMOTIONAL_STATE.ENRAGED).toBe('enraged');
        });

        it('should freeze RESPONSE_FORMAT', () => {
            expect(Object.isFrozen(RESPONSE_FORMAT)).toBe(true);
            expect(RESPONSE_FORMAT.SPOKEN).toBe('spoken');
            expect(RESPONSE_FORMAT.THOUGHT).toBe('thought');
        });
    });

    describe('buildContextPackage', () => {
        it('should return a normalized context package with all sections', () => {
            const pkg = buildContextPackage(
                makeCharacter(),
                makeSituation(),
                { maxTokens: 80, format: 'spoken' }
            );

            expect(pkg.character.id).toBe('npc-tharg');
            expect(pkg.character.name).toBe('Tharg');
            expect(pkg.character.personality.voice).toBe('gruff');
            expect(pkg.character.stats.intelligence).toBe(8);
            expect(pkg.situationalContext.triggerEvent).toBe('player_addressed');
            expect(pkg.responseConstraints.maxTokens).toBe(80);
        });

        it('should throw on missing character.id', () => {
            expect(() => buildContextPackage(
                { ...makeCharacter(), id: '' },
                makeSituation()
            )).toThrow(/character.id/);
        });

        it('should throw on missing character.name', () => {
            expect(() => buildContextPackage(
                { ...makeCharacter(), name: '' },
                makeSituation()
            )).toThrow(/character.name/);
        });

        it('should throw on missing character.race', () => {
            expect(() => buildContextPackage(
                { ...makeCharacter(), race: '' },
                makeSituation()
            )).toThrow(/character.race/);
        });

        it('should throw on invalid triggerEvent', () => {
            expect(() => buildContextPackage(
                makeCharacter(),
                { ...makeSituation(), triggerEvent: 'not_a_trigger' }
            )).toThrow(/triggerEvent/);
        });

        it('should throw on invalid emotionalState', () => {
            expect(() => buildContextPackage(
                makeCharacter(),
                { ...makeSituation(), emotionalState: 'not_a_state' }
            )).toThrow(/emotionalState/);
        });

        it('should default stats to 10 when not provided', () => {
            const charNoStats = makeCharacter({ stats: {} });
            const pkg = buildContextPackage(charNoStats, makeSituation());

            expect(pkg.character.stats.intelligence).toBe(10);
            expect(pkg.character.stats.wisdom).toBe(10);
            expect(pkg.character.stats.charisma).toBe(10);
        });

        it('should default maxTokens to 60', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            expect(pkg.responseConstraints.maxTokens).toBe(60);
        });
    });

    describe('buildSystemPrompt', () => {
        it('should include character identity information', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildSystemPrompt(pkg);

            expect(prompt).toContain('Tharg');
            expect(prompt).toContain('Orc');
            expect(prompt).toContain('brutal orc warlord');
            expect(prompt).toContain('chaotic evil');
        });

        it('should include speech patterns and motivations', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildSystemPrompt(pkg);

            expect(prompt).toContain('speaks in third person');
            expect(prompt).toContain('domination');
        });

        it('should include response guidance', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildSystemPrompt(pkg);

            expect(prompt).toContain('RESPONSE GUIDANCE');
            expect(prompt).toContain('Stay in character');
        });

        it('should include secrets section when present', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildSystemPrompt(pkg);

            expect(prompt).toContain('KNOWLEDGE AND SECRETS');
            expect(prompt).toContain('knows where the treasure is');
        });
    });

    describe('buildUserPrompt', () => {
        it('should include trigger event and emotional state', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildUserPrompt(pkg);

            expect(prompt).toContain('PLAYER ADDRESSED');
            expect(prompt).toContain('calm');
        });

        it('should include location and time', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildUserPrompt(pkg);

            expect(prompt).toContain('dark dungeon');
            expect(prompt).toContain('midnight');
        });

        it('should include HP description', () => {
            const pkg = buildContextPackage(
                makeCharacter(),
                makeSituation({ combatState: { hpPercent: 20, conditions: ['poisoned'], recentActions: [] } })
            );
            const prompt = buildUserPrompt(pkg);

            expect(prompt).toContain('near death');
            expect(prompt).toContain('poisoned');
        });

        it('should include avoidRepetition when present', () => {
            const pkg = buildContextPackage(
                makeCharacter(),
                makeSituation(),
                { avoidRepetition: ['Die fool!', 'You dare?'] }
            );
            const prompt = buildUserPrompt(pkg);

            expect(prompt).toContain('Die fool!');
            expect(prompt).toContain('You dare?');
        });

        it('should end with respond-as instruction', () => {
            const pkg = buildContextPackage(makeCharacter(), makeSituation());
            const prompt = buildUserPrompt(pkg);

            expect(prompt).toContain('Respond as Tharg now');
        });
    });

    describe('getTokenModulation', () => {
        it('should return higher multiplier for near_death', () => {
            expect(getTokenModulation('near_death')).toBeGreaterThan(1.0);
        });

        it('should return higher multiplier for ally_died', () => {
            expect(getTokenModulation('ally_died')).toBeGreaterThan(1.0);
        });

        it('should return 1.0 for normal triggers', () => {
            expect(getTokenModulation('combat_start')).toBe(1.0);
            expect(getTokenModulation('round_start')).toBe(1.0);
        });

        it('should return 1.0 for unknown triggers', () => {
            expect(getTokenModulation('whatever')).toBe(1.0);
        });
    });
});
