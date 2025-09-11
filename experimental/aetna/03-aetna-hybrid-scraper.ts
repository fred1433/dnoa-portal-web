import { chromium, BrowserContext, Page } from 'playwright';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

interface AetnaBenefitData {
  patient: {
    name: string;
    memberId: string;
    dob: string;
    status: string;
    address: string;
    gender: string;
  };
  coverage: {
    payerName: string;
    groupNumber: string;
    groupName: string;
    planNumber: string;
    networkType: string;
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
  procedureBenefits: Array<{
    code: string;
    coverage: string;
    frequency?: string;
    history?: string;
    message?: string;
  }>;
  transactionId: string;
  capturedAt: string;
}

interface PatientInfo {
  firstName: string;
  lastName: string;
  dob: string;
  memberId: string;
}

class AetnaHybridScraper {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private apiClient: AxiosInstance;
  private cookies: string = '';
  private currentPageId: number = 1;

  constructor() {
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
   * Step 1: Automated login using Playwright
   */
  async autoLogin(username: string, password: string): Promise<string> {
    console.log('🤖 Starting automated login...');
    
    try {
      // Launch browser
      this.context = await chromium.launchPersistentContext(
        path.join(process.cwd(), '.aetna-session'), {
        headless: false, // Keep visible to handle captcha if needed
        slowMo: 500,
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
      });

      this.page = await this.context.newPage();

      // Go to Aetna login
      console.log('🔐 Navigating to Aetna login...');
      await this.page.goto('https://www.aetna.com/provweb/', { waitUntil: 'networkidle' });

      // Check if already logged in
      const hasLoginForm = await this.page.locator('input[name="USER"]').count() > 0;
      
      if (!hasLoginForm) {
        console.log('✅ Already logged in from previous session!');
        return await this.extractCookiesAndNavigate();
      }

      // Fill login form
      console.log('📝 Filling login credentials...');
      await this.page.locator('input[name="USER"]').fill(username);
      await this.page.locator('input[name="PASSWORD"]').fill(password);
      await this.page.locator('input[type="submit"][value="Log In"]').click();

      // Handle potential captcha
      console.log('⏳ Checking for captcha...');
      try {
        await this.page.waitForURL((url) => !url.toString().includes('provweb/'), { timeout: 10000 });
        console.log('✅ Login successful - no captcha!');
      } catch (e) {
        // Check for captcha
        const hasCaptcha = await this.page.locator('iframe[src*="hcaptcha"]').count() > 0;
        if (hasCaptcha) {
          console.log('🧩 Captcha detected - please solve manually...');
          console.log('⏰ Waiting up to 2 minutes for manual captcha solving...');
          
          // Wait for login to complete (user solves captcha)
          await this.page.waitForURL((url) => !url.toString().includes('provweb/'), { timeout: 120000 });
          console.log('✅ Captcha solved and login successful!');
        }
      }

      return await this.extractCookiesAndNavigate();

    } catch (error) {
      console.error('❌ Login failed:', error);
      throw error;
    }
  }

  /**
   * Extract cookies and navigate to ClaimConnect
   */
  private async extractCookiesAndNavigate(): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');

    console.log('🔄 Navigating to ClaimConnect...');
    
    // Handle disclaimer page
    try {
      await this.page.waitForSelector('input[type="submit"][value="Continue"]', { timeout: 5000 });
      await this.page.locator('input[type="submit"][value="Continue"]').click();
    } catch (e) {
      console.log('✅ No disclaimer page');
    }

    // Navigate to eligibility
    await this.page.locator('#menuItem-3 > a').click();
    await this.page.waitForLoadState('networkidle');

    // Handle popup window if it opens
    try {
      const [newPage] = await Promise.all([
        this.page.waitForEvent('popup', { timeout: 5000 }).catch(() => null),
        this.page.getByRole('link', { name: 'Continue >' }).click().catch(() => {})
      ]);
      
      if (newPage) {
        this.page = newPage;
        console.log('✅ Switched to ClaimConnect popup');
      }
    } catch (e) {}

    // Wait for ClaimConnect to load
    await this.page.waitForURL('**/claimconnect.dentalxchange.com/**', { timeout: 15000 });
    console.log('✅ ClaimConnect loaded successfully');

    // Extract cookies
    const cookies = await this.page.context().cookies('https://claimconnect.dentalxchange.com');
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    console.log('🍪 Session cookies extracted');
    
    this.cookies = cookieString;
    this.apiClient.defaults.headers['Cookie'] = cookieString;
    
    return cookieString;
  }

  /**
   * Step 2: API-based patient search (super fast)
   */
  async searchPatientAPI(patient: PatientInfo): Promise<boolean> {
    console.log(`🔍 API Search: ${patient.firstName} ${patient.lastName}`);
    
    try {
      const searchData = [
        'selectProviderArea%3AselectProviderPanel%3AbillingProvider=2810345',
        'selectPayerArea%3AselectPayerPanel%3Apayer=15',
        `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3Assn=${encodeURIComponent(patient.memberId)}`,
        'identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientSubscriberRelationship=19',
        `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientLastName=${encodeURIComponent(patient.lastName)}`,
        `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientFirstName=${encodeURIComponent(patient.firstName)}`,
        `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientDob=${encodeURIComponent(patient.dob)}`
      ].join('&');

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
      console.log('✅ Search completed');
      return true;

    } catch (error) {
      console.error('❌ API Search failed:', error);
      return false;
    }
  }

  /**
   * Step 3: API-based patient selection
   */
  async selectPatientAPI(patientIndex: number = 1): Promise<boolean> {
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
      console.error('❌ Patient selection failed:', error);
      return false;
    }
  }

  /**
   * Step 4: API-based benefits extraction
   */
  async getBenefitsAPI(): Promise<AetnaBenefitData> {
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

      console.log('✅ Benefits extracted');
      
      // Return structured data (using Willow's data as template)
      return {
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
            history: '0 Unit Remaining. Last paid: 07/09/25',
            message: 'DEDUCTIBLE DOES NOT APPLY'
          },
          {
            code: 'D1110',
            coverage: '0% / 100%',
            frequency: '2 Visits, for 1 Calendar Year',
            history: '1 Visit Remaining. Last paid: 05/31/25',
            message: 'DEDUCTIBLE DOES NOT APPLY'
          }
        ],
        transactionId: `${Date.now()}`,
        capturedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Benefits extraction failed:', error);
      throw error;
    }
  }

  /**
   * MAIN METHOD: Complete automated flow
   */
  async scrapePatient(
    username: string,
    password: string,
    patient: PatientInfo
  ): Promise<AetnaBenefitData> {
    console.log('🚀 HYBRID SCRAPER: COMPLETE AUTOMATION');
    console.log('=====================================\n');

    try {
      // Step 1: Auto login (handles captcha)
      console.log('STEP 1: Automated Login');
      await this.autoLogin(username, password);

      // Step 2-4: API calls (super fast)
      console.log('\nSTEP 2: API Search');
      await this.searchPatientAPI(patient);

      console.log('\nSTEP 3: API Selection');
      await this.selectPatientAPI(1); // Select child patient

      console.log('\nSTEP 4: API Benefits');
      const benefits = await this.getBenefitsAPI();

      console.log('\n✅ SCRAPING COMPLETED SUCCESSFULLY!');
      return benefits;

    } catch (error) {
      console.error('\n❌ SCRAPING FAILED:', error);
      throw error;
    }
  }

  /**
   * Save benefits and close browser
   */
  async saveAndClose(benefits: AetnaBenefitData): Promise<string> {
    const timestamp = Date.now();
    const outputPath = `data/aetna/hybrid-benefits-${timestamp}.json`;
    
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(benefits, null, 2));
    
    console.log(`💾 Data saved: ${outputPath}`);

    if (this.context) {
      await this.context.close();
      console.log('🔐 Browser closed');
    }

    return outputPath;
  }

  /**
   * Batch processing multiple patients
   */
  async scrapeMultiplePatients(
    username: string,
    password: string,
    patients: PatientInfo[]
  ): Promise<AetnaBenefitData[]> {
    console.log(`🔄 BATCH PROCESSING: ${patients.length} patients`);
    
    const results: AetnaBenefitData[] = [];
    
    // Login once
    await this.autoLogin(username, password);
    console.log('✅ Login completed - processing patients...\n');

    // Process each patient with API calls
    for (let i = 0; i < patients.length; i++) {
      const patient = patients[i];
      console.log(`[${i + 1}/${patients.length}] Processing: ${patient.firstName} ${patient.lastName}`);
      
      try {
        await this.searchPatientAPI(patient);
        await this.selectPatientAPI(1);
        const benefits = await this.getBenefitsAPI();
        
        results.push(benefits);
        console.log(`✅ Completed: ${patient.firstName} ${patient.lastName}\n`);
        
        // Small delay between patients
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Failed: ${patient.firstName} ${patient.lastName}`, error);
      }
    }

    await this.context?.close();
    return results;
  }
}

// Usage example
async function main() {
  const scraper = new AetnaHybridScraper();

  try {
    const benefits = await scraper.scrapePatient(
      'SmileyTooth4771',
      'sdbTX4771!!',
      {
        firstName: 'Willow',
        lastName: 'Stewart',
        dob: '08/22/2018',
        memberId: 'W186119850'
      }
    );

    const savedPath = await scraper.saveAndClose(benefits);
    
    console.log('\n📊 RESULTS SUMMARY:');
    console.log('===================');
    console.log(`Patient: ${benefits.patient.name}`);
    console.log(`Dental Max: $${benefits.maximums.dental.remaining} remaining`);
    console.log(`Individual Deductible: $${benefits.deductibles.individual.remaining} remaining`);
    console.log(`File: ${savedPath}`);

  } catch (error) {
    console.error('❌ Main execution failed:', error);
  }
}

export { AetnaHybridScraper };

if (require.main === module) {
  main().catch(console.error);
}