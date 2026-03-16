# @dnd-platform/combat — Combat Engine

## Purpose

The combat engine is the crown jewel of this platform. It implements D&D 5e combat mechanics with immutable state, zero-trust action validation, and step-by-step dice resolution. It is a self-contained rules engine that knows nothing about HTTP, databases, or UI.

## Owns

- **GameState**: Immutable state container. All mutations return new instances. Structural sharing for performance. Contains all combatant positions, HP, conditions, concentration, spell slots, initiative order.
- **TurnMenu**: Zero-trust option generator. The server is the sole authority on what actions are legal. Generates the complete menu of available actions for the current combatant based on game state.
- **ActionResolver**: Executes chosen actions. Handles attack (melee/ranged, single/multi, advantage/disadvantage), spell casting (damage, healing, buffs, debuffs, concentration, AoE), dodge, dash, disengage, bardic inspiration, polymorph, and all other D&D actions.
- **StepResolver**: Step-by-step dice resolution. Pauses for player dice rolls (attack roll → hit? → damage roll), auto-rolls for AI-controlled creatures.
- **EncounterRunner**: Full encounter lifecycle — initiative rolling, turn cycling, start/end-of-turn effects (poison, regeneration, condition expiry), victory/defeat detection.
- **AI Tactics**: Intelligence-tiered combat AI. Evaluates battlefield state and selects actions for enemy creatures. Priority-based with creature-specific profiles (goblins fight differently than dragons).
- **Loot Generation**: Drops items from loot tables when creatures die.

## Does Not Own

- Who is fighting (character data comes from outside)
- Story context (why combat started — that's `dm/`)
- Narration of combat events (DM narrates, engine resolves)
- Persistent storage of combat results
- UI rendering of combat

## Dependencies

- `@dnd-platform/content` — Spell definitions, creature stat blocks, item data, condition effects

## Key Architectural Rules

1. **GameState is immutable.** NEVER mutate in place. Every change returns a new GameState. This enables undo, replay, and prevents entire classes of bugs.
2. **TurnMenu is the sole authority.** The client cannot submit an action that isn't in the menu. No client-side validation. Server validates everything.
3. **StepResolver pauses for dice.** Player rolls happen in the real world (via the dice UI). The resolver waits for dice results before continuing. AI dice auto-resolve.
4. **No side effects in the engine.** The engine takes state + action → returns new state + events. No database calls, no HTTP, no WebSocket. Pure functions with immutable data.

## Structure

```
src/
  index.js                ← Public API
  engine/
    GameState.js          ← Immutable state container
    TurnMenu.js           ← Zero-trust action menu generator
    ActionResolver.js     ← Action execution (attacks, spells, movement, etc.)
    StepResolver.js       ← Step-by-step dice resolution
    EncounterRunner.js    ← Encounter lifecycle (initiative, turns, victory)
  ai/
    tactics.js            ← AI combat decision engine
    TacticsAdapter.js     ← Bridges AI decisions to TurnMenu choices
    profiles/             ← Per-creature AI behavior profiles (YAML)
  data/
    buildConverter.js     ← Converts character builds to combat-ready format
  services/
    CombatSessionManager.js  ← Session CRUD, turn execution orchestration
    LootService.js           ← Loot generation from loot tables
    InventoryService.js      ← Item management during combat
__tests__/                ← Mirror of src/ structure
```

## Testing

- GameState: immutability invariants, all mutation methods return new instances
- TurnMenu: generates correct options for every game situation (movement, attack, spell, conditions)
- ActionResolver: every action type with edge cases (advantage, resistance, critical hits, concentration, AoE targeting)
- StepResolver: pause/resume flow, dice provision, auto-rolling
- EncounterRunner: initiative, turn order, start/end-of-turn effects, victory conditions
- Tactics: AI selects reasonable actions for each creature profile
- Existing test suite has 33+ test files — preserve and extend
