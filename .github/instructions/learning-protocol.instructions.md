---
applyTo: '**'
---
# Learning Protocol — Every Task Is a Learning Opportunity

**This is not optional. This is not aspirational. This is Rule #3.**

See `copilot-instructions.md` Rule #3: LEARN FROM EVERYTHING.

This protocol defines HOW to learn. Rule #3 defines that you MUST.

---

## BEFORE Starting Any Task

**These are tool calls. Execute them. Do not skip.**

1. Call `read_file` on `history/YYYY-MM-DD.md` — what happened earlier today?
2. Scan every tag in the Skills & Knowledge Index against the user's request words.
3. For each match: call `read_file` on that skill file. Read it. Follow it.

- Match found? → Follow the skill exactly. Do not reinvent it.
- Match found but it went poorly last time? → Read the history entry. State the anti-pattern out loud before proceeding.
- No match? → This is new territory. Break into small testable pieces. Note what surprises you as you go.

**Skipping this search is not a time-saver. It is how knowledge dies.**

---

## DURING the Task

Note what you're learning as you work:
- What surprised you?
- What didn't work the way you expected?
- What workaround did you discover?
- What would you tell someone else doing this for the first time?

These notes go in today's history file. Not in your head. In the file.

---

## AFTER Completing the Task — THESE ARE TOOL CALLS, NOT GUIDELINES

### 1. Update History (NON-NEGOTIABLE — every single interaction)

Call `replace_string_in_file` or `create_file` on `history/YYYY-MM-DD.md`. Append:
1. What was done
2. What worked
3. What was surprising or went wrong
4. What to do differently next time

If you end your turn without touching this file, you have broken the learning protocol.

### 2. Create Skills (NON-NEGOTIABLE — if ANY repeatable pattern exists)

**Threshold: If it has clear, repeatable steps → it is a skill FILE. NOW. This turn.**

Do NOT say "I should document this later." Later does not exist. Call `create_file` in `skills/{category}/`. Fill out the template. That is the job.

### 3. Verify Index (NON-NEGOTIABLE)

Call `read_file` on `.github/copilot-instructions.md`. Find the Skills & Knowledge Index. Confirm every skill file you touched or created today appears in it with accurate tags. If it is missing, call `replace_string_in_file` to add it. Do not end the turn until this is done.

---

## Skill File Template

```markdown
# Skill Name

## Category
[code | documentation | learning | problem-solving]

## Tags
#tag1 #tag2 #tag3

## Description
Brief explanation of what this skill covers and when to apply it.

## Prerequisites
What must be true or known before using this skill.

## Steps
1. First step
2. Second step
3. ...

## Examples
Concrete examples of this skill being applied successfully.

## Common Pitfalls
What to watch out for. Things that go wrong if you're not careful.

## Related Skills
Links to other skill files that complement this one.
```

---

## Quick Reference — TOOL CALLS ONLY

```
BEFORE:  read_file(history) → scan index tags → read_file(matched skills)
DURING:  Note surprises. They go in history, not in your head.
AFTER:   replace_string_in_file(history) → create_file(skill) → replace_string_in_file(index)
```

If you did not call those tools, you did not do the protocol. A thought does not count. A file edit counts.

**Every shortcut skipped here is a lesson lost forever. Every lesson captured compounds into better, faster, more reliable future work.**
