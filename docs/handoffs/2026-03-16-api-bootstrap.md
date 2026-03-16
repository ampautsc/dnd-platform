# API Package Bootstrap Handoff
**Date:** 2026-03-16  
**From:** Sis (migration agent)  
**To:** Whoever picks up the `packages/api/` work

---

## Critical Orientation — Read This First

The source code lives in a **different repository** on this machine:

```
C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\
```

The new package lives at:

```
C:\Users\ampau\source\dnd-platform\packages\api\
```

**The Copilot assistant working in `dnd-platform` will not automatically see or know about `dnd-builder`.**  
Every handoff reference below gives you the exact source path to read before writing the ESM version.

---

## Current State

| Package | Status | Tests |
|---------|--------|-------|
| `@dnd-platform/content` | ✅ Complete | 744 |
| `@dnd-platform/combat` | ✅ Complete | 516 |
| `@dnd-platform/api` | 🔲 Stub | 0 |

Head commit: `8553bac`

---

## What This Package Is

The REST API server: authentication, persistent character/inventory storage, content browsing, group management, session history. **It owns the database. Everything that must survive a restart goes through here.**

Full architecture spec: `packages/api/README.md`

---

## Source Files to Migrate (dnd-builder → api)

All paths are relative to `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\`

### Express App & Routes

| Source File | Destination | Notes |
|-------------|------------|-------|
| `index.js` | `src/index.js` | Strip MongoDB connect + keep Express setup. Remove inline combat/encounter routes — those belong elsewhere. |
| `routes/api.js` | `src/routes/` | Main API router. Split into sub-routers per resource. |
| `routes/characters.js` | `src/routes/characters.js` | Character CRUD via Mongoose |
| `routes/world.js` | Read only — world queries belong in `world/` package | |
| `routes/combat-sessions.js` | Read only — belongs in `gateway/` | |
| `routes/encounters.js` | Read only — belongs in `dm/` | |
| `routes/characterResponses.js` | Read only — belongs in `dm/` | |
| `routes/parties.js` | `src/routes/groups.js` | Party = Group in new naming |

### Services

| Source File | Destination | Notes |
|-------------|------------|-------|
| `services/InventoryService.js` | `src/services/InventoryService.js` | Item add/remove/merge, currency — migrate as ESM |
| `services/LootService.js` | `src/services/LootService.js` | Applies loot to a character's inventory |

### Mongoose Models (migrate all)

All live at `models/` in dnd-builder. Migrate each to `src/models/`:

- `models/Background.js`
- `models/Build.js`
- `models/CharacterPersonality.js`
- `models/ClassFeature.js`
- `models/Condition.js`
- `models/Feat.js`
- `models/Item.js`
- `models/LevelProgression.js`
- `models/ScenarioEvaluation.js`
- `models/Skill.js`
- `models/Species.js`
- `models/Spell.js`

These are CJS (`module.exports`). Convert to ESM (`export default`). Key reminder: Mongoose itself is CJS-compatible from ESM via named imports.

### Seed Scripts (reference only — don't migrate as app code)

- `seed.js` — seeds Feats, Items, Builds, SpellNotes, ClassFeatures, Skills, Backgrounds, LevelProgressions, Conditions
- `seed-reference.js` — seeds supplementary reference data
- `seed-species.js` — seeds 71 species from `data/species-raw.json`

These inform what the API must handle. Use them to write test fixtures, not production code.

### Auth (greenfield — no source exists)

The dnd-builder used MongoDB sessions/JWT directly in Express middleware. The new `api/` should implement the **magic link flow** designed in `packages/api/README.md`:

- `POST /api/auth/request-link` → generate token, "email" it (console.log in dev)
- `POST /api/auth/verify` → verify token, issue JWT
- `GET /api/auth/me` → current user from JWT

Write `src/services/AuthService.js` from scratch. It is not complex — generate a short-lived token, verify it, issue a signed JWT.

---

## CJS → ESM Conversion Rules

The monorepo uses `"type": "module"`. All files must be ESM.

```js
// ❌ Old CJS (dnd-builder)
const mongoose = require('mongoose');
module.exports = MyModel;

// ✅ New ESM (api package)
import mongoose from 'mongoose';
export default MyModel;
```

**Watch for:**
- `require()` inside functions → move to top-level `import`
- `__dirname` / `__filename` → use `import.meta.url` + `fileURLToPath`
- Dynamic requires → static imports

---

## Architecture Rules

1. **Database owner.** Other packages do NOT directly access the DB. They call API endpoints or use service interfaces.
2. **Thin routes.** Routes extract params, call services, return responses. Zero business logic in route handlers.
3. **Services are testable without a DB.** Inject a mock Mongoose model. Never require a live MongoDB to run tests.
4. **JWT is the auth token.** Issued on magic link verify. Validated by `gateway/` on WebSocket connect.
5. **Content browsing = proxy to `@dnd-platform/content`.** Don't duplicate content data — import from content package.

---

## Database

dnd-builder used MongoDB via Mongoose. The new api package **may** continue with MongoDB or switch to SQLite for simplicity. Decision is open — but:
- Tests must work with an in-memory mock (no real DB in CI)
- If MongoDB: use `mongodb-memory-server` for tests
- If SQLite: use better-sqlite3 with an in-memory db for tests

---

## Bootstrap Steps

```bash
cd packages/api

# 1. Init package
# Set: "name": "@dnd-platform/api", "type": "module", "private": true

# 2. Install Express
npm install express cors dotenv

# 3. Install test deps
npm install --save-dev vitest @vitest/coverage-v8

# 4. Optional: Mongoose
npm install mongoose
npm install --save-dev mongodb-memory-server

# 5. Write first test — AuthService unit test
# src/services/__tests__/AuthService.test.js
```

---

## TDD Order (suggested sequence)

1. `AuthService` — token generation, verification, JWT issuance (pure functions, no DB)
2. `CharacterService` — CRUD with mocked Mongoose model
3. `InventoryService` — item add/remove/currency math (pure logic, no DB)
4. `LootService` — applies loot drops to inventory
5. Auth routes — HTTP status codes, request shapes
6. Character routes — full CRUD via HTTP
7. Content proxy routes — calls content package, formats response

---

## Target File Structure

```
packages/api/
  src/
    index.js
    routes/
      auth.js
      characters.js
      inventory.js
      content.js
      groups.js
      sessions.js
    services/
      AuthService.js
      CharacterService.js
      InventoryService.js
      GroupService.js
      LootService.js
    models/
      Background.js
      Build.js
      Character.js
      Condition.js
      Feat.js
      Item.js
      LevelProgression.js
      Skill.js
      Species.js
      Spell.js
    middleware/
      auth.js
    __tests__/
  package.json
  README.md
```

---

## Definition of Done

- [ ] All routes listed in `packages/api/README.md` exist and respond correctly
- [ ] Auth flow: request-link → verify → JWT → me — full cycle tested
- [ ] Character CRUD: create/read/update/delete with validation
- [ ] Inventory: add item, remove item, currency math — all tested
- [ ] Stat calculations: ability modifier, proficiency, AC, skill checks
- [ ] Level-up: valid/invalid choices, feature application
- [ ] Content proxy: all content endpoints return data from content package
- [ ] All tests pass without a live database or network connection
- [ ] `npm test` passes with ≥ 80% coverage

---

## Related Files

- `packages/api/README.md` — full architecture spec
- `packages/combat/README.md` — combat engine API (used for session integration)
- `packages/content/src/` — content data API (used for content proxy routes)
- Source: `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\`

---

*Written by Sis on 2026-03-16. The combat and content engines are proven and tested. The API is the persistence layer — own it.*
