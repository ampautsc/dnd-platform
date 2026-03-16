# @dnd-platform/dm — Virtual DM Engine

## Purpose

The Virtual DM's brain. This package orchestrates the entire game experience — interpreting player actions, managing narrative flow, generating narration and imagery, running NPC dialogue, triggering combat, and crafting the story chapter by chapter. Its singular job: **take adventurers on a fantastic journey where everyone feels great about their role.**

## Owns

- **Story Engine**: Maintains the narrative arc — rising action, climax, resolution. Tracks pacing, dramatic tension, and story beats. Ensures each session has a satisfying arc.
- **Scene Manager**: Controls the current scene type (exploration, social, travel, combat, rest, shop, etc.) and transitions between them. Knows when to trigger combat, when to introduce an NPC, when to describe a landscape.
- **Narration Generator**: Produces the DM's "book pages" — prose text, image generation prompts, and speech synthesis directives. The DM literally writes the story as it happens.
- **Action Processor**: Interprets player actions ("I search for footprints" → Perception check, DC based on context → narrate result). Determines what skill check applies, sets DCs, resolves outcomes.
- **Group Decision Arbiter**: When a player proposes a group action, sends a vote request to all players via the gateway. Collects responses. Majority rules. Narrates the outcome.
- **Party Coherence Monitor**: Detects when a player's proposed action would take them too far from the group (splitting the party). Issues a warning/confirmation before proceeding.
- **NPC Dialogue System**: The existing CharacterResponseService, EncounterMemoryService, PersonalityEvolutionService, CharacterContextBuilder, CombatNarratorService, and InfoExtractionService all live here. 32+ NPCs with literary-quality consciousness — inner monologues, emotional arcs, secrets, relationship tracking.
- **Combat Integration**: Detects when combat should begin. Creates a combat session in `combat/` with the right participants and positions. Receives combat results. Narrates the aftermath.
- **Session Lifecycle**: Manages the full session flow — lobby → book intro → gameplay → wrap-up → chapter generation.
- **Chapter Generation**: After each session, reads the game log and writes a prose chapter summarizing the adventure. Players can read these as the story of their campaign.
- **Image Generation**: Determines when images are needed (scene transitions, dramatic moments, combat start, NPC introductions) and generates prompts for the image service. Images are requested asynchronously.
- **LLM Provider Interface**: All AI calls go through the provider abstraction. Supports Claude, GPT, Gemini, local GGUF models, and a mock provider for testing.

## Does Not Own

- Combat mechanics (that's `combat/` — DM triggers combat and narrates results, doesn't resolve attacks)
- Persistent data storage (that's `api/`)
- Real-time connections (that's `gateway/` — DM sends narration events, gateway delivers them)
- World simulation (that's `world/` — DM reads world state, doesn't run the simulation)
- UI rendering (that's `client/`)

## Dependencies

- `@dnd-platform/content` — Reference data for DCs, skill checks, spell effects, NPC templates
- `@dnd-platform/combat` — Creates combat sessions, reads combat results

## Communication

- **Reads from `world/`** via defined interface (current world state, NPC locations/moods, villain timeline progress)
- **Sends to `gateway/`** via event emission (narration pages, scene transitions, vote requests, private DM responses)
- **Receives from `gateway/`** via event handling (player actions, vote responses, chat messages)
- **Creates sessions in `combat/`** and receives results back

## Key Architectural Rules

1. **The DM decides, other packages execute.** The DM decides "combat starts" — `combat/` runs it. The DM decides "show a book page" — `gateway/` delivers it.
2. **Every game action is logged.** The game log is the source of truth for chapter generation and session replay.
3. **NPC consciousness is literary quality.** NPCs have inner monologues, contradictions, emotional baselines, psychological profiles. They are characters, not chatbots.
4. **AI calls are never blocking.** Image generation, narration, NPC responses — all async. The game keeps flowing while AI processes.

## Structure

```
src/
  index.js                      ← Public API
  story/
    StoryEngine.js              ← Narrative arc, pacing, dramatic tension
    SceneManager.js             ← Scene types and transitions
    ChapterGenerator.js         ← Writes prose chapters from game logs
  narration/
    NarrationGenerator.js       ← Book pages: text + image prompts + speech
    ImagePromptBuilder.js       ← Crafts image generation prompts from narrative context
  actions/
    ActionProcessor.js          ← Interprets player actions, determines checks, resolves outcomes
    GroupDecisionArbiter.js     ← Vote management for group decisions
    PartyCoherenceMonitor.js    ← Split-party detection and warnings
  npc/
    CharacterResponseService.js ← NPC dialogue generation with LLM
    CharacterContextBuilder.js  ← Assembles NPC context for LLM prompts
    EncounterSessionService.js  ← Social encounter session management
    EncounterMemoryService.js   ← Per-NPC per-session memory (trust, disposition, secrets)
    PersonalityEvolutionService.js ← Cross-session permanent NPC growth
    InfoExtractionService.js    ← Extracts revealed info from NPC responses
    CombatNarratorService.js    ← Combat state → dramatic NPC dialogue triggers
  npc/personalities/            ← NPC personality definition files (JSON)
  session/
    SessionManager.js           ← Session lifecycle (lobby → play → end)
    GameLog.js                  ← Timestamped event recording
  llm/
    LLMProvider.js              ← Provider abstraction interface
    ClaudeProvider.js           ← Anthropic Claude implementation
    OpenAIProvider.js           ← OpenAI GPT implementation
    LocalProvider.js            ← Local GGUF model via node-llama-cpp
    MockProvider.js             ← Deterministic responses for testing
__tests__/
```

## Testing

- Story Engine: arc progression, pacing controls, tension management
- Scene Manager: valid transitions, trigger conditions
- Narration: book page generation, image prompt quality
- Action Processor: action interpretation, DC setting, outcome resolution
- Group Decisions: vote collection, majority calculation, edge cases (ties, timeouts)
- NPC Dialogue: personality consistency, memory recall, emotional arc progression, repetition avoidance
- Combat Integration: trigger detection, session creation, result processing
- Chapter Generation: log → prose conversion, completeness, readability
- LLM Providers: all providers implement the interface, mock provider returns expected responses
- All NPC tests use MockProvider — never real API calls in tests
