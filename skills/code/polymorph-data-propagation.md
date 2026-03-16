# Skill: Polymorph / Beast Form Data Propagation

## Category
code

## Tags
#dnd #combat #polymorph #beast-form #data-propagation #multiattack

## Description
When adding any new field to beast form data in the combat engine, that field must be explicitly propagated through ALL polymorph code paths. The engine has 3 distinct paths where beast form data is copied, and missing any one causes silent bugs where the field exists in data but never reaches the combatant at runtime.

## Prerequisites
- Understanding of the polymorph flow in ActionResolver
- Understanding of beast form data in spell definitions

## Steps
1. **Add the field to beast form data** in spell/creature definitions
2. **Propagate through self-target polymorph update** — where the combatant's stats are replaced with beast form stats
3. **Propagate through prePolymorphState save (enemy target)** — where original stats are saved before replacement
4. **Propagate through prePolymorphState save (self target)** — same save path but for self-targeting polymorph
5. **Propagate through polymorph revert path** — where original stats are restored when the form drops
6. **Update TurnMenu** if the field affects available actions or menu options
7. **Write tests** that verify the field survives the full polymorph → action → revert cycle

## The Three Polymorph Code Paths (ActionResolver)
```
Path 1: Self-target update
  combatant.newField = beastForm.newField || null;

Path 2: prePolymorphState save - enemy
  prePolymorphState: { ...existing, newField: target.newField }

Path 3: prePolymorphState save - self
  prePolymorphState: { ...existing, newField: caster.newField }
```

## Common Pitfalls
- Adding the field to data but forgetting to copy it during polymorph application
- Copying it during application but not saving it in prePolymorphState (so revert breaks)
- Handling the enemy polymorph path but not the self polymorph path (or vice versa)
- Not testing with `|| null` fallback for forms that don't have the field

## Related Skills
- `skills/code/combat-engine-patterns.md`
