// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Combat HUD E2E Tests
 * 
 * Verifies:
 * 1. Combat simulator loads and fills the viewport
 * 2. Toolbar buttons are present and visible (not zero-width)
 * 3. Hex viewport is rendered
 * 4. Portrait area is rendered
 * 5. DiceRollBar is visible at the bottom
 * 6. Combat log panel is present
 * 7. Toolbar buttons are clickable when session is active
 */

test.describe('Combat Simulator HUD', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and enter combat simulator
    await page.goto('/');
    
    // Click the combat simulator button
    const combatBtn = page.getByText('Enter Combat Simulator');
    await expect(combatBtn).toBeVisible({ timeout: 10000 });
    await combatBtn.click();

    // Wait for combat viewer to appear
    await expect(page.locator('[data-testid="combat-viewer"]')).toBeVisible({ timeout: 15000 });
    
    // Wait for session to initialize (combat log or HUD should appear)
    await page.waitForTimeout(3000);
  });

  test('combat viewer fills the viewport', async ({ page }) => {
    const viewer = page.locator('[data-testid="combat-viewer"]');
    const box = await viewer.boundingBox();
    expect(box).not.toBeNull();
    
    const viewport = page.viewportSize();
    if (!box || !viewport) return; // type guard
    // Should fill most of the viewport (allowing small margins)
    expect(box.width).toBeGreaterThan(viewport.width * 0.95);
    expect(box.height).toBeGreaterThan(viewport.height * 0.95);
  });

  test('HUD SVG frame is rendered and visible', async ({ page }) => {
    const hudSvg = page.locator('.hud__svg');
    await expect(hudSvg).toBeVisible();
    
    const box = await hudSvg.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(100);
  });

  test('all 9 toolbar buttons are present in the DOM', async ({ page }) => {
    const buttons = [
      'toolbar-btn-move',
      'toolbar-btn-attack',
      'toolbar-btn-spell',
      'toolbar-btn-loot',
      'toolbar-btn-dash',
      'toolbar-btn-dodge',
      'toolbar-btn-bonus',
      'toolbar-btn-react',
      'toolbar-btn-end',
    ];

    for (const testId of buttons) {
      const btn = page.locator(`[data-testid="${testId}"]`);
      await expect(btn).toBeAttached({ timeout: 5000 });
    }
  });

  test('toolbar buttons have non-zero dimensions', async ({ page }) => {
    // Each toolbar button group contains a rect — verify it has real width
    const buttons = [
      'toolbar-btn-move',
      'toolbar-btn-attack',
      'toolbar-btn-spell',
      'toolbar-btn-end',
    ];

    for (const testId of buttons) {
      const rect = page.locator(`[data-testid="${testId}"] rect`);
      await expect(rect).toBeAttached({ timeout: 5000 });
      
      const width = await rect.getAttribute('width');
      const widthNum = parseFloat(width || '0');
      expect(widthNum, `${testId} rect width should be > 10`).toBeGreaterThan(10);
    }
  });

  test('toolbar buttons are positioned within the viewport', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport) return;

    // Check a few key buttons are within viewport bounds
    const btnEnd = page.locator('[data-testid="toolbar-btn-end"]');
    await expect(btnEnd).toBeAttached();
    
    const rect = btnEnd.locator('rect');
    const x = parseFloat(await rect.getAttribute('x') || '0');
    const y = parseFloat(await rect.getAttribute('y') || '0');
    const w = parseFloat(await rect.getAttribute('width') || '0');
    
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(viewport.width);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(viewport.height);
  });

  test('DiceRollBar is visible at the bottom', async ({ page }) => {
    // DiceRollBar has "Click a die to roll" text
    const rollBar = page.getByText('Click a die to roll');
    await expect(rollBar).toBeVisible({ timeout: 10000 });
  });

  test('combat log panel is present', async ({ page }) => {
    const log = page.locator('[data-testid="combat-log"]');
    await expect(log).toBeVisible({ timeout: 10000 });
  });

  test('hex canvas is rendered', async ({ page }) => {
    // The hex canvas is a canvas element inside CombatHexCanvas
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10000 });
    
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThan(200);
  });

  test('exit button is visible and positioned on screen', async ({ page }) => {
    const exitBtn = page.getByText('Exit Combat Simulator');
    await expect(exitBtn).toBeVisible();
    
    const box = await exitBtn.boundingBox();
    expect(box).not.toBeNull();
    // Should be in top-left area since we moved it
    const viewport = page.viewportSize();
    if (!box || !viewport) return;
    expect(box.x).toBeLessThan(viewport.width * 0.5); // left side
    expect(box.y).toBeLessThan(100);
  });

  test('clicking exit returns to main page', async ({ page }) => {
    const exitBtn = page.getByText('Exit Combat Simulator');
    await exitBtn.click();
    
    // Should see the gate/main page again
    await expect(page.getByText('Enter Combat Simulator')).toBeVisible({ timeout: 10000 });
  });

  test('end turn button is clickable when session active', async ({ page }) => {
    // Wait for server menu to be ready
    const hud = page.locator('[data-server-menu="ready"]');
    await expect(hud).toBeVisible({ timeout: 15000 });

    const endBtn = page.locator('[data-testid="toolbar-btn-end"]');
    await expect(endBtn).toBeAttached();
    
    // Click end turn — should trigger turn change
    await endBtn.click();
    
    // Combat log should have new entries after ending turn
    await page.waitForTimeout(2000);
    const logEntries = page.locator('[data-testid="log-entry"]');
    const count = await logEntries.count();
    expect(count).toBeGreaterThan(0);
  });
});
