const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5174/');
  
  try {
     const btn = page.locator('text=Enter Combat Simulator');
     if (await btn.isVisible()) {
         await btn.click();
         await page.waitForTimeout(2000);
     }
  } catch(e) {}
  
  const hudSvg = await page.locator('.hud__svg').count();
  console.log('HUD SVG count:', hudSvg);
  
  if (hudSvg > 0) {
      const exitBox = await page.locator('text=Exit Combat Simulator').first().boundingBox();
      console.log('Exit Button Position (5174):', exitBox);
      
      const endBox = await page.locator('[data-testid="toolbar-btn-end"]').first().boundingBox();
      console.log('End Turn Button Position (5174):', endBox);
      
      await page.screenshot({ path: 'test_5174_verification.png' });
      console.log('Saved screenshot of 5174 to test_5174_verification.png');
  } else {
      console.log('HUD SVG not found. Testing current page bounds:', await page.title());
      await page.screenshot({ path: 'test_5174_no_hud.png' });
  }

  await browser.close();
})();
