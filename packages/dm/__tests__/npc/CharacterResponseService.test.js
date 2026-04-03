import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

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

            assert.strictEqual(result.text, 'Greetings, traveler. What brings you to my tavern?');
            assert.strictEqual(result.source, 'llm');
            assert.strictEqual(result.npcId, 'npc-tharg');
            assert.strictEqual(result.npcName, 'Tharg');
            assert.strictEqual(result.triggerEvent, 'player_addressed');
            assert.strictEqual(typeof result.latencyMs, 'number');
            assert.ok(result.latencyMs >= 0);
        });

        it('should fall back to a canned response when provider throws', async () => {
            // Make provider throw
            provider.generateResponse = async () => { throw new Error('API down'); };
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            const result = await service.generateResponse(ctxPkg, { personality });

            assert.strictEqual(result.source, 'fallback');
            assert.ok(result.text);
            assert.strictEqual(typeof result.text, 'string');
            // Should be one of the personality's fallback lines for this trigger
            assert.ok(personality.fallbackLines.player_addressed.includes(result.text));
        });

        it('should fall back when provider returns empty text', async () => {
            provider.setMockResponse('');
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            const result = await service.generateResponse(ctxPkg, { personality });

            assert.strictEqual(result.source, 'fallback');
            assert.ok(result.text);
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

            assert.strictEqual(result.source, 'fallback');
            assert.ok(result.text);
            assert.strictEqual(typeof result.text, 'string');
        });
    });

    describe('repetition avoidance', () => {
        it('should track recent responses per session and NPC', async () => {
            provider.setMockResponse('First response');
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            await service.generateResponse(ctxPkg, { sessionId: 'sess-1', personality });
            const recent = service.getRecentResponses('sess-1', 'npc-tharg');

            assert.ok(recent.includes('First response'));
        });

        it('should pass recent responses as avoidRepetition to the provider', async () => {
            provider.setMockSequence(['First line', 'Second line']);
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            await service.generateResponse(ctxPkg, { sessionId: 'sess-1', personality });
            await service.generateResponse(ctxPkg, { sessionId: 'sess-1', personality });

            // Check that the provider received avoidRepetition data on the second call
            const history = provider.getHistory();
            assert.strictEqual(history.length, 2);
            // Second call should have had avoidRepetition populated
            assert.ok(history[1].avoidRepetition.includes('First line'));
        });

        it('should limit stored recent responses to MAX_STORED_RESPONSES', async () => {
            provider.setMockSequence(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            for (let i = 0; i < 7; i++) {
                await service.generateResponse(ctxPkg, { sessionId: 'sess-1', personality });
            }

            const recent = service.getRecentResponses('sess-1', 'npc-tharg');
            assert.ok(recent.length <= 5);
        });
    });

    describe('clearSessionCache', () => {
        it('should remove all cached responses for a session', async () => {
            provider.setMockResponse('Hello');
            const ctxPkg = makeContextPackage();
            const personality = makePersonality();

            await service.generateResponse(ctxPkg, { sessionId: 'sess-1', personality });
            assert.strictEqual(service.getRecentResponses('sess-1', 'npc-tharg').length, 1);

            service.clearSessionCache('sess-1');
            assert.strictEqual(service.getRecentResponses('sess-1', 'npc-tharg').length, 0);
        });
    });

    describe('selectFallbackLine', () => {
        it('should pick from personality fallback lines when available', () => {
            const personality = makePersonality();
            const line = service.selectFallbackLine(personality, 'player_addressed');

            assert.ok(personality.fallbackLines.player_addressed.includes(line));
        });

        it('should use global defaults when personality has no lines for trigger', () => {
            const personality = makePersonality({ fallbackLines: {} });
            const line = service.selectFallbackLine(personality, 'combat_start');

            assert.strictEqual(typeof line, 'string');
            assert.ok(line.length > 0);
        });

        it('should avoid recently used lines when possible', () => {
            const personality = makePersonality({
                fallbackLines: {
                    player_addressed: ['Line A', 'Line B'],
                },
            });

            const line = service.selectFallbackLine(personality, 'player_addressed', ['Line A']);
            assert.strictEqual(line, 'Line B');
        });
    });
});
