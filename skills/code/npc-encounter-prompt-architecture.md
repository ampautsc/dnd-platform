# NPC Encounter Prompt Architecture

## Category
code

## Tags
#npc #encounter #prompt #consciousness #vessel-surrender #llm #multi-turn #runtime-context

## Description
Pattern for building NPC encounter system prompts with vessel surrender consciousness framing, multi-turn conversation history, and runtime context injection. This is the architecture that makes NPCs feel like living people instead of chatbots.

## Prerequisites
- NPC personality data in `content/npcs/` with `consciousnessContext` field
- Location data in `content/locations/` with atmosphere details
- `NpcRuntimeContext` service tracking per-NPC mutable state
- `EncounterMemoryService` for within-session memory
- `PersonalityEvolutionService` for cross-session growth
- LLM provider supporting `systemPrompt` + `messages` array

## Steps

### 1. Build the System Prompt
Use `buildEncounterSystemPrompt()` from `packages/dm/src/npc/buildEncounterSystemPrompt.js`. It composes 11 sections:
1. **Vessel Surrender** — "You are not performing a character. You ARE this person."
2. **Identity** — name, race, age-in-days, backstory, voice, speech patterns
3. **Inner Life** — monologue, preoccupation, contradictions, conflicts, psychology
4. **Wants & Needs** — conscious want + unconscious need (hidden driver)
5. **Location Atmosphere** — sounds, smells, lighting, specific area
6. **Day Context** — current activity, mood, today's experiences
7. **Knowledge & Secrets** — trust-gated information release
8. **Permanent Growth** — evolution summary from PersonalityEvolutionService
9. **Encounter Memory** — memory summary from EncounterMemoryService
10. **Opinions** — merged base + evolved opinions about nearby NPCs
11. **Response Guidance** — no markdown, no asterisks, no narrator, not obligated to engage

### 2. Build Multi-Turn Messages
Convert `session.messages` into alternating user/assistant roles:
- Player messages → `role: 'user'`
- This NPC's prior responses → `role: 'assistant'`
- Other NPCs' speech → `role: 'user'` with `[Name says: "..."]` framing

### 3. Pass Through CharacterResponseService
Use encounter path: provide `options.systemPrompt` + `options.messages` to `generateResponse()`. This bypasses the legacy `contextBuilder.buildContext()` path.

### 4. Seed Runtime Context
On API startup, seed NPC locations/activities/moods via `NpcRuntimeContext`:
```javascript
runtime.setLocation('mira_barrelbottom', { locationId: 'bottoms_up', areaWithin: 'The Bar' });
runtime.setActivity('mira_barrelbottom', 'Wiping down the bar');
runtime.setMood('mira_barrelbottom', 'content but watchful');
```

## Examples
See `packages/dm/src/npc/EncounterSessionService.js` `sendMessage()` for the complete orchestration.

## Common Pitfalls
- **Asterisk actions**: LLMs will use `*action*` notation even when told "no third person / no narrator". Must explicitly say "Do not use asterisk actions like *walks away*".
- **Forgetting memory injection**: Without `applyTriggerEffects()` call after each response, trust/disposition never evolves within the encounter.
- **Empty runtime snapshot**: If NpcRuntimeContext isn't seeded, NPC has no location/activity/mood in the prompt — they feel generic.
- **Token limits**: The system prompt can be very long with full consciousness context. Monitor token usage and consider summarization for very long conversations.

## Related Skills
- `skills/code/npc-consciousness-creation.md` — how NPC personality data is structured
- `skills/code/rest-api-bridge-pattern.md` — how encounters are exposed via REST
- `skills/code/combat-engine-patterns.md` — combat path uses different prompt building
