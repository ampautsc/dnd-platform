import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { EncounterMemoryService } from '../../src/npc/EncounterMemoryService.js';

/**
 * Requirements:
 * 1. getMemory() creates/returns per-session per-NPC memory with defaults
 * 2. Trust management: getTrust, adjustTrust, setTrust — clamped [0, 1]
 * 3. Emotional arc: recordEmotion, getRecentEmotions — tracks mood sequence
 * 4. Secrets: hintSecret, revealSecret, isSecretHinted, isSecretRevealed
 * 5. Revealed info: revealInfo, getRevealedInfo — progressive character discovery
 * 6. Significant moments: recordSignificantMoment
 * 7. Disposition shift: adjustDisposition — clamped [-1, 1]
 * 8. Trigger effects: applyTriggerEffects — infers trust/disposition from trigger events
 * 9. Memory summary: buildMemorySummary — prompt-ready text from memory state
 * 10. Session cleanup: clearSessionMemory, clearAllMemory
 */

describe('EncounterMemoryService', () => {
    let memory;

    beforeEach(() => {
        memory = new EncounterMemoryService();
    });

    describe('getMemory', () => {
        it('should create a new memory with defaults for an unknown NPC', () => {
            const m = memory.getMemory('sess-1', 'npc-tharg');

            assert.strictEqual(m.npcId, 'npc-tharg');
            assert.strictEqual(m.sessionId, 'sess-1');
            assert.strictEqual(m.interactionCount, 0);
            assert.strictEqual(m.dispositionShift, 0);
            assert.strictEqual(m.currentMood, 'neutral');
            assert.strictEqual(m.defaultTrust, 0.3);
            assert.deepStrictEqual(m.emotionalArc, []);
            assert.deepStrictEqual(m.secretsRevealed, []);
            assert.deepStrictEqual(m.secretsHinted, []);
            assert.deepStrictEqual(m.significantMoments, []);
        });

        it('should accept custom defaultTrust', () => {
            const m = memory.getMemory('sess-1', 'npc-ally', { defaultTrust: 0.8 });
            assert.strictEqual(m.defaultTrust, 0.8);
        });

        it('should return the same memory on subsequent calls', () => {
            const m1 = memory.getMemory('sess-1', 'npc-tharg');
            m1.interactionCount = 5;
            const m2 = memory.getMemory('sess-1', 'npc-tharg');
            assert.strictEqual(m2.interactionCount, 5);
        });

        it('should isolate memory between different sessions', () => {
            memory.getMemory('sess-1', 'npc-tharg').interactionCount = 10;
            const m = memory.getMemory('sess-2', 'npc-tharg');
            assert.strictEqual(m.interactionCount, 0);
        });
    });

    describe('trust management', () => {
        it('should return defaultTrust for unknown entities', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            assert.strictEqual(memory.getTrust('sess-1', 'npc-tharg', 'player-1'), 0.3);
        });

        it('should adjust trust and clamp to [0, 1]', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            
            memory.adjustTrust('sess-1', 'npc-tharg', 'player-1', 0.5);
            assert.strictEqual(memory.getTrust('sess-1', 'npc-tharg', 'player-1'), 0.8);

            // Should clamp to 1
            memory.adjustTrust('sess-1', 'npc-tharg', 'player-1', 0.5);
            assert.strictEqual(memory.getTrust('sess-1', 'npc-tharg', 'player-1'), 1.0);

            // Should clamp to 0
            memory.adjustTrust('sess-1', 'npc-tharg', 'player-1', -2.0);
            assert.strictEqual(memory.getTrust('sess-1', 'npc-tharg', 'player-1'), 0);
        });

        it('should set trust to an absolute value', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            memory.setTrust('sess-1', 'npc-tharg', 'player-1', 0.9);
            assert.strictEqual(memory.getTrust('sess-1', 'npc-tharg', 'player-1'), 0.9);
        });
    });

    describe('emotional arc', () => {
        it('should record emotions and update currentMood', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            memory.recordEmotion('sess-1', 'npc-tharg', 'calm');
            memory.recordEmotion('sess-1', 'npc-tharg', 'enraged');

            const m = memory.getMemory('sess-1', 'npc-tharg');
            assert.strictEqual(m.currentMood, 'enraged');
            assert.deepStrictEqual(m.emotionalArc, ['calm', 'enraged']);
        });

        it('should return recent N emotions', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            memory.recordEmotion('sess-1', 'npc-tharg', 'calm');
            memory.recordEmotion('sess-1', 'npc-tharg', 'suspicious');
            memory.recordEmotion('sess-1', 'npc-tharg', 'enraged');
            memory.recordEmotion('sess-1', 'npc-tharg', 'desperate');

            assert.deepStrictEqual(memory.getRecentEmotions('sess-1', 'npc-tharg', 2), ['enraged', 'desperate']);
        });
    });

    describe('secrets', () => {
        it('should track hinted and revealed secrets', () => {
            memory.getMemory('sess-1', 'npc-tharg');

            memory.hintSecret('sess-1', 'npc-tharg', 'hidden_treasure');
            assert.strictEqual(memory.isSecretHinted('sess-1', 'npc-tharg', 'hidden_treasure'), true);
            assert.strictEqual(memory.isSecretRevealed('sess-1', 'npc-tharg', 'hidden_treasure'), false);

            memory.revealSecret('sess-1', 'npc-tharg', 'hidden_treasure');
            assert.strictEqual(memory.isSecretRevealed('sess-1', 'npc-tharg', 'hidden_treasure'), true);
            // Should remove from hinted once revealed
            assert.strictEqual(memory.isSecretHinted('sess-1', 'npc-tharg', 'hidden_treasure'), false);
        });

        it('should not duplicate secrets', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            memory.hintSecret('sess-1', 'npc-tharg', 'treasure');
            memory.hintSecret('sess-1', 'npc-tharg', 'treasure');
            assert.strictEqual(memory.getMemory('sess-1', 'npc-tharg').secretsHinted.length, 1);
        });
    });

    describe('revealed info', () => {
        it('should reveal string fields by appending', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            memory.revealInfo('sess-1', 'npc-tharg', 'backstory', 'Born in the mountains.');
            memory.revealInfo('sess-1', 'npc-tharg', 'backstory', 'Lost his family to war.');

            const info = memory.getRevealedInfo('sess-1', 'npc-tharg');
            assert.ok(info.backstory.includes('Born in the mountains.'));
            assert.ok(info.backstory.includes('Lost his family to war.'));
        });

        it('should merge array fields without duplicates', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            memory.revealInfo('sess-1', 'npc-tharg', 'motivations', 'Protect his family');
            memory.revealInfo('sess-1', 'npc-tharg', 'motivations', ['Protect his family', 'Seek revenge']);

            const info = memory.getRevealedInfo('sess-1', 'npc-tharg');
            assert.deepStrictEqual(info.motivations, ['Protect his family', 'Seek revenge']);
        });

        it('should ignore invalid fields', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            memory.revealInfo('sess-1', 'npc-tharg', 'not_a_real_field', 'something');
            const info = memory.getRevealedInfo('sess-1', 'npc-tharg');
            assert.strictEqual(info.not_a_real_field, undefined);
        });
    });

    describe('disposition', () => {
        it('should adjust and clamp disposition to [-1, 1]', () => {
            memory.getMemory('sess-1', 'npc-tharg');

            memory.adjustDisposition('sess-1', 'npc-tharg', 0.5);
            assert.strictEqual(memory.getMemory('sess-1', 'npc-tharg').dispositionShift, 0.5);

            memory.adjustDisposition('sess-1', 'npc-tharg', 0.8);
            assert.strictEqual(memory.getMemory('sess-1', 'npc-tharg').dispositionShift, 1.0);

            memory.adjustDisposition('sess-1', 'npc-tharg', -3.0);
            assert.strictEqual(memory.getMemory('sess-1', 'npc-tharg').dispositionShift, -1.0);
        });
    });

    describe('applyTriggerEffects', () => {
        it('should apply trust and disposition changes from player_addressed', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            const effects = memory.applyTriggerEffects('sess-1', 'npc-tharg', 'player_addressed', 'player-1');

            assert.ok(effects.trustDelta > 0);
            assert.ok(memory.getTrust('sess-1', 'npc-tharg', 'player-1') > 0.3);
        });

        it('should apply negative trust from attacked trigger', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            const effects = memory.applyTriggerEffects('sess-1', 'npc-tharg', 'attacked', 'player-1');

            assert.ok(effects.trustDelta < 0);
            assert.ok(memory.getTrust('sess-1', 'npc-tharg', 'player-1') < 0.3);
        });

        it('should record significant moments from traumatic triggers', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            memory.applyTriggerEffects('sess-1', 'npc-tharg', 'attacked', 'player-1');

            const m = memory.getMemory('sess-1', 'npc-tharg');
            assert.ok(m.significantMoments.length > 0);
        });
    });

    describe('buildMemorySummary', () => {
        it('should return null when no interactions have occurred', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            assert.strictEqual(memory.buildMemorySummary('sess-1', 'npc-tharg'), null);
        });

        it('should return a string summary after interactions', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            memory.recordInteraction('sess-1', 'npc-tharg');
            memory.recordEmotion('sess-1', 'npc-tharg', 'calm');
            memory.recordEmotion('sess-1', 'npc-tharg', 'suspicious');
            memory.adjustTrust('sess-1', 'npc-tharg', 'player-1', 0.2);

            const summary = memory.buildMemorySummary('sess-1', 'npc-tharg');
            assert.ok(summary);
            assert.strictEqual(typeof summary, 'string');
            assert.ok(summary.includes('suspicious'));
        });
    });

    describe('session cleanup', () => {
        it('should clear all memories for a session', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            memory.getMemory('sess-1', 'npc-other');
            memory.getMemory('sess-2', 'npc-tharg');

            memory.clearSessionMemory('sess-1');

            assert.strictEqual(memory.hasMemory('sess-1', 'npc-tharg'), false);
            assert.strictEqual(memory.hasMemory('sess-1', 'npc-other'), false);
            assert.strictEqual(memory.hasMemory('sess-2', 'npc-tharg'), true);
        });

        it('should clear all memories globally', () => {
            memory.getMemory('sess-1', 'npc-tharg');
            memory.getMemory('sess-2', 'npc-tharg');

            memory.clearAllMemory();
            assert.strictEqual(memory.hasMemory('sess-1', 'npc-tharg'), false);
            assert.strictEqual(memory.hasMemory('sess-2', 'npc-tharg'), false);
        });
    });
});
