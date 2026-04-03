import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CharacterContextBuilder } from '../../src/npc/CharacterContextBuilder.js';

describe('CharacterContextBuilder', () => {
    it('should build context prompt correctly', () => {
        const builder = new CharacterContextBuilder();
        const gameState = { currentScene: 'Tavern', recentEvents: ['Player ordered ale'] };
        const npcPersonality = { name: 'Tharg', backstory: 'A gruff orc.' };
        
        const context = builder.buildContext(npcPersonality, gameState);
        
        assert.ok(context.includes('You are Tharg'));
        assert.ok(context.includes('A gruff orc.'));
        assert.ok(context.includes('Tavern'));
        assert.ok(context.includes('Player ordered ale'));
    });

    it('should handle empty game state', () => {
        const builder = new CharacterContextBuilder();
        const npcPersonality = { name: 'Grom', backstory: 'A silent type.' };
        
        const context = builder.buildContext(npcPersonality, null);
        
        assert.ok(context.includes('You are Grom'));
        assert.ok(context.includes('A silent type.'));
    });
});
