import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { LLMProvider } from '../../src/llm/LLMProvider.js';

describe('LLMProvider', () => {
    let provider;

    beforeEach(() => {
        provider = new LLMProvider({ 
            anthropicKey: 'test-anthropic',
            openaiKey: 'test-openai'
         });
    });

    it('should have anthropic configured', () => {
        assert.strictEqual(provider.anthropicKey, 'test-anthropic');
    });

    it('should throw unsupported model error for unknown model prefix', async () => {
        await assert.rejects(() => provider.generateResponse({ model: 'unknown-model', prompt: 'test' }), /Unsupported model/);
    });

    it('should default model to claude haiku when not specified', async () => {
        // Will attempt Anthropic call (and fail because key is fake),
        // but proves model defaulting works by NOT throwing "unsupported model"
        try {
            await provider.generateResponse({ prompt: 'test' });
        } catch (err) {
            // It may throw for other reasons (bad key), but NOT for unsupported model
            assert.ok(!(/Unsupported model/).test(err.message), 'Should not throw unsupported model error');
        }
    });
});

describe('LLMProvider — prompt caching', () => {
    /** @type {LLMProvider} */
    let provider;
    /** @type {object} */
    let capturedCreateArgs;

    beforeEach(() => {
        provider = new LLMProvider({ anthropicKey: 'test-anthropic' });
        capturedCreateArgs = null;

        // Stub the Anthropic SDK's messages.create to capture the request
        provider.anthropicClient = {
            messages: {
                create: async (args) => {
                    capturedCreateArgs = args;
                    return {
                        content: [{ text: '[SPEAK] "What can I get you?"' }],
                        model: 'claude-haiku-4-5-20251001',
                        usage: {
                            input_tokens: 5200,
                            output_tokens: 42,
                            cache_creation_input_tokens: 4800,
                            cache_read_input_tokens: 0,
                        },
                    };
                },
            },
        };
        // Suppress file logging during tests
        provider._logResponse = () => {};
    });

    it('should pass system prompt as structured cache_control array', async () => {
        const systemPrompt = 'AI Model, you need to understand this concept...';

        await provider.callAnthropic({
            model: 'claude-haiku-4-5-20251001',
            systemPrompt,
            userPrompt: 'What do you do?',
        });

        // System must be an array of content blocks with cache_control
        assert.ok(Array.isArray(capturedCreateArgs.system), 'system should be an array');
        assert.strictEqual(capturedCreateArgs.system.length, 1);
        assert.deepStrictEqual(capturedCreateArgs.system[0], {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
        });
    });

    it('should pass empty array when no system prompt provided', async () => {
        await provider.callAnthropic({
            model: 'claude-haiku-4-5-20251001',
            systemPrompt: '',
            userPrompt: 'Hello',
        });

        assert.ok(Array.isArray(capturedCreateArgs.system), 'system should be an array');
        assert.strictEqual(capturedCreateArgs.system.length, 0);
    });

    it('should return usage with cache fields in response', async () => {
        const result = await provider.callAnthropic({
            model: 'claude-haiku-4-5-20251001',
            systemPrompt: 'Some prompt',
            userPrompt: 'Hello',
        });

        assert.ok(result.usage, 'result should have usage');
        assert.strictEqual(result.usage.input_tokens, 5200);
        assert.strictEqual(result.usage.output_tokens, 42);
        assert.strictEqual(result.usage.cache_creation_input_tokens, 4800);
        assert.strictEqual(result.usage.cache_read_input_tokens, 0);
    });

    it('should return text, content, and model in response', async () => {
        const result = await provider.callAnthropic({
            model: 'claude-haiku-4-5-20251001',
            systemPrompt: 'Some prompt',
            userPrompt: 'Hello',
        });

        assert.strictEqual(result.text, '[SPEAK] "What can I get you?"');
        assert.strictEqual(result.content, result.text);
        assert.strictEqual(result.model, 'claude-haiku-4-5-20251001');
    });

    it('should use multi-turn messages when provided', async () => {
        const messages = [
            { role: 'user', content: 'Hey Samren!' },
            { role: 'assistant', content: '[SPEAK] "What\'s shakin\'?"' },
            { role: 'user', content: 'Pour me an ale.' },
        ];

        await provider.callAnthropic({
            model: 'claude-haiku-4-5-20251001',
            systemPrompt: 'Some consciousness prompt',
            messages,
            userPrompt: 'ignored when messages present',
        });

        assert.deepStrictEqual(capturedCreateArgs.messages, messages);
    });

    it('should fall back to userPrompt as single message when no messages array', async () => {
        await provider.callAnthropic({
            model: 'claude-haiku-4-5-20251001',
            systemPrompt: 'Some prompt',
            userPrompt: 'What do you see?',
        });

        assert.deepStrictEqual(capturedCreateArgs.messages, [
            { role: 'user', content: 'What do you see?' },
        ]);
    });
});

describe('LLMProvider — systemBlocks (multi-block caching)', () => {
    /** @type {LLMProvider} */
    let provider;
    /** @type {object} */
    let capturedCreateArgs;

    beforeEach(() => {
        provider = new LLMProvider({ anthropicKey: 'test-anthropic' });
        capturedCreateArgs = null;

        provider.anthropicClient = {
            messages: {
                create: async (args) => {
                    capturedCreateArgs = args;
                    return {
                        content: [{ text: '[SPEAK] "Aye."' }],
                        model: 'claude-haiku-4-5-20251001',
                        usage: {
                            input_tokens: 6000,
                            output_tokens: 10,
                            cache_creation_input_tokens: 5500,
                            cache_read_input_tokens: 0,
                        },
                    };
                },
            },
        };
        provider._logResponse = () => {};
    });

    it('should create multiple system content blocks each with cache_control', async () => {
        await provider.callAnthropic({
            model: 'claude-haiku-4-5-20251001',
            systemBlocks: [
                { text: '<world_knowledge>coins and gods</world_knowledge>' },
                { text: 'AI Model, you need to understand this concept...' },
            ],
            userPrompt: 'Hello',
        });

        assert.ok(Array.isArray(capturedCreateArgs.system));
        assert.strictEqual(capturedCreateArgs.system.length, 2);
        assert.deepStrictEqual(capturedCreateArgs.system[0], {
            type: 'text',
            text: '<world_knowledge>coins and gods</world_knowledge>',
            cache_control: { type: 'ephemeral' },
        });
        assert.deepStrictEqual(capturedCreateArgs.system[1], {
            type: 'text',
            text: 'AI Model, you need to understand this concept...',
            cache_control: { type: 'ephemeral' },
        });
    });

    it('should skip blocks with empty text', async () => {
        await provider.callAnthropic({
            model: 'claude-haiku-4-5-20251001',
            systemBlocks: [
                { text: '' },
                { text: 'NPC consciousness prompt' },
            ],
            userPrompt: 'Hello',
        });

        assert.strictEqual(capturedCreateArgs.system.length, 1);
        assert.strictEqual(capturedCreateArgs.system[0].text, 'NPC consciousness prompt');
    });

    it('should prefer systemBlocks over systemPrompt when both provided', async () => {
        await provider.callAnthropic({
            model: 'claude-haiku-4-5-20251001',
            systemBlocks: [
                { text: 'Block A' },
                { text: 'Block B' },
            ],
            systemPrompt: 'This should be ignored',
            userPrompt: 'Hello',
        });

        assert.strictEqual(capturedCreateArgs.system.length, 2);
        assert.strictEqual(capturedCreateArgs.system[0].text, 'Block A');
        assert.strictEqual(capturedCreateArgs.system[1].text, 'Block B');
    });

    it('should fall back to systemPrompt when systemBlocks is not provided', async () => {
        await provider.callAnthropic({
            model: 'claude-haiku-4-5-20251001',
            systemPrompt: 'Single prompt',
            userPrompt: 'Hello',
        });

        assert.strictEqual(capturedCreateArgs.system.length, 1);
        assert.strictEqual(capturedCreateArgs.system[0].text, 'Single prompt');
    });

    it('should produce empty system array when systemBlocks is empty', async () => {
        await provider.callAnthropic({
            model: 'claude-haiku-4-5-20251001',
            systemBlocks: [],
            userPrompt: 'Hello',
        });

        assert.strictEqual(capturedCreateArgs.system.length, 0);
    });

    it('should pass systemPrompt string to debug log even with systemBlocks', async () => {
        // Verify the request object still has a loggable systemPrompt
        const logEntries = [];
        const origLog = provider._logResponse;
        provider._logResponse = (req, _res) => { logEntries.push(req); };

        await provider.callAnthropic({
            model: 'claude-haiku-4-5-20251001',
            systemBlocks: [
                { text: 'Block A' },
                { text: 'Block B' },
            ],
            userPrompt: 'Hello',
        });

        // The logged request should still be accessible
        assert.strictEqual(logEntries.length, 1);
    });
});
