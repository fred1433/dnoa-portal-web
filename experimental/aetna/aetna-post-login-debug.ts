import { chromium, BrowserContext } from 'playwright';
import * as path from 'path';
import * as os from 'os';

async function debugPostLogin() {
  console.log('🔍 AETNA POST-LOGIN DEBUG\n');
  
  // Use same stealth profile
  const userDataDir = path.join(os.homedir(), '.aetna-scraper-profile');
  
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 100,
    channel: 'chrome',
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  // Should already be logged in from previous run
  console.log('📋 Going to Aetna home...');
  await page.goto('https://www.aetna.com/provweb/', { waitUntil: 'networkidle' });
  
  // Wait a bit for any redirects
  await page.waitForTimeout(3000);
  
  // Take screenshot
  await page.screenshot({ path: 'aetna-after-login.png' });
  console.log('📸 Screenshot saved as aetna-after-login.png');
  
  console.log('\n🔍 Current URL:', page.url());
  
  // Look for links
  console.log('\n🔍 Looking for navigation links:');
  const links = await page.locator('a').all();
  console.log(`Found ${links.length} links`);
  
  // Find links with "Eligibility" or "Benefits" text
  for (const link of links) {
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    if (text && (text.includes('Eligibility') || text.includes('eligibility') || text.includes('Benefits') || text.includes('Search'))) {
      console.log(`  ✨ "${text.trim()}" -> ${href}`);
    }
  }
  
  console.log('\n⏸️  Keeping browser open. Press Ctrl+C to exit.');
}

debugPostLogin().catch(console.error);