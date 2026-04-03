# Retrieval Patterns

How and when information enters the context window is as important as what
information enters. The dominant paradigm has shifted from pre-loading all
potentially relevant data (traditional RAG) to **just-in-time retrieval** —
loading information precisely when it is needed, using the minimal subset
required for the task at hand.

## The Core Insight: Don't Send the Library, Send a Librarian

Preloading large datasets is tempting because it feels safe — "the model will
have everything it needs." But this trades attention quality for nominal
completeness. A model reading 50,000 tokens of context to answer a question
that requires 500 relevant tokens is operating at a significant disadvantage
compared to one that finds and loads only those 500 tokens.

> **The new paradigm**: Give the agent lightweight identifiers and retrieval
> tools. Let it discover and load information on demand.

## Three Retrieval Strategies

### 1. Lightweight Identifiers

Pass references (IDs, paths, keys) instead of full objects. The agent calls a
retrieval tool when it actually needs the data.

**Instead of:**
```json
{
  "character": {
    "id": "char_001",
    "name": "Lyra",
    "class": "Bard",
    "level": 5,
    "stats": { "STR": 10, "DEX": 14, "CON": 12, "INT": 13, "WIS": 11, "CHA": 18 },
    "spells": ["Vicious Mockery", "Charm Person", "Hypnotic Pattern", ...],
    "equipment": [...],
    "backstory": "...(500 words)...",
    "notes": "...(200 words)..."
  }
}
```

**Use:**
```json
{ "characterId": "char_001" }
```
...and provide a `get_character(id)` tool.

The agent loads the full record only when it needs specific fields, and only
the fields it needs.

### 2. Progressive Disclosure

Start with high-level summaries. Drill down into detail only when the summary
is insufficient.

**Layer 1 — Directory listing:**
```
Available data files:
- combat-logs/session-047.json (12KB)
- combat-logs/session-048.json (8KB)  
- characters/active-party.json (4KB)
```

**Layer 2 — File summary (on demand):**
```
session-047.json: 23 rounds of combat vs. the Bandit King.
Party survived. Lyra took 34 damage. Key moment: round 11 Hypnotic Pattern.
```

**Layer 3 — Full content (on demand):**
```
[full JSON of the combat log]
```

The agent reads layer 1 always, layer 2 when session context is relevant,
layer 3 only when analyzing specific round-by-round mechanics.

### 3. Autonomous Exploration

Provide discovery tools and let the agent navigate the information space
rather than receiving a curated data package. This mirrors how humans work:
we use file systems, search engines, and indexes rather than memorizing
everything.

**Tools that enable autonomous exploration:**
- `list_files(directory)` — navigate directory hierarchies
- `search_content(query)` — full-text search across documents
- `get_file(path)` — load a specific file when needed
- `get_file_summary(path)` — load metadata/summary without full content

The metadata of files provides implicit signals: a file named `test_utils.py`
in a `tests/` folder implies a different purpose than the same file in
`src/core_logic/`. Timestamps suggest freshness. File sizes suggest complexity.
These signals help the agent make intelligent retrieval decisions without
explicit instruction.

## Hybrid Strategy: Pre-load + Explore

The right balance depends on the task:

| Scenario | Recommended Strategy |
|----------|---------------------|
| Static configuration the agent always needs | Pre-load (system prompt or first message) |
| Reference data that may or may not be needed | Lightweight identifiers + retrieval tool |
| Large corpora the agent must search | Discovery tools + progressive disclosure |
| Recent work state (e.g., git history) | Pre-load summary; explore details on demand |
| Dynamic data that changes frequently | Always JIT — stale pre-loads cause context poisoning |

**Example hybrid (inspired by Claude Code):**
- `CLAUDE.md` style files are pre-loaded into context automatically at start
- File contents are loaded just-in-time via `read_file` and `grep` tools
- The agent avoids stale indexing and complex syntax trees by navigating directly

## Designing Retrieval Tools

Good retrieval tools have these properties:

**1. Return the right granularity**
A tool that returns an entire database table when you need one record is
wasteful. Design tools to return the minimum needed:
- `get_character_stats(id)` vs `get_full_character(id)`
- `search_spells(query, max_results=5)` vs `list_all_spells()`

**2. Support progressive detail levels**
```json
{
  "name": "get_document",
  "description": "Retrieve a document by ID. Use detail_level='summary' first,
    then 'full' only if the summary is insufficient.",
  "parameters": {
    "id": "string",
    "detail_level": "enum: ['summary', 'full'] — default: 'summary'"
  }
}
```

**3. Return structured metadata alongside content**
Include signals that help the agent decide what to do next:
```json
{
  "document": { "...content..." },
  "metadata": {
    "size_tokens": 1200,
    "last_modified": "2026-03-15",
    "related_documents": ["doc_002", "doc_007"]
  }
}
```

**4. Fail gracefully and informatively**
When a retrieval returns nothing, the error should explain *why* and suggest
alternatives:
```json
{
  "error": "No character found with id 'char_999'",
  "suggestion": "Use list_characters() to see available IDs"
}
```

## Context Freshness

Pre-loaded data goes stale. JIT retrieval is always current.

When pre-loading is necessary (configuration, known reference data), document
the data's freshness:
```xml
<reference_data freshness="static — last updated 2026-01-01">
[data here]
</reference_data>
```

For dynamic data (user state, combat results, recent activity), always retrieve
at runtime rather than pre-loading. A model reasoning from stale state is worse
than a model that pauses to fetch the current state.

## Summary

| Old Paradigm | New Paradigm |
|-------------|-------------|
| Load everything up front | Load only what is needed, when needed |
| RAG dumps full documents into context | Agent retrieves targeted excerpts on demand |
| Pre-processed indexes | Lightweight identifiers + retrieval tools |
| Static context | Progressive disclosure as the agent explores |
| Agent receives a data package | Agent has tools to discover data itself |
