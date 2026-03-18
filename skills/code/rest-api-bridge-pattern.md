# Legacy Service Migration — REST API Bridge Pattern

## Category
code

## Tags
#api #dm #rest #bridge #encounter #controller #tdd #integration

## Description
Pattern for exposing an existing internal service (like dm/EncounterSessionService) via REST API routes when the service was originally designed for direct programmatic use. Creates a thin controller layer between Express routes and the service, handling error-code-to-HTTP-status mapping.

## Prerequisites
- Service layer already exists and is tested (e.g., EncounterSessionService)
- Service uses structured error codes (e.g., `err.code = 'NPC_NOT_FOUND'`)
- API package exists with Express, supertest, existing route patterns

## Steps
1. **Add service's package as dependency** — Update `package.json` to add the service's package (e.g., `@dnd-platform/dm`)
2. **Create EncounterController** (thin bridge) — Maps service methods to controller methods. No logic, just delegation. Lives in `api/src/services/`.
3. **Create route file** — Maps HTTP verbs/paths to controller methods. Handles error-code-to-HTTP-status mapping in catch blocks. Lives in `api/src/routes/`.
4. **Mount routes in app.js** — Import routes, mount behind auth middleware. Make optional (check for controller in deps).
5. **Wire in index.js** — Create the DM engine with provider and personalityLookup, create controller, pass to createApp.
6. **Write tests** — Use supertest with in-memory dependencies. Use MockProvider for DM engine. Stub NODE_ENV for auth bypass.

## Error Code to HTTP Status Mapping
```javascript
const ERROR_STATUS = {
  INVALID_INPUT: 400,
  NPC_NOT_FOUND: 404,
  MAX_SESSIONS: 429,
  ENCOUNTER_NOT_FOUND: 404,
  ENCOUNTER_ENDED: 409,
};
```

## Examples
- `packages/api/src/services/EncounterController.js` — Thin bridge to dm.encounterSession
- `packages/api/src/routes/encounters.js` — REST endpoints for NPC encounters
- `packages/api/__tests__/routes/encounters.test.js` — 14 tests using createDmEngine with MockProvider

## Common Pitfalls
- **Provider interface mismatch**: Internal services may expect different request/response shapes than the provider returns. Verify both request fields (what the service sends to provider) and response fields (what the service reads from provider output).
- **Auth dev bypass**: When adding requireAuth to new routes, remember existing "should return 401 without auth" tests will break. Update them to set `NODE_ENV=production`.
- **dotenv path**: In monorepo, `.env` at root isn't found when running from `packages/api/`. Use `import.meta.url` to resolve path.
- **Optional mounting**: Make new routes optional in app.js (`if (deps.controller)`) so existing tests don't break.

## Related Skills
- `skills/code/dm-mvp-tests-first-bootstrap.md` — TDD pattern for DM services
- `skills/code/legacy-service-migration-contracts.md` — Migration contract patterns
