import { chromium, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

class AetnaRecorder {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private actions: string[] = [];
  
  async init() {
    console.log('🔧 Initializing recorder with stealth profile...');
    
    const userDataDir = path.join(os.homedir(), '.aetna-scraper-profile');
    
    this.context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      slowMo: 500, // Slower to see what's happening
      channel: 'chrome',
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
    
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      (window as any).chrome = {
        runtime: {},
      };
    });
    
    this.page = await this.context.newPage();
    
    // Set up event listeners to record actions
    this.setupRecording();
    
    console.log('✅ Recorder initialized');
    console.log('📝 Recording all your actions...\n');
  }
  
  private setupRecording() {
    if (!this.page) return;
    
    // Record clicks
    this.page.on('framenavigated', (frame) => {
      if (frame === this.page?.mainFrame()) {
        const url = frame.url();
        this.actions.push(`// Navigate to: ${url}`);
        this.actions.push(`await page.goto('${url}', { waitUntil: 'networkidle' });`);
      }
    });
    
    // Log console messages (helpful for debugging)
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('❌ Console error:', msg.text());
      }
    });
  }
  
  async recordWorkflow() {
    if (!this.page) throw new Error('Page not initialized');
    
    console.log('🚀 AETNA WORKFLOW RECORDER');
    console.log('===========================\n');
    console.log('📋 Instructions:');
    console.log('1. I will navigate to the Aetna login page');
    console.log('2. Complete the login manually if needed');
    console.log('3. Navigate through the eligibility flow');
    console.log('4. I will capture selectors at each step\n');
    
    // Step 1: Go to login page
    console.log('📍 Step 1: Navigating to Aetna login page...');
    await this.page.goto('https://www.aetna.com/provweb/', { waitUntil: 'networkidle' });
    
    // Check if already logged in
    const hasLoginForm = await this.page.locator('input[name="USER"]').count() > 0;
    
    if (hasLoginForm) {
      console.log('\n📝 Step 2: Filling login credentials...');
      await this.page.locator('input[name="USER"]').fill('SmileyTooth4771');
      await this.page.locator('input[name="PASSWORD"]').fill('sdbTX4771!!');
      
      console.log('\n⚠️  IMPORTANT: Click "Log In" button manually');
      console.log('   If captcha appears, solve it manually');
      console.log('   Waiting for successful login...\n');
      
      // Wait for navigation away from login
      try {
        await this.page.waitForURL((url) => !url.toString().includes('provweb/'), { timeout: 120000 });
        console.log('✅ Login successful!\n');
      } catch (e) {
        console.log('⏱️  Timeout waiting for login\n');
      }
    } else {
      console.log('✅ Already logged in\n');
    }
    
    // Step 3: Capture current page state
    await this.capturePageState('post-login');
    
    // Step 4: Look for disclaimer/continue button
    console.log('📍 Step 3: Checking for disclaimer page...');
    try {
      const continueButton = await this.page.locator('input[type="submit"][value="Continue"]').count();
      if (continueButton > 0) {
        console.log('   Found disclaimer page, clicking Continue...');
        await this.page.locator('input[type="submit"][value="Continue"]').click();
        await this.page.waitForLoadState('networkidle');
        await this.capturePageState('after-disclaimer');
      }
    } catch (e) {
      console.log('   No disclaimer page');
    }
    
    // Step 5: Find and click Eligibility & Benefits
    console.log('\n📍 Step 4: Looking for Eligibility & Benefits menu...');
    await this.findAndLogSelectors();
    
    console.log('\n📝 MANUAL NAVIGATION REQUIRED:');
    console.log('Please manually click through the workflow:');
    console.log('1. Click "Eligibility & Benefits" menu item');
    console.log('2. Select billing provider (Jennifer Chou)');
    console.log('3. Select payer (Aetna Dental)');
    console.log('4. Enter patient info:');
    console.log('   - Last Name: Stewart');
    console.log('   - First Name: Willow');
    console.log('   - DOB: 08/22/2018');
    console.log('   - Relationship: Child (19)');
    console.log('   - Member ID: W186119850');
    console.log('5. Click Continue to search');
    console.log('6. Click on subscriber (SCOTT STEWART)');
    console.log('7. Click "View Benefits"');
    console.log('\nPress Ctrl+C when done to save the recording\n');
    
    // Keep capturing states periodically
    const captureInterval = setInterval(async () => {
      const url = this.page?.url();
      if (url && url.includes('eligibility')) {
        await this.capturePageState('eligibility-page');
        clearInterval(captureInterval);
      }
    }, 5000);
  }
  
  private async capturePageState(name: string) {
    if (!this.page) return;
    
    const timestamp = Date.now();
    const screenshotPath = `aetna-${name}-${timestamp}.png`;
    await this.page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    
    // Capture HTML structure
    const htmlPath = `aetna-${name}-${timestamp}.html`;
    const html = await this.page.content();
    fs.writeFileSync(htmlPath, html);
    console.log(`📄 HTML saved: ${htmlPath}`);
  }
  
  private async findAndLogSelectors() {
    if (!this.page) return;
    
    console.log('\n🔍 Searching for selectors...\n');
    
    // Find menu items
    const menuItems = await this.page.locator('[id^="menuItem"]').all();
    console.log(`Found ${menuItems.length} menu items:`);
    for (let i = 0; i < menuItems.length; i++) {
      const text = await menuItems[i].textContent();
      const id = await menuItems[i].getAttribute('id');
      if (text?.includes('Eligibility') || text?.includes('Benefits')) {
        console.log(`  ✨ Menu item: #${id} -> "${text?.trim()}"`);
        this.actions.push(`// Click Eligibility & Benefits menu`);
        this.actions.push(`await page.locator('#${id} > a').click();`);
      }
    }
    
    // Find links
    const links = await this.page.locator('a').all();
    for (const link of links) {
      const text = await link.textContent();
      if (text && (text.includes('Eligibility') || text.includes('Benefits'))) {
        const href = await link.getAttribute('href');
        console.log(`  ✨ Link: "${text.trim()}" -> ${href}`);
      }
    }
  }
  
  async saveRecording() {
    const timestamp = Date.now();
    const filename = `aetna-recording-${timestamp}.ts`;
    
    const template = `// Aetna Workflow Recording - ${new Date().toISOString()}
import { chromium, Page } from 'playwright';

async function runAetnaWorkflow() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
${this.actions.join('\n  ')}
  
  // Add your assertions here
  
  await browser.close();
}

runAetnaWorkflow().catch(console.error);
`;
    
    fs.writeFileSync(filename, template);
    console.log(`\n✅ Recording saved to: ${filename}`);
  }
  
  async close() {
    if (this.context) {
      await this.saveRecording();
      await this.context.close();
    }
  }
}

async function main() {
  const recorder = new AetnaRecorder();
  
  try {
    await recorder.init();
    await recorder.recordWorkflow();
    
    // Keep running until user stops
    await new Promise(() => {});
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await recorder.close();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Recording stopped by user');
  process.exit(0);
});

main().catch(console.error);