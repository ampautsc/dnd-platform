/**
 * AmbientSceneEngine — integration tests.
 *
 * Requirements:
 * - Orchestrates evaluator → priorityResolver → responseGenerator pipeline
 * - Returns empty results for empty utterance or no present NPCs
 * - Non-reacting NPCs produce nothing
 * - Reactions are sorted by priority
 * - Responses are generated only for prioritized reactors
 * - responseGenerator failure for one NPC doesn't break the round
 * - Works without responseGenerator (reaction-only mode)
 */


import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AmbientSceneEngine } from '../../src/ambient/AmbientSceneEngine.js';

// Minimal fake evaluator for orchestration tests

function createFakeEvaluator(reactors) {
  const calls = [];
  const evaluateAll = async (...args) => {
    calls.push(args);
    return reactors;
  };
  evaluateAll.calls = calls;
  return { evaluateAll };
}

// Fake priority resolver that returns input sorted by reactionStrength desc

function createFakeResolver() {
  const calls = [];
  const resolve = (reactions) => {
    calls.push([reactions]);
    return reactions
      .map(r => ({ ...r, d20: 10, chaMod: 0, priority: 10 + r.reactionStrength }))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);
  };
  resolve.calls = calls;
  return { resolve };
}

const FAKE_NPC_A = { templateKey: 'npc_a', name: 'NPC A', race: 'Human' };
const FAKE_NPC_B = { templateKey: 'npc_b', name: 'NPC B', race: 'Elf' };
const FAKE_NPC_C = { templateKey: 'npc_c', name: 'NPC C', race: 'Dwarf' };

describe('AmbientSceneEngine', () => {
  describe('constructor', () => {
    it('should throw when evaluator is missing', () => {
      assert.throws(() => new AmbientSceneEngine({
        evaluator: null,
        priorityResolver: createFakeResolver(),
      }), /evaluator is required/);
    });

    it('should throw when priorityResolver is missing', () => {
      assert.throws(() => new AmbientSceneEngine({
        evaluator: createFakeEvaluator([]),
        priorityResolver: null,
      }), /priorityResolver is required/);
    });
  });

  describe('processUtterance', () => {
    it('should return empty for empty utterance', async () => {
      const engine = new AmbientSceneEngine({
        evaluator: createFakeEvaluator([]),
        priorityResolver: createFakeResolver(),
      });

      const result = await engine.processUtterance({
        utterance: '',
        presentNpcs: [FAKE_NPC_A],
      });

      assert.deepStrictEqual(result.reactions, []);
      assert.deepStrictEqual(result.responses, []);
    });

    it('should return empty for no present NPCs', async () => {
      const engine = new AmbientSceneEngine({
        evaluator: createFakeEvaluator([]),
        priorityResolver: createFakeResolver(),
      });

      const result = await engine.processUtterance({
        utterance: 'Hello everyone!',
        presentNpcs: [],
      });

      assert.deepStrictEqual(result.reactions, []);
      assert.deepStrictEqual(result.responses, []);
    });

    it('should return empty when no NPCs react', async () => {
      const engine = new AmbientSceneEngine({
        evaluator: createFakeEvaluator([]),
        priorityResolver: createFakeResolver(),
      });

      const result = await engine.processUtterance({
        utterance: 'The weather is nice today.',
        presentNpcs: [FAKE_NPC_A, FAKE_NPC_B],
      });

      assert.deepStrictEqual(result.reactions, []);
      assert.deepStrictEqual(result.responses, []);
    });

    it('should return prioritized reactions when NPCs react', async () => {
      const reactors = [
        { npcKey: 'npc_a', npcName: 'NPC A', shouldReact: true, reactionStrength: 3 },
        { npcKey: 'npc_b', npcName: 'NPC B', shouldReact: true, reactionStrength: 5 },
      ];

      const engine = new AmbientSceneEngine({
        evaluator: createFakeEvaluator(reactors),
        priorityResolver: createFakeResolver(),
      });

      const result = await engine.processUtterance({
        utterance: 'Who wants a drink?',
        presentNpcs: [FAKE_NPC_A, FAKE_NPC_B],
      });

      assert.strictEqual(result.reactions.length, 2);
      // NPC B has higher reactionStrength so should be first
      assert.strictEqual(result.reactions[0].npcKey, 'npc_b');
      assert.strictEqual(result.reactions[1].npcKey, 'npc_a');
    });

    it('should generate responses when responseGenerator is provided', async () => {
      const reactors = [
        { npcKey: 'npc_a', npcName: 'NPC A', shouldReact: true, reactionStrength: 4 },
      ];


      const responseGeneratorCalls = [];
      const responseGenerator = async (...args) => {
        responseGeneratorCalls.push(args);
        return "I'll have what he's having!";
      };
      responseGenerator.calls = responseGeneratorCalls;

      const engine = new AmbientSceneEngine({
        evaluator: createFakeEvaluator(reactors),
        priorityResolver: createFakeResolver(),
        responseGenerator,
      });

      const result = await engine.processUtterance({
        utterance: 'Drinks on me!',
        presentNpcs: [FAKE_NPC_A],
      });

      assert.strictEqual(result.responses.length, 1);
      assert.strictEqual(result.responses[0].dialogue, "I'll have what he's having!");
      assert.strictEqual(result.responses[0].npcKey, 'npc_a');
      assert.strictEqual(responseGenerator.calls.length, 1);
    });

    it('should work without responseGenerator (reaction-only mode)', async () => {
      const reactors = [
        { npcKey: 'npc_a', npcName: 'NPC A', shouldReact: true, reactionStrength: 4 },
      ];

      const engine = new AmbientSceneEngine({
        evaluator: createFakeEvaluator(reactors),
        priorityResolver: createFakeResolver(),
      });

      const result = await engine.processUtterance({
        utterance: 'Hello!',
        presentNpcs: [FAKE_NPC_A],
      });

      assert.strictEqual(result.reactions.length, 1);
      assert.deepStrictEqual(result.responses, []);
    });

    it('should survive responseGenerator failure for one NPC', async () => {
      const reactors = [
        { npcKey: 'npc_a', npcName: 'NPC A', shouldReact: true, reactionStrength: 5 },
        { npcKey: 'npc_b', npcName: 'NPC B', shouldReact: true, reactionStrength: 3 },
      ];


      let callCount = 0;
      const responseGeneratorCalls = [];
      const responseGenerator = async (...args) => {
        responseGeneratorCalls.push(args);
        callCount++;
        if (callCount === 1) throw new Error('LLM failure');
        return 'I heard that!';
      };
      responseGenerator.calls = responseGeneratorCalls;

      const engine = new AmbientSceneEngine({
        evaluator: createFakeEvaluator(reactors),
        priorityResolver: createFakeResolver(),
        responseGenerator,
      });


      // Suppress console.error for this test
      const originalError = console.error;
      console.error = () => {};

      const result = await engine.processUtterance({
        utterance: 'Something interesting',
        presentNpcs: [FAKE_NPC_A, FAKE_NPC_B],
      });

      console.error = originalError;

      // Both reacted, but only NPC B got a response (NPC A's call failed)
      assert.strictEqual(result.reactions.length, 2);
      assert.strictEqual(result.responses.length, 1);
      assert.strictEqual(result.responses[0].npcKey, 'npc_b');
    });

    it('should pass correct arguments to evaluator', async () => {
      const evaluator = createFakeEvaluator([]);

      const engine = new AmbientSceneEngine({
        evaluator,
        priorityResolver: createFakeResolver(),
      });

      await engine.processUtterance({
        utterance: 'Hello there!',
        presentNpcs: [FAKE_NPC_A],
        speakerName: 'Player One',
        locationName: 'Bottoms Up',
      });

      const calls = evaluator.evaluateAll.calls;
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0][0], [FAKE_NPC_A]);
      assert.strictEqual(calls[0][1], 'Hello there!');
      assert.deepStrictEqual(calls[0][2], { speakerName: 'Player One', locationName: 'Bottoms Up' });
    });
  });
});
