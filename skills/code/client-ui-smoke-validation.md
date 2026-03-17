# Client UI Smoke Validation

## Category
code

## Tags
#client #ui #validation #vite #playwright #testing #screens #tdd #react

## Description
A repeatable workflow to validate that client UI changes are correct at three levels: unit tests, browser smoke test, and live HTTP health check. Also covers building testable multi-screen React flows with TDD.

## Prerequisites
- Client package has `vitest` tests and Playwright configured.
- Dependencies are installed.
- A target client route/page exists for smoke assertions.
- `exclude: ['e2e/**', 'node_modules/**']` in vite.config.js test section (prevents Playwright files from running under vitest).

## Steps
1. **Test infrastructure**: Create MockGateway (WebSocket sim), MockApi (REST sim), context providers (useGateway, useApi).
2. **Screen state machine**: `useScreen()` hook with navigate(screen, data) — avoids router library for <= 10 screens.
3. **Write ALL screen tests before implementation**: Each screen gets `.test.jsx` with 3-6 tests covering render, callbacks, edge states (loading, empty, disabled).
4. **Implement screens to pass tests**: Minimal JSX, mobile-first (44px touch targets), no game logic.
5. **Wire screens into App.jsx router**: Parent owns headings, screens own content. Demo fixtures for local dev.
6. **Fix text collisions**: Use exact strings for status text, unique substrings for buttons.
7. Run client unit tests (`npx vitest run`) from `packages/client`.
8. Run Playwright smoke test (`npx playwright test`) from `packages/client`.
9. Validate server health with `Invoke-WebRequest` status check on dev server port.
10. If a step fails, fix that step before moving to the next.

## Examples
- Text collision fix: `screen.getByText(/✓ Ready/)` instead of `screen.getByText(/ready/i/)` when both status and button contain "ready".
- Parent heading pattern: App.jsx has `<h1>Session Lobby</h1>`, SessionLobby component has no heading — avoids "multiple elements" error.
- Demo fixture: `const DEMO_CHARACTERS = [{ id: 'c1', name: 'Aria', class: 'Wizard', level: 5 }]`
- Screen state: `const { screen, screenData, navigate } = useScreen()` → `navigate(SCREENS.LOBBY, { code })`
- E2E full flow: Playwright test fills gate form → selects character → readies up → explores → votes → ends → plays again.

## Common Pitfalls
- **Duplicate headings**: screen component has h2, parent App has h1 with same text → `getByRole('heading')` fails with "multiple elements". Solution: parent owns headings.
- **Loose regex matchers**: `/ready/i` matches status text AND button text. Use exact text or unique substrings.
- **Playwright picked up by vitest**: exclude `e2e/` in vite test config.
- **setTimeout in components**: use `waitFor` with explicit timeout in tests for auto-advancing screens.
- Running `npm run dev` from repo root in a monorepo (starts placeholder script, not the client app).
- Treating static test pass as proof without checking live server HTTP response.

## Related Skills
- `skills/code/service-health-verification.md`
- `skills/code/dm-mvp-tests-first-bootstrap.md` — TDD workflow pattern
- `skills/problem-solving/task-decomposition.md`
