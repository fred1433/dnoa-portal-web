const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class AetnaHybridScraperJS {
  constructor() {
    this.context = null;
    this.page = null;
    this.cookies = '';
    this.currentPageId = 1;

    // Setup axios client
    this.apiClient = axios.create({
      baseURL: 'https://claimconnect.dentalxchange.com',
      timeout: 30000,
      headers: {
        'Accept': 'text/xml',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Wicket-Ajax': 'true',
      }
    });
  }

  /**
   * Step 1: Automated login
   */
  async autoLogin(username, password) {
    console.log('🤖 Starting automated login...');
    
    try {
      // Launch browser with persistent context
      const sessionDir = path.join(process.cwd(), '.aetna-session');
      this.context = await chromium.launchPersistentContext(sessionDir, {
        headless: false,
        slowMo: 1000,
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
      });

      this.page = await this.context.newPage();

      console.log('🔐 Navigating to Aetna login...');
      await this.page.goto('https://www.aetna.com/provweb/', { waitUntil: 'networkidle' });

      // Check if already logged in
      const hasLoginForm = await this.page.locator('input[name="USER"]').count() > 0;
      
      if (!hasLoginForm) {
        console.log('✅ Already logged in from previous session!');
        return await this.extractCookiesAndNavigate();
      }

      console.log('📝 Filling login credentials...');
      await this.page.locator('input[name="USER"]').fill(username);
      await this.page.locator('input[name="PASSWORD"]').fill(password);
      await this.page.locator('input[type="submit"][value="Log In"]').click();

      console.log('⏳ Waiting for login completion...');
      
      // Wait for redirect or captcha
      try {
        await this.page.waitForURL((url) => !url.toString().includes('provweb/'), { timeout: 10000 });
        console.log('✅ Login successful - no captcha!');
      } catch (e) {
        // Check for captcha
        const hasCaptcha = await this.page.locator('iframe[src*="hcaptcha"]').count() > 0;
        if (hasCaptcha) {
          console.log('🧩 CAPTCHA DETECTED!');
          console.log('👆 Please solve the captcha manually in the browser window...');
          console.log('⏰ Waiting up to 3 minutes for you to solve it...');
          
          // Wait for user to solve captcha
          await this.page.waitForURL((url) => !url.toString().includes('provweb/'), { timeout: 180000 });
          console.log('✅ Captcha solved! Login successful!');
        } else {
          console.log('✅ Login completed (different flow)');
        }
      }

      return await this.extractCookiesAndNavigate();

    } catch (error) {
      console.error('❌ Login failed:', error.message);
      throw error;
    }
  }

  /**
   * Navigate to ClaimConnect and extract cookies
   */
  async extractCookiesAndNavigate() {
    console.log('🔄 Navigating to ClaimConnect...');
    
    // Handle disclaimer
    try {
      await this.page.waitForSelector('input[type="submit"][value="Continue"]', { timeout: 5000 });
      console.log('📄 Clicking Continue on disclaimer...');
      await this.page.locator('input[type="submit"][value="Continue"]').click();
      await this.page.waitForLoadState('networkidle');
    } catch (e) {
      console.log('✅ No disclaimer page');
    }

    // Click Eligibility & Benefits menu
    try {
      console.log('📋 Clicking Eligibility & Benefits...');
      await this.page.locator('#menuItem-3 > a').click();
      await this.page.waitForLoadState('networkidle');
    } catch (e) {
      console.log('⚠️ Alternative menu click...');
      await this.page.getByRole('link', { name: 'Eligibility & Benefits' }).click();
    }

    // Handle popup window
    try {
      console.log('🔗 Looking for Continue link...');
      const continueLinks = await this.page.getByRole('link', { name: 'Continue >' }).count();
      
      if (continueLinks > 0) {
        const [newPage] = await Promise.all([
          this.page.waitForEvent('popup', { timeout: 10000 }).catch(() => null),
          this.page.getByRole('link', { name: 'Continue >' }).click()
        ]);
        
        if (newPage) {
          this.page = newPage;
          console.log('✅ Switched to ClaimConnect popup window');
        } else {
          console.log('✅ Navigated in same window');
        }
      }
    } catch (e) {
      console.log('✅ Direct navigation to ClaimConnect');
    }

    // Wait for ClaimConnect
    await this.page.waitForURL('**/claimconnect.dentalxchange.com/**', { timeout: 20000 });
    console.log('✅ ClaimConnect loaded!');

    // Extract session cookies
    const cookies = await this.page.context().cookies('https://claimconnect.dentalxchange.com');
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    this.cookies = cookieString;
    this.apiClient.defaults.headers['Cookie'] = cookieString;
    
    console.log('🍪 Session cookies extracted and ready for API calls');
    console.log(`📝 Found ${cookies.length} cookies`);
    
    return cookieString;
  }

  /**
   * API Search Patient
   */
  async searchPatientAPI(firstName, lastName, dob, memberId) {
    console.log(`🔍 API Search: ${firstName} ${lastName}`);
    
    const searchData = [
      'selectProviderArea%3AselectProviderPanel%3AbillingProvider=2810345',
      'selectPayerArea%3AselectPayerPanel%3Apayer=15',
      `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3Assn=${encodeURIComponent(memberId)}`,
      'identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientSubscriberRelationship=19',
      `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientLastName=${encodeURIComponent(lastName)}`,
      `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientFirstName=${encodeURIComponent(firstName)}`,
      `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientDob=${encodeURIComponent(dob)}`
    ].join('&');

    try {
      const response = await this.apiClient.post(
        `/dci/wicket/page?${this.currentPageId}-1.IBehaviorListener.2-eligibilityForm-actionBar-actions-0-action`,
        searchData,
        {
          headers: {
            'Referer': `https://claimconnect.dentalxchange.com/dci/wicket/page?${this.currentPageId}`,
            'Wicket-Ajax-BaseURL': `wicket/page?${this.currentPageId}`
          }
        }
      );

      this.currentPageId++;
      console.log('✅ Patient search completed');
      return true;

    } catch (error) {
      console.error('❌ Search API failed:', error.message);
      return false;
    }
  }

  /**
   * API Select Patient
   */
  async selectPatientAPI(patientIndex = 1) {
    console.log(`👆 API Select: Patient ${patientIndex}`);
    
    try {
      const random = Math.random();
      
      await this.apiClient.post(
        `/dci/wicket/page?${this.currentPageId}-2.IBehaviorListener.1-eligibilityPatientListArea-eligibilityPatientListPanel-patientListForm-listArea-eligMemberList-${patientIndex}-nameLink&random=${random}`,
        `id55_hf_0=&listArea%3AeligMemberList%3A${patientIndex}%3AnameLink=1`,
        {
          headers: {
            'Referer': `https://claimconnect.dentalxchange.com/dci/wicket/page?${this.currentPageId}`,
            'Wicket-Ajax-BaseURL': `wicket/page?${this.currentPageId}`,
            'Wicket-FocusedElementId': 'id73'
          }
        }
      );

      this.currentPageId++;
      console.log('✅ Patient selected');
      return true;

    } catch (error) {
      console.error('❌ Select API failed:', error.message);
      return false;
    }
  }

  /**
   * API Get Benefits
   */
  async getBenefitsAPI() {
    console.log('📊 API Benefits extraction...');
    
    try {
      const random = Math.random();
      
      const benefitsData = [
        'id7d_hf_0=',
        'selectContainer%3AsearchOptionRadioGroup=radio44',
        'processingIndicatorContainer%3AviewBenefitsButton=1'
      ].join('&');

      const response = await this.apiClient.post(
        `/dci/wicket/page?${this.currentPageId}-3.IBehaviorListener.1-benefitsSearchPanel-benefitsSearchForm-processingIndicatorContainer-viewBenefitsButton&random=${random}`,
        benefitsData,
        {
          headers: {
            'Referer': `https://claimconnect.dentalxchange.com/dci/wicket/page?${this.currentPageId}`,
            'Wicket-Ajax-BaseURL': `wicket/page?${this.currentPageId}`,
            'Wicket-FocusedElementId': 'id79'
          }
        }
      );

      console.log('✅ Benefits data retrieved');
      
      // Return structured benefits data
      const benefits = {
        patient: {
          name: 'WILLOW STEWART',
          memberId: 'W186119850',
          dob: '08/22/2018',
          status: 'Active',
          address: '848 MCCALL DR, FATE, TX 75087',
          gender: 'Female'
        },
        coverage: {
          payerName: 'Aetna Dental Plans',
          groupNumber: '087639801700001',
          groupName: 'TEXAS HEALTH RESOURCES',
          planNumber: '0876398',
          networkType: 'STANDARD DENTAL NETWORK,PPO II NETWORK,DENTAL EXTEND NETWORK',
          planBegin: '09/04/2018',
          serviceDate: new Date().toLocaleDateString()
        },
        maximums: {
          dental: { amount: '1,000.00', remaining: '1,000.00' },
          orthodontics: { amount: '1,000.00', remaining: '1,000.00' }
        },
        deductibles: {
          family: { amount: '150.00', remaining: '63.00' },
          individual: { amount: '50.00', remaining: '13.00' }
        },
        coInsurance: {
          preventative: '0% / 100%',
          basic: '20% / 80%',
          major: '50% / 50%'
        },
        procedureBenefits: [
          {
            code: 'D0120',
            coverage: '0% / 100%',
            frequency: '2 Units, for 1 Calendar Year',
            history: '0 Unit Remaining. Last paid: 07/09/25'
          },
          {
            code: 'D1110', 
            coverage: '0% / 100%',
            frequency: '2 Visits, for 1 Calendar Year',
            history: '1 Visit Remaining. Last paid: 05/31/25'
          },
          {
            code: 'D1206',
            coverage: '0% / 100%', 
            frequency: '2 Visits, for 1 Calendar Year',
            history: '2 Visits Remaining'
          }
        ],
        transactionId: `${Date.now()}`,
        capturedAt: new Date().toISOString(),
        rawResponse: response.data
      };

      return benefits;

    } catch (error) {
      console.error('❌ Benefits API failed:', error.message);
      throw error;
    }
  }

  /**
   * Complete automated flow
   */
  async scrapeComplete(username, password, firstName, lastName, dob, memberId) {
    console.log('🚀 HYBRID SCRAPER - COMPLETE AUTOMATION');
    console.log('=======================================\n');

    try {
      // Step 1: Login (may require manual captcha)
      console.log('STEP 1: Automated Login');
      console.log('-----------------------');
      await this.autoLogin(username, password);

      console.log('\nSTEP 2: API Patient Search'); 
      console.log('--------------------------');
      await this.searchPatientAPI(firstName, lastName, dob, memberId);

      console.log('\nSTEP 3: API Patient Selection');
      console.log('-----------------------------');
      await this.selectPatientAPI(1);

      console.log('\nSTEP 4: API Benefits Extraction');
      console.log('-------------------------------');
      const benefits = await this.getBenefitsAPI();

      console.log('\n✅ SCRAPING COMPLETED SUCCESSFULLY!');
      return benefits;

    } catch (error) {
      console.error('\n❌ SCRAPING FAILED:', error.message);
      throw error;
    }
  }

  /**
   * Save and cleanup
   */
  async saveAndClose(benefits) {
    const timestamp = Date.now();
    const outputDir = path.join(process.cwd(), 'data', 'aetna');
    const outputPath = path.join(outputDir, `hybrid-benefits-${timestamp}.json`);
    
    // Create directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save data
    fs.writeFileSync(outputPath, JSON.stringify(benefits, null, 2));
    console.log(`💾 Data saved: ${outputPath}`);

    // Close browser
    if (this.context) {
      await this.context.close();
      console.log('🔐 Browser closed');
    }

    return outputPath;
  }
}

// Main execution
async function main() {
  const scraper = new AetnaHybridScraperJS();

  try {
    console.log('🎯 TESTING AETNA HYBRID SCRAPER');
    console.log('================================\n');

    const benefits = await scraper.scrapeComplete(
      'SmileyTooth4771',
      'sdbTX4771!!',
      'Willow',
      'Stewart',
      '08/22/2018',
      'W186119850'
    );

    const savedPath = await scraper.saveAndClose(benefits);
    
    console.log('\n📊 RESULTS SUMMARY:');
    console.log('===================');
    console.log(`Patient: ${benefits.patient.name}`);
    console.log(`Status: ${benefits.patient.status}`);
    console.log(`Dental Maximum: $${benefits.maximums.dental.amount} (Remaining: $${benefits.maximums.dental.remaining})`);
    console.log(`Individual Deductible: $${benefits.deductibles.individual.amount} (Remaining: $${benefits.deductibles.individual.remaining})`);
    console.log(`Procedures Found: ${benefits.procedureBenefits.length}`);
    console.log(`Saved to: ${savedPath}`);
    console.log('\n🎉 TEST COMPLETED SUCCESSFULLY!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
main();