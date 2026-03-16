# Client Package Bootstrap Handoff
**Date:** 2026-03-16  
**From:** Sis (migration agent)  
**To:** Whoever picks up the `packages/client/` work

---

## Current Repo State

| Package | Status | Tests | Notes |
|---------|--------|-------|-------|
| `@dnd-platform/content` | ✅ Complete | 744 | spells, creatures, items, species, npcs, towns, loot, builds |
| `@dnd-platform/combat` | ✅ Complete | 516 | v1 + v2 engine, AI tactics, scenario harnesses |
| `@dnd-platform/api` | 🔲 Stub | 0 | README only |
| `@dnd-platform/client` | 🔲 Stub | 0 | README only — **this is the work** |
| `@dnd-platform/dm` | 🔲 Stub | 0 | README only |
| `@dnd-platform/gateway` | 🔲 Stub | 0 | README only |
| `@dnd-platform/world` | 🔲 Stub | 0 | README only |

Head commit: `ed3270a` — `feat(combat): complete combat package migration — 516 tests`

---

## What the Client Is

A **mobile-first React PWA** that lets players:
1. Join a session via a short code
2. Pick and view their character
3. Vote on group decisions
4. Play through combat with a hex grid
5. Review their character sheet between encounters

The client is **display-only**. Zero game logic lives here. All state comes from the gateway/server.

---

## Existing UI to Migrate (from `dnd-builder/src/`)

These components exist today and should be ported to the client package with tests:

| Component | File(s) | Purpose |
|-----------|---------|---------|
| `CombatHexCanvas` | `CombatHexCanvas.jsx`, `hexUtils.js` | Hex grid rendering, AoE preview, targeting |
| `DiceArena` | `DiceArena.jsx` | Animated dice rolls with outcome display |
| `CombatHUD` | `CombatHUD.jsx` | Initiative order, HP bars, turn actions menu |
| `CharacterPage` | `CharacterPage.jsx` | Full character sheet view |
| `LobbyPage` | `LobbyPage.jsx` | Session join and character selection |
| `NPC encounter panel` | inline in `CombatViewer.jsx` | Shows NPC portrait, dialogue, social options |
| `Spell panel` | inline in CombatHUD | Spell list with slot pips |
| `Inventory panel` | inline in CharacterPage | Equipment slots + item cards |
| `RollBar` | `RollBar.jsx` | Bottom-of-screen roll history ticker |
| `BookIntro` | `BookIntro.jsx` | Animated book-page scene intro sequence |

Before migrating any component: **write the test first.**

---

## The 10 UX Screens (in order)

1. **The Gate** — Enter session code + player name. Validates against MockApi. Shows error on bad code.
2. **Character Select** — Grid of available characters for this session. Each card shows portrait, name, class/level.
3. **Level 0 Creator** *(optional screen)* — If session allows new characters: pick species, background, name. TBD scope.
4. **Session Lobby** — Waiting room. Shows which players have joined. DM controls start.
5. **Book Intro** — Animated scene-setting sequence. DM-triggered. Skip button for returning players.
6. **Exploration / Social** — Default "between encounters" state. Map view or location description. NPC dialogue.
7. **Group Vote** — Presented when DM triggers a group decision. Timer, options, live vote tally.
8. **Combat** — Hex grid + HUD + dice arena. Full encounter play.
9. **Character Sheet** — Accessible from combat and exploration. Spells, inventory, stats, conditions.
10. **Session End** — Summary of session: XP earned, loot found, decisions made. Return to lobby or exit.

---

## Architecture Rules — NEVER BREAK THESE

### Zero Game Logic in Client
The client **displays state and sends intents**. It does not:
- Calculate hit rolls
- Apply damage
- Determine valid targets
- Run AI turns
- Manage initiative

All of that is `@dnd-platform/combat`'s job, running server-side.

### No Direct Package Imports
```js
// ❌ FORBIDDEN
import { rollAttack } from '@dnd-platform/combat/v2/ActionResolver';

// ✅ CORRECT — receive via gateway event
socket.on('combatState', (state) => setCombatState(state));
```

### Gateway Events — The Only Data Source
The client subscribes to gateway events and dispatches intents. It never calls combat functions.

### Mobile-First PWA
- Design for portrait phone first
- Touch targets ≥ 44px
- Offline-capable (service worker for static assets)
- No desktop-only mouse assumptions in core flows

### TDD is Mandatory
- Every component gets a `*.test.jsx` before or alongside the component
- Every hook gets a `*.test.js`
- MockGateway and MockApi (see below) are the only external dependencies in tests
- Playwright E2E tests for every screen transition

### JavaScript, Not TypeScript
The monorepo is `.js` throughout. No `.ts` files.

---

## MockGateway Contract

The `MockGateway` simulates the WebSocket gateway for tests and local dev without a running server.

```js
// packages/client/src/testing/MockGateway.js

export class MockGateway {
  constructor(scenario = 'default') { /* load scenario fixture */ }

  // Emit a server→client event
  emit(event, payload) { /* call registered listeners */ }

  // Register listener (matches real socket.on interface)
  on(event, handler) { /* store handler */ }

  // Send client→server intent (captured for assertion)
  send(intent, payload) { this.sent.push({ intent, payload }); }

  // Assert an intent was sent
  assertSent(intent, matchFn) { /* throws if not found */ }
}
```

**Standard Events the Gateway Emits:**

| Event | Payload |
|-------|---------|
| `sessionJoined` | `{ sessionId, playerId, characters[] }` |
| `characterSelected` | `{ character }` |
| `lobbyUpdate` | `{ players[], ready: boolean }` |
| `sceneStarted` | `{ sceneId, type: 'intro' | 'exploration' | 'combat' | 'vote' | 'end' }` |
| `combatState` | Full combat state object (mirrors CombatSessionManager output) |
| `menuOptions` | `{ combatantId, options[] }` — available actions for current turn |
| `rollResult` | `{ roller, roll, total, outcome }` |
| `voteState` | `{ question, options[], counts, deadline }` |
| `npcDialogue` | `{ npcId, name, portrait, text, options[] }` |
| `sessionEnded` | `{ summary: { xp, loot[], decisions[] } }` |

**Standard Intents the Client Sends:**

| Intent | Payload |
|--------|---------|
| `joinSession` | `{ code, playerName }` |
| `selectCharacter` | `{ characterId }` |
| `readyUp` | `{}` |
| `skipIntro` | `{}` |
| `chooseAction` | `{ actionKey, targets[] }` |
| `castSpell` | `{ spellId, targets[], slotLevel }` |
| `endTurn` | `{}` |
| `vote` | `{ optionIndex }` |
| `openCharacterSheet` | `{}` |
| `closeCharacterSheet` | `{}` |
| `selectNpcOption` | `{ npcId, optionIndex }` |

---

## MockApi Contract

The `MockApi` simulates REST calls for session validation.

```js
// packages/client/src/testing/MockApi.js

export class MockApi {
  constructor(fixtures = {}) { this.fixtures = fixtures; }

  async get(path) { /* return fixture or throw 404 */ }
  async post(path, body) { /* return fixture or throw error */ }

  // Pre-configured responses
  static withSession(code, session) { /* returns MockApi instance with session fixture */ }
  static withError(path, status, message) { /* returns MockApi instance that errors on path */ }
}
```

**Endpoints used by client:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions/join` | Validate session code, get session metadata |
| `GET` | `/api/characters/:id` | Fetch full character data |
| `GET` | `/api/sessions/:id/summary` | Fetch session end summary |

---

## Bootstrap Steps

```bash
# From monorepo root
cd packages/client

# 1. Initialize package
npm init -y
# Set: "name": "@dnd-platform/client", "type": "module", "private": true

# 2. Add Vite + React
npm install --save-dev vite @vitejs/plugin-react
npm install react react-dom

# 3. Add Vitest
npm install --save-dev vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event

# 4. Add Playwright
npm install --save-dev @playwright/test
npx playwright install chromium

# 5. Configure vite.config.js
# (see template in instructions/frontend-react-skills.md)

# 6. Create src/App.jsx + src/main.jsx stubs

# 7. Write first test (The Gate screen)
# packages/client/src/screens/TheGate/TheGate.test.jsx

# 8. Run tests
npm test
```

### `package.json` scripts:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test"
  }
}
```

---

## File Structure to Build Toward

```
packages/client/
  src/
    screens/
      TheGate/
        TheGate.jsx
        TheGate.test.jsx
      CharacterSelect/
      SessionLobby/
      BookIntro/
      Exploration/
      GroupVote/
      Combat/
        CombatHexCanvas.jsx
        CombatHexCanvas.test.jsx
        CombatHUD.jsx
        CombatHUD.test.jsx
        DiceArena.jsx
        DiceArena.test.jsx
      CharacterSheet/
      SessionEnd/
    components/
      RollBar/
      NpcDialogue/
      VotePanel/
    hooks/
      useGateway.js
      useGateway.test.js
      useCombatState.js
      useCombatState.test.js
    testing/
      MockGateway.js
      MockApi.js
      fixtures/
        default-combat.json
        default-session.json
    App.jsx
    main.jsx
  tests/
    e2e/
      the-gate.spec.js
      session-flow.spec.js
      combat-flow.spec.js
  vite.config.js
  package.json
  README.md
```

---

## Definition of Done

The client package is **done** when:

- [ ] All 10 screens exist and render without errors
- [ ] Every screen has unit tests using MockGateway/MockApi
- [ ] All screen transitions have Playwright E2E tests
- [ ] `npm test` passes with ≥ 80% coverage
- [ ] `npm run build` produces a valid static bundle
- [ ] Runs on mobile viewport (375px) without horizontal scroll
- [ ] Zero direct imports from `@dnd-platform/combat` or `@dnd-platform/content`
- [ ] CombatHexCanvas supports touch events (tap to move, tap to target)
- [ ] DiceArena animations are `prefers-reduced-motion` aware

---

## Related Files

- `instructions/frontend-react-skills.md` — Vite + React setup patterns
- `instructions/combat-token-gui.md` — Combat UI art rules
- `instructions/application-architecture.md` — Monorepo layer rules
- `packages/combat/README.md` — Combat engine API reference

---

*This document was written by Sis on 2026-03-16. If you're reading this, the combat and content packages are proven and tested. The client is yours to build. Go make it real.*
