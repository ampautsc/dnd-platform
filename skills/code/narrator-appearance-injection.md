# Narrator Appearance Injection

## Category
code

## Tags
#narrator #appearance #gender #npc #prompt #scene #llm #name-gating

## Description
Pattern for injecting full NPC appearance data into the DM narrator's LLM prompt so it can write vivid, properly gendered prose. Solves the problem where the narrator only has display labels (e.g., "the halfling behind the bar") and the LLM guesses gender/appearance incorrectly.

## Prerequisites
- NPC personality data with `appearance` block (build, hair, skin, eyes, height, distinguishingFeatures[], typicalAttire, firstImpression) + `gender` and `race` top-level fields
- `personalityLookup(templateKey)` function that returns NPC personality data
- `RelationshipRepository` for name resolution (display labels vs. real names)
- `SceneNarrator` service that builds LLM prompts for DM narration

## Steps

### 1. Add personalityLookup to SceneNarrator constructor
Accept `personalityLookup` as an optional dependency. Default to null for backward compatibility.

### 2. Build _buildAppearanceBlock(templateKey, displayName)
For a given NPC, look up personality data and construct a formatted text block:
```
the halfling behind the bar:
  Gender: female
  Race: Halfling
  Build: Compact and sturdy, halfling frame
  Hair: Curly auburn, pinned back with a wooden clip
  ...
  Distinguishing features:
    - Constantly wiping her hands on a worn apron
    - A small leather-bound notebook tucked into her apron pocket
```
Key rules:
- Use display label as header — NEVER the real name
- Skip missing fields gracefully (if no gender, omit the line)
- List distinguishing features as bullet points

### 3. Build _buildAppearancesSection(characters)
Compose a `[CHARACTER APPEARANCES]` section from all NPCs in the scene.

### 4. Inject into both narrator prompt methods
- `narrateNpcBatch`: Build characters list from npcActions, inject section before the instruction paragraph
- `narrateSceneOpening`: Build characters list from participantNames (objects with templateKey), inject section after the participant list

### 5. Ensure templateKey propagates to npcActions
SceneEngine pushes `templateKey: npcParticipant.templateKey` into npcActions so the narrator can look up personality data.

### 6. Wire personalityLookup in factory
Pass the same `personalityLookup` function used by EncounterSessionService and CombatNarratorService.

## Examples
The prompt the LLM receives now includes:
```
[CHARACTER APPEARANCES]
the halfling behind the bar:
  Gender: female
  Race: Halfling
  Build: Compact and sturdy, halfling frame
  Hair: Curly auburn, pinned back with a wooden clip
  Skin: Warm olive complexion with flour dust on her forearms
  Eyes: Dark brown, quick-moving, miss nothing in the room
  Attire: A practical dress with rolled sleeves under a stained canvas apron
  Distinguishing features:
    - Constantly wiping her hands on a worn apron
    - A small leather-bound notebook tucked into her apron pocket
```
This gives the LLM enough data to write "she" instead of guessing "he", and to describe curly auburn hair, olive skin, flour-dusted forearms — all without revealing the name "Mira Barrelbottom".

## Common Pitfalls
- **Missing gender field**: Most NPC content files don't have explicit `gender`. The block builder skips it, but the LLM may still guess. Add `gender` to all active NPC files.
- **Not propagating templateKey**: If SceneEngine doesn't push `templateKey` into npcActions, the narrator can't look up appearance data.
- **Duplicate name resolution**: Both `_resolveDisplayName` and `_buildAppearanceBlock` need the templateKey. Make sure the display name used as the appearance block header matches the one used in the action summary.

## Related Skills
- `skills/code/npc-encounter-prompt-architecture.md` — system prompt for NPC encounters (different layer)
- `skills/code/npc-consciousness-creation.md` — creating NPC personality data
- `skills/code/npc-relationship-repository.md` — name gating via RelationshipRepository
