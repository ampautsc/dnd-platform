# Skipping Local Model Tests to Prevent OOM

## Category
code

## Tags
#testing #llm #local-model #memory #oom #node-llama-cpp #skip #ci #groq

## Description
Pattern for preventing out-of-memory (OOM) errors by skipping or isolating tests that load large local LLM models (e.g., GGUF via node-llama-cpp). Ensures only Groq/mocked tests run by default, keeping CI and dev runs safe.

## Prerequisites
- Test files that load local models (e.g., ReactionProvider.test.js) are clearly identified
- node:test or similar test runner

## Steps
1. Identify all test files that instantiate LocalLlamaProvider or load GGUF models
2. Wrap the test suite in describe.skip or conditional if-block so it does not run by default
3. For node:test, use `describe.skip('Suite', ...)` or `if (!HAS_KEY) return;` as appropriate
4. Document in README that local model tests are opt-in only
5. Run only Groq/mocked tests in CI and normal dev runs

## Examples
- `describe.skip('LocalLlamaProvider', () => { ... })` in ReactionProvider.test.js
- `if (!HAS_KEY) return;` for Groq API key-dependent tests

## Common Pitfalls
- Forgetting to skip local model tests leads to OOM and system instability
- Using ambiguous error assertions (assert.throws with identical message) causes false failures
- Not documenting the opt-in nature of local model tests

## Related Skills
- `skills/code/groq-free-api-provider-pattern.md` — Groq provider for fast, safe CI tests
- `skills/code/npc-scenario-driven-testing.md` — Data-driven test patterns for LLM evaluation
