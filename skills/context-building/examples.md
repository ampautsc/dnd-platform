# Examples (Few-Shot Prompting)

Examples are the single most reliable mechanism for steering a model's output
format, tone, and behavior. A few well-crafted examples communicate more
precisely than pages of rules — they show the model exactly what you want,
not just describe it.

## Why Examples Work

Rules describe constraints. Examples demonstrate patterns. The model learns from
both, but examples create a concrete target the model can match rather than
an abstract specification it must interpret.

A prompt that says "be concise" is ambiguous — concise for a support ticket is
different from concise for an executive summary. An example of a concise support
ticket is not.

## The Core Properties of Effective Examples

### Relevant
Examples must mirror your actual use case closely. If your prompt will handle
D&D character builds, your examples should involve D&D character builds — not
generic text summarization even if the structural pattern is similar.

### Diverse
Cover the edge cases and variations that matter. If every example shows the
happy path, the model extrapolates a happy-path pattern and underperforms on
edge cases. Include:
- Normal cases
- Edge cases (empty input, ambiguous input, malformed input)
- Boundary conditions (minimum/maximum values, unusual formats)

Diversity also means varying the *examples themselves* enough that the model
doesn't pick up unintended surface patterns. If all your examples have 3-word
answers, the model may default to 3-word answers even when more is appropriate.

### Structured
Wrap examples in tags so the model distinguishes them from instructions:

```xml
<examples>
  <example>
    <input>What class should I play for a pacifist run?</input>
    <output>Cleric. The Life domain gives you powerful healing without
    requiring combat specialization. You can contribute meaningfully to
    any party while avoiding offensive action.</output>
  </example>
  <example>
    <input>I want to multiclass. Is that a good idea?</input>
    <output>It depends on your goal. Multiclassing adds versatility at the
    cost of delayed high-level features. Before committing, identify which
    feature from the second class you actually want and whether it
    outweighs the delay.</output>
  </example>
</examples>
```

## How Many Examples

**3–5 examples** is the reliable range for most tasks. Fewer risks insufficient
pattern coverage; more risks context bloat without proportional gain.

For high-stakes formatting precision (e.g., structured JSON output, API
response shapes), 5 examples covering varied cases is worth the token cost.
For tone and style, 3 well-chosen examples are usually sufficient.

## Anti-patterns to Avoid

### The Laundry List of Edge Cases

```xml
<examples>
  <!-- Example 1: normal case -->
  <!-- Example 2: user is angry -->
  <!-- Example 3: user is confused -->
  <!-- Example 4: user asks off-topic question -->
  <!-- Example 5: user provides malformed input -->
  <!-- Example 6: user is terse -->
  <!-- Example 7: user provides excessive detail -->
  <!-- Example 8: typos in input -->
  <!-- ... 12 more examples ... -->
</examples>
```

This bloats context without proportional benefit. Twenty narrow examples of
individual edge cases are less effective than 5 diverse examples that establish
a clear pattern the model can generalize from.

### Examples Embedded in Instructions

Mixing examples with instructions forces the model to parse which content is
directive and which is illustrative:

```
# Bad — example embedded in rule
When the user asks about class selection, respond concisely. For example,
if they ask "what should I play?", say "It depends on your style. Are you
drawn to combat, magic, or support roles?" Then ask follow-up questions.
```

```xml
<!-- Better — example separated from instruction -->
<instructions>
When the user asks about class selection, respond concisely and
ask a focused follow-up question to narrow down their preference.
</instructions>

<example>
  <input>What class should I play?</input>
  <output>It depends on your style. Are you drawn to combat, magic, or
  support roles?</output>
</example>
```

### Examples That Don't Match the Real Task

If your examples use simplified inputs but your real inputs are complex, the
model learns from the simplified pattern. Use representative examples that match
the actual complexity and variation of your inputs.

## Examples with Thinking (Chain-of-Thought)

For tasks requiring multi-step reasoning, show the reasoning pattern in your
examples using `<thinking>` tags:

```xml
<example>
  <input>
  A fighter (AC 18, 45 HP) attacks a goblin (AC 15, 7 HP) with a
  longsword (+5 to hit, 1d8+3 damage). What happens?
  </input>
  <thinking>
  Attack roll: +5 to hit vs AC 15. Need to roll 10+ on d20 to hit.
  Probability of hit: 11/20 = 55%.
  If hit: 1d8+3 damage. Average = 4.5+3 = 7.5.
  With 7 HP, the goblin likely dies on a hit (average damage ≥ HP).
  Critical hit (natural 20): 2d8+3 average = 12, definitely lethal.
  </thinking>
  <output>
  The fighter has a 55% chance to hit (needs 10+ on d20). On a typical
  hit, the goblin takes 7-8 damage — likely lethal given its 7 HP. A
  critical hit deals 12 average damage, a guaranteed kill. There is also
  a 5% chance of a critical miss with no effect.
  </output>
</example>
```

## Self-Evaluation of Examples

After writing your examples, ask the model to evaluate them:

```xml
<instructions>
Review the examples I've provided. Identify:
1. Any example that could be misinterpreted
2. Any important variation that isn't covered
3. Any unintended pattern the examples might imply
</instructions>

<examples>
[your examples here]
</examples>
```

This catches blind spots in your example set before deployment.

## Quick Reference

| Property | Guideline |
|----------|-----------|
| Count | 3–5 examples for most tasks |
| Tags | Wrap in `<example>` (single) or `<examples>` (multiple) |
| Diversity | Cover edge cases, not just happy paths |
| Relevance | Match your actual inputs, not simplified versions |
| Reasoning | Use `<thinking>` tags to show multi-step reasoning patterns |
| Separation | Keep examples separate from instructions |
| Evaluation | Ask the model to critique your example set |
