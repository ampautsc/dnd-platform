/**
 * PROTOTYPE — Prove Groq free API works for NPC reaction classification.
 *
 * Same scenario as prototype-session-reuse.test.js (local model) but using
 * Groq's free llama-3.1-8b-instant via OpenAI-compatible API.
 *
 * Requires GROQ_API_KEY env var. Get a free key: https://console.groq.com/keys
 *
 * Expectations:
 *   - Sub-1-second per call (vs 12-45s local)
 *   - Correct classification (beer = react, magic = don't react)
 *   - JSON mode produces valid output without grammar enforcement
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { GroqReactionProvider } from '../../src/ambient/GroqReactionProvider.js';

// Same terse system prompt from the local prototype — but reframed:
// not "topics you care about" but "situations you would INSERT YOURSELF into"
const SYSTEM_PROMPT = `You are Norvin Stonebottom, a Hill Dwarf tavern regular. You sit on your barstool drinking beer.
You INTERJECT when: someone insults this tavern's beer, someone claims your seat, your wife Gorma is mentioned, someone questions your bar tab, the tavern might close, someone needs accounting advice.
You IGNORE: routine orders ("I'll have an ale"), magic talk, combat stories, religion, strangers chatting, anything that isn't your business.
DEFAULT: Stay silent. Most tavern chatter is not your concern. You only speak when something directly provokes you or touches your interests.
Output JSON only: {"shouldReact": true/false, "reactionStrength": 1-5} where 1=no interest, 5=must respond. If shouldReact is false, reactionStrength MUST be 1.`;

const API_KEY = process.env.GROQ_API_KEY;

// Skip entirely if no API key — don't fail CI
const describeIfKey = API_KEY ? describe : describe.skip;

let provider;

describeIfKey('Groq Prototype — free API reaction classification', () => {

  before(async () => {
    provider = new GroqReactionProvider({ apiKey: API_KEY });
    await provider.init();
  });

  after(async () => {
    if (provider) await provider.dispose();
  });

  it('should initialize without error', () => {
    assert.strictEqual(provider.isReady, true);
  });

  it('should react when someone insults the beer quality', async () => {
    const start = Date.now();
    const result = await provider.evaluateReaction(
      SYSTEM_PROMPT,
      'A stranger slams his mug on the bar: "This ale tastes like something died in the keg! Worst beer I\'ve had in any tavern."'
    );
    const elapsed = Date.now() - start;

    console.log(`Beer insult: ${elapsed}ms — ${JSON.stringify(result)}`);

    assert.strictEqual(result.shouldReact, true);
    assert.ok(result.reactionStrength >= 3);
    assert.ok(elapsed < 5000); // should be well under this
  }, 10_000);

  it('should NOT react to a routine beer order', async () => {
    const start = Date.now();
    const result = await provider.evaluateReaction(
      SYSTEM_PROMPT,
      'A traveler sits down at the bar: "Barkeep, I\'ll have whatever ale you\'ve got on tap."'
    );
    const elapsed = Date.now() - start;

    console.log(`Routine order: ${elapsed}ms — ${JSON.stringify(result)}`);

    assert.strictEqual(result.shouldReact, false);
    assert.ok(result.reactionStrength <= 2);
    assert.ok(elapsed < 5000);
  }, 10_000);

  it('should NOT react to magic theory discussion', async () => {
    const start = Date.now();
    const result = await provider.evaluateReaction(
      SYSTEM_PROMPT,
      'A robed elf mutters to their companion: "The third-order transmutation theorem requires revision."'
    );
    const elapsed = Date.now() - start;

    console.log(`Magic theory: ${elapsed}ms — ${JSON.stringify(result)}`);

    assert.strictEqual(result.shouldReact, false);
    assert.ok(result.reactionStrength <= 2);
    assert.ok(elapsed < 5000);
  }, 10_000);

  it('should react when someone mentions his wife Gorma', async () => {
    const start = Date.now();
    const result = await provider.evaluateReaction(
      SYSTEM_PROMPT,
      'The bartender leans over: "Norvin, your wife Gorma was in here earlier asking where you\'ve been all evening."'
    );
    const elapsed = Date.now() - start;

    console.log(`Wife mention: ${elapsed}ms — ${JSON.stringify(result)}`);

    assert.strictEqual(result.shouldReact, true);
    assert.ok(result.reactionStrength >= 3);
    assert.ok(elapsed < 5000);
  }, 10_000);

  it('should react when someone takes his seat', async () => {
    const start = Date.now();
    const result = await provider.evaluateReaction(
      SYSTEM_PROMPT,
      'A burly half-orc drops onto the corner barstool — Norvin\'s usual spot — and waves for service.'
    );
    const elapsed = Date.now() - start;

    console.log(`Seat taken: ${elapsed}ms — ${JSON.stringify(result)}`);

    assert.strictEqual(result.shouldReact, true);
    assert.ok(result.reactionStrength >= 4);
    assert.ok(elapsed < 5000);
  }, 10_000);

  it('should NOT react to combat stories between strangers', async () => {
    const start = Date.now();
    const result = await provider.evaluateReaction(
      SYSTEM_PROMPT,
      'Two adventurers at the far table are loudly comparing sword techniques and bragging about a dragon fight.'
    );
    const elapsed = Date.now() - start;

    console.log(`Combat chat: ${elapsed}ms — ${JSON.stringify(result)}`);

    assert.strictEqual(result.shouldReact, false);
    assert.ok(result.reactionStrength <= 2);
    assert.ok(elapsed < 5000);
  }, 10_000);

  it('should measure total time for all 6 scenarios', () => {
    // This is just an observational test — the console.log above tracks each timing.
    // The real value: compare these times to the local model's 12-45s per call.
    console.log('All 6 classification calls completed. Review times above.');
    assert.strictEqual(true, true);
  });
});
