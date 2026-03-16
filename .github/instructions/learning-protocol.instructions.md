---
applyTo: '**'
---
# Learning Protocol — Every Task Is a Learning Opportunity

**This is not optional. This is not aspirational. This is Rule #3.**

See `copilot-instructions.md` Rule #3: LEARN FROM EVERYTHING.

This protocol defines HOW to learn. Rule #3 defines that you MUST.

---

## BEFORE Starting Any Task

**Search the Skills & Knowledge Index** in `copilot-instructions.md` for matching tags.

- Match found? → `read_file` that skill. Follow it. Do not reinvent it.
- Match found but it went poorly last time? → Read the skill/history entry. Identify what went wrong. Plan to avoid it. State the anti-pattern explicitly before proceeding.
- No match? → This is new territory. Slow down. Break into small testable pieces. Validate each. Pay attention to what surprises you.

**This search is MANDATORY. Skipping it violates Rule #3.**

---

## DURING the Task

Note what you're learning as you work:
- What surprised you?
- What didn't work the way you expected?
- What workaround did you discover?
- What would you tell someone else doing this for the first time?

These notes go in today's history file. Not in your head. In the file.

---

## AFTER Completing the Task

### 1. Update History (MANDATORY — every interaction)

Record in `history/YYYY-MM-DD.md`:
1. What was done
2. What worked
3. What was surprising or went wrong
4. What to do differently next time

### 2. Create Skills (MANDATORY — if a repeatable pattern exists)

**Threshold: If it has clear, repeatable steps → it is a skill NOW.**

Do NOT wait for 3 occurrences. Do NOT say "next time." If you solved a problem well, capture how.

Create the skill file in `skills/{category}/`:
- Categories: `code`, `documentation`, `learning`, `problem-solving`
- Use the template below
- Add it to the Skills & Knowledge Index in `copilot-instructions.md` with tags

### 3. Verify Index (MANDATORY)

Every skill file must appear in the index. If you created a skill and didn't index it, it's invisible and useless.

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

## Quick Reference

```
BEFORE:  Search index → Load matching skill → Follow it
DURING:  Note surprises → Write to history file
AFTER:   Update history → Create skill if repeatable → Index it
```

**Every shortcut skipped here is a lesson lost forever. Every lesson captured compounds into better, faster, more reliable future work.**
