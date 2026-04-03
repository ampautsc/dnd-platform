import { test, expect } from '@playwright/test';

test('loads The Gate screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /d&d platform/i })).toBeVisible();
  await expect(page.getByText(/join a game session/i)).toBeVisible();
});

test('full flow: gate → character select → lobby → exploration → vote → end', async ({ page }) => {
  await page.goto('/');

  // 1. Open the session form (collapsed in <details>) and fill it
  await page.getByText(/join a game session/i).click();
  await page.getByLabel(/session code/i).fill('DEMO');
  await page.getByLabel(/player name/i).fill('Tester');
  await page.getByRole('button', { name: /join session/i }).click();

  // 2. Character Select screen
  await expect(page.getByRole('heading', { name: /choose your champion/i })).toBeVisible();
  await expect(page.getByText('Aria Moonwhisper')).toBeVisible();
  await page.getByRole('button', { name: /select/i }).first().click();

  // 3. Session Lobby
  await expect(page.getByRole('heading', { name: /session lobby/i })).toBeVisible();
  await expect(page.getByText('DEMO')).toBeVisible();
  await page.getByRole('button', { name: /ready up/i }).click();

  // 4. Exploration — auto-advances after ready up (1s delay)
  await expect(page.getByRole('heading', { name: /adventure/i })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/dark cavern/i)).toBeVisible();

  // Click an action to trigger NPC dialogue
  await page.getByRole('button', { name: /enter the cavern/i }).click();
  await expect(page.getByText(/mysterious voice/i)).toBeVisible();

  // Click again to advance to vote
  await page.getByRole('button', { name: /investigate the voice/i }).click();

  // 5. Group Vote
  await expect(page.getByRole('heading', { name: /party decision/i })).toBeVisible();
  await page.getByRole('button', { name: /left/i }).click();

  // 6. Session End — auto-advances after voting (1.5s delay)
  await expect(page.getByRole('heading', { name: /session complete/i })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/the cavern of echoes/i)).toBeVisible();
  await expect(page.getByText(/450 xp/i)).toBeVisible();

  // Play again loops back to gate
  await page.getByRole('button', { name: /play again/i }).click();
  await expect(page.getByRole('heading', { name: /d&d platform/i })).toBeVisible();
});

test('Enter Bottoms Up opens free-chat tavern mode', async ({ page }) => {
  await page.goto('/');

  // The "Enter Bottoms Up" button should be visible on the gate screen
  const enterButton = page.getByRole('button', { name: /enter bottoms up/i });
  await expect(enterButton).toBeVisible();

  // Click it — should navigate to free-chat scene screen
  await enterButton.click();

  // Heading shows location name (initially "Tavern", then "Bottoms Up" once API returns)
  await expect(page.getByRole('heading', { name: /tavern|bottoms up/i })).toBeVisible({ timeout: 5000 });

  // Leave button should be present
  await expect(page.getByRole('button', { name: /leave/i })).toBeVisible({ timeout: 5000 });

  // Input should be always enabled in free-chat mode (placeholder text)
  await expect(page.getByPlaceholder(/say something at the bar/i)).toBeVisible({ timeout: 5000 });
});

test('ambient utterance in Bottoms Up shows NPC reactions', async ({ page }) => {
  // NOTE: Requires API server running on localhost:3000 with Groq key loaded.
  // 10 NPCs evaluated serially through Groq rate limiter (~2s each) = ~20-30s total.
  test.setTimeout(90_000);

  await page.goto('/');
  await page.getByRole('button', { name: /enter bottoms up/i }).click();

  // Wait for free-chat mode to load
  const input = page.getByPlaceholder(/say something at the bar/i);
  await expect(input).toBeVisible({ timeout: 10000 });

  // Type an utterance that should trigger NPC reactions
  await input.fill('Barkeep! Pour me your finest ale!');
  await page.keyboard.press('Enter');

  // Should see the player's message in transcript
  await expect(page.getByText('Barkeep! Pour me your finest ale!')).toBeVisible();

  // Wait for ambient reactions (API call to Groq + processing)
  // 10 NPCs × ~2s throttle = ~20-30s + API latency per call
  // Should see at least one NPC name reacting (Woody, Carza, etc.) or "nobody looks up"
  await expect(
    page.getByText(/looks up with interest|nobody looks up|★/i)
  ).toBeVisible({ timeout: 60000 });
});

test('Enter Combat Simulator button opens the viewer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /enter combat simulator/i }).click();
  await expect(page.getByRole('button', { name: /exit combat simulator/i })).toBeVisible();
});
