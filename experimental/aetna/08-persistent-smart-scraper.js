const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class AetnaSmartScraper {
  constructor() {
    this.context = null;
    this.page = null;
    this.userDataDir = path.join(process.cwd(), '.aetna-chrome-profile');
    this.isFirstRun = !fs.existsSync(this.userDataDir);
  }

  async initialize() {
    console.log('🚀 AETNA PERSISTENT SMART SCRAPER');
    console.log('==================================\n');
    
    if (this.isFirstRun) {
      console.log('🆕 FIRST RUN DETECTED - Profile will be created');
      console.log('⚠️  You may need to solve a captcha ONCE\n');
    } else {
      console.log('✅ Profile found - Should bypass captcha!\n');
    }

    // Launch persistent context with Chrome
    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: false, // VISIBLE pour captcha si nécessaire
      channel: 'chrome', // Chrome RÉEL (pas Chromium)
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: [],
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox'
      ]
    });

    console.log('✅ Chrome launched with persistent profile');
    console.log(`📁 Profile location: ${this.userDataDir}\n`);

    this.page = await this.context.newPage();
  }

  async checkAndLogin() {
    console.log('🔐 Checking login status...');
    
    // Navigate to Aetna provider portal
    await this.page.goto('https://www.aetna.com/provweb/', { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });

    // Check if login form is present
    const needsLogin = await this.page.locator('input[name="USER"]').count() > 0;

    if (needsLogin) {
      console.log('\n⚠️  LOGIN REQUIRED - Attempting automatic fill...');
      
      try {
        // Auto-fill credentials
        const username = 'U7005941';
        const password = 'Hematocrit#8';
        
        console.log('📝 Filling credentials...');
        await this.page.fill('input[name="USER"]', username);
        await this.page.fill('input[name="PASSWORD"]', password);
        console.log('✅ Credentials filled');
        
        // Click login button
        console.log('🖱️ Clicking login button...');
        await this.page.click('input[type="submit"][value="Log In"]');
        
        console.log('\n⚠️  CAPTCHA MAY APPEAR - Please solve it manually if needed');
        console.log('⏰ Waiting up to 10 minutes for login to complete...\n');

        // Wait for successful login (redirect away from login page)
        await this.page.waitForURL(url => !url.includes('provweb'), { 
          timeout: 600000 // 10 minutes
        });
        
        console.log('✅ Login successful!');
        console.log('🎉 Session saved for future use (weeks/months)!\n');
        
      } catch (error) {
        console.log('❌ Login failed or timeout');
        console.log('💡 The browser window is still open - complete login manually');
        console.log('⏰ Waiting additional 5 minutes...\n');
        
        try {
          await this.page.waitForURL(url => !url.includes('provweb'), { 
            timeout: 300000 // 5 more minutes
          });
          console.log('✅ Manual login successful!\n');
        } catch (e) {
          throw new Error('Login timeout - unable to proceed');
        }
      }
    } else {
      console.log('✅ Already logged in - session still valid!');
      console.log('🚀 No captcha needed - proceeding automatically!\n');
    }

    // Navigate to ClaimConnect
    console.log('🔄 Navigating to ClaimConnect...');
    await this.page.goto('https://claimconnect.dentalxchange.com/dci/LoginDX.jsp', {
      waitUntil: 'networkidle'
    });

    // Wait for proper redirect to main page
    await this.page.waitForURL(url => url.includes('wicket/page'), { 
      timeout: 30000 
    });

    const currentUrl = this.page.url();
    console.log('✅ Reached ClaimConnect main page');
    console.log(`📍 Current URL: ${currentUrl}\n`);

    return currentUrl;
  }

  async searchPatient(lastName, firstName, dob) {
    console.log(`🔍 Searching patient: ${firstName} ${lastName} (DOB: ${dob})`);
    
    try {
      // Navigate to search page if needed
      const searchLink = this.page.locator('a:has-text("Eligibility & Benefits")').first();
      if (await searchLink.count() > 0) {
        await searchLink.click();
        await this.page.waitForLoadState('networkidle');
      }

      // Fill search form
      await this.page.fill('input[name*="lastName"]', lastName);
      await this.page.fill('input[name*="firstName"]', firstName);
      await this.page.fill('input[name*="dob"]', dob);

      // Submit search
      await this.page.click('button[type="submit"]:has-text("Search")');
      await this.page.waitForLoadState('networkidle');

      console.log('✅ Search submitted');

      // Check for results
      const results = await this.page.locator('tr[class*="result"]').count();
      console.log(`📊 Found ${results} matching patients\n`);

      return results > 0;

    } catch (error) {
      console.error('❌ Search failed:', error.message);
      return false;
    }
  }

  async selectPatient(index = 0) {
    console.log(`👤 Selecting patient at index ${index}`);
    
    try {
      const patientRows = this.page.locator('tr[class*="result"]');
      const count = await patientRows.count();

      if (count === 0) {
        throw new Error('No patients found');
      }

      // Click on the patient row
      await patientRows.nth(index).click();
      await this.page.waitForLoadState('networkidle');

      console.log('✅ Patient selected\n');
      return true;

    } catch (error) {
      console.error('❌ Selection failed:', error.message);
      return false;
    }
  }

  async getBenefitsData() {
    console.log('📄 Extracting benefits data...');
    
    try {
      // Wait for benefits page to load
      await this.page.waitForSelector('text=/Benefit Information|Coverage Information/', {
        timeout: 30000
      });

      // Get the HTML content
      const html = await this.page.content();
      console.log(`✅ Retrieved ${html.length} characters of HTML\n`);

      // Parse benefits using our existing parser
      const benefits = this.parseHtmlBenefits(html);
      
      return benefits;

    } catch (error) {
      console.error('❌ Benefits extraction failed:', error.message);
      return null;
    }
  }

  parseHtmlBenefits(html) {
    console.log('🔍 Parsing benefits data...');
    
    const benefits = {
      patient: {},
      coverage: {},
      maximums: {},
      deductibles: {},
      coInsurance: {},
      procedureBenefits: [],
      providerInfo: {},
      planLevelRemarks: [],
      capturedAt: new Date().toISOString()
    };

    try {
      // Patient Information
      const patientBlock = html.match(/Name:<br\s*\/?>Member ID or SSN:<br\s*\/?>Date of Birth:<\/td>\s*<td>([^<]+)<br\s*\/?>(W[^<]+)<br\s*\/?>([^\/<]+)/i);
      if (patientBlock) {
        benefits.patient.name = patientBlock[1].trim();
        benefits.patient.memberId = patientBlock[2].trim();
        benefits.patient.dob = patientBlock[3].trim();
        console.log('✅ Patient:', benefits.patient.name);
      }

      // Maximums
      const dentalMaxRegex = /<tr[^>]*>\s*<td[^>]*>\s*<span>DENTAL<\/span>\s*<\/td><td[^>]*>\s*<span>Individual<\/span>\s*<\/td><td[^>]*>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>\s*<\/td><td[^>]*>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>\s*<\/td><td[^>]*>\s*<span>([^<]+)<\/span>/i;
      const dentalMax = html.match(dentalMaxRegex);
      
      if (dentalMax) {
        benefits.maximums.dental = {
          amount: dentalMax[1],
          remaining: dentalMax[2],
          period: dentalMax[3].trim()
        };
        console.log('✅ Dental max:', benefits.maximums.dental.amount);
      }

      // Orthodontics maximum
      const orthoMaxRegex = /<tr[^>]*>\s*<td[^>]*>\s*<span>Orthodontics<\/span>\s*<\/td><td[^>]*>\s*<span>Individual<\/span>\s*<\/td><td[^>]*>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>\s*<\/td><td[^>]*>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>\s*<\/td><td[^>]*>\s*<span>([^<]+)<\/span>/i;
      const orthoMax = html.match(orthoMaxRegex);
      
      if (orthoMax) {
        benefits.maximums.orthodontics = {
          amount: orthoMax[1],
          remaining: orthoMax[2],
          period: orthoMax[3].trim()
        };
        console.log('✅ Ortho max:', benefits.maximums.orthodontics.amount);
      }

      // Deductibles
      const familyDeductRegex = /<tr[^>]*>\s*<td[^>]*>\s*<span>Dental<\/span>\s*<\/td><td[^>]*>\s*<span>Family<\/span>\s*<\/td><td[^>]*>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>\s*<\/td><td[^>]*>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>/i;
      const familyDeduct = html.match(familyDeductRegex);
      
      if (familyDeduct) {
        benefits.deductibles.family = {
          amount: familyDeduct[1],
          remaining: familyDeduct[2]
        };
        console.log('✅ Family deductible:', benefits.deductibles.family.amount);
      }

      // Individual deductible  
      const indivDeductRegex = /<tr[^>]*>\s*<td[^>]*>\s*<span>Dental<\/span>\s*<\/td><td[^>]*>\s*<span>Individual<\/span>\s*<\/td><td[^>]*>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>\s*<\/td><td[^>]*>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>/i;
      const indivDeduct = html.match(indivDeductRegex);
      
      if (indivDeduct) {
        benefits.deductibles.individual = {
          amount: indivDeduct[1],
          remaining: indivDeduct[2]
        };
        console.log('✅ Individual deductible:', benefits.deductibles.individual.amount);
      }

      // Procedure Codes
      const procedureRegex = /<tr[^>]*>\s*<td[^>]*>\s*<span>(D\d{4})<\/span>\s*<\/td><td[^>]*>\s*<span>([^<]+)<\/span>\s*<\/td><td[^>]*>\s*<span>([^<]*)<\/span>\s*<\/td><td[^>]*>\s*<span>([^<]*)<\/span>/g;
      
      let procedureMatch;
      while ((procedureMatch = procedureRegex.exec(html)) !== null) {
        benefits.procedureBenefits.push({
          code: procedureMatch[1],
          coverage: procedureMatch[2].trim(),
          frequency: procedureMatch[3].trim() || 'Not specified',
          message: procedureMatch[4].trim() || 'No additional info'
        });
      }

      console.log('✅ Found', benefits.procedureBenefits.length, 'procedure codes\n');

      return benefits;

    } catch (error) {
      console.error('⚠️ Parsing error:', error.message);
      benefits.parsingError = error.message;
      return benefits;
    }
  }

  async processMultiplePatients(patientList) {
    console.log(`\n🏃 BATCH PROCESSING ${patientList.length} PATIENTS`);
    console.log('=====================================\n');

    const results = [];
    
    for (const patient of patientList) {
      console.log(`\n--- Processing: ${patient.firstName} ${patient.lastName} ---`);
      
      try {
        // Search patient
        const found = await this.searchPatient(
          patient.lastName,
          patient.firstName,
          patient.dob
        );

        if (found) {
          // Select first result
          await this.selectPatient(0);
          
          // Get benefits
          const benefits = await this.getBenefitsData();
          
          if (benefits) {
            results.push({
              ...patient,
              benefits,
              status: 'success'
            });
            
            // Save individual result
            this.saveResults(benefits, `${patient.lastName}-${patient.firstName}`);
          } else {
            results.push({
              ...patient,
              status: 'error',
              error: 'Could not extract benefits'
            });
          }
        } else {
          results.push({
            ...patient,
            status: 'not_found'
          });
        }

        // Small delay between patients
        await this.page.waitForTimeout(2000);

      } catch (error) {
        console.error(`❌ Error processing ${patient.firstName} ${patient.lastName}:`, error.message);
        results.push({
          ...patient,
          status: 'error',
          error: error.message
        });
      }
    }

    return results;
  }

  saveResults(benefits, patientName = '') {
    const timestamp = Date.now();
    const fileName = patientName 
      ? `benefits-${patientName}-${timestamp}.json`
      : `benefits-${timestamp}.json`;
    const outputPath = path.join('data', 'aetna', fileName);
    
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(benefits, null, 2));
    
    console.log(`💾 Data saved: ${outputPath}`);
    return outputPath;
  }

  async close() {
    if (this.context) {
      // DON'T close context - keep session alive!
      console.log('\n🔒 Browser closed (session preserved in profile)');
      console.log('✅ Next run will skip login & captcha!\n');
      await this.context.close();
    }
  }
}

// Test execution
async function main() {
  const scraper = new AetnaSmartScraper();

  try {
    await scraper.initialize();
    await scraper.checkAndLogin();

    // Test with single patient
    const testPatient = {
      firstName: 'WILLOW',
      lastName: 'STEWART',
      dob: '08/22/2018'
    };

    console.log('\n📋 TEST RUN - Single Patient');
    console.log('=============================\n');

    const found = await scraper.searchPatient(
      testPatient.lastName,
      testPatient.firstName,
      testPatient.dob
    );

    if (found) {
      await scraper.selectPatient(0);
      const benefits = await scraper.getBenefitsData();
      
      if (benefits) {
        const savedPath = scraper.saveResults(benefits, 'test-patient');
        
        console.log('\n📊 RESULTS SUMMARY:');
        console.log('===================');
        console.log(`Patient: ${benefits.patient.name || 'Not extracted'}`);
        console.log(`Member ID: ${benefits.patient.memberId || 'Not extracted'}`);
        console.log(`Dental Max: $${benefits.maximums.dental?.amount || 'N/A'}`);
        console.log(`Remaining: $${benefits.maximums.dental?.remaining || 'N/A'}`);
        console.log(`Procedures: ${benefits.procedureBenefits.length} found`);
        console.log(`Saved to: ${savedPath}`);
      }
    }

    console.log('\n🎉 PERSISTENT SCRAPER TEST COMPLETE!');
    console.log('Next run will be CAPTCHA-FREE! 🚀\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await scraper.close();
  }
}

// Export for use in other scripts
module.exports = AetnaSmartScraper;

// Run if called directly
if (require.main === module) {
  main();
}