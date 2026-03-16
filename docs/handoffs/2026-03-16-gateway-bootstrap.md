# Gateway Package Bootstrap Handoff
**Date:** 2026-03-16  
**From:** Sis (migration agent)  
**To:** Whoever picks up the `packages/gateway/` work

---

## Critical Orientation — Read This First

The source code for the full platform lives in a **different repository** on this machine:

```
C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\
```

The new package lives at:

```
C:\Users\ampau\source\dnd-platform\packages\gateway\
```

**The Copilot assistant working in `dnd-platform` will not automatically see or know about `dnd-builder`.**

Important: The gateway is **mostly greenfield**. dnd-builder did not have a dedicated WebSocket gateway — real-time communication was handled inline in Express routes with `socket.io`. The architecture has been redesigned into a clean standalone hub.

---

## Current State

| Package | Status | Tests |
|---------|--------|-------|
| `@dnd-platform/content` | ✅ Complete | 744 |
| `@dnd-platform/combat` | ✅ Complete | 516 |
| `@dnd-platform/gateway` | 🔲 Stub | 0 |

Head commit: `8553bac`

---

## What This Package Is

The real-time WebSocket hub. It **routes messages** — it contains **zero game logic**. Clients connect here. The `dm/` and `combat/` packages send events here to be delivered. The gateway authenticates connections via JWT, manages session rooms, handles reconnection, and relays WebRTC signaling for voice chat.

Full architecture spec: `packages/gateway/README.md`

---

## Source to Reference (dnd-builder — NOT migrate, only inform design)

These files in dnd-builder show how socket.io was used inline. Use them to understand the event patterns, not as code to copy.

All paths relative to `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\`:

| Source File | What to Learn From It |
|-------------|----------------------|
| `routes/combat-sessions.js` | What events were emitted during combat (`combatState`, `turnMenu`, `rollResult`). Extract the socket.emit calls. |
| `routes/encounters.js` | NPC encounter events (`npcDialogue`, `encounterState`). Extract socket patterns. |
| `routes/parties.js` | Party/lobby events (`partyUpdate`, `playerJoined`). Extract socket patterns. |
| `index.js` | Socket.io setup, room joining, JWT verification pattern |

These show the **vocabulary** of events. The architecture is being redesigned but the event names and shapes are mostly right.

---

## The Full Message Protocol

This is defined in `packages/gateway/README.md`. Repeat it here for emphasis.

All messages are JSON:
```json
{
  "channel": "narration|combat|chat|private|vote",
  "type": "specific_event_type",
  "payload": { ... },
  "timestamp": "ISO-8601",
  "senderId": "user-id or 'dm' or 'system'"
}
```

### Client → Server
| Channel | Type | Description |
|---------|------|-------------|
| `private` | `player_action` | Player sends free-text action to DM |
| `combat` | `combat_action` | Player submits combat action (from TurnMenu) |
| `combat` | `dice_result` | Player provides dice roll result |
| `chat` | `message` | Chat message to group |
| `vote` | `vote_response` | Player votes on a group decision |

### Server → Client
| Channel | Type | Description |
|---------|------|-------------|
| `narration` | `book_page` | DM sends book page (text + image URL + speech) |
| `narration` | `scene_transition` | Scene change with description and anchor image |
| `combat` | `state_update` | Combat state changed (HP, position, conditions) |
| `combat` | `turn_menu` | Current player's legal action options |
| `combat` | `dice_request` | Server needs player to roll dice |
| `private` | `dm_response` | DM responds to player's private action |
| `vote` | `vote_request` | DM initiates a group vote |
| `vote` | `vote_result` | Vote concluded, outcome announced |
| `chat` | `message` | Chat message broadcast |

---

## Architecture Rules

1. **Zero game logic.** The gateway does NOT run combat, resolve actions, generate narration, or know what any message means. It routes.
2. **No imports from other packages.** The gateway imports nothing from `@dnd-platform/content`, `combat`, `dm`, `api`, or `world`. Zero.
3. **JWT validation only.** Validates JWT on connect using a shared secret/public key from env vars. Does not care what's inside the JWT beyond validity + user ID.
4. **Every room is a session.** One game session = one room. All clients in the session are in the room. DM is in the room.
5. **Reconnection is first-class.** A player disconnect does not drop their seat. On reconnect: send state snapshot + missed events.

---

## Dependency: Socket.io

Use `socket.io` for WebSocket management. It handles reconnection, rooms, namespaces, and heartbeats well.

```bash
npm install socket.io
npm install --save-dev vitest @vitest/coverage-v8
```

For testing socket.io without a live server, use `socket.io-mock` or test via the server's socket events directly (socket.io supports in-memory testing).

---

## Bootstrap Steps

```bash
cd packages/gateway

# 1. Init package
# Set: "name": "@dnd-platform/gateway", "type": "module", "private": true

# 2. Install socket.io
npm install socket.io

# 3. Install test deps
npm install --save-dev vitest @vitest/coverage-v8 socket.io-client

# 4. Write first test — JWT rejection test
# A connection with an invalid JWT must be rejected
# src/__tests__/auth.test.js

# 5. Write room creation test
# Creating a room, joining it, verifying membership
# src/__tests__/rooms.test.js
```

---

## TDD Order (suggested sequence)

1. `JwtValidator` — validates JWT format, signature, expiry (pure function)
2. `RoomManager` — create/destroy rooms, track members (pure state management)
3. `Room` — single room: add/remove members, event buffer (pure state)
4. `MessageRouter` — routes messages by channel to correct handler (pure routing logic)
5. Socket.io integration — connection accepts valid JWT, rejects invalid
6. `StateRecovery` — builds state snapshot + missed event replay
7. `WebRTCSignaling` — ICE/SDP relay between two connected peers

---

## Target File Structure

```
packages/gateway/
  src/
    index.js
    rooms/
      RoomManager.js
      Room.js
    routing/
      MessageRouter.js
    auth/
      JwtValidator.js
    reconnection/
      StateRecovery.js
    signaling/
      WebRTCSignaling.js
    __tests__/
      auth.test.js
      rooms.test.js
      routing.test.js
      reconnection.test.js
      signaling.test.js
  package.json
  README.md
```

---

## MockGateway (for other packages)

Once the gateway interface is defined, also create:

```
packages/gateway/src/testing/MockGateway.js
```

This is the mock that `client/` tests and `dm/` tests use instead of a live gateway. It was partially designed in the client handoff doc (`docs/handoffs/2026-03-16-client-bootstrap.md`). The gateway package owns the real implementation — create the MockGateway here and export it for other packages to import.

---

## Definition of Done

- [ ] `JwtValidator` rejects expired, invalid-signature, and malformed tokens
- [ ] `RoomManager` creates/destroys rooms with correct membership tracking
- [ ] Messages reach correct handlers based on channel
- [ ] Invalid JWT connection is rejected with `401` message before room join
- [ ] Player disconnect keeps room slot; reconnect delivers state snapshot + missed events
- [ ] ICE and SDP messages are relayed between correct peers
- [ ] `MockGateway` exported for use by other packages
- [ ] All tests pass without a live network connection
- [ ] `npm test` passes with ≥ 80% coverage

---

## Related Files

- `packages/gateway/README.md` — full architecture spec and message protocol
- `docs/handoffs/2026-03-16-client-bootstrap.md` — MockGateway contract expected by client
- Source (reference): `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\routes\combat-sessions.js`
- Source (reference): `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\routes\parties.js`
- Source (reference): `C:\Users\ampau\source\AiAssist\AiAssist\DnD\dnd-builder\server\index.js` (socket.io setup)

---

*Written by Sis on 2026-03-16. The gateway is the cleanest of the four remaining packages — it has no AI, no game logic, and no DB. It just routes. Build it cleanly.*
