# Tool Design

Tools define the boundary between an agent and its environment — they
determine what the agent can do and what information it can access. Because
every tool call contributes tokens to the context (the call itself, the
parameters, the result), tool design is a direct lever on context efficiency.

## The Core Principle: Every Tool Must Justify Its Existence

A bloated tool set has two costs:
1. **Cognitive cost** — More tools means more decision points. If a human
   engineer can't immediately say which tool to use in a given situation,
   neither can the agent. Ambiguity leads to wrong tool selection and wasted
   tool calls.
2. **Context cost** — Tool definitions consume tokens in the context window.
   A large tool set with overlapping capabilities contributes noise without
   proportional utility.

Design tools like well-factored code: self-contained, single-purpose, with
clear contracts.

## Elements of a Strong Tool Definition

### 1. Simple, Accurate Name

The name is the primary signal for when to use the tool. It should be:
- **Specific**: `get_character_stats` not `get_data`
- **Action-oriented**: `search_spells`, `create_encounter`, `delete_character`
- **Unambiguous**: Avoid names so similar that the agent must reason about which to choose

Bad:
```
get_info / get_details / fetch_data / retrieve_record
```

Good:
```
get_character / get_character_stats / get_character_equipment
```

### 2. Detailed, Structured Description

The description is the primary signal for *how and when* to use the tool.
Include:
- What the tool does
- What it returns
- When it should (and shouldn't) be used
- Important constraints or side effects

```json
{
  "name": "search_spells",
  "description": "Search the D&D 5e spell database by name, class, level, or school.
    Returns matching spells with name, level, school, casting time, and brief effect.
    Use when the user asks about available spells or wants to find spells meeting
    specific criteria. Do not use for looking up a single known spell by exact name
    — use get_spell() instead for that case.",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search term (spell name, partial name, or keyword)"
      },
      "class_filter": {
        "type": "string",
        "description": "Filter to spells available to a specific class (e.g., 'Bard', 'Wizard')"
      },
      "max_level": {
        "type": "integer",
        "description": "Maximum spell level to include (1-9). Omit to include all levels."
      },
      "max_results": {
        "type": "integer",
        "description": "Maximum results to return. Default: 10. Max: 50.",
        "default": 10
      }
    },
    "required": ["query"]
  }
}
```

### 3. Non-Overlapping Scope

Tools should do one thing and do it well. Overlap creates ambiguity — the
agent wastes context trying to determine which tool is appropriate.

**Overlapping (bad):**
- `get_character(id)` — returns full character including stats and equipment
- `get_character_stats(id)` — returns character stats (subset of above)
- `get_character_details(id)` — "detailed" character info (ambiguous scope)

**Non-overlapping (good):**
- `get_character(id)` — returns core character fields (name, class, level, species)
- `get_character_stats(id)` — returns the derived ability scores and modifiers
- `get_character_equipment(id)` — returns equipped items and inventory

Each tool has a clear, distinct purpose. The agent can select without ambiguity.

### 4. Single Action, Shallow Parameters

Tools that perform one action and accept at most one level of parameter nesting
are easier for models to use correctly. Deep nesting increases cognitive load
and error probability.

**Too deep:**
```json
{
  "filter": {
    "character": {
      "stats": {
        "strength": { "min": 14, "max": 20 }
      },
      "equipment": {
        "weapon": { "type": "sword" }
      }
    }
  }
}
```

**Better:**
```json
{
  "min_strength": 14,
  "max_strength": 20,
  "weapon_type": "sword"
}
```

### 5. Token-Efficient Return Values

Tool results enter the context window. A tool that returns 5,000 tokens of
data when 200 are needed is consuming 4,800 tokens of attention budget.

Design return values to match the task:
- Return summaries first; provide a way to drill into details
- Omit fields that are rarely needed (or make them opt-in via a `detail_level` parameter)
- Use compact representations: IDs instead of repeated full objects in lists

**Verbose (bad for most use cases):**
```json
[
  { "id": "spell_001", "name": "Vicious Mockery", "level": 0, "school": "Enchantment",
    "casting_time": "1 action", "range": "60 feet", "components": "V",
    "duration": "Instantaneous", "description": "...(200 words)...",
    "higher_levels": "...", "classes": ["Bard"], "ritual": false },
  ...
]
```

**Compact (better default):**
```json
[
  { "id": "spell_001", "name": "Vicious Mockery", "level": 0, "school": "Enchantment" },
  ...
]
```

Use a `get_spell(id)` call when the full description is actually needed.

### 6. Graceful Failure

Errors from tools enter the context window. A clear, actionable error message
is far better than a cryptic exception string.

**Cryptic:**
```json
{ "error": "TypeError: Cannot read properties of undefined (reading 'stats')" }
```

**Actionable:**
```json
{
  "error": "Character 'char_999' not found.",
  "suggestion": "Use list_characters() to see available character IDs."
}
```

The agent can immediately use the suggestion without wasting a turn on
disambiguation.

## Common Mistakes

| Mistake | Consequence | Fix |
|---------|------------|-----|
| Too many tools with overlapping scope | Agent picks wrong tool; context fills with failed calls | Consolidate; make scopes distinct |
| Tool names that don't reveal purpose | Agent guesses; wrong selection | Use specific, action-oriented names |
| Tools that return full objects when summaries suffice | Context bloat | Add detail_level parameter or split into summary/detail tools |
| Vague parameter descriptions | Agent provides wrong values; validation errors | Be explicit about types, formats, defaults, and constraints |
| No error guidance | Agent loops trying to fix unfixable situation | Include `suggestion` in error responses |
| Tool that does too many things | Hard to describe; hard to select correctly | Split into single-action tools |

## Tool Set Size Guidelines

| Use Case | Recommended Tool Count |
|----------|----------------------|
| Simple Q&A with knowledge lookup | 3–5 tools |
| Document analysis and summarization | 5–8 tools |
| Code-writing agent | 8–12 tools |
| Full autonomous coding agent | 12–20 tools |

Above ~20 distinct tools, the decision surface becomes difficult to manage.
If your agent needs more, consider using sub-agents with focused tool sets
rather than one agent with a comprehensive tool set.
