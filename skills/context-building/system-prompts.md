# System Prompts

System prompts are the foundational instructions that set the model's behavior,
tone, and constraints for an entire interaction. They are the single most
important component of context engineering because they define the agent's
identity and operating parameters.

## The Right Altitude

The most common failure in system prompt design is calibrating the wrong level
of specificity. There are two failure modes:

**Too rigid (brittle):**
```
If the user says "hello", respond with "Hello! How can I help you today?"
If the user asks about pricing, respond with "Our plans start at $10/month."
If the user asks about features, respond with "We offer X, Y, and Z."
```

This approach hardcodes behavior for every scenario, creates maintenance burden,
and breaks when the user does anything unexpected.

**Too vague (assumes shared context):**
```
Be helpful and professional. Answer questions about our product.
```

This provides no concrete signals about desired behavior, tone, or boundaries.
The model will guess — and guessing means inconsistency.

**Right altitude:**
```
You are a customer support agent for Acme Corp. Your primary goal is to resolve
customer issues efficiently while maintaining a professional, empathetic tone.

Key behaviors:
- Acknowledge the customer's problem before suggesting solutions.
- If you cannot resolve an issue, escalate by asking the customer to contact
  support@acme.com with their ticket number.
- Never discuss competitor products or make promises about future features.
- Keep responses concise — aim for 2-3 paragraphs maximum.
```

This is specific enough to guide behavior, flexible enough to handle novel
situations, and provides heuristics the model can apply intelligently.

## Structure with Sections

Organize system prompts into clearly delineated sections. Use XML tags or
markdown headers to separate concerns:

```xml
<role>
You are a senior code reviewer specializing in TypeScript and Node.js.
</role>

<instructions>
Review the provided code for:
1. Correctness — logic errors, edge cases, off-by-one mistakes
2. Security — injection risks, authentication gaps, data exposure
3. Performance — unnecessary allocations, N+1 queries, blocking operations
4. Style — adherence to project conventions documented below

For each issue found, provide:
- The file and line number
- A brief description of the problem
- A concrete fix or recommendation
</instructions>

<project_conventions>
- Use strict TypeScript — avoid `any`
- Export interfaces alongside Mongoose schemas
- Route handlers are thin controllers; business logic lives in services
- Return { error: string, details?: string } on errors
</project_conventions>

<output_format>
Organize findings by severity: Critical > Warning > Suggestion.
Use markdown code blocks when referencing specific lines.
</output_format>
```

### Why sections matter

- **Reduces misinterpretation.** When instructions, context, and formatting rules
  are interleaved, the model may confuse a formatting example for an instruction.
  Explicit sections eliminate this ambiguity.
- **Enables selective attention.** The model can focus on the relevant section for
  a given decision rather than scanning the entire prompt.
- **Simplifies maintenance.** You can update one section without ripple effects
  on others.

## Key Principles

### 1. Explain the Why

Providing motivation behind instructions helps the model generalize correctly:

**Without why:**
```
Never return more than 5 results.
```

**With why:**
```
Limit responses to 5 results because our UI renders a fixed-height list.
Exceeding 5 results causes layout overflow on mobile devices.
```

The model now understands the constraint's purpose and can make intelligent
decisions when edge cases arise (e.g., when the user explicitly asks for more).

### 2. State What to Do, Not What to Avoid

Positive instructions are more effective than negative ones:

**Less effective:**
```
Do not use markdown in your response.
Do not include code blocks.
Do not be verbose.
```

**More effective:**
```
Respond in flowing prose paragraphs without any formatting markup.
Keep responses to 2-3 concise paragraphs.
```

### 3. Set a Role

Even a single sentence focusing the model's role improves behavior:

```
You are an experienced D&D Dungeon Master who helps players build
optimized characters for 5th Edition campaigns.
```

Roles provide an implicit set of expectations about tone, vocabulary,
domain knowledge, and priorities that the model activates automatically.

### 4. Start Minimal, Add Based on Failures

Begin with the simplest prompt that conveys your intent. Test it against your
use cases. When failures occur, add targeted instructions to address those
specific failure modes. This prevents over-engineering and keeps context tight.

### 5. Order Matters for Long Prompts

When system prompts exceed several thousand tokens:

- Place **reference data and long documents at the top**
- Place **instructions and rules in the middle**
- Place **the specific query or task at the bottom**

Queries at the end of long context can improve response quality by up to 30%
because the model's attention is strongest at the boundaries of the context
window (beginning and end).

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|-------------|-----|
| Laundry list of edge cases | Bloats context; model can't prioritize | Provide 3-5 canonical examples instead |
| Hardcoded if-else logic | Brittle; breaks on novel inputs | Use heuristic-level guidance |
| Assuming shared context | Model has no background knowledge of your project | State all relevant facts explicitly |
| Over-prompting with emphasis | "CRITICAL: YOU MUST..." causes over-triggering | Use calm, direct language |
| Mixing concerns in one block | Model confuses formatting rules with logic rules | Separate into labeled sections |
