import { describe, it, expect, beforeEach } from 'vitest';
import { CharacterResponseService } from '../../src/npc/CharacterResponseService.js';
import { MockProvider } from '../../src/llm/MockProvider.js';
import { CharacterContextBuilder } from '../../src/npc/CharacterContextBuilder.js';

/**
 * Requirements:
 * 1. Accept a provider (MockProvider) and context builder via constructor injection
 * 2. generateResponse() calls provider with built context and returns a ResponseResult
 * 3. ResponseResult contains: text, source ('llm'|'fallback'), npcId, npcName, triggerEvent, latencyMs
 * 4. On provider failure, fall back to a deterministic fallback line (source='fallback')
 * 5. Track per-session per-NPC recent responses for repetition avoidance
 * 6. clearSessionCache() removes all cached responses for a session
 * 7. selectFallbackLine() picks from personality fallbackLines or global defaults
 */

function makePersonality(overrides = {}) {
    return {
        name: 'Tharg',
        backstory: 'A gruff orc bartender.',
        fallbackLines: {
            player_addressed: ['Hmph.', 'What do you want?', 'Go away.'],
            combat_start: ['Die!', 'For the horde!'],
        },
        ...overrides,
    };
}

function makeContextPackage(overrides = {}) {
    return {
        character: {
            id: 'npc-tharg',
            name: 'Tharg',
            npcType: 'enemy',
        },
        situationalContext: {
            triggerEvent: 'player_addressed',
            emotionalState: 'calm',
        },
        responseConstraints: {
            maxTokens: 60,
            format: 'spoken',
            avoidRepetition: [],
        },
        ...overrides,
    };
}

describe('CharacterResponseService', () => {
    let service;
    let provider;
    let contextBuilder;

    beforeEach(() => {
        provider = new MockProvider();
        contextBuilder = new CharacterContextBuilder();
        service = new CharacterResponseService({ provider, contextBuilder });
    });

    describe('generateResponse', () => {
        it('should return a ResponseResult with LLM text when provider succeeds', async () => {
            provider.setMockResponse('Greetings, traveler. What brings you to my tavern?');
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            const result = await service.generateResponse(ctxPkg, { personality });

            expect(result.text).toBe('Greetings, traveler. What brings you to my tavern?');
            expect(result.source).toBe('llm');
            expect(result.npcId).toBe('npc-tharg');
            expect(result.npcName).toBe('Tharg');
            expect(result.triggerEvent).toBe('player_addressed');
            expect(typeof result.latencyMs).toBe('number');
            expect(result.latencyMs).toBeGreaterThanOrEqual(0);
        });

        it('should fall back to a canned response when provider throws', async () => {
            // Make provider throw
            provider.generateResponse = async () => { throw new Error('API down'); };
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            const result = await service.generateResponse(ctxPkg, { personality });

            expect(result.source).toBe('fallback');
            expect(result.text).toBeTruthy();
            expect(typeof result.text).toBe('string');
            // Should be one of the personality's fallback lines for this trigger
            expect(personality.fallbackLines.player_addressed).toContain(result.text);
        });

        it('should fall back when provider returns empty text', async () => {
            provider.setMockResponse('');
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            const result = await service.generateResponse(ctxPkg, { personality });

            expect(result.source).toBe('fallback');
            expect(result.text).toBeTruthy();
        });

        it('should use global fallback lines if personality has none for the trigger', async () => {
            provider.generateResponse = async () => { throw new Error('API down'); };
            const ctxPkg = makeContextPackage({
                situationalContext: {
                    triggerEvent: 'near_death',
                    emotionalState: 'desperate',
                },
            });
            const personality = makePersonality({ fallbackLines: {} });

            const result = await service.generateResponse(ctxPkg, { personality });

            expect(result.source).toBe('fallback');
            expect(result.text).toBeTruthy();
            expect(typeof result.text).toBe('string');
        });
    });

    describe('repetition avoidance', () => {
        it('should track recent responses per session and NPC', async () => {
            provider.setMockResponse('First response');
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            await service.generateResponse(ctxPkg, { sessionId: 'sess-1', personality });
            const recent = service.getRecentResponses('sess-1', 'npc-tharg');

            expect(recent).toContain('First response');
        });

        it('should pass recent responses as avoidRepetition to the provider', async () => {
            provider.setMockSequence(['First line', 'Second line']);
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            await service.generateResponse(ctxPkg, { sessionId: 'sess-1', personality });
            await service.generateResponse(ctxPkg, { sessionId: 'sess-1', personality });

            // Check that the provider received avoidRepetition data on the second call
            const history = provider.getHistory();
            expect(history.length).toBe(2);
            // Second call should have had avoidRepetition populated
            expect(history[1].avoidRepetition).toContain('First line');
        });

        it('should limit stored recent responses to MAX_STORED_RESPONSES', async () => {
            provider.setMockSequence(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            for (let i = 0; i < 7; i++) {
                await service.generateResponse(ctxPkg, { sessionId: 'sess-1', personality });
            }

            const recent = service.getRecentResponses('sess-1', 'npc-tharg');
            expect(recent.length).toBeLessThanOrEqual(5);
        });
    });

    describe('clearSessionCache', () => {
        it('should remove all cached responses for a session', async () => {
            provider.setMockResponse('Hello');
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            await service.generateResponse(ctxPkg, { sessionId: 'sess-1', personality });
            expect(service.getRecentResponses('sess-1', 'npc-tharg').length).toBe(1);

            service.clearSessionCache('sess-1');
            expect(service.getRecentResponses('sess-1', 'npc-tharg').length).toBe(0);
        });
    });

    describe('selectFallbackLine', () => {
        it('should pick from personality fallback lines when available', () => {
            const personality = makePersonality();
            const line = service.selectFallbackLine(personality, 'player_addressed');

            expect(personality.fallbackLines.player_addressed).toContain(line);
        });

        it('should use global defaults when personality has no lines for trigger', () => {
            const personality = makePersonality({ fallbackLines: {} });
            const line = service.selectFallbackLine(personality, 'combat_start');

            expect(typeof line).toBe('string');
            expect(line.length).toBeGreaterThan(0);
        });

        it('should avoid recently used lines when possible', () => {
            const personality = makePersonality({
                fallbackLines: {
                    player_addressed: ['Line A', 'Line B'],
                },
            });

            const line = service.selectFallbackLine(personality, 'player_addressed', ['Line A']);
            expect(line).toBe('Line B');
        });
    });
});
