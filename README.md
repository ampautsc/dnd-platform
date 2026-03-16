# D&D Virtual World Platform

A multiplayer, AI-powered D&D 5e platform where a Virtual DM guides adventuring parties through a living, persistent world. Players create characters, form groups, and embark on weekly adventures — narrated as the pages of a book being written in real time.

## Vision

D&D is collaborative storytelling guided by a DM. This platform enhances that core experience with digital tools — not replaces it. The Virtual DM's job is singular: **take our adventurers on a fantastic journey** where everyone feels great about their role on the team and how they contribute to the group's success.

## Architecture

Monorepo with 7 packages, each with a clear single responsibility:

```
dnd-platform/
  packages/
    content/     ← Shared D&D reference data library (spells, creatures, species, items, classes)
    combat/      ← Combat engine (immutable GameState, zero-trust TurnMenu, step-by-step dice)
    api/         ← REST API server (auth, users, characters, inventory, session history)
    gateway/     ← Real-time WebSocket hub (rooms, reconnection, voice signaling)
    dm/          ← Virtual DM brain (story engine, narration, NPC dialogue, scene management)
    world/       ← World simulation (background tick, NPC schedules, villain storylines, downtime)
    client/      ← Thin mobile-first PWA (visualization + user controls only, zero game logic)
```

### Package Dependency Graph

```
content ← combat ← dm → world
content ← api
content ← client (types only)
gateway (routes messages between client ↔ dm, client ↔ combat)
```

## User Experience Flow

### 1. The Gate
A guard character asks "Who goes there?" — single email input field. Submit → magic link emailed → click to authenticate. No passwords.

### 2. Character Select
See your characters as cards (portrait, name, class, level). Create a new one or select existing.

### 3. Level 0 — The Starter Town
Full character creation happens in-world. Everything editable in real-time: species, class, stats, appearance, name. Movement restricted to the starter town (practice areas, training dummies, tutorial NPCs). "Lock In" → level up to Level 1, enter the persistent world. Irreversible.

### 4. Looking for Group
Level 1+ characters browse or create groups (3-6 adventurers) with a weekly session time.

### 5. Session Lobby
Group members assemble. "Start Session" when enough are present. Absentees run downtime activities.

### 6. Session Start — The Book
Pages of a book animate on screen — text + illustrations + the DM's voice reading aloud. This is the "Previously on..." intro. Final page is blank, DM says "Further adventure awaits...", pages fade, the scene resolves into the current location.

### 7. Active Play — Exploration & Social
- Anchor image showing current location
- Group chat (voice transcribed to text, text readable aloud)
- Each player has a **private DM channel** for official game actions (rolls, investigations, etc.)
- Player actions that affect the group are broadcast by the DM
- Actions that would split the party trigger a DM warning/confirmation
- NPC conversations in a dedicated interaction panel

### 8. Group Decisions
Any player can propose a group action → DM sends vote to all → majority rules → DM narrates the transition with new book pages.

### 9. Combat
DM triggers combat → hex map combat HUD with initiative, action bar, dice arena. The v2 combat engine (immutable GameState, zero-trust action validation, step-by-step dice resolution) drives all mechanics. Enemy turns use AI tactics with dramatic narration. Combat ends → loot → DM narrates aftermath → back to exploration.

### 10. Session End
DM wraps with closing narration (book pages). Chapter written from game log. XP/rewards distributed. World clock advances.

### 11. Between Sessions
World ticks forward. Downtime activity benefits applied. Villain storylines advance. Players can browse character sheets and past chapters anytime via REST API.

## Key Design Principles

1. **Thin UI** — The client renders and captures input. All game logic lives in server packages.
2. **The DM is the brain** — Every narrative decision, scene transition, and action interpretation flows through `dm/`.
3. **Combat engine is the crown jewel** — Immutable state, zero-trust validation, comprehensive D&D 5e mechanics. Preserve and extend, never rewrite.
4. **Game log is source of truth** — Every action, roll, narration, and decision is a timestamped event. Chapters are generated from logs. Sessions can be replayed. Reconnection replays missed events.
5. **Provider-agnostic AI** — LLM provider interface supports Claude, GPT, Gemini, local models. Never couple to one vendor.
6. **AI-generated images per scene** — The DM generates image prompts for narrative moments. Images are generated asynchronously via pluggable image service.
7. **Test-driven development** — No code without tests. Requirements → tests → implementation. Always.

## Tech Stack

- **Language**: JavaScript/TypeScript across all packages
- **Client**: React + Vite, mobile-first PWA
- **Server**: Express (or Fastify), MongoDB
- **Real-time**: WebSocket with rooms (Socket.io or equivalent)
- **Voice**: WebRTC peer-to-peer (signaled through gateway)
- **AI**: Provider-agnostic LLM interface (Claude, GPT, Gemini, local GGUF)
- **Testing**: Vitest (unit), Playwright (E2E)
- **Build**: npm workspaces

## Getting Started

```bash
npm install          # Install all workspace dependencies
npm test             # Run all package tests
npm run dev          # Start development servers
```

## Existing Code

This project inherits production-quality code from the `dnd-builder` prototype:
- **Combat Engine v2**: ~5,000 lines covering attacks, spells, AoE, polymorph, concentration, conditions, reactions, step-by-step dice
- **NPC Consciousness System**: 32 deeply-written NPCs with personality evolution, encounter memory, inner monologues
- **Combat AI**: Intelligence-tiered decision engine with rule-based and LLM-based strategies
- **LLM Provider Abstraction**: Claude API, local GGUF (node-llama-cpp), and mock providers
- **45+ Test Files**: Unit tests, engine tests, E2E Playwright specs
