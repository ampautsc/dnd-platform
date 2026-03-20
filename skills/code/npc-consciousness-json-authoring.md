# NPC Consciousness JSON Authoring

## Category
code

## Tags
#npc #consciousness #json #content #character #authoring #cache #token-budget #analytical-register #tdd

## Description
How to author the NPC consciousness JSON files in `packages/content/src/npcs/data/` so that: every section performs unique analytical work with no overlap, real source-material specificity is preserved, the file meets the 4,096+ token threshold for Anthropic prompt cache eligibility, and all content tests pass.

## Prerequisites
- Understanding of the `packages/content` NPC schema (see `packages/content/src/npcs/`)
- Know the character's canonical source material well enough to cite specific named events, canonical quotes, and named relationships — not generalizations
- `scripts/preview-sam-prompt.mjs` pattern available for token verification
- `packages/content/__tests__/npcs.test.js` running; it validates schema structure

---

## Core Principle: Each Section Is a Different Lens

**Every section must do work that no other section does.**

A fact, trait, or event that appears in multiple sections is acceptable only if each occurrence is in a strictly different analytical register. Same framing in two sections = redundancy. Different framing of the same fact = depth.

| Analytical Register | Owns |
|---|---|
| Observable behavior | `disposition`, `speechPatterns` |
| Raw facts / timeline | `backstory`, `knownFactions`, `knownLocations` |
| Internal architecture | `innerMonologue`, `attachmentStyle`, `copingMechanisms` |
| Things festering unprocessed | `internalConflicts` |
| Vulnerabilities / exposures | `fears` |
| Things withheld from others | `secretsHeld` |
| Epistemic gaps (what he can't answer) | `wakeUpQuestions` |
| The performance and its cost | `socialMask` |
| Observable conversational moves | `deflectionPatterns` |
| Psychological WHY behind moves | `copingMechanisms` |

---

## The Motif Repetition Rule

The same event (e.g., "sold the bar") may appear across multiple sections but each occurrence must use a different framing:

- `backstory` = the facts (what happened, when, what he did next)
- `fears` = what the event revealed as vulnerability (his loyalty has a hidden price)
- `internalConflicts` = the unprocessed meaning (what does it mean that he was capable of it)
- `secretsHeld` = the withheld fact (nobody outside that era knows)

**WRONG:** fears says "he sold the bar and never resolved it," conflicts says "the sale remains unresolved" — same framing, different section.

**RIGHT:** fears says "that his loyalty has a price he does not know yet"; conflicts says "he sold the bar once and learned something he has not finished accounting for: that the bar's claim on him has a conditional buried somewhere."

### Speech vs. Deflection Distinction (Critical)
`speechPatterns` describes the **observable pattern** — when he does it, how it sounds, how people respond. It must NOT explain the psychological mechanism.
`deflectionPatterns` owns the **psychological reality** — what it actually is, what it does for him, whether he's conscious of it.

- `speechPatterns[baseball]`: "Reaches for a baseball memory when a conversation turns — the story arrives so naturally and feels so genuinely offered that people follow it without deciding to."
- `deflectionPatterns[baseball]`: "every conversation that gets too close produces a structurally relevant story from his pitching days; it functions as redirection and he has convinced himself it is wisdom."

The test: after reading both, the reader should get NEW information from each — not the same fact rephrased.

---

## Steps

### 1. Choose source-material anchor events
Before writing a single line, list the 6–10 most specific, canonical events from the character's history. These must be:
- Named (specific episode, character, date if possible)
- Unique to this character (not generic archetypes)
- Emotionally significant

For Sam Malone: "Mayday" origin explained (bases-loaded jams, not heroics), sold bar to corporation + drove a cab, Diane's second departure turning in the doorway, sobriety chip in front pocket, Woody's question about what he would have done differently, Coach's death and the unexpressed grief.

### 2. Draft `backstory` first — facts only
Backstory is a newspaper article about this person. Past tense. No emotional interpretation. Timeline, facts, named events, outcomes. The emotional weight lives in OTHER sections.

Do NOT write "struggled with" or "wrestled with" — those are `internalConflicts`. Write "the walking multiplied as the years went on" (fact), not "he struggled with his decline" (interpretation).

### 3. Draft `innerMonologue` — HOW, not WHAT
This section describes the character's internal processing architecture — not what they think about, but how their thinking works. What does the voice run on? (people, ideas, tasks, abstractions) What happens when something emotionally heavy arrives? Is it fast or slow?

Do NOT describe specific preoccupations here — those go in `currentPreoccupation`.

### 4. Pair every fear with a distinct internalConflict
Fears = vulnerabilities (exposures that could hurt him if touched).
InternalConflicts = unprocessed wounds (things festering in a box).

They are NOT the same. Every `fears` entry should be about a specific vulnerability. Every `internalConflicts` entry should be an active unresolved accounting. Check that no fear is simply a restatement of a conflict.

### 5. Pair wakeUpQuestions against fears
WakeUpQuestions are epistemic — questions he genuinely cannot answer. They are NOT fears rephrased. A fear is "Coach died and I never said it." A wakeUpQuestion is "When I quoted Coach just now — was that grief or a performance of grief, and when did I stop being sure which was which?"

### 6. Separate speechPatterns from deflectionPatterns
After drafting both, read each entry in speechPatterns and check: does this entry explain WHY the behavior exists or what it accomplishes? If yes, it belongs in deflectionPatterns. SpeechPatterns should only answer: what does it look like? when does it happen? what do people experience?

After drafting both, read each entry in deflectionPatterns and check: does this entry just say "he does X when…"? If it doesn't explain what X does for him psychologically, it's incomplete.

### 7. Write `opinionsAbout` in first person, relationship-specifically
Every entry must reveal something that could only come from this exact relationship — not transferable to any other character. If you could swap out the name and the opinion would still make sense, it's not specific enough.

Each opinion should contain:
- What the other person means to the NPC (not what they "provide")
- Something that only someone in this relationship would know
- One uncomfortable or ambiguous truth

### 8. Verify `consciousWant` and `unconsciousNeed` are layered, not duplicated
`consciousWant` = what they would say if you asked them what they want. The surface goal.
`unconsciousNeed` = the thing that would actually satisfy them, which they cannot name. Must be structurally different from the want — if achieving the want would also achieve the need, they're not a pair.

Sam's want: be recognized as the craftsman who stayed.
Sam's need: discover that staying was self-knowledge, not the easier thing (the fear underneath the want).

### 9. Run the duplicate sentence scanner
```js
node -e "
const fs=require('fs');
const data=JSON.parse(fs.readFileSync('packages/content/src/npcs/data/NPC_KEY.json','utf8'));
const texts=[];
const walk=(v)=>{if(typeof v==='string')texts.push(v);else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk);};
walk(data);
const split=(s)=>s.split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(x=>x.length>25);
const map=new Map();
for(const t of texts){for(const s of split(t)){const n=s.toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();if(n.length<40)continue;map.set(n,(map.get(n)||0)+1);}}
const d=[...map.entries()].filter(([,c])=>c>1).sort((a,b)=>b[1]-a[1]);
console.log('DUP_COUNT',d.length);
console.log(d.slice(0,20).map(([s,c])=>c+'x | '+s).join('\n'));
"
```
Target: `DUP_COUNT 0`. If dupes exist, collapse them — keep the instance in the section that most owns it, remove from others.

After zero exact dupes pass, do a manual motif pass: look for events that appear in 3+ sections and verify each occurrence is in a strictly different analytical register.

### 10. Verify token count (must be ≥ 4,096)
```js
// scripts/preview-NPC-prompt.mjs
import { buildEncounterSystemPrompt } from '../packages/dm/src/npc/buildEncounterSystemPrompt.js';
import npcData from '../packages/content/src/npcs/data/NPC_KEY.json' assert { type: 'json' };
const prompt = buildEncounterSystemPrompt(npcData, 'some_location');
const chars = prompt.length;
const tokens = Math.round(chars / 4);
console.log(`${chars} chars / ~${tokens} estimated tokens`);
if (tokens < 4096) console.warn('WARNING: Below cache threshold. Add depth.');
```
If tokens < 4,096, add depth to `backstory`, `opinionsAbout`, or `internalConflicts` — those sections accept more detail without structural risk. Do NOT add filler text; every sentence must earn its place.

### 11. Write the file without BOM
**PowerShell `Set-Content -Encoding UTF8` adds a BOM that breaks `JSON.parse`.** Always use:
```powershell
[System.IO.File]::WriteAllText(
  "C:\full\path\to\file.json",
  $content,
  [System.Text.UTF8Encoding]::new($false)
)
```

### 11b. Register in `NPC_FILES` immediately
`packages/content/src/npcs/index.js` has a static `NPC_FILES` array — new JSON files are NOT auto-discovered. Add the `templateKey` to the array in the same step as writing the file:
```js
// near the end of the NPC_FILES array in index.js:
  'previous_entry',
  'your_new_npc_key',   // ← add this
]
```
Do NOT run tests before doing this — the file will exist but the test count will not change and the NPC will appear absent.

### 12. Run content tests
```bash
cd packages/content
npx vitest run __tests__/npcs.test.js
```
All 817 tests must pass. Any JSON schema error will surface here.

---

## Section-by-Section Reference Card

| Section | Owns | Does NOT Own |
|---|---|---|
| `appearance` | Physical facts + first impression | How he acts, what he thinks |
| `disposition` | What a stranger observes in 5 minutes | Why he acts that way; interior states |
| `backstory` | Timeline facts, named events, outcomes | Emotional interpretation |
| `motivations` | Four distinct forward-pulling drives | Fears, conflicts, wants |
| `fears` | Four specific vulnerabilities / exposures | Unprocessed wounds (that's conflicts) |
| `speechPatterns` | Observable linguistic habits: timing, tics, structure | WHY he does them |
| `directQuotes` | Canonical lines in his voice, one facet each | Paraphrase or narration |
| `secretsHeld` | Facts he has not told anyone | His feelings about those facts |
| `innerMonologue` | HOW his internal voice works; what it runs on | What it's currently working on |
| `currentPreoccupation` | One specific active haunting thing | General themes |
| `socialMask` | What the performance IS and what it costs | What others see (that's disposition) |
| `contradictions` | Four structural paradoxes with mechanism | Simple contradictions without mechanism |
| `internalConflicts` | Four named unresolved wounds festering | Fears; wants |
| `wakeUpQuestions` | Epistemic questions he can't answer | Fears rephrased |
| `attachmentStyle` | How attachment works differently by relationship type | Behaviors (that's copingMechanisms) |
| `copingMechanisms` | How he manages being overwhelmed | How he deflects in conversation |
| `deflectionPatterns` | Three specific conversational moves, with mechanism | Observable speech habits (that's speechPatterns) |
| `opinionsAbout` | First-person, relationship-specific, includes uncomfortable truth | Generic characterizations |
| `consciousWant` | What he'd articulate if asked | What would actually satisfy him |
| `unconsciousNeed` | What would actually satisfy him, which he can't name | The same thing as consciousWant |

---

## Examples

### Good section pairing (motif at different registers)

**The sold-bar-once motif across sections:**

`backstory`: "Then sold it to a corporation during a bad financial year, briefly drove a cab in Boston, bought it back when the corporation's franchise experiment collapsed."
→ *Register: timeline fact*

`fears`: "That he sold the bar once and could again — that his loyalty to the place has a price he does not know yet."
→ *Register: vulnerability exposed*

`internalConflicts`: "He sold the bar once and got it back, but learned something about himself that he has not finished accounting for: that the bar's claim on him has a conditional buried somewhere, and he does not know what the condition is."
→ *Register: unprocessed accounting*

`secretsHeld`: "He sold the bar once. [...] Nobody who was not there knows. He does not think about what it means that he was capable of letting it go."
→ *Register: withheld fact + its unthought implication*

Each occurrence adds new information. None repeats another's framing.

---

### Bad section pairing (same framing twice)

**WRONG:**
`fears`: "He is worried he sold the bar once and never really processed what it means."
`internalConflicts`: "He sold the bar once and has never resolved what it means about him."

Both say the same thing. Merge into the section that owns that register. Cut the other.

---

## Common Pitfalls

1. **Disposition and socialMask overlapping** — disposition is what strangers see; socialMask is what the performance *costs* and what's behind it. If you can't describe the mask's cost, you haven't written the socialMask.

2. **Fears and wakeUpQuestions duplicating** — fears are exposures ("that he loved Coach and never said it"); wakeUpQuestions are epistemic ("was that grief or a performance of grief, and when did I stop being sure which was which"). Test: a fear is a thing that could hurt him; a wakeUpQuestion is a thing he genuinely cannot answer.

3. **speechPatterns explaining motivation** — the moment a speechPattern entry says "this functions as redirection" or "he does this to avoid" you've written deflectionPatterns. Move or split.

4. **directQuotes using narrated style** — a quote should be the character's voice, in first person, verbatim. Not "he says he used to play ball." Should sound like transcription.

5. **consciousWant and unconsciousNeed pointing at the same thing** — if achieving one would achieve the other, they're not a pair. The need should be the condition that makes the want matter, or the thing the want has been substituting for.

6. **Generic motivations** — "wants to protect his friends" is not a motivation. "He would walk into traffic for Norm or Carla or Woody without needing to think about it" is motivation. Specificity is the test.

7. **PowerShell BOM corruption** — always write JSON files via `[System.IO.File]::WriteAllText` with `UTF8Encoding($false)`. `Set-Content -Encoding UTF8` silently prepends a BOM that breaks `JSON.parse` and produces confusing parse errors at character position 0.

8. **Forgetting to register in `NPC_FILES`** — `packages/content/src/npcs/index.js` has a static `NPC_FILES` array. New JSON files are NOT auto-discovered. Always add the new `templateKey` to `NPC_FILES` in the same step as creating the JSON file, or the test count will not change and the NPC will not be accessible at runtime. The symptom is test count remains unchanged after file creation.

---

## Related Skills
- `skills/code/npc-consciousness-creation.md` — NPC consciousness design (LLM prompting and character design)
- `skills/code/npc-encounter-prompt-architecture.md` — how the JSON gets used in encounter prompts
- `skills/code/npc-vessel-surrender-canonical-prompt.md` — the locked prompt structure the JSON feeds into
- `skills/code/pop-culture-npc-seed-library.md` — generating initial NPC seeds from pop culture sources
