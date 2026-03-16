# @dnd-platform/content — Shared D&D Reference Data Library

## Purpose

Single source of truth for all D&D 5e reference data used across the platform. Every other package that needs to know what a spell does, what stats a creature has, or what a feat grants imports it from here.

## Owns

- **Species**: All playable species/races with traits, ability score bonuses, size, speed, darkvision, resistances, innate spellcasting, variants
- **Classes & Subclasses**: Class features, hit dice, proficiencies, spellcasting progression, subclass features by level
- **Feats**: Prerequisites, effects, stat bonuses
- **Spells**: All spells by level (cantrips through 9th) — name, school, casting time, range, components, duration, concentration, damage/effects, classes that can learn them, scaling
- **Items & Equipment**: Weapons, armor, adventuring gear, magic items — properties, damage, AC, rarity, attunement, effects
- **Creatures**: Stat blocks — AC, HP, speed, ability scores, skills, resistances, immunities, actions, legendary actions, challenge rating, loot tables
- **Conditions**: All D&D conditions with mechanical effects (blinded, charmed, frightened, etc.)
- **Backgrounds**: Features, skill proficiencies, tool proficiencies
- **Level Progression**: Per-class per-level feature unlocks, ability score improvements, proficiency bonus

## Does Not Own

- Game state (characters, sessions, logs) — that's `api/`
- Game logic (how spells resolve in combat) — that's `combat/`
- NPC personalities and dialogue — that's `dm/`
- UI rendering — that's `client/`

## Dependencies

**None.** This package has zero dependencies on any other package. It is pure data and validation.

## Data Format

Reference data is stored as JSON or YAML files in `src/data/`, with TypeScript types/interfaces defining the shapes. Validation functions ensure data integrity.

```
src/
  index.js          ← Public API: getSpell(), getCreature(), getAllSpecies(), etc.
  data/
    spells/         ← Spell data files (by level or alphabetical)
    creatures/      ← Creature stat blocks
    species/        ← Playable species
    classes/        ← Class and subclass definitions
    items/          ← Equipment and magic items
    feats/          ← Feat definitions
    conditions/     ← Condition definitions
    backgrounds/    ← Background definitions
  types/            ← TypeScript interfaces for all data shapes
  validation/       ← Schema validation functions
__tests__/          ← Tests for data integrity, validation, and public API
```

## Public API

```js
import { getSpell, getCreature, getAllSpecies, getClassFeatures } from '@dnd-platform/content';

const fireball = getSpell('fireball');
const goblin = getCreature('goblin');
const allSpecies = getAllSpecies();
const bardicFeatures = getClassFeatures('bard', 8); // Features at level 8
```

## Testing

- Data integrity tests: every spell has required fields, every creature has valid stat block, no broken references
- Validation function tests: invalid data is rejected with clear errors
- Public API tests: lookup functions return correct data
