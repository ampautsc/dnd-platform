# World Simulation Tick Engine

> Created: 2026-04-01
> Status: Draft

## Objective

Build the background tick engine for `packages/world/` that advances NPC schedules, villain storylines, and location state on a configurable time interval — independent of whether players are actively in a session. The engine must run silently in the background, expose its state through a defined interface for `packages/dm/` to consume, and never import from or couple to `dm/`, `api/`, `gateway/`, or `client/`.

## Success Criteria

- Tick engine advances world state every N seconds (configurable, default 60s)
- NPC schedules cycle through a 24-hour routine (location, activity, mood) correctly over simulated time
- Villain storyline advances on each tick regardless of player presence
- `packages/dm/` can query current world state via a defined interface (no direct import of internals)
- All service methods have unit tests with >90% coverage
- World state is immutable — each tick returns a new state object, never mutates in place
- Engine can be started, paused, and stopped without leaking timers or memory

## Scope

### In Scope
- Tick engine core (`WorldTickEngine`) with start/stop/pause
- NPC daily schedule processor (24 time slots, location + activity + mood per slot)
- Villain storyline engine (parallel narrative that advances each tick)
- Location/region state (events, weather, season progression)
- Downtime activity processor (crafting, research, training advancement)
- Public interface (`packages/world/src/index.js`) exposing state query methods for `dm/`
- Unit tests for all services

### Out of Scope
- Persisting world state to a database (that's `api/`'s job)
- Player-facing UI for world state (that's `client/`'s job)
- Real-time WebSocket push of world events (that's `gateway/`'s job)
- NPC dialogue or consciousness (that's `dm/`'s job)
- Actual AI/LLM calls from within `world/` — pure simulation logic only

## Architecture Decisions

### Decision 1: Immutable State via Reducer Pattern
**Choice:** World state is a plain object. Each tick runs a pure `tickReducer(state, elapsed)` → `newState`.  
**Alternatives considered:** Mutable state with event emitters; class with internal mutation.  
**Why this wins:** Matches the combat engine pattern already established in `packages/combat/`. Testable in isolation — just call `tickReducer` with known input and assert output. No timer required in unit tests.

### Decision 2: Simulated Time, Not Wall Clock
**Choice:** The engine tracks `worldTime` as a number (minutes since epoch), not a real `Date`.  
**Alternatives considered:** Using real `Date.now()` scaled by a multiplier.  
**Why this wins:** Tests can advance time arbitrarily without waiting. Production can run 1 real second = 1 simulated minute for fast-paced games, or 1:1 for realism. Configurable with zero test impact.

### Decision 3: Interface Boundary with `packages/dm/`
**Choice:** `world/` exposes a `WorldStateReader` interface. `dm/` receives this as a constructor dependency.  
**Alternatives considered:** Direct import of world internals from `dm/`; shared event bus.  
**Why this wins:** Respects package boundary rules. `dm/` can be tested with a mock `WorldStateReader`. `world/` can evolve independently.

## Phases

### Phase 1 — Core Tick Engine
**Deliverable:** `WorldTickEngine` class that starts/stops, calls `tickReducer` on interval, and exposes `getState()`.  
**Depends on:** Nothing.

### Phase 2 — NPC Schedule Processor
**Deliverable:** `npcScheduleReducer(npcs, worldTime)` → updated NPC states with correct location/activity/mood for current time slot.  
**Depends on:** Phase 1 (needs worldTime from tick engine).

### Phase 3 — Villain Storyline Engine
**Deliverable:** `villainStorylineReducer(storylines, worldTime)` → advanced storyline state.  
**Depends on:** Phase 1.

### Phase 4 — Location & Region State
**Deliverable:** `locationReducer(locations, worldTime)` → updated weather, active events, season.  
**Depends on:** Phase 1.

### Phase 5 — Public Interface + `dm/` Integration
**Deliverable:** `WorldStateReader` interface in `index.js`. `dm/` integration tests using mock reader.  
**Depends on:** Phases 1–4 all green.

## Tasks

### Phase 1 Tasks
- [ ] Write `tickReducer` pure function — accepts state + elapsed ms, returns new state
  - **AC:** Unit test: given state at t=0, after 60s tick, worldTime advances by 1
- [ ] Write `WorldTickEngine` class wrapping `tickReducer` with `setInterval`
  - **AC:** `start()` runs ticks; `stop()` clears interval; `getState()` returns latest state
- [ ] Write `createInitialWorldState()` factory
  - **AC:** Returns valid state shape with worldTime=0, empty npcs, empty locations

### Phase 2 Tasks
- [ ] Define NPC schedule schema (24 time slots, each with location/activity/mood)
  - **AC:** Schema validates against existing NPC content files
- [ ] Write `npcScheduleReducer(npcs, worldTime)` pure function
  - **AC:** At worldTime=480 (8am), Samren is at the bar. At worldTime=1440 (midnight), Samren is sleeping.
- [ ] Add NPC schedules to content files for existing NPCs (Samren, at minimum)

### Phase 3 Tasks
- [ ] Define villain storyline schema (stages, trigger conditions, current stage)
  - **AC:** Schema supports branching — multiple possible next stages based on conditions
- [ ] Write `villainStorylineReducer(storylines, worldTime)` pure function
  - **AC:** Storyline advances to next stage when elapsed time exceeds stage duration

### Phase 4 Tasks
- [ ] Write `locationReducer(locations, worldTime)` pure function
  - **AC:** Weather cycles realistically; season advances every 90 simulated days
- [ ] Add starting location data for Millhaven to content files

### Phase 5 Tasks
- [ ] Define `WorldStateReader` interface (TypeScript interface or JSDoc typedef)
  - **AC:** Interface covers: `getNpcState(id)`, `getLocationState(id)`, `getVillainStorylines()`, `getCurrentTime()`
- [ ] Wire `WorldTickEngine` to publish state readable via `WorldStateReader`
- [ ] Write integration tests in `packages/dm/__tests__/` using mock `WorldStateReader`

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Timer drift causing NPC schedule desync | Medium | Low | Use simulated time, not wall clock. Drift is impossible. |
| NPC schedule data out of sync with content files | High | Medium | Schema validation test runs on every `npm test`. Fails loudly. |
| `dm/` team imports world internals instead of interface | Medium | High | Lint rule (eslint no-restricted-imports) blocking direct `world/src/` imports from `dm/`. |
| Villain storyline logic gets too complex for pure functions | Low | Medium | Keep each reducer small. Complex branching = separate sub-reducer, still pure. |

## Testing Strategy

All phases follow strict TDD:

1. **Unit tests** for every reducer function — no engine, no timers, just `fn(input) → output`
2. **Integration tests** for `WorldTickEngine` — use fake timers (`node:timers/promises`) to advance time without waiting
3. **Schema tests** for content files — validate NPC schedules and location data on every test run
4. **Interface contract tests** in `dm/` — mock `WorldStateReader` implements the interface and verifies `dm/` uses it correctly

Test runner: Vitest (matches rest of monorepo)  
Test location: `packages/world/__tests__/` mirroring `src/` structure

## Dependencies

- `packages/content/` — NPC and location data files (already exists, needs schedule data added)
- No external packages required — pure Node.js logic

## Open Questions

- [ ] **Tick rate in production:** 1 real second = how many simulated minutes? Needs game design decision before Phase 1 is wired to a real interval.
- [ ] **World state persistence:** `world/` holds state in memory. If the server restarts, state resets. Is that acceptable for v1, or does `api/` need to snapshot world state? Needs answer before Phase 5.
- [ ] **Multiple concurrent game sessions:** Does each session get its own world simulation, or is world state shared? Impacts `WorldTickEngine` lifecycle significantly.
