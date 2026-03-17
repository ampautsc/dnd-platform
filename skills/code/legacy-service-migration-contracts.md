# Legacy Service Migration with Contract Tests

## Category
code

## Tags
#migration #legacy #tdd #contracts #dm #services

## Description
Migrate a legacy service safely by writing contract tests first and validating API compatibility before wiring exports.

## Prerequisites
- Access to legacy source file
- Destination package test runner configured
- Known public API to preserve

## Steps
1. Locate legacy source and any sibling-package implementation.
2. Extract public API and fallback behavior into a test requirements block.
3. Write failing tests for happy path, fallback path, and immutability/reference safety.
4. Run targeted red phase and confirm missing module/behavior mismatch.
5. Implement the minimum service to satisfy contract tests.
6. Wire exports/facade and add/adjust integration assertion.
7. Run targeted tests, then full package tests.
8. Capture mismatches and assumptions in history.

## Examples
- DM NpcScheduler migration preserving getScheduleEntry/getFullSchedule with fallback behavior and clone-safe returns.

## Common Pitfalls
- Implementing from memory without codifying contract in tests.
- Skipping red phase confirmation.
- Returning mutable references to internal schedule data.
- Forgetting to wire barrel/facade exports after implementation.

## Related Skills
- skills/code/dm-mvp-tests-first-bootstrap.md
- skills/problem-solving/task-decomposition.md
