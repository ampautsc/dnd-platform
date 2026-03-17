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

    it('should throw unsupported model error', async () => {
        await expect(() => provider.generateResponse({ model: 'unknown-model', prompt: 'test' })).rejects.toThrow(/Unsupported model/);
    });
});
