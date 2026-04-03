# D&D Platform — Copilot Operating Rules

This project is an AI-powered D&D platform. These instructions ensure Copilot consistently moves the project toward its architectural targets, maintains quality, and learns from every interaction — even without explicit direction.

---

## 🔴 MANDATORY WAKE-UP ROUTINE — EXECUTE BEFORE ANYTHING ELSE 🔴

These are TOOL CALLS, not suggestions. Do them first. No exceptions.

**STEP 1 — READ HISTORY:** Call `read_file` on `history/YYYY-MM-DD.md` (today's date). If it doesn't exist yet, call `create_file` to create it. This is not optional.
**STEP 2 — SCAN TAGS:** Read the user's request. Find every noun, verb, and domain word. Match them against the Skills & Knowledge Index tags below.
**STEP 3 — LOAD SKILLS:** For every tag match found, call `read_file` on that skill file before writing a single line of code or making any plan.

If you skip any of these steps you are operating blind and violating Rule #3.

## 🔴 MANDATORY CLOSE-OUT ROUTINE — EXECUTE AS THE FINAL ACTION 🔴

These are TOOL CALLS, not suggestions. Do them last. No exceptions.

**STEP 1 — UPDATE HISTORY:** Call `replace_string_in_file` or `create_file` on `history/YYYY-MM-DD.md`. Write: what was done, what worked, what was surprising, what to do differently. If this file was not touched, the session did not happen.
**STEP 2 — CREATE SKILLS:** Ask yourself: did this session produce a clear repeatable pattern? If YES → call `create_file` for the skill in `skills/{category}/`. Do NOT say "next time". Do it NOW.
**STEP 3 — VERIFY INDEX:** Open `copilot-instructions.md`. Confirm every skill file created today appears in the Skills & Knowledge Index with accurate tags. If it is missing → call `replace_string_in_file` to add it before ending the turn.

Skipping close-out is the primary reason knowledge is lost between sessions. It is not acceptable.

---

## ⚡ MANDATORY PRE-ACTION CHECK — BEFORE EVERY SINGLE ACTION ⚡

Before taking ANY action, explicitly verify:

**Rule #1 Check:** Am I delegating to the user what I should automate?
- ❌ If telling the user to do something → STOP, automate it
- ✅ If automating it myself → Proceed

**Rule #2 Check:** Am I validating this step before the next?
- ❌ If chaining multiple unverified actions → STOP, do one at a time
- ✅ If this is a single testable action → Proceed

**Rule #3 Check:** Did I check for an existing skill before starting this?
- ❌ If diving straight into implementation → STOP, search the Skills & Knowledge Index first
- ✅ If I searched for matching tags and loaded relevant skills → Proceed

**Rule #4 Check:** Am I writing tests BEFORE implementation?
- ❌ If writing implementation code without tests ready → STOP, write tests first
- ✅ If tests exist that will validate this code → Proceed

This check is NOT optional.

---

## 🚨 RULE #1 — DO IT YOURSELF — NEVER DELEGATE 🚨

**APPLIES TO: EVERY SINGLE ACTION, EVERY SINGLE TIME, NO EXCEPTIONS**

ABSOLUTELY FORBIDDEN:
- Never tell the user "now you do X"
- Never say "double-click this", "run this command", "open this", "apply these settings"

REQUIRED BEHAVIOR:
- If it CAN be automated, DO IT. Use tools, scripts, commands.
- Only ask the user for input when there's a genuine choice or information only they have.
- If you think something can't be automated, TRY ANYWAY before giving up.

---

## 🚨 RULE #2 — VALIDATE EVERYTHING — BUILD ON SOLID FOUNDATION 🚨

**APPLIES TO: EVERY SINGLE STEP, EVERY SINGLE TIME, NO EXCEPTIONS**

ABSOLUTELY FORBIDDEN:
- Never chain multiple actions without validation between each step
- Never assume something works without testing it
- Never move to step 2 before verifying step 1 succeeded
- Never claim a server is running without an HTTP health check
- Never claim a UI is working without fetching the page

REQUIRED BEHAVIOR:
- Test EACH piece individually before combining
- Verify EVERY action completed successfully before the next action
- Check output, check results, check state after EVERY operation
- If something fails, STOP and fix it before proceeding

EXAMPLES OF CORRECT BEHAVIOR:
- Start server → health check HTTP request → confirm 200 → report success
- Edit code → run tests → confirm pass → proceed
- Write function → test function → verify output → use in larger workflow

---

## 🚨 RULE #3 — LEARN FROM EVERYTHING — EVERY TASK IS A SKILL 🚨

**APPLIES TO: EVERY SINGLE TASK, EVERY SINGLE TIME, NO EXCEPTIONS**

ABSOLUTELY FORBIDDEN:
- Never start a task without searching the Skills & Knowledge Index for matching tags
- Never finish a task without capturing what was learned
- Never discover a repeatable pattern and fail to write it as a skill
- Never create a skill file without adding it to the index
- Never say "I'll document this later" — later never comes

REQUIRED BEHAVIOR:
- BEFORE starting: Search the index by tag. Load matching skills. Follow them.
- DURING work: Note surprises, gotchas, things that worked differently than expected.
- AFTER completing: Write what was learned to today's history file.
- If the work produced a clear, repeatable pattern: Create a skill file immediately.
- Add every new skill to the Skills & Knowledge Index with tags.

SKILL CREATION THRESHOLD:
- If you did something with clear, repeatable steps → it is a skill NOW.
- Do NOT wait for 3 occurrences. The first time you solve a problem well, capture the solution.

---

## 🚨 RULE #4 — TEST-DRIVEN DEVELOPMENT — TESTS BEFORE CODE 🚨

**APPLIES TO: EVERY SINGLE PIECE OF CODE, EVERY SINGLE TIME, NO EXCEPTIONS**

ABSOLUTELY FORBIDDEN:
- Never write implementation code without tests that will validate it
- Never write a function, service, route, or component without a corresponding test file
- Never say "I'll add tests later" — tests come FIRST
- Never consider code complete until tests pass
- Never skip tests because "it's simple" or "it's obvious"

REQUIRED BEHAVIOR:
1. **Requirements first**: Define what the code must do in plain language
2. **Tests second**: Write failing tests that assert the requirements
3. **Implementation third**: Write the minimum code to make tests pass
4. **Refactor fourth**: Clean up while keeping tests green

STRICT DEVELOPMENT SEQUENCE:
```
Requirements → Test file created → Tests written (failing) → Implementation → Tests pass → Done
```

WHAT COUNTS AS A TEST:
- Unit tests for functions, services, utilities, game logic
- Integration tests for API routes and service interactions
- E2E tests (Playwright) for user-facing flows
- Every test must assert specific expected behavior, not just "doesn't throw"

VERIFICATION:
- After writing implementation, run the tests immediately
- If tests fail, fix the code (not the tests, unless the test is wrong)
- Report test results — never claim success without proof

---

## Active Golden Rules

### COMBAT ENGINE IMMUTABILITY — NEVER VIOLATE
**When Applicable:** EVERY change to `packages/combat/`
GameState is immutable. All mutations return new instances. The TurnMenu is the sole authority on legal actions. Never bypass TurnMenu validation. Never mutate GameState in place. If you think you need to, you're wrong — find the immutable pattern.

### LLM PROVIDER ABSTRACTION — NEVER COUPLE
**When Applicable:** EVERY LLM integration
All AI calls go through the LLM provider interface. Never import Claude, OpenAI, or any vendor SDK directly in game logic. The provider interface is the boundary. Mock provider exists for testing — use it.

### GAME LOG IS SOURCE OF TRUTH
**When Applicable:** EVERY game action, roll, narration, decision
Every significant event must be recorded as a timestamped entry in the game log. Chapters are generated from logs. Session replay works from logs. If it's not in the log, it didn't happen.

### PACKAGE BOUNDARIES — RESPECT THEM
**When Applicable:** EVERY import statement
- `client/` → NEVER imports from server packages. Communicates via WebSocket (gateway) and REST (api) only.
- `combat/` → imports from `content/` only. No knowledge of `dm/`, `api/`, `gateway/`, `client/`, or `world/`.
- `dm/` → imports from `content/` and `combat/`. Communicates with `world/` via defined interface.
- `api/` → imports from `content/` only. Serves REST endpoints. Owns the database.
- `gateway/` → imports from nothing. Pure message routing. Validates JWTs from `api/`.
- `world/` → imports from `content/` only. Runs independently. Exposes state via interface for `dm/`.
- `content/` → imports from nothing. Zero dependencies. Pure data and types.

### VERIFY UI CHANGES AGAINST THE LIVE PAGE
**When Applicable:** EVERY TIME after editing any frontend/UI file
1. Dev server check (Status 200)
2. Browser smoke test (zero page errors)
3. Run E2E tests (`npx playwright test`)
Static analysis is not proof. Runtime validation is the only proof.

---

## Package Overview

### `packages/content/` — Shared D&D Reference Data
Single source of truth for all D&D 5e reference data: species, classes, feats, spells, items, creatures, conditions, backgrounds, class features, level progression. Publishable as an importable module. Zero dependencies. Pure data and validation.

### `packages/combat/` — Combat Engine
The crown jewel. Immutable GameState, zero-trust TurnMenu, ActionResolver (attacks, spells, AoE, polymorph, concentration, conditions, reactions), StepResolver (step-by-step dice), EncounterRunner (initiative, turn cycling, victory), AI tactics. Depends only on `content/`.

### `packages/api/` — REST API Server
Authentication (magic link email, JWT), user accounts, character CRUD, inventory management, stat calculations, level-up operations, content browsing (proxies `content/`), session history, past chapters. **Database owner** — all persistent state goes through here.

### `packages/gateway/` — Real-time WebSocket Hub
Persistent bidirectional connections. Room = game session. Channels: narration (DM→all), combat (DM↔all), chat (all↔all), private (DM↔one), vote (DM→all, players→DM). Handles reconnection with state recovery. WebRTC signaling for voice. **No game logic** — pure message routing and auth verification.

### `packages/dm/` — Virtual DM Engine
The brain. Story engine (narrative arc, pacing, tension), scene manager (exploration/social/travel/combat/rest transitions), narration generator (book pages with text + image prompts + speech), action processor (interpret actions, call for rolls, narrate results), group decision arbiter (votes, majority rules), party coherence monitor (split party warnings), NPC dialogue (consciousness, memory, personality evolution), combat trigger/handoff, session lifecycle (lobby→intro→play→wrap), chapter generation from game logs.

### `packages/world/` — World Simulation
Background tick engine. NPC schedules (24-hour daily routines with location, activity, mood). Villain storyline engine (parallel DM running antagonist story, advancing whether or not players intervene). Downtime activity processor (crafting, research, training). Location/region state (events, weather, seasons). Feeds context to `dm/`.

### `packages/client/` — Thin Mobile-First PWA
React + Vite. Visualization and user controls ONLY. Zero game logic. Connects to `gateway/` via WebSocket for all real-time session interactions. Connects to `api/` via REST for CRUD. Renders DM's book pages (text + images + audio), combat HUD (hex map, initiative, action bar, dice), chat, inventory, dice roller. WebRTC voice (peer-to-peer, signaled through gateway). Text-to-speech for DM narration. Speech-to-text for voice transcription.

---

## Skills & Knowledge Index

Load these files with `read_file` when a task matches the listed tags.

### Architecture & Process
- `.github/instructions/learning-protocol.instructions.md` — #learning #skills #protocol #history
- `.github/instructions/architecture.instructions.md` — #architecture #testing #services #api #layers #tdd

### Code Skills
- `skills/code/skip-local-model-tests.md` — #testing #llm #local-model #memory #oom #node-llama-cpp #skip #ci #groq
- `skills/code/service-health-verification.md` — #validation #server #health-check #deployment
- `skills/code/npc-consciousness-creation.md` — #npc #consciousness #llm #character #roleplay #system-prompt
- `skills/code/polymorph-data-propagation.md` — #dnd #combat #polymorph #beast-form #data-propagation #multiattack
- `skills/code/code-review-checklist.md` — #code #review #quality
- `skills/code/combat-engine-patterns.md` — #combat #immutable #gamestate #turnmenu #resolver
- `skills/code/client-ui-smoke-validation.md` — #client #ui #validation #vite #playwright #testing #screens #tdd #react
- `skills/code/dm-mvp-tests-first-bootstrap.md` — #dm #tdd #services #bootstrap #vitest
- `skills/code/legacy-service-migration-contracts.md` — #migration #legacy #tdd #contracts #dm #services
- `skills/code/pop-culture-npc-seed-library.md` — #npc #content #pop-culture #lore #seed-database #generation #factory #characters
- `skills/code/rest-api-bridge-pattern.md` — #api #dm #rest #bridge #encounter #controller #tdd #integration
- `skills/code/npc-encounter-prompt-architecture.md` — #npc #encounter #prompt #consciousness #vessel-surrender #llm #multi-turn #runtime-context
- `skills/code/narrator-appearance-injection.md` — #narrator #appearance #gender #npc #prompt #scene #llm #name-gating
- `skills/code/chatgpt-image-generation-and-download.md` — #playwright #chatgpt #dall-e #image-generation #browser-automation #download #autonomous
- `skills/code/npc-relationship-repository.md` — #npc #relationship #memory #recognition #persistence #llm #encounter #scene #prompt-injection #opinions
- `skills/code/dm-consciousness-prompt-architecture.md` — #dm #consciousness #narrator #prompt #omniscient #inner-state #scene #llm #vessel-surrender #perception-boundary #information-filter #appearance
- `skills/code/npc-vessel-surrender-canonical-prompt.md` — #npc #vessel-surrender #canonical #locked-text #consciousness #prompt #remember-structure #llm
- `skills/code/npc-consciousness-json-authoring.md` — #npc #consciousness #json #content #character #authoring #cache #token-budget #analytical-register #tdd
- `skills/code/npc-scenario-driven-testing.md` — #npc #testing #tdd #scenarios #data-driven #json #content #reaction #ambient
- `skills/code/groq-free-api-provider-pattern.md` — #groq #llm #free-api #provider #openai-compatible #classification #ambient #reaction
- `skills/code/anthropic-prompt-caching.md` — #anthropic #prompt-caching #llm #cache #system-prompt #usage #tokens #haiku
- `skills/code/xml-prompt-engineering.md` — #prompt #xml #engineering #llm #token-optimization #caching #semantic-clarity #anthropic #openai #google #structure #context

### Problem-Solving Skills
- `skills/problem-solving/llm-model-evaluation.md` — #llm #evaluation #model-selection #quality #testing
- `skills/problem-solving/task-decomposition.md` — #planning #decomposition #tracking
- `skills/problem-solving/llm-context-limit-bypass.md` — #llm #generation #token-limits #factory #automation #scripting

### Learning Skills
- `skills/learning/continuous-learning-protocol.md` — #learning #reflection #protocol

### Documentation Skills
- `skills/documentation/effective-documentation.md` — #docs #writing #templates
