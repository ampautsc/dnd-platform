import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    console.log("Navigating to http://localhost:5173...");
    await page.goto("http://localhost:5173");
    
    console.log("Looking for 'Enter Combat Simulator'...");
    await page.click("text=Enter Combat Simulator");

    console.log("Clicked! Waiting 3 seconds...");
    await page.waitForTimeout(3000);
    
    const hasDiceBox = await page.evaluate(() => !!document.querySelector("#dice-box-canvas"));
    console.log("Dice Box Canvas exists:", hasDiceBox);
    
    const elements = await page.evaluate(() => {
      const flyoutItems = Array.from(document.querySelectorAll(".hud-radial-flyout-item"));
      const buttons = Array.from(document.querySelectorAll("button"));
      return {
        flyoutItems: flyoutItems.map(el => ({ text: el.textContent, className: el.className })),
        buttons: buttons.map(el => ({ text: el.textContent, className: el.className }))
      };
    });
    
    console.log("Elements matching .hud-radial-flyout-item:", elements.flyoutItems);
    console.log("Buttons present on page:", elements.buttons);
    
    const storageObj = await page.evaluate(() => JSON.stringify(sessionStorage));
    console.log("sessionStorage:", JSON.parse(storageObj || "{}"));
    
  } catch (err) {
    console.error("Playwright error:", err);
  } finally {
    await browser.close();
  }
}

run();