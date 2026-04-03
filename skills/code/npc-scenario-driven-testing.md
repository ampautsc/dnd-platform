# NPC Scenario-Driven Testing

## Category
code

## Tags
#npc #testing #tdd #scenarios #data-driven #json #content #reaction #ambient

## Description
Store NPC test scenarios as first-class data in the NPC JSON file (`reactionScenarios`). The test suite reads them at runtime — adding scenarios to the JSON automatically adds test coverage without touching test files. This is the architecture-correct pattern because `packages/content/` owns NPC data and the tests in `packages/dm/` consume it.

## Prerequisites
- NPC JSON files exist in `packages/content/src/npcs/data/`
- A test file exists that can load NPC data via `getNpc(key)`
- The behavior being tested is deterministic enough to produce clear yes/no assertions

## Steps

### 1. Add `reactionScenarios` to NPC JSON
At the end of the NPC JSON, after `fallbackLines`, add:
```json
"reactionScenarios": {
  "shouldReact": [
    "Utterance the NPC would definitely react to.",
    "Another utterance — 6 minimum, each targeting a different personality axis."
  ],
  "shouldNotReact": [
    "An utterance completely outside this NPC's interests.",
    "Another non-relevant utterance — 6 minimum, each from a genuinely different domain."
  ]
}
```

**Scenario design rules:**
- `shouldReact` utterances must touch the NPC's motivations, fears, expertise, or relationships
- `shouldNotReact` utterances must be from genuinely unrelated domains (e.g., botanical classification for a tavern regular)
- Avoid edge cases — scenarios should be unambiguous to a reader, which also makes them unambiguous to the model
- Each scenario should target a *different* personality axis — don't write 6 variants of the same trigger

### 2. Write a data-driven test loop
```js
const CHARACTERS = [
  { key: 'npc_key', label: 'NPC Name — short description' },
  // ...
];

for (const { key, label } of CHARACTERS) {
  const npc = getNpc(key);
  if (!npc?.reactionScenarios) {
    throw new Error(`NPC ${key} is missing reactionScenarios`);
  }
  const { shouldReact, shouldNotReact } = npc.reactionScenarios;

  describe(label, () => {
    for (const utterance of shouldReact) {
      it(`reacts: "${utterance.substring(0, 65)}"`, async () => {
        const r = await evaluate(key, utterance);
        expect(r.shouldReact).toBe(true);
      }, 60_000);
    }

    for (const utterance of shouldNotReact) {
      it(`silent: "${utterance.substring(0, 65)}"`, async () => {
        const r = await evaluate(key, utterance);
        expect(r.shouldReact).toBe(false);
      }, 60_000);
    }
  });
}
```

### 3. Validate at loop time
The `throw` inside the loop runs when tests are collected (before any test executes), so a missing `reactionScenarios` field fails loudly and immediately — not silently or as a runtime skip.

### 4. Expanding coverage
To add more test cases: edit the NPC JSON, add more strings to `shouldReact` or `shouldNotReact`. The test loop picks them up automatically with no test file changes.

## Examples
- `NpcReactionEvaluator.test.js` — 8 characters, 12 scenarios each (6+6) = 96 model-backed tests, all driven from `npc.reactionScenarios` in the 8 fantasy NPC JSON files

## Common Pitfalls
- **Ambiguous scenarios**: "Tell me something interesting" is ambiguous — Clifton Rattleknow might or might not react. Use scenarios that have an obvious answer.
- **Domain overlap**: If a `shouldNotReact` scenario accidentally touches the NPC's interests, the model will react and the test will fail. Test the scenario mentally against the NPC personality before committing.
- **Missing JSON field**: The loop validation (`throw new Error(...)`) catches this before tests run, but you still need to add the field to the JSON manually.
- **reactionScenarios not in schema validation**: If the content tests use strict schema validation, this field may need to be added to the schema definition. Currently it is additive (passes tests without schema change) but in the future it should become a required field once all NPCs have it.

## Related Skills
- `skills/code/npc-consciousness-json-authoring.md` — authoring the NPC JSON files these scenarios live in
- `skills/code/dm-mvp-tests-first-bootstrap.md` — bootstrap and vitest setup for packages/dm
