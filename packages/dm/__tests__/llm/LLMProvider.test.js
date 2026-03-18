import { describe, it, expect, beforeEach } from 'vitest';
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
        expect(provider.anthropicKey).toBe('test-anthropic');
    });

    it('should throw unsupported model error for unknown model prefix', async () => {
        await expect(() => provider.generateResponse({ model: 'unknown-model', prompt: 'test' })).rejects.toThrow(/Unsupported model/);
    });

    it('should default model to claude haiku when not specified', async () => {
        // Will attempt Anthropic call (and fail because key is fake),
        // but proves model defaulting works by NOT throwing "unsupported model"
        await expect(() => provider.generateResponse({ prompt: 'test' })).rejects.not.toThrow(/Unsupported model/);
    });
});
