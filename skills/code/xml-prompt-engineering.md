# XML Prompt Engineering Best Practices

## Category
code

## Tags
#prompt #xml #engineering #llm #token-optimization #caching #semantic-clarity #anthropic #openai #google #structure #context

## Description
How to write XML context blocks for LLM prompts that are dense, useful, and cache-efficient. Covers both structure (tags) and content (what goes inside them). This is the project standard.

## Prerequisites
- `skills/code/anthropic-prompt-caching.md`
- `skills/code/npc-vessel-surrender-canonical-prompt.md`

---

## Why XML

All three major providers recommend XML for structured context. Claude was trained on XML-heavy data. OpenAI: "XML tags delineate where content begins and ends." Google: "XML-style tags are effective."

**Project rule:** XML for structured data. Plain text for instructions. Never mix XML and Markdown at the same nesting level.

---

## Content Rules (The Hard Part)

These rules govern what goes INSIDE tags. Structure is easy — content quality is where prompts fail.

### 1. Every sentence must contain a retrievable fact
The litmus test: could a character USE this information in conversation or decision-making? If a sentence is commentary, atmosphere, or meta-observation — cut it.

**Useful:** "Ten copper pieces equal one silver piece. A laborer earns 2 sp per day."
**Waste:** "The economy is a complex system that reflects the medieval nature of the setting."
**Waste:** "This is not a matter of faith — it is observable fact."

The second example explains nothing. The third narrates from outside the world — no character in-world would think that.

### 2. Write reference data, not creative essays
Context blocks are lookup tables for the model. They exist so an NPC can reference currency, gods, or geography naturally. They are not worldbuilding prose, flavor text, or creative writing.

**Reference:** "Gods grant spells to clerics. Tyr (justice), Mystra (magic), Tempus (war). Clerics who lose faith lose their power."
**Essay:** "The gods of this world are not distant, philosophical concepts. They are real, tangible beings whose power can be felt in every healing spell and every smiting blow."

The essay uses 3x the tokens to say "gods are real" — something the reference version communicates implicitly.

### 3. One pass, no restating
Say a fact once in the most useful section. Never restate it in different words for emphasis or "completeness." If you're tempted to write "As mentioned above" or rephrase something — don't.

### 4. Write from inside the world
All context should read as common knowledge held by someone living in this world. No outsider commentary, no comparisons to the real world, no "in this setting" framing. The model IS a character in this world — give it what that character would know.

### 5. Dense prose over structured lists
Natural language inside tags, not config syntax. But "natural language" means dense factual prose — not paragraphs. Pack multiple facts per sentence using semicolons, parentheticals, and appositives.

**Dense:** "Five-coin system: copper (cp), silver (sp), electrum (ep), gold (gp), platinum (pp). 10cp = 1sp, 5sp = 1ep, 2ep = 1gp, 10gp = 1pp. A laborer earns 2sp/day; a meal costs 3sp at an inn."
**Sparse:** "The realm uses a five-coin system. The most basic coin is the copper piece. Ten copper pieces can be exchanged for one silver piece."

---

## Structure Rules

### 6. Descriptive tag names
`<currency>`, `<religion>`, `<scene_context>` — not `<wk>`, `<data_3>`. Tag names alone should reveal prompt structure. Keep them concise; each appears twice (open + close).

### 7. Max 3 levels deep
`<world_knowledge>` → `<currency>` → prose. Flat > deep.

### 8. Static first, dynamic last
Anthropic: ~30% improvement when queries appear at the end. This also maximizes cache prefix hits.

**Order:** Static reference → Dynamic context → Instructions → Query

### 9. Attributes for metadata
`<setting name="millhaven">`, `<example id="greeting">`. Not child elements.

---

## Token Optimization

**The 1,024-token cache minimum is a floor, not a target.** If your content is 800 tokens of pure facts, add more facts — never add more words to the same facts. Padding to hit a threshold produces waste that gets cached and paid for on every call.

**Cache-aware ordering:**
```
[CACHED PREFIX — identical across calls]
  Vessel surrender → Identity → Backstory → World knowledge → Personality
[DYNAMIC SUFFIX — changes per call]
  Current scene → Recent memory → Relationships → Instructions
```

**Whitespace:** Zero blank lines between sibling tags. No indentation inside content tags. Blank lines are ~1 token each and provide zero semantic signal to the model.

**Redundancy kills:** Same fact in two places = double the cost every call, forever. One home per fact.

---

## Few-Shot Examples

```xml
<examples>
  <example id="casual-greeting">
    <input>A stranger walks in and nods.</input>
    <output>[SPEAK] "What'll it be?" *polishes a glass*</output>
  </example>
</examples>
```

3–5 examples. After context, before instructions.

---

## System Prompt Layout (This Project)

```
Vessel Surrender (plain text, canonical, locked)
<world_knowledge>...</world_knowledge>  (XML, static, cached)
Remember who you are: ... (plain text, canonical)
<scene_context>...</scene_context>  (XML, dynamic per call)
Response guidance (plain text, instructions)
Come in to focus. (plain text, canonical, locked)
```

Vessel surrender and "Come in to focus" are canonical plain text — never wrap in XML.

---

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Literary commentary inside data tags | Every sentence must contain a retrievable fact |
| Writing to hit a token count | Add more facts, not more words |
| Outsider narration ("in this world...") | Write from inside the world |
| Restating facts in different words | Say it once in the best section |
| Mixing XML + Markdown at same level | XML for data, plain text for instructions |
| 4+ levels of nesting | Flatten to 2–3 levels |
| Config-style `<key>value</key>` | Dense prose inside tags |
| Blank lines between sibling tags | Zero blank lines |
| Dynamic content before static | Static first (cache prefix) |

## Common Pitfalls

- **"Natural prose" ≠ creative writing.** Dense factual prose. Not atmospheric worldbuilding.
- **The cache minimum is not a word count target.** 1,024 tokens of facts > 3,000 tokens of facts + padding.
- **Unclosed tags** degrade parsing accuracy.
- **XML around vessel surrender text** — canonical plain text, never wrap it.
- **Over-structuring** — 2 sentences don't need XML tags.

## Related Skills
- `skills/code/anthropic-prompt-caching.md` — Prompt caching with Claude
- `skills/code/npc-vessel-surrender-canonical-prompt.md` — Canonical NPC prompt structure
- `skills/code/npc-consciousness-json-authoring.md` — NPC data authoring principles
- `skills/code/dm-consciousness-prompt-architecture.md` — DM narrator prompt structure
- `skills/code/npc-encounter-prompt-architecture.md` — How prompt sections are assembled
