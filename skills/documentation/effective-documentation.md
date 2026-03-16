# Skill: Effective Documentation

## Category
documentation

## Tags
#docs #writing #templates

## Description
How to write documentation that is useful, maintainable, and actually read. Documentation serves Copilot's learning system and human developers alike.

## Steps

### 1. Identify the Audience
- Is this for future Copilot sessions? → Include tags, concrete steps, anti-patterns
- Is this for human developers? → Include setup instructions, architectural decisions, rationale
- Is this a README? → Keep it high-level, link to details

### 2. Structure for Scanability
- Use headers hierarchically
- Use bullet points and numbered lists
- Use code blocks for commands and examples
- Put the most important information first

### 3. Include Context
- WHY was this decision made?
- WHAT was the alternative?
- WHEN does this apply?

### 4. Include Examples
- A concrete example is worth 100 words of explanation
- Show the happy path AND the error path
- Use real code from the project, not abstract pseudocode

### 5. Keep it Maintained
- Update docs when behavior changes
- Delete docs that are no longer true (wrong docs are worse than no docs)
- Date entries in history files

## Common Pitfalls
- Writing docs nobody will read (too long, too abstract)
- Not including "when to apply" → people don't know to look for it
- Documenting HOW without WHY → the doc becomes wrong when the implementation changes
- Not using the skill template → skills are inconsistent and hard to follow

## Related Skills
- `skills/learning/continuous-learning-protocol.md`
