# @dnd-platform/gateway — Real-Time WebSocket Hub

## Purpose

The gateway manages persistent bidirectional connections between clients and server packages. It is a message router — it does not contain game logic. It authenticates connections, manages rooms (one per game session), routes messages between clients and the appropriate server package, and handles reconnection.

## Owns

- **Connection Management**: Persistent WebSocket connections with heartbeat/keepalive.
- **Room Management**: Each game session is a room. Players join on session start, leave on disconnect or session end.
- **Message Routing**: Routes player actions to `dm/` or `combat/` and broadcasts server responses back to the room.
- **Channel Multiplexing**: Within a room, messages have channels:
  - `narration` — DM → all players (book pages, scene descriptions)
  - `combat` — DM/combat engine ↔ all players (combat state updates, action menus)
  - `chat` — All ↔ all (player chat, voice transcriptions)
  - `private` — DM ↔ one player (private action responses, secret information)
  - `vote` — DM → all, players → DM (group decision voting)
- **Reconnection**: When a player disconnects, their room slot remains. On reconnect, send current state snapshot + missed events. Automated stand-in behavior kicks in during absence (dodge in combat, hang back otherwise).
- **WebRTC Signaling**: Relays ICE candidates and SDP offers/answers between clients for peer-to-peer voice chat setup. Does NOT relay voice data — that goes directly between browsers.
- **JWT Validation**: Verifies JWTs (issued by `api/`) on connection. Rejects unauthenticated connections.

## Does Not Own

- Game state or logic (that's `dm/` and `combat/`)
- User accounts or auth issuance (that's `api/`)
- Narration content (that's `dm/`)
- Combat mechanics (that's `combat/`)
- UI (that's `client/`)

## Dependencies

**None.** The gateway imports nothing from other packages. It validates JWTs using a shared secret or public key configured via environment variable.

## Message Protocol

All messages are JSON with this envelope:

```json
{
  "channel": "narration|combat|chat|private|vote",
  "type": "specific_event_type",
  "payload": { ... },
  "timestamp": "ISO-8601",
  "senderId": "user-id or 'dm' or 'system'"
}
```

### Client → Server Messages
| Channel | Type | Description |
|---|---|---|
| `private` | `player_action` | Player sends action to DM ("I search for footprints") |
| `combat` | `combat_action` | Player submits combat action (from TurnMenu) |
| `combat` | `dice_result` | Player provides dice roll result |
| `chat` | `message` | Chat message to the group |
| `vote` | `vote_response` | Player votes on a group decision |

### Server → Client Messages
| Channel | Type | Description |
|---|---|---|
| `narration` | `book_page` | DM sends a book page (text + image URL + speech) |
| `narration` | `scene_transition` | Scene change with description and anchor image |
| `combat` | `state_update` | Combat state changed (HP, position, conditions) |
| `combat` | `turn_menu` | Current player's legal action options |
| `combat` | `dice_request` | Server needs the player to roll dice |
| `private` | `dm_response` | DM responds to a player's private action |
| `vote` | `vote_request` | DM initiates a group vote |
| `vote` | `vote_result` | Vote concluded, outcome announced |
| `chat` | `message` | Chat message broadcast |

## Structure

```
src/
  index.js              ← WebSocket server setup
  rooms/
    RoomManager.js      ← Create/destroy rooms, track membership
    Room.js             ← Single room: members, state, event buffer
  routing/
    MessageRouter.js    ← Routes incoming messages to the right handler/service
  auth/
    JwtValidator.js     ← Validates JWT on connection
  reconnection/
    StateRecovery.js    ← Builds state snapshot + missed events for reconnecting client
  signaling/
    WebRTCSignaling.js  ← Relays ICE/SDP for voice chat setup
__tests__/
```

## Testing

- Connection: connect, disconnect, heartbeat timeout, invalid JWT rejection
- Rooms: create, join, leave, destroy, member listing
- Routing: messages reach correct handlers based on channel
- Reconnection: state snapshot accuracy, missed event replay, automated stand-in activation
- Signaling: ICE relay, SDP relay, peer connection lifecycle
- Load: concurrent connections, concurrent rooms, message throughput
