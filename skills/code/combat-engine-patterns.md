# Skill: Combat Engine Patterns

## Category
code

## Tags
#combat #immutable #gamestate #turnmenu #resolver #engine

## Description
Core patterns for working with the D&D combat engine. The engine is built on three foundational principles: immutable state, zero-trust validation, and step-by-step resolution. Violating any of these principles introduces bugs that are extremely hard to trace.

## Prerequisites
- Understanding of the combat engine architecture (GameState, TurnMenu, ActionResolver, StepResolver, EncounterRunner)
- Understanding of D&D 5e combat rules

## Steps (When Modifying the Combat Engine)

### Adding a New Action Type
1. Add the action to TurnMenu's option generation (when is this action available?)
2. Add the action handler in ActionResolver (what does it do?)
3. If dice are involved, add step entries in StepResolver (what rolls are needed?)
4. Write tests for TurnMenu (action appears when valid, doesn't appear when invalid)
5. Write tests for ActionResolver (action produces correct state changes)
6. Write tests for StepResolver (dice flow pauses and resumes correctly)
7. If AI creatures should use this action, update TacticsAdapter

### Adding a New Condition or Effect
1. Add condition definition to content package
2. Add to GameState's condition tracking
3. Add start-of-turn/end-of-turn effects in EncounterRunner if applicable
4. Add to TurnMenu if the condition restricts available actions
5. Add to ActionResolver if the condition modifies action outcomes (e.g., advantage/disadvantage)
6. Write tests covering: apply → active effects → expiry

### Modifying Spell Resolution
1. Update spell definition in content package
2. Update ActionResolver's spell handling
3. If concentration: verify concentration tracking in GameState
4. If AoE: verify geometry in AoE calculations
5. Write tests: cast → effect → concentration check → end

## Key Invariants (Never Violate)

1. **GameState is immutable.** Every method returns a NEW GameState. No `.hp -= damage`. Use `state.applyDamage(target, amount)` which returns a new state.

2. **TurnMenu is the authority.** If TurnMenu says you can't do it, you can't. The client cannot submit unlisted actions. ActionResolver should reject anything not in the menu.

3. **StepResolver pauses for player dice.** Player rolls are physical events. The resolver emits a `dice_request`, waits for `dice_result`, then continues. AI dice auto-resolve. Never skip the pause for players.

4. **No side effects.** The engine takes (state, action) → returns (newState, events). No database calls. No HTTP. No WebSocket sends. Pure transformation.

5. **Events are complete records.** Every state change produces events that fully describe what happened. Events are the source material for narration and logging.

## Common Pitfalls
- Mutating GameState in place (the most common and dangerous mistake)
- Adding an action to ActionResolver without adding it to TurnMenu
- Forgetting to handle the action in TacticsAdapter (AI creatures can't use it)
- Not testing polymorph interactions (see `polymorph-data-propagation.md`)
- Not testing with concentration spells active (concentration checks on damage)
- Testing only the happy path (what about: target already dead? caster stunned? no spell slots remaining?)

## Related Skills
- `skills/code/polymorph-data-propagation.md` — specific polymorph data flow
- `skills/code/npc-consciousness-creation.md` — NPC responses during combat (CombatNarratorService)
