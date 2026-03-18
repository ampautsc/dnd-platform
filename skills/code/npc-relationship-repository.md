# Skill: NPC Relationship Repository & Memory Synthesis (Unified)

## Category
code

## Tags
#npc #relationship #memory #recognition #persistence #llm #encounter #scene #prompt-injection #opinions

## Description
Pattern for persistent NPC relationship tracking with LLM-powered memory synthesis. `RelationshipRepository` is the **single source of truth** for all NPC relationship data in prompts — both static opinions (from `opinionsAbout` in NPC JSON) and runtime memories (from LLM synthesis). At encounter/scene end, the DM LLM synthesizes narrative memories from each participant's perspective. Memories accumulate across sessions and are injected into NPC consciousness prompts via a unified `Remember your relationships:` section.

## Prerequisites
- NPC personality data in `content/npcs/` with `appearance` field
- LLM provider configured (provider abstraction)
- EncounterSessionService and/or SceneEngine for encounter/scene lifecycle hooks
- SQLite database (better-sqlite3) for persistence (optional, can run in-memory)

## Steps

### 1. RelationshipRepository (data layer)
- In-memory Map keyed by `subjectId::targetId` 
- Schema per relationship: `{ subjectId, targetId, recognitionTier, displayLabel, memories[], emotionalValence, encounterCount, lastEncounter, opinion, createdAt }`
- `opinion` field: prose text from NPC's consciousness perspective (seeded from `opinionsAbout` in NPC JSON)
- 4-tier recognition: stranger → recognized → acquaintance → familiar
- No demotion allowed, no tier skipping (advances one step at a time)
- `getDisplayName(subject, target, realName)` returns appearance label for stranger/recognized, real name for acquaintance+
- `getMemoryContext(subject, target)` returns formatted string: opinion prose first, then structured data (Recognition, Feeling, Encounters, Memories)
- `seedFromPersonality(personality)` reads `consciousnessContext.opinionsAbout`, creates `familiar` relationships with opinion text — idempotent (won't overwrite existing)
- `buildRelationshipContext(subjectId, participants)` builds unified context string: iterates participants, calls `getMemoryContext()` + `getDisplayName()`, formats as `About {name}:\n{context}` blocks
- Optional persistence adapter: `{ save(s,t,data), load(s,t), loadAll() }`

### 2. MemorySynthesizer (LLM service)
- Takes encounter transcript + participant list
- Asks DM LLM to produce per-pair memories: `{ subjectId, targetId, summary, significance, emotionalShift, tierPromotion }`
- Narrative format (one paragraph per memory, not structured fields)
- Graceful fallback: when LLM fails, generates basic "was present" memories
- Static `generateDisplayLabel(npcData)` uses appearance.firstImpression or constructs from build+attire

### 3. Persistence adapter (API layer)
- SQLite table: `relationships (subjectId TEXT, targetId TEXT, recognitionTier, displayLabel, memories TEXT, emotionalValence REAL, encounterCount INTEGER, lastEncounter, createdAt, PRIMARY KEY(subjectId,targetId))`
- `memories` is JSON-serialized array
- UPSERT on save (INSERT ... ON CONFLICT DO UPDATE)

### 4. Wire into encounter/scene lifecycle
- Add `memorySynthesizer` and `relationshipRepo` as optional deps to services
- Add `async synthesizeAndStoreMemories(id)` methods — no-op when deps not wired
- Method: extract transcript + participants → call synthesizer → loop results → recordMemory + adjustValence + promoteTier

### 5. Wire into prompt building
- `buildEncounterSystemPrompt` gets `relationshipContext` param → `Remember your relationships:` section (CANONICAL header)
- **No separate `[YOUR OPINIONS]` section** — opinions are embedded in relationship context
- Caller (SceneEngine/EncounterSessionService) calls `repo.seedFromPersonality(personality)` first, then `repo.buildRelationshipContext(npcId, otherParticipants)` to get unified context
- `PersonalityEvolutionService.buildOpinionsContext()` is **deprecated** — do not use
- `buildSceneSystemPrompt` gets `sceneContext.nameResolver` → gates names in "Others present:"

## Common Pitfalls
- Making end methods async breaks callers that don't await — use separate method instead
- Tier skipping (stranger → familiar in one encounter) is too fast — enforce one-step promotion
- Don't overwrite pre-seeded NPC↔NPC relationships with dynamic data (check existence first)
- The LLM memory synthesis prompt must explicitly say to include: promises, debts, information shared, emotional shifts
- Memory token usage grows with encounters — limit to last 5 memories in prompt injection
- Test with optional deps set to null to verify backward compatibility

## Related Skills
- `skills/code/npc-encounter-prompt-architecture.md` — how NPC prompts are built
- `skills/code/npc-consciousness-creation.md` — NPC personality data structure
- `skills/code/rest-api-bridge-pattern.md` — how API routes wire to DM services
