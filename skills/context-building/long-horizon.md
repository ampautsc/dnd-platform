# Long-Horizon Strategies

Long-horizon tasks require agents to maintain coherence and goal-directed
behavior across sequences of actions where the token count exceeds the
context window limit. Whether a task spans tens of minutes or multiple hours
of work, specialized strategies are required to bridge the gaps between
context windows.

## The Core Problem

An agent working in a loop generates more and more data: tool calls, results,
reasoning, intermediate outputs. Eventually the context window fills. Without
a strategy for managing this growth, one of two failure modes occurs:

1. **Context overflow** — The agent loses access to earlier information and
   makes decisions without critical background context.
2. **Context pollution** — The agent retains everything but attention quality
   degrades (see `context-rot.md`). It "drowns" in accumulated detail rather
   than losing information outright.

Both failures manifest as inconsistency, repeated work, or incorrect decisions
that seem puzzling when you review the transcript.

## Strategy 1: Compaction

Compaction is the practice of summarizing a context window nearing its limit
and reinitializing a new context with the compressed summary.

### How It Works

1. Detect that the context window is approaching its limit
2. Pass the full message history to the model with instructions to summarize:
   - Preserve: architectural decisions, unresolved issues, implementation details, progress state
   - Discard: redundant tool outputs, verbose intermediate steps, superseded reasoning
3. Initialize a new context with the summary (plus any critical recent artifacts)
4. Continue work from the clean context

### What to Keep vs. Discard

**Keep:**
- Goals and objectives (what the task is trying to achieve)
- Decisions made and their rationale
- Unresolved bugs or blockers
- Current implementation state ("X is working; Y is partially done; Z hasn't started")
- Key file paths and data structures

**Discard:**
- Raw tool call outputs that were already acted on
- Verbose intermediate reasoning that led to a decision (keep the decision, not the journey)
- Repeated or superseded observations
- Full file contents that can be retrieved again on demand

### Lightest-Touch Compaction: Tool Result Clearing

The safest, most conservative form of compaction is clearing accumulated tool
results from message history. Once the result of a tool call has been reasoned
about and acted on, the raw result rarely needs to be visible again. Removing
these entries can free substantial context without risking loss of important state.

### Tuning the Compaction Prompt

Start by maximizing recall — err toward keeping everything. Then iterate to
improve precision by eliminating content that proved to be noise. Overly
aggressive compaction loses subtle context whose importance only becomes
apparent later.

## Strategy 2: Structured Note-Taking

Structured note-taking (agentic memory) is the practice of having the agent
write persistent notes to an external file that get loaded back into context
at later times.

### The Pattern

```
Context Window N:
  Agent works on task →
  Writes progress to notes.md →
  Context window ends

Context Window N+1:
  Load notes.md →
  Agent reads its own notes →
  Continues work from last known state
```

### What to Write in Notes

Notes serve one purpose: **enable the next session to resume without guessing**.

**Include:**
- Current task status ("Implementing the ranking filter — 3 of 5 conditions done")
- Decisions made and why (brief rationale, not full reasoning)
- Known blockers or bugs encountered
- The "next action" — what the next session should start with
- References to key files or data structures that were active

**Avoid:**
- Verbose recaps of what was done (the git log does this)
- Opinions or speculation not needed for resumption
- Duplicate information already in source files or commit messages

### Format Recommendations

**Use JSON for structured state data** (task lists, feature status, test results):
```json
{
  "feature": "ranking filter",
  "status": "in-progress",
  "completed": ["sortBy", "sortOrder", "speciesFilter"],
  "remaining": ["featsFilter", "magicItemsFilter"],
  "nextAction": "implement featsFilter with case-insensitive ALL-match semantics"
}
```

**Use plain text for progress notes** (freeform context, decisions, blockers):
```
Session 2026-04-03:
Implemented sortBy and sortOrder. Verified against 313 tests — all pass.
Next: featsFilter. Note — build IDs encode feat names with spaces and mixed
casing. Use toLowerCase() for comparison, not strict equality.
Blocker: none.
```

**Use git for change history** — git commits serve as a log of what changed
and provide checkpoints for rollback. Write descriptive commit messages; they
are a form of structured note-taking.

## Strategy 3: Sub-Agent Architectures

Sub-agents provide a clean separation of concerns: the orchestrating agent
maintains high-level state while specialized sub-agents handle focused tasks
with their own clean context windows.

### The Pattern

```
Orchestrator Agent:
  - Maintains the overall plan
  - Tracks progress at feature/task level
  - Coordinates sub-agents
  - Synthesizes results

Sub-Agent A (e.g., Research):
  - Receives a specific, bounded question
  - Explores extensively (may use tens of thousands of tokens)
  - Returns a condensed, distilled summary (1,000–2,000 tokens)
  - Its full exploration context is discarded after synthesis

Sub-Agent B (e.g., Implementation):
  - Receives a specific, bounded implementation task
  - Works with a clean context focused on that task
  - Returns the result plus a brief status update
```

### When to Use Sub-Agents

Sub-agents pay off when:
- The task has parallel independent subtasks (research + implementation + testing)
- Exploration work is extensive but only the conclusions matter to the orchestrator
- Different subtasks require different tool sets (read-only research vs. write-enabled implementation)
- The orchestrator would otherwise accumulate too much intermediate context

Sub-agents add overhead when:
- The task is sequential with strong dependencies between steps
- Sub-task results need to be integrated in real time
- The simpler approach (a single agent with notes) is sufficient

## Initializer + Coding Agent Pattern

For multi-session projects, a two-phase harness dramatically improves coherence:

**Session 1 — Initializer Agent:**
- Understands the full project requirements
- Creates a structured feature list (`features.json`) with all requirements marked incomplete
- Writes an `init.sh` script that starts the development environment
- Makes an initial git commit that establishes the baseline
- Writes `progress.txt` with the current state

**Sessions 2-N — Coding Agent:**
```
1. Run `pwd` to confirm working directory
2. Read `progress.txt` and `features.json` to understand current state
3. Read git log to see what was recently changed
4. Run `init.sh` to start the dev environment and run a baseline test
5. Choose the highest-priority incomplete feature
6. Implement it and verify end-to-end
7. Mark it complete in `features.json`
8. Commit with a descriptive message
9. Update `progress.txt` with summary of what was done and what's next
```

This pattern addresses the two most common long-horizon failures:
- **Premature completion** — the agent sees partial progress and declares victory. The feature list makes incomplete work explicit.
- **Undocumented progress** — the agent loses track of where it was. Notes + git history make state recoverable.

## Choosing the Right Strategy

| Situation | Best Strategy |
|-----------|--------------|
| Single long conversation approaching context limit | Compaction |
| Iterative development across many sessions | Structured notes + git |
| Complex task with parallel workstreams | Sub-agent architecture |
| All of the above at scale | All three combined |
| Simple task that fits in one window | None needed |
