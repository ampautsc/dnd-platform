# DM MVP Tests-First Bootstrap

## Category
code

## Tags
#dm #tdd #services #bootstrap #vitest

## Description
A repeatable workflow for bootstrapping a new DM package slice by writing service tests first, confirming a red phase, then implementing the smallest service layer to go green.

## Prerequisites
- Package README/handoff clarifies MVP scope.
- Workspace supports package-level Vitest runs.
- Service boundaries are defined (pure functions/services before transport layers).

## Steps
1. Define explicit requirements at the top of each test file.
2. Create failing tests for each service in `__tests__/services/`.
3. Run package tests and confirm red phase (expected failures).
4. Implement minimal service modules under `src/services/`.
5. Export services and package API from `src/index.js`.
6. For orchestration services, verify every injected dependency call against the real dependency signature before the green run.
7. Re-run tests until all are green without widening scope.

## Examples
- `GameLog`: timestamped append + query since timestamp.
- `SessionManager`: strict lifecycle transitions with structured transition errors.
- `ActionProcessor`: deterministic intent mapping for core action categories.
- `GroupDecisionArbiter`: decision lifecycle with deterministic timeout behavior via injected `nowFn`.
- `PartyCoherenceMonitor`: spatial split detection with configurable threshold and Euclidean centroid math.
- `ChapterGenerator`: LLM-driven prose generation from game log entries with empty-log fallback and injected timestamp.
- `ImagePromptBuilder`: pure prompt construction from scene context with configurable style and negative prompt.
- `NarrationGenerator`: LLM-driven book pages composing text + image prompt + speech directive, with sceneType-based pacing.

## Common Pitfalls
- Skipping red-phase confirmation before implementation.
- Mixing HTTP/database concerns into early service tests.
- Over-implementing intents before concrete tests exist.
- Trusting syntactically valid JavaScript orchestration code without checking dependency method contracts.
- Hard-coding `Date.now()` in services that include timeout logic, which makes tests flaky and non-deterministic.
- For spatial/position services, not enumerating all tracking-state combinations (tracked vs untracked mover, solo vs group) before implementing — missed edge cases surface only in test runs.
- For LLM-consuming services, mixing prompt content assertions with output shape assertions in the same test — split them for clearer failure diagnostics.
- When batching a pure helper and its LLM-consuming orchestrator, writing both implementations before either test suite — write and red-confirm each test file first.

## Related Skills
- `skills/problem-solving/task-decomposition.md`
- `skills/code/client-ui-smoke-validation.md`
