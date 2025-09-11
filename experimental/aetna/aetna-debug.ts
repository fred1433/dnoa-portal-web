import { chromium } from 'playwright';

async function debug() {
  console.log('🔍 AETNA DEBUG - Checking what we see on the page\n');
  
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100
  });
  
  const page = await browser.newContext().then(ctx => ctx.newPage());
  
  console.log('📋 Going to Aetna login page...');
  await page.goto('https://www.aetna.com/provweb/', { waitUntil: 'networkidle' });
  
  // Take screenshot
  await page.screenshot({ path: 'aetna-login-page.png' });
  console.log('📸 Screenshot saved as aetna-login-page.png');
  
  // Check what's on the page
  console.log('\n🔍 Looking for login elements:');
  
  // Check all input fields
  const allInputs = await page.locator('input').all();
  console.log(`Found ${allInputs.length} input fields`);
  
  for (let i = 0; i < allInputs.length; i++) {
    const input = allInputs[i];
    const name = await input.getAttribute('name');
    const id = await input.getAttribute('id');
    const type = await input.getAttribute('type');
    const placeholder = await input.getAttribute('placeholder');
    console.log(`  Input ${i+1}: name="${name}", id="${id}", type="${type}", placeholder="${placeholder}"`);
  }
  
  // Check all buttons
  const allButtons = await page.locator('button').all();
  console.log(`\nFound ${allButtons.length} buttons`);
  
  for (let i = 0; i < allButtons.length; i++) {
    const button = allButtons[i];
    const text = await button.textContent();
    console.log(`  Button ${i+1}: "${text?.trim()}"`);
  }
  
  // Check for iframes (captcha might be in iframe)
  const iframes = await page.locator('iframe').all();
  console.log(`\nFound ${iframes.length} iframes`);
  
  console.log('\n⏸️  Keeping browser open for inspection. Press Ctrl+C to exit.');
}

debug().catch(console.error);