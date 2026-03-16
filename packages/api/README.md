# @dnd-platform/api — REST API Server

## Purpose

The REST API server handles all persistent CRUD operations, authentication, and serves as the database owner. Any data that needs to survive a server restart goes through here.

## Owns

- **Authentication**: Magic link email flow. User enters email → API generates token → emails link → user clicks → JWT issued. No passwords.
- **User Accounts**: Email, display name, preferences, auth tokens.
- **Characters**: Full character CRUD. Species, class, level, stats, inventory, status (level0/active/retired). Multiple characters per user.
- **Inventory Management**: Add, remove, merge items. Currency tracking. Equipment slots.
- **Stat Calculations**: Ability scores, modifiers, proficiency bonus, skill checks, saving throws, AC, HP — all derived from character data + `content/` rules.
- **Level-Up Operations**: Apply level-up choices (class features, ability score improvements, new spells, etc.) to character data.
- **Content Browsing**: Proxies `content/` package as REST endpoints for the client to browse species, classes, feats, spells, items, etc.
- **Session History**: Past session metadata, chapter records, game log archives.
- **Group Management**: Group CRUD, membership, scheduling.

## Does Not Own

- Real-time session state (that's `gateway/` + `dm/`)
- Game logic / rules engine (that's `combat/`)
- AI / narration / story (that's `dm/`)
- World simulation (that's `world/`)
- UI (that's `client/`)

## Dependencies

- `@dnd-platform/content` — Reference data for validation (is this a valid species? does this spell exist?)

## Key Architectural Rules

1. **Database owner.** All persistent state lives here. Other packages do not directly access the database.
2. **Thin routes.** Routes extract params, call services, format responses. No business logic in route handlers.
3. **Services are testable in isolation.** No database required for unit tests — use in-memory mocks or dependency injection.
4. **JWT is the auth token.** Issued on magic link verification. Sent with every request. Gateway validates JWTs issued by this service.

## API Surface

### Auth
- `POST /api/auth/request-link` — Send magic link to email
- `POST /api/auth/verify` — Verify magic link token, return JWT
- `GET /api/auth/me` — Get current user from JWT

### Characters
- `GET /api/characters` — List user's characters
- `POST /api/characters` — Create new character (Level 0)
- `GET /api/characters/:id` — Get character details
- `PUT /api/characters/:id` — Update character (Level 0 = full edit, Level 1+ = restricted)
- `POST /api/characters/:id/lock-in` — Lock in character, level up to 1
- `POST /api/characters/:id/level-up` — Apply level-up choices
- `DELETE /api/characters/:id` — Retire/delete character

### Inventory
- `GET /api/characters/:id/inventory` — Get inventory
- `POST /api/characters/:id/inventory` — Add item
- `DELETE /api/characters/:id/inventory/:itemId` — Remove item

### Content (proxied from content package)
- `GET /api/content/species`, `/classes`, `/feats`, `/spells`, `/items`, `/creatures`, `/conditions`

### Groups
- `GET /api/groups` — Browse groups
- `POST /api/groups` — Create group
- `POST /api/groups/:id/join` — Join group
- `POST /api/groups/:id/leave` — Leave group

### Sessions
- `GET /api/sessions` — List past sessions for a group
- `GET /api/sessions/:id/chapter` — Get generated chapter
- `GET /api/sessions/:id/log` — Get raw game log

## Structure

```
src/
  index.js            ← Express app setup
  routes/
    auth.js           ← Authentication endpoints
    characters.js     ← Character CRUD
    inventory.js      ← Inventory management
    content.js        ← Content browsing (proxy)
    groups.js         ← Group management
    sessions.js       ← Session history
  services/
    AuthService.js    ← Magic link generation, JWT issuance/verification
    CharacterService.js ← Character CRUD logic, validation
    InventoryService.js ← Item management, currency
    GroupService.js   ← Group membership, scheduling
  models/             ← Database schemas (Mongoose or equivalent)
  middleware/
    auth.js           ← JWT verification middleware
__tests__/
```

## Testing

- Auth: magic link generation, token verification, JWT creation/validation, expired tokens
- Character CRUD: create, read, update, delete, validation, Level 0 vs 1+ restrictions
- Inventory: add, remove, merge, currency math, capacity limits
- Stat calculations: ability modifiers, proficiency, AC, skill checks
- Level-up: valid/invalid choices, feature application, spell slot progression
- API routes: HTTP status codes, request/response shapes, auth middleware
