const { chromium } = require('playwright');
(async () => {
  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    await page.goto('http://localhost:5173');
    await page.click('text=Enter Combat Simulator');
    await page.waitForTimeout(2000); 
    
    const exitBox = await page.locator('text=Exit Combat Simulator').boundingBox();
    console.log('Exit Button Position:', exitBox);
    
    const endBox = await page.locator('[data-testid="toolbar-btn-end"]').boundingBox();
    console.log('End Turn Button Position:', endBox);
    
    await page.screenshot({ path: '../../docs/maps/combat_hud_verified.png' });
    console.log('Screenshot saved to docs/maps/combat_hud_verified.png');
    
    await browser.close();
  } catch(e) { console.error(e); process.exit(1); }
})();
