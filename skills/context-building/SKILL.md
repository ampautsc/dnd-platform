---
name: context-building
description: Best practices for constructing effective context for AI agents.
  Covers system prompts, XML structuring, examples, retrieval patterns, tool design,
  long-horizon strategies, and anti-patterns. Use when designing prompts, building
  agent harnesses, or optimizing token utility for any LLM-powered system.
---

## Overview

Context engineering is the discipline of curating the optimal set of tokens
available to a language model at inference time. It is the natural progression
of prompt engineering: where prompt engineering focuses on *writing* effective
instructions, context engineering focuses on *managing the entire state* — system
prompts, tools, examples, message history, retrieved data, and memory artifacts —
that shapes the model's behavior across one or many turns.

The guiding principle is simple:

> Find the **smallest possible set of high-signal tokens** that maximizes the
> likelihood of the desired outcome.

Every token consumes a finite attention budget. More tokens do not mean better
results; in fact, performance degrades as context grows (a phenomenon called
**context rot**). Effective context construction means being precise, structured,
and intentional about what enters the context window — and what stays out.

This skill provides a reference framework for building effective context,
organized around the four pillars of context engineering:

1. **System Prompts** — Clear, structured instructions at the right altitude
2. **Tools** — Self-contained, non-overlapping, token-efficient interfaces
3. **Data Retrieval** — Just-in-time context over pre-loading
4. **Long-Horizon Strategies** — Compaction, memory, and multi-agent patterns

## Quick Reference: The Core Principles

### 1. Treat Context as a Finite Resource

LLMs have a fixed attention budget. Every token added depletes it. As context
length grows, the model's ability to accurately recall and reason over the full
content decreases. Design for *minimal sufficiency* — include everything the model
needs and nothing it doesn't.

### 2. Structure Reduces Ambiguity

Use XML tags, markdown headers, or other delimiters to separate distinct types
of content (instructions, context, examples, input). When the model can
unambiguously parse your intent, it responds more accurately.

### 3. Be Clear and Direct

Write instructions as if briefing a brilliant colleague who lacks your specific
context. State what you want explicitly. Provide the *why* behind important
rules — the model generalizes from explanations.

**Golden rule:** Show your prompt to a colleague with minimal context on the
task. If they'd be confused, the model will be too.

### 4. Examples Are Worth a Thousand Words

A few well-crafted examples (3–5) are the single most reliable way to steer
output format, tone, and behavior. Make them relevant, diverse, and clearly
delineated from instructions.

### 5. Progressive Disclosure Over Data Dumps

Don't load everything up front. Give the model lightweight identifiers (file
paths, IDs, queries) and let it retrieve details on demand. Start with summaries;
drill down as needed.

### 6. Right Altitude for Instructions

Avoid two extremes:
- **Too rigid:** Hardcoded if-else logic that creates brittle, unmaintainable prompts.
- **Too vague:** High-level guidance that assumes shared context the model doesn't have.

The optimal altitude is specific enough to guide behavior, flexible enough to
let the model apply heuristics intelligently.

### 7. Design for the Next Context Window

Complex tasks span multiple sessions. Leave clean artifacts — progress notes,
structured state files, descriptive commits — so the next session can resume
without guessing.

## Detailed Guides

For deeper guidance on each aspect of context engineering, consult the following
reference files:

| Guide | When to Read |
|-------|-------------|
| `system-prompts.md` | When constructing or refining system prompts |
| `structuring-context.md` | When organizing complex prompts with XML tags, markdown, or document hierarchies |
| `examples.md` | When adding few-shot examples to a prompt |
| `retrieval-patterns.md` | When designing how an agent discovers and loads information at runtime |
| `long-horizon.md` | When building agents that work across multiple context windows or extended sessions |
| `tool-design.md` | When designing tools for an agent's action/information space |
| `context-rot.md` | When diagnosing degraded model performance or reviewing context hygiene |

## Context Construction Checklist

Use this checklist when building or reviewing a context configuration:

- [ ] **System prompt** is clear, direct, and at the right altitude
- [ ] **Sections** are delineated with XML tags or markdown headers
- [ ] **Role** is set to focus behavior and tone
- [ ] **Instructions** explain *what* and *why*, not just *how*
- [ ] **Examples** (3–5) are relevant, diverse, and wrapped in `<example>` tags
- [ ] **Long documents** are placed at the top, with queries/instructions at the bottom
- [ ] **Tools** are self-contained, non-overlapping, with descriptive parameters
- [ ] **Data retrieval** uses JIT patterns — identifiers over full payloads
- [ ] **State management** uses structured formats (JSON for schema, text for notes)
- [ ] **Progress artifacts** are left for subsequent sessions (progress files, git commits)
- [ ] **Context budget** is respected — no redundant or low-signal tokens

## Sources

This skill synthesizes guidance from:

- [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anthropic Applied AI team
- [Claude Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) — Anthropic documentation
- [Use XML Tags](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags) — Anthropic documentation
- [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — Anthropic engineering
- [Context Engineering from Claude](https://01.me/en/2025/12/context-engineering-from-claude/) — Synthesized from Anthropic talks at AWS re:Invent 2025
