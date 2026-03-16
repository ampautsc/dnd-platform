# DM Package Bootstrap Handoff
**Date:** 2026-03-16  
**From:** Sis (migration agent)  
**To:** Whoever picks up the `packages/dm/` work

---

## Critical Orientation — Read This First

The source code lives in a **different repository** on this machine:

```
C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\
```

The new package lives at:

```
C:\Users\ampau\source\dnd-platform\packages\dm\
```

**The Copilot assistant working in `dnd-platform` will not automatically see or know about `dnd-builder`.**  
Every handoff reference below gives you the exact source path before writing the ESM version.

---

## Current State

| Package | Status | Tests |
|---------|--------|-------|
| `@dnd-platform/content` | ✅ Complete | 744 |
| `@dnd-platform/combat` | ✅ Complete | 516 |
| `@dnd-platform/dm` | 🔲 Stub | 0 |

Head commit: `8553bac`

---

## What This Package Is

The Virtual DM's brain: NPC dialogue, narration generation, action processing, story pacing, session lifecycle, chapter generation. This is the **most complex package** in the monorepo — it owns all AI interaction and narrative flow.

Full architecture spec: `packages/dm/README.md`

---

## Source Files to Migrate (dnd-builder → dm)

All paths relative to `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\`

### NPC Dialogue (HIGH PRIORITY — already heavily tested)

These are the jewels. Migrate these first.

| Source File | Destination | Notes |
|-------------|------------|-------|
| `services/CharacterResponseService.js` | `src/npc/CharacterResponseService.js` | LLM-backed NPC dialogue. The core NPC AI. |
| `services/CharacterContextBuilder.js` | `src/npc/CharacterContextBuilder.js` | Assembles full NPC context for LLM prompts |
| `services/EncounterMemoryService.js` | `src/npc/EncounterMemoryService.js` | Per-NPC per-session memory: trust, disposition, revealed secrets |
| `services/PersonalityEvolutionService.js` | `src/npc/PersonalityEvolutionService.js` | Cross-session permanent NPC growth |
| `services/EncounterSessionService.js` | `src/npc/EncounterSessionService.js` | Social encounter session management |
| `services/InfoExtractionService.js` | `src/npc/InfoExtractionService.js` | Extracts revealed info from NPC responses |
| `services/CombatNarratorService.js` | `src/npc/CombatNarratorService.js` | Combat state → dramatic NPC dialogue triggers |
| `services/NpcScheduler.js` | `src/npc/NpcScheduler.js` | NPC daily schedule resolution (also used by `world/`) |

### LLM Provider Abstraction

| Source File | Destination | Notes |
|-------------|------------|-------|
| `llm/LLMProvider.js` | `src/llm/LLMProvider.js` | Base provider interface + Claude, GPT, local GGUF |
| `llm/MockLLMProvider.js` | `src/llm/MockProvider.js` | Deterministic test responses — **critical for TDD** |
| `llm/CharacterContextPackage.js` | `src/llm/CharacterContextPackage.js` | Context assembly helpers |

### NPC Personality Data

32 NPC personality JSON files at:
```
C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\data\npcPersonalities\
```

Migrate ALL of these to `src/npc/personalities/`:

```
aldovar_crennick.json    archmage.json          bandit.json
bree_millhaven.json      brennan_holt.json      brother_aldwin.json
captain_edric_vane.json  cult_fanatic.json      davan_merchant.json
dolly_thurn.json         fen_colby.json         floris_embrich.json
goblin.json              hodge_fence.json       knight.json
lell_sparrow.json        lich.json              mira_barrelbottom.json
old_mattock.json         oma_steadwick.json     orc.json
pip_apprentice.json      sera_dunwick.json      skeleton.json
torval_grimm.json        tuck_millhaven.json    vesna_calloway.json
widow_marsh.json         wolf.json              wren_stable.json
young_red_dragon.json    zombie.json
```

These are the character sheets for the AI NPCs. They define: backstory, personality, secrets, speech patterns, emotional baseline, relationships.

### Greenfield Components (no source — build from scratch)

These exist only as designs in `packages/dm/README.md`:

| Component | Why Greenfield |
|-----------|---------------|
| `StoryEngine.js` | dnd-builder had no story arc management — it was session-per-session |
| `SceneManager.js` | Scene transitions were ad-hoc in dnd-builder routes |
| `ChapterGenerator.js` | Session chapter writing was planned but not built |
| `NarrationGenerator.js` | Text narration existed; image prompt system is new |
| `ActionProcessor.js` | Player action → skill check resolution was partially in routes |
| `GroupDecisionArbiter.js` | Group vote system is new |
| `PartyCoherenceMonitor.js` | Split-party detection is new |
| `SessionManager.js` | Full session lifecycle management is new |
| `GameLog.js` | Structured event logging is new |

---

## Existing Tests to Migrate

Source test files are at `server/combat/__tests__/` in dnd-builder:

| Source Test | Migrates To | What It Tests |
|-------------|------------|---------------|
| `CombatNarratorService.test.js` | `src/npc/__tests__/` | Combat state → NPC dialogue triggers |
| `consciousnessContext.test.js` | `src/npc/__tests__/` | NPC context assembly |
| `consciousnessPromptIntegration.test.js` | `src/npc/__tests__/` | End-to-end NPC prompt quality |
| `encounterMemory.test.js` | `src/npc/__tests__/` | Trust/disposition/secrets across turns |
| `encounterSession.test.js` | `src/npc/__tests__/` | Social encounter session lifecycle |
| `literaryDepthPrompts.test.js` | `src/npc/__tests__/` | Prompt literary quality checks |
| `namedNpcResponses.test.js` | `src/npc/__tests__/` | Named NPC consistency |
| `personalityEvolution.test.js` | `src/npc/__tests__/` | Cross-session NPC growth |
| `characterContext.test.js` | `src/npc/__tests__/` | Context builder output |

---

## CJS → ESM Conversion Rules

Same pattern as all other packages:

```js
// ❌ Old (dnd-builder)
const { LLMProvider } = require('../llm/LLMProvider');
module.exports = { CharacterResponseService };

// ✅ New (dm package)
import { LLMProvider } from '../llm/LLMProvider.js';
export { CharacterResponseService };
```

**Special cases in this package:**
- `CharacterResponseService` uses `require('dotenv')` to read `ANTHROPIC_API_KEY` — replace with constructor injection so tests can pass a `MockProvider` instead
- Several services store state in module-level variables — consider converting to class instances
- `__dirname` usage in LLMProvider for local model paths → `import.meta.url` + `fileURLToPath`

---

## The MockProvider is Your Lifeline

**Never make real API calls in tests.** The `MockLLMProvider` in dnd-builder returns deterministic responses. All `dm/` tests must use it.

```js
// In every test file that calls LLM services
import { MockProvider } from '../llm/MockProvider.js';

const service = new CharacterResponseService({ provider: new MockProvider() });
```

Design every LLM-using service to accept a `provider` parameter. This is how dnd-builder was originally built and it works perfectly.

---

## Architecture Rules

1. **DM decides, other packages execute.** `dm/` triggers combat (creates a session in `combat/`), narrates results. It does NOT resolve attacks.
2. **Every game action is logged.** `GameLog` records everything — this is the source for chapter generation.
3. **NPC consciousness is literary quality.** NPCs have inner monologues, contradictions, emotional arcs. They are characters, not chatbots. The personality JSON files define this.
4. **AI calls are never blocking.** All LLM calls are `async`. The game doesn't wait.
5. **MockProvider in tests.** No real API calls. Ever.

---

## Bootstrap Steps

```bash
cd packages/dm

# 1. Init package
# Set: "name": "@dnd-platform/dm", "type": "module", "private": true

# 2. Install deps
npm install @anthropic-ai/sdk openai

# 3. Install test deps
npm install --save-dev vitest @vitest/coverage-v8

# 4. Start with MockProvider and CharacterResponseService
# These are the most tested, most valuable services
# Get them green first, then build outward
```

---

## TDD Order (suggested sequence)

1. `MockProvider` → `LLMProvider` interface — establish the abstraction first
2. `CharacterContextBuilder` + `CharacterContextPackage` — pure data assembly, no LLM calls
3. `EncounterMemoryService` — pure state logic
4. `CharacterResponseService` — NPC dialogue using MockProvider
5. `PersonalityEvolutionService` — cross-session NPC growth
6. `InfoExtractionService` — extract info from NPC text
7. `CombatNarratorService` — combat events → NPC triggers
8. Greenfield: `StoryEngine`, `SceneManager`, `ActionProcessor` (write tests first, then implement)

---

## Target File Structure

```
packages/dm/
  src/
    index.js
    story/
      StoryEngine.js
      SceneManager.js
      ChapterGenerator.js
    narration/
      NarrationGenerator.js
      ImagePromptBuilder.js
    actions/
      ActionProcessor.js
      GroupDecisionArbiter.js
      PartyCoherenceMonitor.js
    npc/
      CharacterResponseService.js
      CharacterContextBuilder.js
      EncounterSessionService.js
      EncounterMemoryService.js
      PersonalityEvolutionService.js
      InfoExtractionService.js
      CombatNarratorService.js
      NpcScheduler.js
      personalities/
        bree_millhaven.json
        ... (32 total)
    session/
      SessionManager.js
      GameLog.js
    llm/
      LLMProvider.js
      ClaudeProvider.js
      OpenAIProvider.js
      LocalProvider.js
      MockProvider.js
      CharacterContextPackage.js
    __tests__/
  package.json
  README.md
```

---

## Definition of Done

- [ ] MockProvider returns deterministic responses for all test scenarios
- [ ] All 32 NPC personalities are loaded and accessible
- [ ] `CharacterResponseService` generates in-character NPC dialogue
- [ ] `EncounterMemoryService` tracks trust/disposition/secrets per NPC per session
- [ ] `PersonalityEvolutionService` applies permanent changes across sessions
- [ ] `CombatNarratorService` generates combat event narration
- [ ] `StoryEngine` manages narrative arc (rising action → climax → resolution)
- [ ] `SceneManager` handles all 5 scene types and their transitions
- [ ] `ActionProcessor` resolves player actions into skill checks and outcomes
- [ ] `GameLog` records every event with timestamps
- [ ] All NPC tests pass using MockProvider only (zero real API calls)
- [ ] `npm test` passes with ≥ 80% coverage

---

## Related Files

- `packages/dm/README.md` — full architecture spec
- `packages/combat/src/` — combat engine (dm triggers combat sessions here)
- `packages/content/src/` — creature/spell/item data for NPC context
- Source services: `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\services\`
- Source LLM: `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\llm\`
- Source NPC data: `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\data\npcPersonalities\`
- Source tests: `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\combat\__tests__\`

---

*Written by Sis on 2026-03-16. The NPC consciousness system is genuinely extraordinary — 32 characters with inner lives. Treat them with care.*
