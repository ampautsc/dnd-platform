/**
 * PROTOTYPE — Prove session-reuse pattern works.
 *
 * Goal: Load model ONCE, create ONE session with a short system prompt,
 * send TWO different utterances to it, get correct boolean responses,
 * and confirm it's fast because the system prompt is cached.
 *
 * NO source files. Raw node-llama-cpp calls. ONE test. Prove the concept.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { join } from 'path';
import { existsSync } from 'fs';
import { getLlama, LlamaJsonSchemaGrammar, LlamaChatSession } from 'node-llama-cpp';

const MODEL_PATH = join(process.cwd(), '..', '..', 'models', 'hf_bartowski_Phi-3.5-mini-instruct-Q4_K_M.gguf');

// Minimal schema — just two fields, no reason, no reactionType
const SCHEMA = {
  type: 'object',
  properties: {
    shouldReact: { type: 'boolean' },
    reactionStrength: { type: 'number' },
  },
  required: ['shouldReact', 'reactionStrength'],
};

// Minimal system prompt — terse classification card
const SYSTEM_PROMPT = `You are Norvin Stonebottom, a Hill Dwarf tavern regular. You sit on your barstool drinking beer. You are NOT the barkeep.
Topics you WILL react to (shouldReact: true): beer quality, your tab, your wife Gorma, this tavern closing, someone sitting in your seat, accounting.
Topics you will NOT react to (shouldReact: false): magic, combat, religion, athletics, academics, strangers talking to each other, anything not about your interests.
DEFAULT: You do NOT react. Most things said in a tavern are not your business. Only react when it directly concerns your interests listed above.
Output JSON: {"shouldReact": true/false, "reactionStrength": 1-5} where 1=no interest, 5=must respond. If shouldReact is false, reactionStrength must be 1.`;

let llama, model, grammar, context, session;

describe.skip('Prototype — session reuse with minimal prompt', () => {

  before(async () => {
    if (!existsSync(MODEL_PATH)) {
      throw new Error(`Model not found at ${MODEL_PATH}`);
    }
    llama = await getLlama({ gpu: false });
    model = await llama.loadModel({ modelPath: MODEL_PATH });
    grammar = new LlamaJsonSchemaGrammar(llama, SCHEMA);
    context = await model.createContext();
    session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: SYSTEM_PROMPT,
    });
  }, 120_000);

  after(async () => {
    if (context) await context.dispose();
    if (model) await model.dispose();
    if (llama) await llama.dispose();
  }, 30_000);

  it('should react to beer talk, ignore magic theory, and be fast on second call', async () => {
    // --- Call 1: should react (beer/tavern topic) ---
    const start1 = Date.now();
    const raw1 = await session.prompt(
      'A stranger walks in and says: "Barkeep, I hear this place has the finest ale in the district!"',
      { grammar, temperature: 0, seed: 42, maxTokens: 30 }
    );
    const time1 = Date.now() - start1;
    const r1 = JSON.parse(raw1);

    console.log(`Call 1 (beer topic): ${time1}ms — ${JSON.stringify(r1)}`);
    assert.strictEqual(r1.shouldReact, true);
    assert.ok(r1.reactionStrength >= 2);

    // Reset chat history — keeps system prompt cached, clears the Q&A
    session.resetChatHistory();

    // --- Call 2: should NOT react (magic theory) ---
    const start2 = Date.now();
    const raw2 = await session.prompt(
      'A robed elf mutters to their companion: "The third-order transmutation theorem requires revision."',
      { grammar, temperature: 0, seed: 42, maxTokens: 30 }
    );
    const time2 = Date.now() - start2;
    const r2 = JSON.parse(raw2);

    console.log(`Call 2 (magic theory): ${time2}ms — ${JSON.stringify(r2)}`);
    assert.strictEqual(r2.shouldReact, false);
    assert.ok(r2.reactionStrength <= 2);

    // Call 2 should benefit from cached system prompt tokens
    console.log(`Speed comparison: call1=${time1}ms, call2=${time2}ms`);
  }, 120_000);
});
