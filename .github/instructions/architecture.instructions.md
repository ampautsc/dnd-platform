---
applyTo: '**'
---
# Architecture & Engineering Requirements

These rules govern how all code in this monorepo is designed, built, and tested. Every package must follow these principles. No exceptions.

---

## Core Architectural Principles

### 1. No Runtime External Dependencies

The application must not depend on third-party systems during normal runtime operation.

- External systems may be used only through separate ingestion, synchronization, or integration processes.
- Any required third-party data must be copied into an internal datastore before the application uses it.
- **Exception**: LLM API calls are a runtime dependency by nature. They MUST be behind the provider abstraction interface, and MUST have graceful degradation (fallback responses, mock provider for testing).

### 2. Internal Data Ownership

All data used at runtime must be controlled internally.

- Reference data (spells, creatures, items, etc.) lives in `packages/content/` as versioned data files.
- Application state (characters, sessions, game logs) lives in the database owned by `packages/api/`.
- No package should reach out to an external API to look up D&D rules or content at runtime.

### 3. Thin / Dumb UI

`packages/client/` is visualization and user controls ONLY.

- No business logic in the client.
- No game rule calculations in the client.
- No action validation in the client (the server is the sole authority via TurnMenu).
- The client renders what the server tells it and sends user inputs back.
- State management in the client is for UI state only (which panel is open, animation state, etc.), not game state.

### 4. Service Layer Owns All Logic

All game logic, business rules, and calculations live in service layers within server packages.

- Services are testable in isolation (no HTTP, no database required for unit tests).
- Services receive data as parameters and return results — no implicit global state.
- Routes/handlers are thin wrappers that call services and format responses.

### 5. Package Boundaries Are Hard Walls

Import rules are enforced by convention (and eventually by tooling):

| Package | Can Import From | Cannot Import From |
|---|---|---|
| `content` | nothing | everything |
| `combat` | `content` | `dm`, `api`, `gateway`, `client`, `world` |
| `dm` | `content`, `combat` | `api`, `gateway`, `client` |
| `world` | `content` | `dm`, `api`, `gateway`, `client`, `combat` |
| `api` | `content` | `combat`, `dm`, `gateway`, `client`, `world` |
| `gateway` | nothing | everything (it's a message router) |
| `client` | nothing server-side | everything (communicates via WebSocket and REST only) |

**`dm` communicates with `world` and `combat` via defined interfaces, not direct imports of internals.**

---

## Test-Driven Development Requirements

### The Strict Sequence

Every piece of code follows this sequence. No shortcuts.

```
1. REQUIREMENTS  → Define what the code must do (plain language, in the test file or a comment)
2. TEST FILE     → Create the test file with describe/it blocks
3. TESTS         → Write failing tests that assert the requirements
4. IMPLEMENTATION → Write the minimum code to make tests pass
5. REFACTOR      → Clean up while keeping tests green
6. VERIFY        → Run tests, confirm all pass, report results
```

### What Must Be Tested

| Code Type | Test Type | Example |
|---|---|---|
| Pure functions / utilities | Unit test | Dice roller, damage calculator, hex distance |
| Service methods | Unit test with mocks | NPC response generation, action resolution |
| API routes | Integration test | POST /api/characters returns 201 with valid body |
| Combat engine | Unit test | ActionResolver handles attack with advantage correctly |
| Game state transitions | Unit test | GameState.applyDamage returns new state with updated HP |
| React components | Component test | CombatHud renders initiative order correctly |
| User flows | E2E (Playwright) | Login → create character → join lobby → start session |

### Test Quality Standards

- Tests assert **specific expected behavior**, not just "doesn't throw"
- Tests have descriptive names that read as specifications: `"should apply half damage when target has resistance"`
- Tests are independent — no test depends on another test's side effects
- Tests use the mock LLM provider, never real API calls
- Tests cover error paths, not just happy paths

### When Tests Are Not Required

Never. Tests are always required. If you think something is too simple to test, write a test proving it works. That test will save someone when the "simple" thing breaks.

---

## Code Style

- JavaScript/TypeScript (TypeScript preferred for new code)
- ES modules (`import`/`export`), not CommonJS (`require`/`module.exports`) for new code
- Functions over classes unless state encapsulation is genuinely needed
- Immutable data patterns (especially in `packages/combat/` — GameState is immutable, all mutations return new instances)
- Descriptive variable and function names over comments
- No `any` type in TypeScript — if you can't type it, you don't understand it yet

---

## Error Handling

- Every service method must define its error cases
- Errors are typed/structured, not raw strings
- Network failures are expected and handled gracefully
- LLM failures fall back to mock/default responses
- The game never crashes for the player — degrade gracefully

---

## File Organization Per Package

Each package follows this structure:

```
packages/{name}/
  src/              ← Source code
    index.js        ← Public API (what other packages can import)
    services/       ← Business logic
    routes/         ← HTTP handlers (api only)
    models/         ← Data models / schemas
    utils/          ← Package-internal utilities
  __tests__/        ← Test files (mirror src/ structure)
  README.md         ← Package documentation
  package.json      ← Package manifest
```

Test files mirror their source:
- `src/services/CombatSessionManager.js` → `__tests__/services/CombatSessionManager.test.js`
