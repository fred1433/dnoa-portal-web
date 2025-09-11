import { chromium, BrowserContext } from 'playwright';
import * as path from 'path';
import * as os from 'os';

async function fullFlowDebug() {
  console.log('🔍 AETNA FULL FLOW DEBUG - From login to post-login\n');
  
  // Use stealth profile
  const userDataDir = path.join(os.homedir(), '.aetna-scraper-profile');
  
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 100,
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });
  
  // Add anti-detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });
  
  const page = await context.newPage();
  
  console.log('📋 Step 1: Going to Aetna login page...');
  await page.goto('https://www.aetna.com/provweb/', { waitUntil: 'networkidle' });
  
  // Check if we need to login
  const hasUsernameField = await page.locator('input[name="USER"]').count() > 0;
  
  if (hasUsernameField) {
    console.log('📋 Step 2: Filling login form...');
    
    // Fill username
    await page.locator('input[name="USER"]').fill('SmileyTooth4771');
    
    // Fill password
    await page.locator('input[name="PASSWORD"]').fill('sdbTX4771!!');
    
    console.log('✅ Form filled');
    console.log('⚠️  MANUAL ACTION NEEDED: Please click "Log In" button in the browser');
    console.log('    (Waiting for you to solve any captcha if needed...)\n');
    
    // Wait for navigation after manual login
    try {
      await page.waitForURL((url) => !url.toString().includes('login'), { timeout: 120000 });
      console.log('✅ Login successful!');
    } catch (e) {
      console.log('⏱️  Timeout waiting for login');
    }
  } else {
    console.log('✅ Already logged in');
  }
  
  // Wait a bit for page to stabilize
  await page.waitForTimeout(3000);
  
  // Capture post-login state
  console.log('\n📋 Step 3: Capturing post-login state...');
  
  await page.screenshot({ path: 'aetna-post-login-full.png' });
  console.log('📸 Screenshot saved as aetna-post-login-full.png');
  
  console.log('🔍 Current URL:', page.url());
  
  // Look for navigation options
  console.log('\n🔍 Looking for eligibility/benefits links:');
  const links = await page.locator('a').all();
  
  for (const link of links) {
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    
    if (text) {
      const lowerText = text.toLowerCase();
      if (lowerText.includes('eligibility') || 
          lowerText.includes('benefit') || 
          lowerText.includes('member') ||
          lowerText.includes('search') ||
          lowerText.includes('patient')) {
        console.log(`  ✨ "${text.trim()}" -> ${href}`);
      }
    }
  }
  
  // Also check for buttons and menu items
  console.log('\n🔍 Looking for buttons/menu items:');
  const buttons = await page.locator('button, [role="button"], [role="menuitem"]').all();
  
  for (const button of buttons) {
    const text = await button.textContent();
    if (text) {
      const lowerText = text.toLowerCase();
      if (lowerText.includes('eligibility') || 
          lowerText.includes('benefit') || 
          lowerText.includes('search')) {
        console.log(`  🔘 "${text.trim()}"`);
      }
    }
  }
  
  console.log('\n⏸️  Browser remains open. Press Ctrl+C to exit.');
}

fullFlowDebug().catch(console.error);