# Skill: Code Review Checklist

## Category
code

## Tags
#code #review #quality

## Description
A comprehensive checklist for reviewing code changes, ensuring quality, security, and maintainability.

## Prerequisites
- Access to code changes (PR/diff)
- Understanding of the project context
- Familiarity with the codebase conventions

## Steps

### 1. Understand the Change
- Read the PR description and linked issues
- Understand the problem being solved
- Review the approach and design

### 2. Functionality Review
- [ ] Code solves the stated problem
- [ ] Logic is correct and handles edge cases
- [ ] Error handling is appropriate
- [ ] No obvious bugs or logic errors

### 3. Code Quality
- [ ] Code is readable and maintainable
- [ ] Naming is clear and consistent
- [ ] Functions/methods have single responsibility
- [ ] No unnecessary complexity
- [ ] Comments explain "why" not "what"
- [ ] No commented-out code

### 4. Security Review
- [ ] Input validation is present
- [ ] No injection vulnerabilities
- [ ] Sensitive data is protected
- [ ] Authentication/authorization is correct
- [ ] No hardcoded secrets

### 5. Performance
- [ ] No obvious performance issues
- [ ] Efficient algorithms used
- [ ] No unnecessary database queries
- [ ] Appropriate caching where needed

### 6. Testing
- [ ] Tests were written BEFORE implementation (TDD)
- [ ] Tests exist and are meaningful
- [ ] Edge cases are tested
- [ ] Error paths are tested
- [ ] Tests are maintainable
- [ ] All tests pass

### 7. Package Boundaries
- [ ] Import rules respected (see architecture.instructions.md)
- [ ] No cross-package boundary violations
- [ ] Client contains zero game logic
- [ ] GameState not mutated in place

### 8. Documentation
- [ ] Public APIs are documented
- [ ] Complex logic is explained
- [ ] README updated if needed
- [ ] Breaking changes noted

## Related Skills
- `skills/code/combat-engine-patterns.md`
- `skills/code/service-health-verification.md`
