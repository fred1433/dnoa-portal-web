import { chromium } from 'playwright';
import * as fs from 'fs';

console.log(`
🔌 AETNA - CONNEXION À CHROME EXISTANT
======================================

1. D'abord, ferme Chrome complètement

2. Relance Chrome avec debugging activé :
   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222

3. Connecte-toi manuellement à Aetna dans ce Chrome

4. Une fois connecté, lance ce script dans un autre terminal :
   npx tsx src/aetna-connect-existing.ts

`);

async function connectToExistingChrome() {
  try {
    // Connect to existing Chrome instance
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('✅ Connected to existing Chrome');
    
    const contexts = browser.contexts();
    const page = contexts[0].pages()[0];
    
    // Navigate to eligibility if not already there
    const url = page.url();
    if (!url.includes('aetna.com')) {
      console.log('📋 Navigating to Aetna...');
      await page.goto('https://www.aetna.com/provweb/');
    }
    
    console.log('🎯 Current URL:', page.url());
    console.log('Ready to scrape! The browser is under Playwright control now.');
    
    // Continue with normal scraping...
    // await page.getByRole('link', { name: 'Search online Eligibility &' }).click();
    // etc...
    
  } catch (error) {
    console.error('❌ Could not connect. Make sure Chrome is running with --remote-debugging-port=9222');
    console.error(error);
  }
}

if (require.main === module) {
  connectToExistingChrome();
}