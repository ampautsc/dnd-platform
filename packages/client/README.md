# @dnd-platform/client — Thin Mobile-First PWA

## Purpose

The user interface. Visualization and user controls ONLY. Zero game logic. This is a thin client that renders what the server tells it and sends user inputs back. It must work well on mobile devices — that's the primary form factor.

## Owns

- **Rendering**: All visual presentation — book pages, combat HUD, character sheets, inventory, chat, dice, maps.
- **User Input Capture**: Touch/click/keyboard events, form inputs, voice input, drag-and-drop.
- **UI State**: Which panel is open, animation progress, scroll position, local preferences. NOT game state.
- **Progressive Web App**: Installable on mobile without app store. Offline capability for viewing cached character data.
- **Voice Chat**: WebRTC peer-to-peer audio between players. Signaling via the gateway.
- **Text-to-Speech**: DM narration rendered as audio (browser SpeechSynthesis API or cloud TTS).
- **Speech-to-Text**: Player voice transcribed to chat (browser SpeechRecognition API or cloud STT).
- **Dice Roller UI**: 3D dice animation for physical dice feel. Sends results to combat engine via gateway.

## Does Not Own

- Game logic (NO rule calculations, NO action validation, NO damage computation)
- Session state (receives it from gateway, doesn't manage it)
- Authentication (calls `api/` routes, stores JWT)
- Narration content (receives from gateway, renders it)
- NPC dialogue (receives from gateway, displays it)

## Dependencies

**None from other packages at runtime.** Communicates via:
- WebSocket connection to `gateway/` for all real-time session interactions
- REST calls to `api/` for CRUD operations (auth, characters, content browsing, history)

May import TypeScript types/interfaces from `@dnd-platform/content` for type safety during development.

## Key Architectural Rules

1. **Zero game logic.** If you're writing an `if` statement that checks D&D rules, it's in the wrong package.
2. **Server is the authority.** The combat TurnMenu tells the client what's legal. The client renders those options. It does NOT filter or augment them.
3. **Mobile-first.** Every screen must work on a phone. Touch targets, responsive layout, no hover-dependent interactions, minimal bandwidth.
4. **Graceful degradation.** If the WebSocket disconnects, show a reconnecting indicator. If an image hasn't loaded, show a placeholder. If voice fails, chat still works.

## Key Screens

### The Gate (Login)
- Guard character visual
- "Who goes there?" prompt
- Email input field → magic link flow
- Minimal, atmospheric, sets the tone

### Character Select
- Card grid of user's characters (portrait, name, class, level)
- "Create New Character" button
- Tap to select → navigate to character context

### Level 0 — Starter Town
- Full character editor (species, class, stats, appearance, name) — all real-time editable
- Starter town map (limited movement area)
- Practice areas, tutorial NPCs
- "Lock In" button (irreversible confirmation UX)

### Session Lobby
- Party member list (online/ready status)
- "Start Session" button (enabled when threshold met)
- Time-to-session countdown

### The Book (Narration)
- Animated book page turning
- Text + illustration on each page
- DM voice reading aloud (TTS)
- Auto-advance or manual page turning
- Fade to live scene on final page

### Active Play (Exploration/Social)
- Location anchor image
- Group chat / voice panel
- Private DM channel (slide-out or tab)
- NPC interaction panel
- Mini-map or location name

### Group Vote
- Overlay showing proposal
- Yes/No buttons
- Live vote tally
- Timeout indicator

### Combat HUD
- Hex map (canvas-based, pannable/zoomable on mobile)
- Initiative order bar
- Action bar (from TurnMenu)
- Dice roll area (3D dice animation)
- Entity cards (HP, conditions, portrait)
- Narration panel (combat narration)

### Character Sheet / Inventory
- Stats, skills, features, spells
- Inventory grid with item details
- Equipment slots
- Drag-and-drop or tap-to-equip

### Chapter Reader
- Book-style layout for past chapters
- Illustrations inline
- Session-by-session history

## Structure

```
src/
  main.tsx                ← App entry point
  App.tsx                 ← Router root
  pages/
    GatePage.tsx          ← Login
    CharacterSelectPage.tsx
    StarterTownPage.tsx   ← Level 0 character creation
    LobbyPage.tsx         ← Session lobby
    SessionPage.tsx       ← Active play (wraps Book, Exploration, Combat)
    ChapterReaderPage.tsx ← Past chapter browsing
    CharacterSheetPage.tsx
  components/
    book/                 ← Book page rendering, page turn animation
    combat/               ← Hex map, combat HUD components
    chat/                 ← Chat window, voice controls
    character/            ← Character sheet, inventory, stat display
    shared/               ← Buttons, inputs, modals, layout components
  hooks/
    useSession.ts         ← WebSocket session management
    useCombat.ts          ← Combat state from gateway
    useVoice.ts           ← WebRTC voice chat
    useSpeech.ts          ← TTS/STT
  services/
    apiClient.ts          ← REST API calls to api/
    socketClient.ts       ← WebSocket connection to gateway/
  types/                  ← TypeScript types (may reference content/ types)
__tests__/               ← Component tests
tests/e2e/               ← Playwright E2E specs
```

## Tech Stack

- React 18+ with TypeScript
- Vite (build and dev server)
- PWA (service worker, manifest, installable)
- @3d-dice/dice-box (3D dice animation)
- Canvas (hex map rendering)
- WebRTC (voice)
- Playwright (E2E testing)

## Testing

- Component tests: each component renders correctly with given props
- Hook tests: WebSocket connection, state management, reconnection
- E2E (Playwright): full user flows (login → character creation → session → combat → session end)
- Mobile viewport E2E: critical flows tested at mobile screen sizes
- Accessibility: keyboard navigation, screen reader compatibility
