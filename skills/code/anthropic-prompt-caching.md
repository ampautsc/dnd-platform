# Anthropic Prompt Caching in LLMProvider

## Category
code

## Tags
#anthropic #prompt-caching #llm #cache #system-prompt #usage #tokens #haiku

## Description
How to enable and verify Anthropic prompt caching in the runtime LLMProvider. The system prompt (NPC consciousness) is passed as a structured content block array with `cache_control: { type: 'ephemeral' }` so the API caches it across turns within the 5-minute TTL window.

## Prerequisites
- `@anthropic-ai/sdk` v0.79+ (no beta header needed for newer models)
- System prompt must exceed the model's minimum cache token threshold (see table below)
- NPC consciousness prompts are ~5,500+ tokens — always eligible

## Minimum Cache Token Thresholds (as of 2026-04-02)

| Model | Min Tokens |
|---|---|
| Claude Opus 4.6, 4.5 | 4,096 |
| Claude Opus 4.1, 4 | 1,024 |
| Claude Sonnet 4.6 | 2,048 |
| Claude Sonnet 4.5, 4, 3.7 | 1,024 |
| Claude Haiku 4.5 | **4,096** |
| Claude Haiku 3.5, 3 | 2,048 |

**⚠ Haiku 4.5 requires 4,096 tokens, not 1,024.** Below-threshold requests succeed silently with no caching — both `cache_creation_input_tokens` and `cache_read_input_tokens` will be 0. No error is returned.

## How Caching Actually Works (Key Mental Model)

1. **Cache writes happen ONLY at breakpoints.** Marking a block with `cache_control` writes one cache entry: a hash of the full prefix up to and including that block. The system does NOT write entries at earlier positions unless they also have `cache_control`.

2. **Cache reads use lookback.** On each request the system checks the prefix hash at your breakpoint. If no match, it walks backward up to 20 blocks checking if prior requests wrote entries at those positions. It finds **prior writes**, not "stable content."

3. **Prefix changes invalidate downstream.** Because the hash is cumulative, changing any block at or before a breakpoint produces a different hash. The cache hierarchy is: `tools` → `system` → `messages`.

4. **Cross-request prefix sharing via lookback.** If two requests share block 1 but differ on block 2, the lookback from block 2 can find block 1's entry — but **ONLY if block 1 has its own `cache_control` breakpoint AND block 1 alone exceeds the minimum token threshold.** If block 1 is below threshold, no entry is written there and lookback finds nothing.

## Steps

### 1. Pass system prompt as structured array (single block)
```javascript
const system = systemText
    ? [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }]
    : [];
```

**DO NOT** pass system as a plain string — that disables caching.

### 1b. Multi-block system prompt (for prefix sharing)
Use `systemBlocks` to separate shared content from per-NPC content. Each block gets its own `cache_control` breakpoint:

```javascript
const systemBlocks = [
  { text: worldKnowledge },         // Block 1: world knowledge XML (breakpoint)
  { text: npcConsciousnessPrompt },  // Block 2: per-NPC consciousness (breakpoint)
];
```

**Cross-NPC sharing requires block 1 to independently exceed the minimum threshold.** If block 1 is below threshold (e.g., 1,903 tokens on Haiku 4.5 which requires 4,096), no cache entry is written at block 1 and switching NPCs gets zero cache benefit.

**Confirmed 2026-04-02 on Sonnet 4.6** (`claude-sonnet-4-6`, 1,024 minimum): Cross-NPC sharing works. Call 1 (Samren) wrote 7,833 tokens. Call 2 (Mira) read 2,162 tokens from block 1 cache + wrote 3,027 new tokens for block 2. Call 3 (Mira repeat) read all 5,189 tokens.

Haiku 4.5 test (2026-04-01) with same ~1,903-token block 1: no cross-NPC sharing because block 1 was below 4,096 minimum. Same-NPC caching still works on Haiku — both blocks as a unit exceed the threshold.

**To enable cross-NPC sharing:** Use Sonnet 4.6 (1,024 minimum, current world knowledge works) or expand block 1 to 4,096+ tokens for Haiku 4.5.

### 2. No beta header needed
The Anthropic SDK v0.79+ handles caching natively. Do NOT add `anthropic-beta: prompt-caching-2024-07-31` to the client constructor.

### 3. Verify cache in response usage
```json
{
  "input_tokens": 70,
  "output_tokens": 363,
  "cache_creation_input_tokens": 5567,
  "cache_read_input_tokens": 0,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 5567,
    "ephemeral_1h_input_tokens": 0
  }
}
```

- **First call**: `cache_creation_input_tokens > 0`, `cache_read_input_tokens = 0`
- **Subsequent calls (within 5min)**: `cache_creation_input_tokens = 0`, `cache_read_input_tokens > 0`
- **Below threshold**: Both fields = 0. No error. Request works but is uncached.

### 4. Max 4 breakpoints per request
You can use up to 4 explicit `cache_control` breakpoints. If automatic caching is also enabled, it uses one of the 4 slots. A 5th breakpoint returns a 400 error.

### 5. 1-hour cache option
For prompts used less frequently than every 5 minutes: `cache_control: { type: 'ephemeral', ttl: '1h' }` at 2x base input token price. 1-hour entries must appear before 5-minute entries in the prompt.

### 6. Log everything
The `_logResponse()` method on LLMProvider writes to `logs/llm-YYYY-MM-DD.log` with full usage details including cache metrics.

## Pricing (per million tokens)

| | Base Input | 5min Cache Write | 5min Cache Read | 1hr Cache Write |
|---|---|---|---|---|
| Haiku 4.5 | $1 | $1.25 (1.25x) | $0.10 (0.1x) | $2.00 (2x) |
| Sonnet 4/4.5/4.6 | $3 | $3.75 | $0.30 | $6.00 |
| Opus 4/4.1 | $15 | $18.75 | $1.50 | $30.00 |
| Opus 4.5/4.6 | $5 | $6.25 | $0.50 | $10.00 |

Cache reads are 10x cheaper than base input. Cache writes are 1.25x base (5min) or 2x base (1hr).

## Examples
- `scripts/test-samren-consciousness.mjs` — 2-call test with multi-block caching (cache create then read).
- `scripts/test-cross-npc-cache.mjs` — 3-call Samren→Mira→Mira test for cross-NPC sharing analysis.
- `packages/dm/__tests__/llm/LLMProvider.test.js` — Unit tests with stubbed Anthropic client.

## Common Pitfalls
- **Plain string system param**: `system: "some text"` DISABLES caching. Must be array of content blocks.
- **Empty system prompt**: Pass `system: []` (empty array), NOT `system: ""` (empty string).
- **Token estimate**: Divide character count by ~4.3 for rough estimate. Actual tokenization differs by ~4%.
- **Cache TTL**: Default 5 minutes. Refreshed for free each time cached content is used.
- **Below-threshold caching is silent**: No error returned. Check response usage fields to confirm caching.
- **Haiku 4.5 minimum is 4,096 — not 1,024**. This catches people who remember Sonnet's threshold.
- **Concurrent requests**: Cache entry only available after first response begins. Wait for first response before sending parallel requests with same prefix.
- **Beta header on SDK**: Adding `anthropic-beta` header may cause errors. Don't.

## Related Skills
- `skills/code/npc-consciousness-json-authoring.md` — authoring the NPC data that becomes the system prompt
- `skills/code/npc-vessel-surrender-canonical-prompt.md` — canonical text structure of the system prompt
- `skills/code/npc-encounter-prompt-architecture.md` — how the prompt sections are assembled
- `skills/code/groq-free-api-provider-pattern.md` — the Groq/free-tier path (separate from Claude caching)
- `skills/code/xml-prompt-engineering.md` — XML structuring for cached prompt blocks
