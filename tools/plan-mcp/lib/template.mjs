/**
 * Plan template and best practices for development planning.
 * 
 * This module defines what a "good plan" looks like. Every plan created
 * through the MCP tool uses this structure to enforce quality.
 */

export const PLAN_SECTIONS = {
  objective: {
    title: '## Objective',
    description: 'What is being built and why. One paragraph max.',
    required: true,
  },
  successCriteria: {
    title: '## Success Criteria',
    description: 'How do we know this is done? Measurable, observable outcomes.',
    required: true,
  },
  scope: {
    title: '## Scope',
    description: 'What is IN scope and what is explicitly OUT of scope.',
    required: true,
    subsections: ['### In Scope', '### Out of Scope'],
  },
  architectureDecisions: {
    title: '## Architecture Decisions',
    description: 'Key technical choices and their rationale. Each decision should state the choice, alternatives considered, and why this one wins.',
    required: false,
  },
  phases: {
    title: '## Phases',
    description: 'Logical phases of work with dependencies between them. Each phase has a clear deliverable.',
    required: true,
  },
  tasks: {
    title: '## Tasks',
    description: 'Specific, actionable work items within each phase. Each task has acceptance criteria.',
    required: true,
  },
  risks: {
    title: '## Risks & Mitigations',
    description: 'What could go wrong and how we handle it. Be honest — optimistic plans fail.',
    required: false,
  },
  testingStrategy: {
    title: '## Testing Strategy',
    description: 'How each component will be verified. Maps to the TDD sequence: requirements → tests → implementation.',
    required: true,
  },
  dependencies: {
    title: '## Dependencies',
    description: 'External blockers, required information, packages, or services.',
    required: false,
  },
  openQuestions: {
    title: '## Open Questions',
    description: 'Unknowns that must be resolved before or during implementation.',
    required: false,
  },
};

/**
 * Generates a plan document from a title and optional initial content per section.
 * 
 * @param {string} title - The plan title
 * @param {Object} [content={}] - Optional content for each section key
 * @returns {string} The formatted plan markdown
 */
export function generatePlanTemplate(title, content = {}) {
  if (!title || typeof title !== 'string') {
    throw new Error('Plan title is required and must be a non-empty string');
  }

  const lines = [
    `# ${title.trim()}`,
    '',
    `> Created: ${new Date().toISOString().split('T')[0]}`,
    `> Status: Draft`,
    '',
  ];

  for (const [key, section] of Object.entries(PLAN_SECTIONS)) {
    lines.push(section.title);
    
    if (content[key]) {
      lines.push('');
      lines.push(content[key]);
    } else {
      lines.push('');
      lines.push(`<!-- ${section.description} -->`);
      if (section.subsections) {
        lines.push('');
        for (const sub of section.subsections) {
          lines.push(sub);
          lines.push('');
        }
      }
    }
    
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Best practices text that the LLM sees as part of the tool description.
 * This guides the model to produce excellent plans.
 */
export const PLANNING_BEST_PRACTICES = `
BEST PRACTICES FOR DEVELOPMENT PLANS:

1. OBJECTIVE — State what is being built and WHY in one paragraph. If you can't 
   explain why, the plan isn't ready.

2. SUCCESS CRITERIA — Define measurable outcomes, not activities. Bad: "Implement 
   the feature." Good: "Users can create a character and see it on the dashboard. 
   All API tests pass. Load time < 200ms."

3. SCOPE — Be explicit about what is OUT. Scope creep kills plans. Every "nice to 
   have" that isn't listed as out-of-scope will sneak into the timeline.

4. PHASES — Each phase should have ONE clear deliverable. Phases depend on each 
   other — a later phase can't start until an earlier one's deliverable is verified.
   A phase with no deliverable is not a phase, it's a wish.

5. TASKS — Each task must be:
   - Small enough to complete in one session (< 2 hours ideal)
   - Testable in isolation (has its own acceptance criteria)
   - Assignable (clear what "done" looks like)
   Tasks without acceptance criteria are not tasks, they are notes.

6. TESTING STRATEGY — For each component, state HOW it will be tested. This maps 
   directly to TDD: write the test descriptions as part of the plan. The plan IS 
   the test spec.

7. RISKS — Be honest about what could go wrong. Every plan has risks. A plan with 
   no risks section is a plan that hasn't been thought through. For each risk, 
   state the mitigation.

8. OPEN QUESTIONS — Unknowns are fine. Undocumented unknowns are not. List every 
   question that needs answering. A plan with open questions is better than a plan 
   that pretends to have all answers.

9. ARCHITECTURE DECISIONS — When there's a choice to make, document it. State the 
   options, the tradeoffs, and the decision. Future-you will thank present-you.

10. ITERATION — Plans are living documents. Update them as you learn. A plan that 
    never changes was either perfect (unlikely) or ignored (likely).
`;
