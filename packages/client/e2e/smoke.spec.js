import { test, expect } from '@playwright/test';

test('loads The Gate screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /the gate/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /join session/i })).toBeVisible();
});

test('full flow: gate → character select → lobby → exploration → vote → end', async ({ page }) => {
  await page.goto('/');

  // 1. Fill in gate form and join
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
  await expect(page.getByRole('heading', { name: /the gate/i })).toBeVisible();
});
