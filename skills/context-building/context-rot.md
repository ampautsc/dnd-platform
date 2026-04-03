# Context Rot: Anti-Patterns and Degradation

Context rot is the degradation of model performance as context length increases.
It is not a cliff — performance degrades gradually — but it is real and
consistent across all frontier models. Understanding its causes is essential
for diagnosing and preventing degraded agent behavior.

## What Context Rot Is

As context grows, the model's ability to accurately:
- Recall specific information from earlier in the context
- Reason across multiple pieces of information that are far apart
- Maintain consistent behavior against instructions defined early in the prompt

...all decrease. The transformer architecture creates n² pairwise relationships
for n tokens. As n grows, the model's capacity to track all relationships is
stretched thin.

**Context rot does not mean the model ignores long contexts.** It means
precision and reliability decrease. The model may still give reasonable
answers — but subtle errors and inconsistencies increase with context length.

## The Four Types of Context Degradation

### 1. Context Poisoning

Incorrect or outdated information in the context causes the model to reason
from wrong premises.

**How it happens:**
- Pre-loaded data that has since changed (stale cache)
- A tool call that returned an error, and the error message was left in context
  as if it were a valid result
- An early incorrect assumption that was never explicitly corrected

**Signs:** The model makes confident assertions that contradict current state.
It "believes" something that was true earlier in the session but is no longer true.

**Prevention:**
- Use JIT retrieval for dynamic data; never pre-load state that changes
- When data is corrected, explicitly state the correction rather than relying
  on the model to notice the contradiction
- Remove stale tool results from message history during compaction

### 2. Context Distraction

Irrelevant information dilutes the model's focus on the information that matters.

**How it happens:**
- Padding system prompts with every rule that might ever apply, rather than
  rules relevant to the current task
- Tool results that include far more data than needed
- Long message histories containing exchanges irrelevant to the current subtask

**Signs:** The model's responses drift toward topics mentioned in the context
but not relevant to the current request. It references information it "noticed"
rather than what was asked about.

**Prevention:**
- Keep system prompts focused on the current task
- Design tools to return the minimum relevant data
- Use compaction to remove exchanges that have been fully resolved

### 3. Context Confusion

Similar-but-distinct information is mixed in the context, causing the model
to blend or confuse the two.

**How it happens:**
- Multiple documents with similar content but different purposes are loaded simultaneously
- The same concept is described in different terms in different parts of the context
- Examples and instructions use the same vocabulary with different meanings

**Signs:** The model conflates two distinct entities, applies a rule from
document A to a situation that should follow document B, or gives answers
that blend properties of two separate things.

**Prevention:**
- Use clear XML tags to delineate distinct documents and their purposes
- Use consistent terminology throughout the context — same word always means
  the same thing
- When loading multiple similar documents, include explicit distinguishing labels:
  ```xml
  <document purpose="current implementation — do not modify">...</document>
  <document purpose="reference implementation — for comparison only">...</document>
  ```

### 4. Context Clash

Contradictory information is present in the context, and the model doesn't
know which to trust.

**How it happens:**
- An early instruction is contradicted by a later one without the earlier one
  being explicitly superseded
- A tool result contradicts an earlier assertion
- Multiple documents make conflicting claims about the same fact

**Signs:** The model hedges ("based on the earlier information... but later
it was stated..."), gives inconsistent responses, or silently picks one of
the contradicting sources without acknowledging the conflict.

**Prevention:**
- When updating instructions, explicitly supersede the old ones:
  ```
  Previous instruction: return 5 results. This is now changed: return 10 results.
  ```
- Remove or correct contradicting tool results rather than appending corrections
- During compaction, resolve contradictions before they enter the next window

## Anti-Patterns

### The Kitchen Sink System Prompt

Loading every rule, every edge case, and every exception into the system prompt.

**Why it fails:** More tokens = more distraction. The signal-to-noise ratio
drops. Rules that only apply 1% of the time dilute attention on rules that
apply 99% of the time.

**Fix:** Start minimal. Add instructions only when a specific failure mode
requires them. Use examples to cover patterns instead of enumerated rules.

### The Uncleared Tool History

Leaving all tool call results in message history indefinitely.

**Why it fails:** Tool results are often verbose. As the conversation grows,
earlier results become irrelevant noise. A result from 20 turns ago that was
already acted on still consumes attention budget.

**Fix:** Implement tool result clearing during compaction. Once a result has
been reasoned about and a decision made, the raw result rarely needs to persist.

### The Stale Pre-Load

Pre-loading data into the system prompt or first message that changes during
the session.

**Why it fails:** The model reasons from the pre-loaded value even after the
real value has changed. The discrepancy between context and reality causes
confident but incorrect responses.

**Fix:** Pre-load only truly static data (configuration, constants, reference
data with known update schedules). Use JIT retrieval for anything that changes.

### The Contradiction Left in Place

An instruction or fact is updated by appending a correction without removing
the original.

**Why it fails:** The original instruction remains visible. The model must
reconcile the conflict and may resolve it incorrectly, especially deep in a
long context where the original may receive less attention.

**Fix:** During compaction, resolve contradictions explicitly. In running
context, when superseding an instruction, use explicit language: "The following
supersedes the earlier instruction about X: ..."

### The Verbose Intermediate Reasoning Dump

Asking the model to "think step by step" and leaving all intermediate reasoning
in the context indefinitely.

**Why it fails:** Intermediate reasoning can be verbose. It was useful for
producing the output but rarely needs to persist. It adds tokens and can
anchor the model to earlier (potentially wrong) reasoning paths.

**Fix:** Use `<thinking>` tags to separate reasoning from conclusions. During
compaction, preserve conclusions and discard the reasoning that produced them.

## Diagnosis Checklist

When agent performance is degraded, check for these context rot indicators:

- [ ] Is the context window more than 50% full?
- [ ] Are there tool results more than 10 turns old still in message history?
- [ ] Is any pre-loaded data potentially stale?
- [ ] Are there contradictory statements in the context?
- [ ] Does the system prompt contain rules for edge cases that don't apply to the current task?
- [ ] Are multiple documents with similar content loaded without clear distinguishing labels?
- [ ] Has the model made references to information from the context that wasn't asked about?

If three or more boxes are checked, the context needs cleaning before
the next inference step.
