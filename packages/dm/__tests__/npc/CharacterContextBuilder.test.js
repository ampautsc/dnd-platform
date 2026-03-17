import { describe, it, expect } from 'vitest';
import { CharacterContextBuilder } from '../../src/npc/CharacterContextBuilder.js';

describe('CharacterContextBuilder', () => {
    it('should build context prompt correctly', () => {
        const builder = new CharacterContextBuilder();
        const gameState = { currentScene: 'Tavern', recentEvents: ['Player ordered ale'] };
        const npcPersonality = { name: 'Tharg', backstory: 'A gruff orc.' };
        
        const context = builder.buildContext(npcPersonality, gameState);
        
        expect(context).toContain('You are Tharg');
        expect(context).toContain('A gruff orc.');
        expect(context).toContain('Tavern');
        expect(context).toContain('Player ordered ale');
    });

    it('should handle empty game state', () => {
        const builder = new CharacterContextBuilder();
        const npcPersonality = { name: 'Grom', backstory: 'A silent type.' };
        
        const context = builder.buildContext(npcPersonality, null);
        
        expect(context).toContain('You are Grom');
        expect(context).toContain('A silent type.');
    });
});
