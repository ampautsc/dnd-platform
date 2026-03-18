# REST API Bridge Pattern → DM Consciousness Prompt Architecture

## Category
code

## Tags
#dm #consciousness #narrator #prompt #omniscient #inner-state #scene #llm #vessel-surrender

## Description
Pattern for building a DM consciousness prompt — an omniscient narrator system prompt that sees all NPC inner states, motivations, secrets, and relationships, then selectively reveals through observable behavior. Follows the same vessel-surrender architecture as NPC consciousness prompts but for the DM mind itself.

## Prerequisites
- `buildEncounterSystemPrompt` pattern understood (12-section vessel surrender for NPCs)
- NPC personality data with `consciousnessContext` (wants, needs, inner monologue)
- NPC runtime context (`NpcRuntimeContext`) for mood, activity
- `RelationshipRepository` for name resolution

## Steps

### 1. Create the prompt builder module
File: `packages/dm/src/npc/buildDmConsciousnessPrompt.js`

Accept params: `{ playerName, worldContext, npcInnerStates }`

### 2. Structure as 10 sections
1. **Vessel Surrender** — "You ARE the Dungeon Master. Not a text formatter."
2. **Storytelling Philosophy** — Show don't tell, sensory-first, body language as paint, dramatic irony
3. **Omniscience** — "You know EVERYTHING about every character"
4. **Selective Reveal** — Camera rule: if a camera could capture it, describe it. If mind-reader only, guard it. Pronoun rule: use pronouns based on observable appearance.
5. **Voice & Style** — Second person, literary prose, no game mechanics, no markdown
6. **Name Gating** — Only use names the player has learned
7. **Target Clarity** — Make unambiguous who is addressing whom
8. **World Context** — Location, atmosphere, time of day (dynamic, injected when available)
9. **NPC Inner States** — DM-eyes-only section with appearance (gender, race, build, hair, skin, eyes, height, attire, distinguishing features), then mood, wants, secrets, deception flags
10. **Information Boundary** — HARD RULES with five-senses perception test, explicit ALLOWED/FORBIDDEN categories

### 3. Collect inner state in SceneEngine
Add `_buildNpcInnerState(participant)` method that pulls from:
- `personalityLookup(templateKey)` → consciousWant, unconsciousNeed, secrets
- `runtimeContext.getSnapshot(templateKey)` → currentMood, currentActivity

Collect alongside `npcActions` in the NPC loop, pass to narrator.

### 4. Wire through SceneNarrator
`narrateNpcBatch` accepts `npcInnerStates`, forwards to `buildDmNarrationPrompt` → `buildDmConsciousnessPrompt`.

### 5. Add player action and scene memory
`narrateNpcBatch` also accepts:
- `playerAction` — what triggered the NPC responses
- `sceneMemory` — rolling summary for callbacks to earlier moments

These go in the user message, not the system prompt.

## Examples

Inner state for a deceptive NPC:
```
▸ a quiet man at the bar:
  Emotional state: tense
  Wants: To leave town before dawn
  Secrets: Carrying stolen goods in his pack
  → Translate this into subtle behavioral tells, not exposition.
  ⚠ THIS CHARACTER IS BEING DECEPTIVE.
  → Show micro-expressions, hesitation, or body language that a
    perceptive observer might notice. Do NOT announce the lie.
```

The DM would narrate: "The man's hand drifts toward his pack, then pulls back. He smiles, but his eyes don't follow."

## Common Pitfalls
- **Dumping inner state**: The prompt MUST emphasize "NEVER state inner thoughts directly"
- **Identical code blocks**: `submitAction` and `advanceNpcTurns` have near-identical NPC loops — consider extracting a shared method
- **Dead dependencies**: `responseService` is injected into SceneNarrator but never used — clean up
- **Scene memory not yet built**: `sceneMemory` param is accepted but SceneEngine doesn't build it yet — needs a rolling summary builder

## Related Skills
- `skills/code/npc-consciousness-creation.md` — NPC vessel surrender pattern
- `skills/code/npc-encounter-prompt-architecture.md` — Encounter system prompt sections
- `skills/code/narrator-appearance-injection.md` — Appearance data in narrator prompts
