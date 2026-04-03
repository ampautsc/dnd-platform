# Structuring Context

Structure is how you help the model parse complex prompts unambiguously.
When a prompt mixes instructions, context, examples, and variable inputs
without clear boundaries, the model must guess where one type of content
ends and another begins. Structure eliminates that guessing.

## XML Tags

XML tags are the most reliable way to delineate content sections for Claude.
They create unambiguous boundaries that the model parses consistently.

### Basic Pattern

```xml
<instructions>
Summarize the document below in 3 bullet points.
Focus on the key findings and their implications.
</instructions>

<document>
[Your document content here]
</document>
```

### Naming Conventions

Use consistent, descriptive tag names:

| Good | Bad | Why |
|------|-----|-----|
| `<instructions>` | `<stuff>` | Descriptive names signal intent |
| `<document>` | `<d>` | Full names are unambiguous |
| `<project_conventions>` | `<rules123>` | Meaningful names help the model prioritize |
| `<expected_output>` | `<thing_to_do>` | Specificity reduces misinterpretation |

### Nesting for Hierarchical Content

When content has natural hierarchy, nest tags to reflect it:

```xml
<documents>
  <document index="1">
    <source>Q3 Financial Report</source>
    <document_content>
    Revenue increased 15% year-over-year...
    </document_content>
  </document>
  <document index="2">
    <source>Q3 Customer Survey</source>
    <document_content>
    Customer satisfaction scores improved by 8 points...
    </document_content>
  </document>
</documents>

<query>
Compare the financial performance with customer satisfaction trends.
What correlations do you observe?
</query>
```

The `index` attributes let both you and the model reference specific documents
unambiguously.

### Using Tags for Output Control

Tags can guide the model's output structure:

```xml
<instructions>
Analyze the code for security issues.
Place your reasoning in <analysis> tags.
Place only the final recommendations in <recommendations> tags.
</instructions>
```

This cleanly separates reasoning from output, making it easy to extract
the actionable part programmatically.

## Markdown Headers

When XML tags feel too heavy, markdown headers provide a lighter alternative:

```markdown
## Role
You are a technical documentation writer.

## Task
Write API documentation for the endpoint described below.

## Endpoint Details
- Method: POST
- Path: /api/characters
- Body: { name: string, class: string, level: number }

## Style Guide
- Use present tense ("Returns" not "Will return")
- Include request and response examples
- Document error codes with descriptions
```

Markdown headers work well for:
- Shorter prompts where full XML feels excessive
- Prompts that are primarily text-based (not mixing code and data)
- Cases where the content within sections is simple

XML tags work better for:
- Complex prompts with mixed content types
- Programmatic prompt construction (easier to parse and template)
- Deep nesting and hierarchical data
- When sections contain code that itself uses markdown

## Document Organization for Long Context

When working with large inputs (20k+ tokens), the physical order of content
in the prompt significantly affects performance.

### The Sandwich Pattern

```
┌─────────────────────────────┐
│  Long documents / data      │  ← TOP: Reference material
│  (placed first)             │
├─────────────────────────────┤
│  Instructions / rules       │  ← MIDDLE: Processing logic
│  Examples                   │
├─────────────────────────────┤
│  Query / task description   │  ← BOTTOM: What to do now
└─────────────────────────────┘
```

**Why this order works:**
- The model's attention is strongest at the **beginning** and **end** of context
- Long data in the middle gets less precise attention
- Placing the query last (closest to the generation point) improves accuracy
  by up to 30% on complex multi-document tasks

### Grounding in Quotes

For document analysis tasks, ask the model to quote relevant passages before
answering. This forces it to locate and surface the specific evidence rather
than generating from a vague impression of the full document:

```xml
<instructions>
First, extract the exact quotes from the document that are relevant to the
question. Place them in <relevant_quotes> tags. Then answer the question
based on those quotes.
</instructions>
```

## Variable Injection

When prompts are templates with dynamic content, use clear delimiters:

```xml
<instructions>
Review the following pull request diff and provide feedback.
</instructions>

<pull_request>
<title>{{PR_TITLE}}</title>
<description>{{PR_DESCRIPTION}}</description>
<diff>
{{PR_DIFF}}
</diff>
</pull_request>

<review_criteria>
Focus on: correctness, security, and adherence to TypeScript strict mode.
</review_criteria>
```

Benefits of explicit variable injection:
- The model clearly distinguishes your instructions from the dynamic content
- You can change the template without affecting the injected data
- Malicious or confusing content in the variables is less likely to be
  interpreted as instructions (defense against prompt injection)

## Common Mistakes

| Mistake | Consequence | Fix |
|---------|------------|-----|
| No section boundaries | Model conflates instructions with examples | Add XML tags or headers |
| Inconsistent tag names | `<context>` in one prompt, `<background>` in another | Standardize naming across your system |
| Over-nesting | 5+ levels deep is hard for both humans and models | Keep nesting to 2-3 levels max |
| Placing query before data | Model starts generating before "seeing" the full context | Query goes last |
| Formatting prompt in markdown when you want plain text output | Model mirrors your formatting style | Match prompt style to desired output style |
