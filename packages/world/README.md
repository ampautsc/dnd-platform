# @dnd-platform/world — World Simulation Engine

## Purpose

The world lives and breathes whether or not the players are watching. This package runs the background simulation — advancing time, moving NPCs through their daily routines, progressing villain storylines, processing character downtime activities, and evolving location/region state.

## Owns

- **World Clock**: Tracks game time (hour, day, season, year). Configurable tick rate mapping real time to game time.
- **NPC Schedules**: 24-hour daily routines for every NPC — where they are, what they're doing, their current mood, at every hour. NPCs have different schedules for different days, seasons, and story states.
- **Villain Storyline Engine**: A parallel narrative running the antagonists' story. Villains have goals, plans, resources, and timelines that advance independently. Their "chapters" are hidden from players until the player storyline intersects. Written by a Virtual DM instance focused on the villain perspective.
- **Downtime Activity Processor**: When a character misses a session (or between sessions), they engage in downtime: crafting, research, training, working, carousing, etc. Produces mechanical outcomes (gold earned, items crafted, skill improvement, rumors heard).
- **Location & Region State**: Towns, dungeons, wilderness areas, roads — all have state that changes over time. Sieges, festivals, weather, seasonal changes, construction, destruction, migration.
- **World Events**: Generates events that feed into the DM's narrative context — "a merchant caravan arrived in town", "the river flooded the eastern farmlands", "strange lights seen in the forest".

## Does Not Own

- Player-facing narration (that's `dm/` — it reads world state and narrates it)
- Combat (that's `combat/`)
- Character data (that's `api/`)
- Real-time connections (that's `gateway/`)
- UI (that's `client/`)

## Dependencies

- `@dnd-platform/content` — Creature templates, item data (for downtime crafting), location templates

## Communication

- **Exposes state** via a defined interface for `dm/` to read:
  - Current world time
  - NPC states at current time (location, activity, mood)
  - Active world events
  - Villain timeline progress (what the DM is allowed to know/reveal)
  - Location descriptions and current state
- **Runs independently** — the world engine can tick on a timer or be manually advanced

## Key Architectural Rules

1. **World state is deterministic given the same inputs.** Same starting state + same tick count = same ending state. This enables testing and replay.
2. **Villain chapters are hidden.** The villain storyline is written from the villain's perspective. Players only see it after their story concludes or intersects.
3. **No direct communication with `client/` or `gateway/`.** World state is read by `dm/`, which decides what to reveal and how to narrate it.

## Structure

```
src/
  index.js                    ← Public API (getWorldState, tick, getNpcState, etc.)
  clock/
    WorldClock.js             ← Time tracking, tick rate, time-of-day calculations
  npcs/
    NpcScheduler.js           ← Per-NPC 24-hour schedule resolution
    NpcStateManager.js        ← Current NPC states, schedule overrides
  villain/
    VillainEngine.js          ← Villain storyline progression
    VillainTimeline.js        ← Goal → plan → action timeline
  downtime/
    DowntimeProcessor.js      ← Activity resolution (crafting, training, working, etc.)
    ActivityDefinitions.js    ← Available downtime activities and their mechanics
  locations/
    LocationState.js          ← Per-location current state
    EventGenerator.js         ← World event generation based on time/state
  weather/
    WeatherSystem.js          ← Weather by region and season
__tests__/
```

## Testing

- World Clock: time advancement, tick rate conversion, day/night/season detection
- NPC Schedules: correct location/activity/mood at each hour, schedule overrides
- Villain Engine: timeline advancement, goal progression, plan execution
- Downtime: activity resolution, outcome calculation, time consumption
- Locations: state transitions, event triggers
- Weather: seasonal patterns, regional variation
- Determinism: same inputs produce same outputs across multiple runs
