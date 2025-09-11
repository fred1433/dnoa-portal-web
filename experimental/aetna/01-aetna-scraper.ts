import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface AetnaBenefitData {
  patient: {
    name: string;
    memberId: string;
    dob: string;
  };
  coverage: {
    payerName: string;
    coverageType: string;
    planType: string;
    groupNumber: string;
    groupName: string;
    planBegin: string;
    serviceDate: string;
  };
  maximums: {
    dental: { amount: string; remaining: string; };
    orthodontics: { amount: string; remaining: string; };
  };
  deductibles: {
    family: { amount: string; remaining: string; };
    individual: { amount: string; remaining: string; };
  };
  coInsurance: {
    preventative: string;
    basic: string;
    major: string;
  };
  procedureBenefits: any[];
  rawText?: string;
}

class AetnaScraperFinal {
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async init() {
    console.log('🔧 Initializing browser with persistent profile...');
    
    // Use a persistent user data directory to maintain cookies/state
    const userDataDir = path.join(os.homedir(), '.aetna-scraper-profile');
    
    // Launch with Chromium (more reliable than Chrome channel)
    this.context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      slowMo: 100,
      // channel: 'chrome', // Removed - use bundled Chromium
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });
    
    // Add anti-detection scripts
    await this.context.addInitScript(() => {
      Object.defineProperty((globalThis as any).navigator, 'webdriver', {
        get: () => undefined,
      });
      Object.defineProperty((globalThis as any).navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      (globalThis as any).window.chrome = {
        runtime: {},
      };
    });
    
    this.page = await this.context.newPage();
    console.log('✅ Browser initialized with stealth mode');
  }

  async login(username: string, password: string) {
    if (!this.page) throw new Error('Browser not initialized');
    
    console.log('🔐 Logging in to Aetna...');
    
    await this.page.goto('https://www.aetna.com/provweb/', { waitUntil: 'networkidle' });
    
    // Check if we need to login (using correct field names)
    const hasLoginForm = await this.page.locator('input[name="USER"]').count() > 0;
    
    if (!hasLoginForm) {
      console.log('✅ Already logged in from previous session!');
      return;
    }
    
    console.log('📝 Filling login form...');
    
    // Try multiple selector strategies for username
    try {
      await this.page.getByRole('textbox', { name: 'User Name:' }).fill(username);
    } catch (e) {
      console.log('⚠️  Trying alternative username selector...');
      await this.page.locator('input[name="USER"]').fill(username);
    }
    
    // Try multiple selector strategies for password
    try {
      await this.page.getByRole('textbox', { name: 'Password :' }).fill(password);
    } catch (e) {
      console.log('⚠️  Trying alternative password selector...');
      await this.page.locator('input[name="PASSWORD"]').fill(password);
    }
    
    // Try multiple selector strategies for login button
    try {
      await this.page.getByRole('button', { name: 'Log In' }).click();
    } catch (e) {
      console.log('⚠️  Trying alternative login button selector...');
      await this.page.locator('input[type="submit"][value="Log In"]').click();
    }
    
    // Wait for navigation or captcha
    try {
      await this.page.waitForURL((url) => !url.toString().includes('provweb/'), { timeout: 10000 });
      console.log('✅ Login successful - no captcha!');
    } catch (e) {
      // Check for captcha
      const hasCaptcha = await this.page.locator('iframe[src*="hcaptcha"]').count() > 0;
      if (hasCaptcha) {
        console.log('⚠️  Captcha detected - manual intervention required');
        console.log('Please solve the captcha manually in the browser window...');
        
        // Wait for "Continue" button after captcha
        await this.page.waitForSelector('button:has-text("Continue")', { timeout: 120000 });
        await this.page.getByRole('button', { name: 'Continue' }).click();
        console.log('✅ Login successful after manual captcha solving');
      } else {
        // Maybe already logged in or redirected differently
        console.log('✅ Login completed');
      }
    }
  }

  async navigateToEligibility() {
    if (!this.page) throw new Error('Page not initialized');
    
    console.log('📋 Navigating to eligibility search...');
    
    // STEP 1: Handle disclaimer page - click Continue
    try {
      // Wait for the Continue button on disclaimer page
      await this.page.waitForSelector('input[type="submit"][value="Continue"]', { timeout: 5000 });
      console.log('📄 Disclaimer page detected, clicking Continue...');
      await this.page.locator('input[type="submit"][value="Continue"]').click();
      await this.page.waitForLoadState('networkidle');
    } catch (e) {
      console.log('✅ No disclaimer page or already passed');
    }
    
    // STEP 2: Click on Eligibility & Benefits from menu
    try {
      // Use the ID from your recording
      await this.page.locator('#menuItem-3 > a').click();
      console.log('✅ Clicked Eligibility & Benefits menu');
    } catch (e) {
      // Fallback to text-based selector
      console.log('⚠️  Trying alternative selector...');
      await this.page.getByRole('link', { name: 'Eligibility & Benefits' }).click();
    }
    
    // Handle any popups/dialogs (cookie banner, etc.)
    try {
      await this.page.getByRole('button', { name: 'Close' }).click();
      console.log('✅ Closed popup/banner');
    } catch (e) {}
    
    // Wait for the page to load
    await this.page.waitForLoadState('networkidle');
    
    // Check if there's a Continue link to open eligibility tool
    try {
      // Try to find and click Continue link
      const continueLink = await this.page.getByRole('link', { name: 'Continue >' }).count();
      if (continueLink > 0) {
        console.log('📋 Found Continue link, checking for popup...');
        
        // Some eligibility tools open in a new window
        const [newPage] = await Promise.all([
          this.page.waitForEvent('popup', { timeout: 5000 }).catch(() => null),
          this.page.getByRole('link', { name: 'Continue >' }).click()
        ]);
        
        if (newPage) {
          this.page = newPage;
          console.log('✅ Switched to eligibility popup window');
        } else {
          console.log('✅ Navigated in same window');
        }
      }
    } catch (e) {
      console.log('✅ Already on eligibility page');
    }
    
    // Select billing provider
    await this.page.getByRole('link', { name: 'Select Billing Provider' }).click();
    await this.page.getByText('Jennifer Chou, Dds - P.O. BOX').click();
    
    // Select payer
    await this.page.getByRole('link', { name: 'Select a Payer' }).click();
    await this.page.getByText('Aetna Dental Plans -').click();
    
    console.log('✅ Provider and payer selected');
  }

  async searchPatient(firstName: string, lastName: string, dob: string, memberId: string) {
    if (!this.page) throw new Error('Page not initialized');
    
    console.log(`🔍 Searching for patient: ${firstName} ${lastName}`);
    
    // Fill patient information
    await this.page.getByRole('textbox', { name: 'Last Name' }).fill(lastName);
    await this.page.getByRole('textbox', { name: 'First Name' }).fill(firstName);
    await this.page.getByRole('textbox', { name: 'Date of Birth *' }).fill(dob);
    
    // Set relationship (19 = Child)
    await this.page.getByLabel('Patient Relationship').selectOption('19');
    
    // Fill member ID
    await this.page.getByRole('textbox', { name: 'Member ID or SSN' }).fill(memberId);
    
    // Submit search
    await this.page.getByRole('button', { name: 'Continue' }).click();
    
    // Wait for results and click on subscriber
    await this.page.waitForSelector('a[role="link"]', { timeout: 10000 });
    
    // Click on the subscriber link (e.g., SCOTT STEWART)
    const links = await this.page.getByRole('link').all();
    for (const link of links) {
      const text = await link.textContent();
      if (text && text.includes('STEWART')) {
        await link.click();
        break;
      }
    }
    
    console.log('✅ Patient found and selected');
  }

  async viewBenefits(): Promise<AetnaBenefitData> {
    if (!this.page) throw new Error('Page not initialized');
    
    console.log('📊 Viewing benefits...');
    
    // Click View Benefits
    await this.page.getByRole('link', { name: 'View Benefits' }).click();
    
    // Wait for benefits page to load
    await this.page.waitForSelector('h1:has-text("Plan Benefits")', { timeout: 10000 });
    
    console.log('✅ Benefits page loaded');
    
    // Extract all text content
    const benefitsText = await this.page.locator('body').innerText();
    
    // Parse the benefits data
    const data = this.parseBenefitsText(benefitsText);
    data.rawText = benefitsText;
    
    return data;
  }

  private parseBenefitsText(text: string): AetnaBenefitData {
    const data: AetnaBenefitData = {
      patient: {
        name: '',
        memberId: '',
        dob: ''
      },
      coverage: {
        payerName: '',
        coverageType: '',
        planType: '',
        groupNumber: '',
        groupName: '',
        planBegin: '',
        serviceDate: ''
      },
      maximums: {
        dental: { amount: '', remaining: '' },
        orthodontics: { amount: '', remaining: '' }
      },
      deductibles: {
        family: { amount: '', remaining: '' },
        individual: { amount: '', remaining: '' }
      },
      coInsurance: {
        preventative: '',
        basic: '',
        major: ''
      },
      procedureBenefits: []
    };

    // Extract patient info
    const nameMatch = text.match(/Name:\s+Member ID.*?\s+([A-Z\s]+)\s+([A-Z0-9]+)/);
    if (nameMatch) {
      data.patient.name = nameMatch[1].trim();
      data.patient.memberId = nameMatch[2];
    }

    // Extract DOB
    const dobMatch = text.match(/Date of Birth:\s+(\d{2}\/\d{2}\/\d{4})/);
    if (dobMatch) {
      data.patient.dob = dobMatch[1];
    }

    // Extract coverage info
    const coverageMatch = text.match(/Coverage:\s+(\w+)/);
    if (coverageMatch) {
      data.coverage.coverageType = coverageMatch[1];
    }

    const groupMatch = text.match(/Group#:\s+(\d+)/);
    if (groupMatch) {
      data.coverage.groupNumber = groupMatch[1];
    }

    const groupNameMatch = text.match(/Group Name:\s+([^\n]+)/);
    if (groupNameMatch) {
      data.coverage.groupName = groupNameMatch[1].trim();
    }

    // Extract maximums
    const dentalMaxMatch = text.match(/DENTAL\s+Individual\s+\$([0-9,\.]+)\s+\$([0-9,\.]+)/);
    if (dentalMaxMatch) {
      data.maximums.dental.amount = dentalMaxMatch[1];
      data.maximums.dental.remaining = dentalMaxMatch[2];
    }

    const orthoMaxMatch = text.match(/Orthodontics\s+Individual\s+\$([0-9,\.]+)\s+\$([0-9,\.]+)/);
    if (orthoMaxMatch) {
      data.maximums.orthodontics.amount = orthoMaxMatch[1];
      data.maximums.orthodontics.remaining = orthoMaxMatch[2];
    }

    // Extract deductibles
    const familyDeductMatch = text.match(/Dental\s+Family\s+\$([0-9,\.]+)\s+\$([0-9,\.]+)/);
    if (familyDeductMatch) {
      data.deductibles.family.amount = familyDeductMatch[1];
      data.deductibles.family.remaining = familyDeductMatch[2];
    }

    const indivDeductMatch = text.match(/Dental\s+Individual\s+\$([0-9,\.]+)\s+\$([0-9,\.]+)/);
    if (indivDeductMatch) {
      data.deductibles.individual.amount = indivDeductMatch[1];
      data.deductibles.individual.remaining = indivDeductMatch[2];
    }

    // Extract co-insurance
    const prevMatch = text.match(/Preventative\s+(\d+%)\s+\/\s+(\d+%)/);
    if (prevMatch) {
      data.coInsurance.preventative = `Patient: ${prevMatch[1]} / Insurance: ${prevMatch[2]}`;
    }

    const basicMatch = text.match(/Basic\s+(\d+%)\s+\/\s+(\d+%)/);
    if (basicMatch) {
      data.coInsurance.basic = `Patient: ${basicMatch[1]} / Insurance: ${basicMatch[2]}`;
    }

    const majorMatch = text.match(/Major[,\w]*\s+(\d+%)\s+\/\s+(\d+%)/);
    if (majorMatch) {
      data.coInsurance.major = `Patient: ${majorMatch[1]} / Insurance: ${majorMatch[2]}`;
    }

    // Extract procedure benefits
    const procedureMatches = text.matchAll(/D(\d{4})\s+(\d+%)\s+\/\s+(\d+%)[^\n]*/g);
    for (const match of procedureMatches) {
      data.procedureBenefits.push({
        code: `D${match[1]}`,
        patientPercent: match[2],
        insurancePercent: match[3]
      });
    }

    return data;
  }

  async close() {
    if (this.context) {
      await this.context.close();
    }
  }
}

// Main function
async function main() {
  const scraper = new AetnaScraperFinal();
  
  try {
    console.log('🚀 AETNA FINAL SCRAPER');
    console.log('======================\n');
    
    await scraper.init();
    await scraper.login('SmileyTooth4771', 'sdbTX4771!!');
    await scraper.navigateToEligibility();
    await scraper.searchPatient('Willow', 'Stewart', '08/22/2018', 'W186119850');
    
    const benefits = await scraper.viewBenefits();
    
    console.log('\n📊 EXTRACTED BENEFITS DATA:');
    console.log('===========================');
    console.log('Patient:', benefits.patient.name);
    console.log('Member ID:', benefits.patient.memberId);
    console.log('DOB:', benefits.patient.dob);
    console.log('\n💰 Maximums:');
    console.log('  Dental:', `$${benefits.maximums.dental.amount} (Remaining: $${benefits.maximums.dental.remaining})`);
    console.log('  Orthodontics:', `$${benefits.maximums.orthodontics.amount} (Remaining: $${benefits.maximums.orthodontics.remaining})`);
    console.log('\n💵 Deductibles:');
    console.log('  Family:', `$${benefits.deductibles.family.amount} (Remaining: $${benefits.deductibles.family.remaining})`);
    console.log('  Individual:', `$${benefits.deductibles.individual.amount} (Remaining: $${benefits.deductibles.individual.remaining})`);
    console.log('\n📋 Co-Insurance:');
    console.log('  Preventative:', benefits.coInsurance.preventative);
    console.log('  Basic:', benefits.coInsurance.basic);
    console.log('  Major/Ortho:', benefits.coInsurance.major);
    console.log('\n📄 Procedures found:', benefits.procedureBenefits.length);
    
    // Save data
    const timestamp = Date.now();
    const filename = `data/aetna/aetna-benefits-${timestamp}.json`;
    fs.mkdirSync('data/aetna', { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(benefits, null, 2));
    console.log(`\n💾 Data saved to ${filename}`);
    
    // Save raw text for reference
    const textFile = `data/aetna/aetna-benefits-${timestamp}.txt`;
    fs.writeFileSync(textFile, benefits.rawText || '');
    console.log(`📄 Raw text saved to ${textFile}`);
    
    console.log('\n✅ Scraping completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Keep browser open for manual inspection if needed
    console.log('\n⏸️  Browser will remain open. Press Ctrl+C to exit.');
    // await scraper.close();
  }
}

// Run the scraper
main().catch(console.error);