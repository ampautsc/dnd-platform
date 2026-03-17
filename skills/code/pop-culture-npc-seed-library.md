# Pop Culture NPC Seed Library

## Category
code

## Tags
#npc #content #popup-culture #lore #seed-database #generation #factory #characters

## Description
How to maintain and expand the Pop Culture NPC Seed Library (`packages/content/scripts/npc-seed-database.json`) which powers the automated NPC generator factory.

## Prerequisites
- Understanding of the NPC JSON schema from `packages/content/__tests__/npcs.test.js`
- Familiarity with the generator factory pattern in `skills/problem-solving/llm-context-limit-bypass.md`

## Steps
1. **Open the Seed Database**: `packages/content/scripts/npc-seed-database.json`
2. **Group by universe**: Every universe key maps to `{ universe, tone, roster }`.
3. **The `tone` field is critical**: Write the tone description as a narrative guide for the LLM. This is what gets injected into the prompt to give the generated NPC authentic flavor from that universe.
4. **For each character in `roster`**: Provide `id`, `originalName`, `archetype`, `description`, and `relationships` (array of other character IDs in this universe). These act as seeds for the full NPC consciousness schema.
5. **Use expansion scripts**: When adding a large batch of universes, write an ephemeral `expand-{name}.js` script, run it so it merges into the existing JSON, then `rm` it.
6. **Verify via node**: After expansion, run a quick `node -e "const d=require('./packages/content/scripts/npc-seed-database.json'); console.log(Object.keys(d).length, 'universes');"` to count.
7. **Run generator**: `npm run build:npcs --prefix packages/content`

## Examples
- Added 7 universes (Phineas & Ferb, Steven Universe, Sherlock Holmes, Avatar) as an initial batch.
- Added 11 more universes (Star Wars, Simpsons, Game of Thrones, Muppets, Jurassic Park, etc.) as expansion batches.
- Final count: 32 universes, 128 characters.

## Common Pitfalls
- **Using duplicate IDs**: A character ID must be globally unique across all universes or relationship links will be ambiguous.
- **Relationships outside roster**: If you reference an ID in `relationships` that does not exist in the database at generation time, the LLM may hallucinate or the index update will fail.
- **Thin `tone` descriptions**: If the `tone` is weak, the generated NPC personality will be generic. Invest in vivid, quirky tone prose.

## Related Skills
- `skills/problem-solving/llm-context-limit-bypass.md`
- `skills/code/npc-consciousness-creation.md`