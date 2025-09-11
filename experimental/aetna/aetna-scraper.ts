import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';

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

class AetnaScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init() {
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 100
    });
    this.page = await this.browser.newContext().then(ctx => ctx.newPage());
  }

  async login(username: string, password: string) {
    if (!this.page) throw new Error('Browser not initialized');
    
    console.log('🔐 Logging in to Aetna...');
    
    await this.page.goto('https://www.aetna.com/provweb/');
    
    // Fill login credentials
    await this.page.getByRole('textbox', { name: 'User Name:' }).fill(username);
    await this.page.getByRole('textbox', { name: 'Password :' }).fill(password);
    await this.page.getByRole('button', { name: 'Log In' }).click();
    
    // Handle hCaptcha if it appears
    try {
      console.log('⚠️  hCaptcha detected - manual intervention required');
      // Wait for user to solve captcha manually
      await this.page.waitForSelector('button:has-text("Continue")', { timeout: 60000 });
      await this.page.getByRole('button', { name: 'Continue' }).click();
      console.log('✅ Login successful');
    } catch (e) {
      console.log('✅ No captcha or already solved');
    }
  }

  async navigateToEligibility() {
    if (!this.page) throw new Error('Page not initialized');
    
    console.log('📋 Navigating to eligibility search...');
    
    // Click on Eligibility & Benefits
    await this.page.getByRole('link', { name: 'Search online Eligibility &' }).click();
    
    // Handle any popups/dialogs
    try {
      await this.page.getByRole('button', { name: 'Close' }).click();
    } catch (e) {}
    
    // Click Continue to open new window
    const page1Promise = this.page.waitForEvent('popup');
    await this.page.getByRole('link', { name: 'Continue >' }).click();
    const newPage = await page1Promise;
    
    // Switch to new page
    this.page = newPage;
    
    // Select billing provider
    await this.page.getByRole('link', { name: 'Select Billing Provider' }).click();
    // This will need to be adjusted based on your specific provider
    await this.page.getByText('Jennifer Chou, Dds - P.O. BOX').click();
    
    // Select payer
    await this.page.getByRole('link', { name: 'Select a Payer' }).click();
    await this.page.getByText('Aetna Dental Plans -').click();
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
    await this.page.waitForSelector('a[role="link"]');
    // Click on the subscriber link (e.g., SCOTT STEWART)
    const links = await this.page.getByRole('link').all();
    for (const link of links) {
      const text = await link.textContent();
      if (text && text.includes('STEWART')) {
        await link.click();
        break;
      }
    }
  }

  async viewBenefits(): Promise<AetnaBenefitData> {
    if (!this.page) throw new Error('Page not initialized');
    
    console.log('📊 Viewing benefits...');
    
    // Click View Benefits
    await this.page.getByRole('link', { name: 'View Benefits' }).click();
    
    // Wait for benefits page to load
    await this.page.waitForSelector('h1:has-text("Plan Benefits")', { timeout: 10000 });
    
    // Extract all text content
    const benefitsText = await this.page.locator('body').innerText();
    
    // Parse the benefits data
    const data = this.parseBenefitsText(benefitsText);
    data.rawText = benefitsText;
    
    return data;
  }

  private parseBenefitsText(text: string): AetnaBenefitData {
    const lines = text.split('\n');
    
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

    // Extract procedure benefits (simplified)
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
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Main function
async function main() {
  const scraper = new AetnaScraper();
  
  try {
    console.log('🚀 AETNA BENEFITS SCRAPER');
    console.log('=========================\n');
    
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
    
    // Save data
    const timestamp = Date.now();
    const filename = `aetna-benefits-${timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify(benefits, null, 2));
    console.log(`\n💾 Data saved to ${filename}`);
    
    // Save raw text for reference
    const textFile = `aetna-benefits-${timestamp}.txt`;
    fs.writeFileSync(textFile, benefits.rawText || '');
    console.log(`📄 Raw text saved to ${textFile}`);
    
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