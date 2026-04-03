# Groq Free API Provider Pattern

## Category
code

## Tags
#groq #llm #free-api #provider #openai-compatible #classification #ambient #reaction

## Description
Pattern for wrapping Groq's free cloud API behind the same provider interface as a local model. Uses the already-installed `openai` package with a `baseURL` swap. No new dependencies. Ideal for fast classification tasks (~100ms per call vs 12-45s local).

## Prerequisites
- `openai` package installed (^6.x)
- Groq API key (free at https://console.groq.com/keys)
- Key stored in `.keys/groq.env` (gitignored), set as `GROQ_API_KEY` env var
- Same provider interface as `LocalLlamaProvider`: `init()`, `isReady`, `evaluateReaction(systemPrompt, utterance)`, `dispose()`

## Steps

### 1. Create Provider Class
```javascript
import OpenAI from 'openai';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export class GroqReactionProvider {
  constructor({ apiKey, model = 'llama-3.1-8b-instant', maxTokens = 30, temperature = 0 } = {}) {
    this.apiKey = apiKey || process.env.GROQ_API_KEY;
    // ... store settings
  }
  
  async init() {
    // Validate key, create OpenAI client with baseURL
    this._client = new OpenAI({ apiKey: this.apiKey, baseURL: GROQ_BASE_URL });
  }

  async evaluateReaction(systemPrompt, utterance) {
    const response = await this._client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: utterance },
      ],
      response_format: { type: 'json_object' },
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    });
    // Parse, validate, clamp
  }
}
```

### 2. Enforce Output Shape at Provider Level
```javascript
// DO: Return only the fields you want
function clampReaction(result) {
  return {
    shouldReact: result.shouldReact,
    reactionStrength: Math.max(1, Math.min(5, Math.round(result.reactionStrength))),
  };
}

// DON'T: Spread preserves extra fields from the LLM
function clampReaction(result) {
  return { ...result, reactionStrength: /* ... */ };  // LEAKS extra fields!
}
```

### 3. Write CI-Safe Unit Tests with Mocked Client
```javascript
// Mock the internal OpenAI client — no real API key needed
provider._client = {
  chat: { completions: { create: vi.fn().mockResolvedValue(mockResponse) } }
};
```

### 4. Skip Real API Tests When No Key
```javascript
const HAS_KEY = !!process.env.GROQ_API_KEY;
describe.skipIf(!HAS_KEY)('Groq integration', () => { /* ... */ });
```

## Examples
- `packages/dm/src/ambient/GroqReactionProvider.js` — Full implementation
- `packages/dm/__tests__/ambient/GroqReactionProvider.test.js` — 17 mocked unit tests
- `packages/dm/__tests__/ambient/prototype-groq.test.js` — 8 real API integration tests

## Common Pitfalls
- **Spread operator in clampReaction**: Cloud APIs return unpredictable extra fields. Use explicit property enumeration, not `...result`.
- **API key cached at construction**: `this.apiKey = apiKey || process.env.GROQ_API_KEY` reads env at construction time. Tests that delete the env var AFTER construction won't see the change.
- **TPM is the binding constraint, not RPM**: Free tier allows 30 RPM but only 6,000 TPM. With 500-token prompts, effective max is ~12 RPM. Always calculate BOTH.
- **JSON mode requires strong prompt instructions**: Groq returns `400: Failed to generate JSON` if the model can't produce valid JSON. Fix: bookend the prompt (JSON preamble at start + explicit JSON example at end).
- **JSON example anchoring (CRITICAL)**: Showing only `{"shouldReact": false, ...}` as the example anchors the 8B model toward silence. This is a stronger signal than all text instructions combined. **ALWAYS show both positive and negative JSON examples.** The example the model sees first is the one it defaults to.
- **Instruction ordering matters for 8B models**: Put YES/positive conditions BEFORE NO/negative conditions. The model reads top-down and anchors early. "Would you respond?" + YES criteria first performs dramatically better than "Stay quiet by default" + exception list.
- **Explicit role keywords bridge identity gaps**: The model may not infer that "barkeep" means Samren. Add explicit role synonyms ("barkeep, innkeeper, waitress") in the reaction criteria so the model can match utterance terms to NPC identity.
- **Classifier prompts should be concise**: For yes/no classification, full personality data (speech patterns, inner monologue, etc.) adds noise. Identity + motivations + fears may be sufficient at ~200 tokens.

## Rate Limiting Pattern
```javascript
// Promise-queue based throttle — serializes concurrent requests
_throttle() {
  this._requestQueue = this._requestQueue.then(async () => {
    const elapsed = Date.now() - this._lastRequestTime;
    const minInterval = Math.ceil(60_000 / this._rpmLimit);
    if (elapsed < minInterval) {
      await new Promise(r => setTimeout(r, minInterval - elapsed));
    }
    this._lastRequestTime = Date.now();
  });
  return this._requestQueue;
}
```

## Related Skills
- `skills/code/npc-scenario-driven-testing.md` — data-driven NPC test patterns
- `skills/code/npc-consciousness-json-authoring.md` — NPC personality data formatting
- `skills/code/combat-engine-patterns.md` — immutable state patterns used elsewhere
- **Free tier limits**: 30 RPM, 14,400 RPD, 6,000 tokens/min. Adequate for 8 NPCs per utterance but NOT for load testing.
- **JSON mode doesn't enforce schema**: `response_format: { type: 'json_object' }` guarantees valid JSON but NOT specific fields. Always validate post-hoc.

## Related Skills
- `skills/code/npc-scenario-driven-testing.md` — Data-driven tests that consume this provider
- `skills/code/combat-engine-patterns.md` — Immutable state patterns (same philosophy: enforce shape at boundary)
