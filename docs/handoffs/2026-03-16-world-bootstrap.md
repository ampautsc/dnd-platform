# World Package Bootstrap Handoff
**Date:** 2026-03-16  
**From:** Sis (migration agent)  
**To:** Whoever picks up the `packages/world/` work

---

## Critical Orientation — Read This First

The source code lives in a **different repository** on this machine:

```
C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\
```

The new package lives at:

```
C:\Users\ampau\source\dnd-platform\packages\world\
```

**The Copilot assistant working in `dnd-platform` will not automatically see or know about `dnd-builder`.**  
Every handoff reference below gives you the exact source path to read before writing the ESM version.

---

## Current State

| Package | Status | Tests |
|---------|--------|-------|
| `@dnd-platform/content` | ✅ Complete | 744 |
| `@dnd-platform/combat` | ✅ Complete | 516 |
| `@dnd-platform/world` | 🔲 Stub | 0 |

Head commit: `8553bac`

---

## What This Package Is

The living world: NPC schedules, villain storylines, location state, world clock, downtime activities, weather. **The world runs whether players are watching or not.** The `dm/` package reads world state and narrates it to players — `world/` never talks to clients directly.

Full architecture spec: `packages/world/README.md`

---

## Source Files to Migrate (dnd-builder → world)

All paths relative to `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\`

### Direct Migrations

| Source File | Destination | Notes |
|-------------|------------|-------|
| `services/WorldEngine.js` | `src/index.js` (or `src/WorldEngine.js`) | Core world state management — the main public API |
| `services/NpcScheduler.js` | `src/npcs/NpcScheduler.js` | NPC 24-hour schedule resolution — also used by `dm/`. Migrate here, `dm/` imports it. |

### World Data

| Source File | Destination | Notes |
|-------------|------------|-------|
| `data/towns/millhaven.json` | `src/data/towns/millhaven.json` | The only town currently defined. Location state, NPC home assignments, calendar of events. |
| `data/npcPersonalities/*.json` | Reference only — do NOT duplicate. Use `dm/`'s copies. | World only needs NPC schedule data, not personality data. |

### NPC Schedule Data (new)

dnd-builder's NPC personalities contain some location/schedule hints but no formal 24-hour schedule definitions. You will need to create schedule format and populate them. Start with millhaven NPCs:

- Bree Millhaven (innkeeper — Hearthstone Inn all day, closes at midnight)
- Tuck Millhaven (Bree's father, missing — schedule = unknown/absent)
- Oma Steadwick (town elder)
- Old Mattock (farmer)
- Wren Stable (stable hand)
- Mira Barrelbottom (merchant)
- Hodge Fence (fence/black market)
- Fen Colby (local troublemaker)

Use this format as the schedule schema:
```json
{
  "npcId": "bree_millhaven",
  "name": "Bree Millhaven",
  "defaultLocation": "hearthstone_inn",
  "schedule": {
    "0": { "location": "hearthstone_inn", "activity": "sleeping", "mood": "tired" },
    "6": { "location": "hearthstone_inn", "activity": "preparing_breakfast", "mood": "focused" },
    "8": { "location": "hearthstone_inn", "activity": "serving_customers", "mood": "warm" },
    "22": { "location": "hearthstone_inn", "activity": "closing_up", "mood": "tired" }
  }
}
```

---

## Greenfield Components (no source — build from scratch)

Most of the `world/` package is designed but never built:

| Component | Status | Notes |
|-----------|--------|-------|
| `WorldClock.js` | Greenfield | Time tracking, tick rate, day/night/season. Pure state + functions. |
| `NpcStateManager.js` | Greenfield | Current NPC states, overrides when NPCs are in combat/events |
| `VillainEngine.js` | Greenfield | Villain storyline — hidden narrative running in parallel |
| `VillainTimeline.js` | Greenfield | Villain goals → plans → actions with timestamps |
| `DowntimeProcessor.js` | Greenfield | Resolves downtime activities between sessions |
| `ActivityDefinitions.js` | Greenfield | Available downtime activities (crafting, training, working, carousing) |
| `LocationState.js` | Greenfield | Per-location current state, transitions (siege, festival, construction) |
| `EventGenerator.js` | Greenfield | World event generation based on time and state |
| `WeatherSystem.js` | Greenfield | Weather by region and season |

**Start small.** Build and test `WorldClock` and `NpcScheduler` first — these are the foundation everything else reads from.

---

## The `WorldEngine.js` Source

Read this file carefully before designing the new architecture:

```
C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\services\WorldEngine.js
```

It contains the existing world state functions. Extract the pure logic, discard the MongoDB/Express coupling, and rebuild as clean ESM modules.

---

## Architecture Rules (from `packages/world/README.md`)

1. **Deterministic.** Same starting state + same tick count = same ending state. This is what makes it testable. No randomness without a seeded RNG that you can control in tests.
2. **Villain chapters are hidden.** The villain storyline is written from the villain's perspective. Players only ever see the effects, not the cause — until their story intersects.
3. **No direct communication with `client/` or `gateway/`.** World state is read by `dm/`, which decides what to reveal and how.
4. **No database in core logic.** World state can be serialized to/from plain objects. Persistence is `api/`'s job.

---

## CJS → ESM Conversion Rules

Same as all other packages:

```js
// ❌ Old (dnd-builder)
const mongoose = require('mongoose');
module.exports = { WorldEngine };

// ✅ New (world package)
import mongoose from 'mongoose';
export { WorldEngine };
```

---

## Bootstrap Steps

```bash
cd packages/world

# 1. Init package
# Set: "name": "@dnd-platform/world", "type": "module", "private": true

# 2. Install deps
npm install @dnd-platform/content

# 3. Install test deps
npm install --save-dev vitest @vitest/coverage-v8

# 4. Write first test — WorldClock
# Pure time math: given startTime + tickCount → what time is it?
# src/clock/__tests__/WorldClock.test.js
```

---

## TDD Order (suggested sequence)

1. `WorldClock` — time math, tick rate, day/night/season detection (pure functions)
2. `NpcScheduler` — given NPC schedule + current hour → location/activity/mood (pure lookup)
3. `NpcStateManager` — current NPC states, schedule overrides
4. `LocationState` — location data, state transitions
5. `WeatherSystem` — seasonal patterns, regional variation
6. `EventGenerator` — generates world events from time + state
7. `DowntimeProcessor` + `ActivityDefinitions` — activity resolution
8. `VillainEngine` + `VillainTimeline` — villain storyline (save for last — most complex)

---

## The Public API

`dm/` will call these functions to get world state:

```js
import {
  getCurrentTime,           // → { hour, day, season, year }
  getNpcState,              // (npcId, time?) → { location, activity, mood }
  getActiveWorldEvents,     // () → WorldEvent[]
  getLocationState,         // (locationId) → LocationState
  getVillainProgress,       // () → VillainProgress (what DM is allowed to reveal)
  tick,                     // (amount?) → advances world clock by 1 (or N) units
  applyDowntime,            // (characterId, activity, duration) → outcome
} from '@dnd-platform/world';
```

Design these as the public surface. Everything else is internal.

---

## Town Data

The only fully defined location is **Millhaven**. Source is at:
```
C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\data\towns\millhaven.json
```

This contains: town description, NPC roster, notable locations, current state.

Migrate to `src/data/towns/millhaven.json`. This becomes the seed data for `LocationState`.

---

## Target File Structure

```
packages/world/
  src/
    index.js
    clock/
      WorldClock.js
    npcs/
      NpcScheduler.js
      NpcStateManager.js
      schedules/
        bree_millhaven.json
        oma_steadwick.json
        ... (one per NPC)
    villain/
      VillainEngine.js
      VillainTimeline.js
    downtime/
      DowntimeProcessor.js
      ActivityDefinitions.js
    locations/
      LocationState.js
      EventGenerator.js
    weather/
      WeatherSystem.js
    data/
      towns/
        millhaven.json
    __tests__/
  package.json
  README.md
```

---

## Definition of Done

- [ ] `WorldClock` correctly tracks time and converts ticks to hours/days/seasons
- [ ] `NpcScheduler` returns correct location/activity/mood for every NPC at every hour
- [ ] `NpcStateManager` handles schedule overrides (NPC in combat, dead, traveling)
- [ ] `LocationState` tracks millhaven and can apply state transitions
- [ ] `WeatherSystem` produces seasonal weather with regional variation
- [ ] `EventGenerator` produces world events based on time and state
- [ ] `DowntimeProcessor` resolves all defined activities with correct outcomes
- [ ] `VillainEngine` advances the villain timeline deterministically
- [ ] World state is serializable (JSON.stringify/parse roundtrip = same state)
- [ ] Determinism test: two worlds with same inputs produce identical outputs
- [ ] All tests pass with zero network or database calls
- [ ] `npm test` passes with ≥ 80% coverage

---

## Related Files

- `packages/world/README.md` — full architecture spec
- `packages/dm/README.md` — how `dm/` reads world state (the consumer interface)
- `packages/content/src/` — creature templates, item data (for downtime crafting)
- Source world engine: `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\services\WorldEngine.js`
- Source NPC scheduler: `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\services\NpcScheduler.js`
- Source town data: `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\data\towns\millhaven.json`
- Source NPC personalities: `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\data\npcPersonalities\`

---

*Written by Sis on 2026-03-16. The world package is where the game becomes alive between sessions. Build the clock and scheduler first — everything else is built on top of time.*
