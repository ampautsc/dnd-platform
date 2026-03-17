import { describe, it, expect, beforeEach } from 'vitest';
import { MockProvider } from '../../src/llm/MockProvider.js';

describe('MockProvider', () => {
    let provider;

    beforeEach(() => {
        provider = new MockProvider();
    });

    it('should generate a predefined response', async () => {
        provider.setMockResponse('Hello world');
        const response = await provider.generateResponse({ prompt: 'say hi' });
        expect(response.text).toBe('Hello world');
    });

    it('should track call history', async () => {
        provider.setMockResponse('Got it');
        await provider.generateResponse({ prompt: 'say hi' });
        await provider.generateResponse({ prompt: 'say bye' });
        
        expect(provider.getHistory().length).toBe(2);
        expect(provider.getHistory()[0].prompt).toBe('say hi');
        expect(provider.getHistory()[1].prompt).toBe('say bye');
    });

    it('should allow clearing history', async () => {
        provider.setMockResponse('foo');
        await provider.generateResponse({ prompt: 'bar' });
        provider.clearHistory();
        expect(provider.getHistory().length).toBe(0);
    });

    it('should support sequence of responses', async () => {
        provider.setMockSequence(['First', 'Second']);
        
        const r1 = await provider.generateResponse({ prompt: '1' });
        const r2 = await provider.generateResponse({ prompt: '2' });
        const r3 = await provider.generateResponse({ prompt: '3' });
        
        expect(r1.text).toBe('First');
        expect(r2.text).toBe('Second');
        expect(r3.text).toBe('Second'); // Should hold last response if sequence runs out
    });
});
