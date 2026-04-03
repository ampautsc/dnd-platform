import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { MockProvider } from '../../src/llm/MockProvider.js';

describe('MockProvider', () => {
    let provider;

    beforeEach(() => {
        provider = new MockProvider();
    });

    it('should generate a predefined response', async () => {
        provider.setMockResponse('Hello world');
        const response = await provider.generateResponse({ prompt: 'say hi' });
        assert.strictEqual(response.text, 'Hello world');
    });

    it('should track call history', async () => {
        provider.setMockResponse('Got it');
        await provider.generateResponse({ prompt: 'say hi' });
        await provider.generateResponse({ prompt: 'say bye' });
        
        assert.strictEqual(provider.getHistory().length, 2);
        assert.strictEqual(provider.getHistory()[0].prompt, 'say hi');
        assert.strictEqual(provider.getHistory()[1].prompt, 'say bye');
    });

    it('should allow clearing history', async () => {
        provider.setMockResponse('foo');
        await provider.generateResponse({ prompt: 'bar' });
        provider.clearHistory();
        assert.strictEqual(provider.getHistory().length, 0);
    });

    it('should support sequence of responses', async () => {
        provider.setMockSequence(['First', 'Second']);
        
        const r1 = await provider.generateResponse({ prompt: '1' });
        const r2 = await provider.generateResponse({ prompt: '2' });
        const r3 = await provider.generateResponse({ prompt: '3' });
        
        assert.strictEqual(r1.text, 'First');
        assert.strictEqual(r2.text, 'Second');
        assert.strictEqual(r3.text, 'Second'); // Should hold last response if sequence runs out
    });
});
