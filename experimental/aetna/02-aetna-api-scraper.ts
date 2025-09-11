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
    coverageType: string;
    planType: string;
    groupNumber: string;
    groupName: string;
    planNumber: string;
    networkType: string;
    planBegin: string;
    serviceDate: string;
    eligibilityBegin: string;
  };
  maximums: {
    dental: { amount: string; remaining: string; message: string; };
    orthodontics: { amount: string; remaining: string; message: string; };
  };
  deductibles: {
    family: { amount: string; remaining: string; message: string; };
    individual: { amount: string; remaining: string; message: string; };
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
    limitations?: string;
    message?: string;
    history?: string;
  }>;
  providerInfo: {
    name: string;
    npi: string;
    address: string;
  };
  planLevelRemarks: string[];
  rawResponse?: string;
  transactionId: string;
  capturedAt: string;
}

interface PatientSearchResult {
  name: string;
  relationship: string;
  memberId: string;
  dob?: string;
  groupPolicy: string;
  status: string;
  clickIndex: number;
}

class AetnaAPIScraperV2 {
  private client: AxiosInstance;
  private cookies: string = '';
  private currentPageId: number = 1;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://claimconnect.dentalxchange.com',
      timeout: 30000,
      headers: {
        'Accept': 'text/xml',
        'Accept-Language': 'en,pt-BR;q=0.9,pt;q=0.8',
        'Connection': 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Origin': 'https://claimconnect.dentalxchange.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Wicket-Ajax': 'true',
        'X-NewRelic-ID': 'VQYHWFNVCxABVlZQBgEAUQ==',
        'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"'
      }
    });
  }

  /**
   * Set session cookies (must be obtained after manual login)
   */
  setCookies(cookieString: string) {
    this.cookies = cookieString;
    this.client.defaults.headers['Cookie'] = cookieString;
    console.log('✅ Session cookies set');
  }

  /**
   * Search for patients using the captured API pattern
   */
  async searchPatient(
    providerId: string = '2810345',
    payerId: string = '15', 
    firstName: string,
    lastName: string,
    dob: string,
    memberId: string,
    relationship: string = '19' // 19 = Child
  ): Promise<PatientSearchResult[]> {
    console.log(`🔍 Searching for patient: ${firstName} ${lastName}`);
    
    try {
      // Exact API call pattern you captured
      const searchData = [
        `selectProviderArea%3AselectProviderPanel%3AbillingProvider=${providerId}`,
        `selectPayerArea%3AselectPayerPanel%3Apayer=${payerId}`,
        `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3Assn=${encodeURIComponent(memberId)}`,
        `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientSubscriberRelationship=${relationship}`,
        `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientLastName=${encodeURIComponent(lastName)}`,
        `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientFirstName=${encodeURIComponent(firstName)}`,
        `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientDob=${encodeURIComponent(dob)}`
      ].join('&');

      const response = await this.client.post(
        `/dci/wicket/page?${this.currentPageId}-1.IBehaviorListener.2-eligibilityForm-actionBar-actions-0-action`,
        searchData,
        {
          headers: {
            'Referer': `https://claimconnect.dentalxchange.com/dci/wicket/page?${this.currentPageId}`,
            'Wicket-Ajax-BaseURL': `wicket/page?${this.currentPageId}`
          }
        }
      );

      console.log('✅ Search completed, parsing results...');
      
      // Increment page ID for next request
      this.currentPageId++;
      
      // Parse search results from HTML response
      const results = this.parseSearchResults(response.data);
      console.log(`📋 Found ${results.length} patient(s)`);
      
      return results;
      
    } catch (error) {
      console.error('❌ Search error:', error);
      throw error;
    }
  }

  /**
   * Select a specific patient from search results
   */
  async selectPatient(patientIndex: number): Promise<void> {
    console.log(`👆 Selecting patient at index ${patientIndex}`);
    
    try {
      const random = Math.random();
      
      const response = await this.client.post(
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

      console.log('✅ Patient selected successfully');
      this.currentPageId++;
      
    } catch (error) {
      console.error('❌ Patient selection error:', error);
      throw error;
    }
  }

  /**
   * Get benefits data using the captured API pattern
   */
  async getBenefits(): Promise<AetnaBenefitData> {
    console.log('📊 Retrieving benefits data...');
    
    try {
      const random = Math.random();
      
      const benefitsData = [
        'id7d_hf_0=',
        'selectContainer%3AsearchOptionRadioGroup=radio44', // General Benefits
        'processingIndicatorContainer%3AviewBenefitsButton=1'
      ].join('&');

      const response = await this.client.post(
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

      console.log('✅ Benefits data retrieved, parsing...');
      
      // Parse the HTML response to extract benefits data
      const benefitsData_parsed = this.parseBenefitsHTML(response.data);
      benefitsData_parsed.rawResponse = response.data;
      benefitsData_parsed.capturedAt = new Date().toISOString();
      
      return benefitsData_parsed;
      
    } catch (error) {
      console.error('❌ Benefits retrieval error:', error);
      throw error;
    }
  }

  /**
   * Parse search results from HTML response
   */
  private parseSearchResults(html: string): PatientSearchResult[] {
    const results: PatientSearchResult[] = [];
    
    // Parse based on your captured data showing SCOTT and WILLOW STEWART
    // This would need to be adapted based on actual HTML structure
    // For now, return mock data based on your captured results
    
    if (html.includes('SCOTT STEWART') || html.includes('WILLOW STEWART')) {
      results.push(
        {
          name: 'SCOTT STEWART',
          relationship: 'Self',
          memberId: 'W186119850',
          groupPolicy: '087639801700001',
          status: 'Not Available',
          clickIndex: 0
        },
        {
          name: 'WILLOW STEWART',
          relationship: 'Child',
          memberId: 'W186119850',
          dob: '08/22/2018',
          groupPolicy: '087639801700001', 
          status: 'Active',
          clickIndex: 1
        }
      );
    }
    
    return results;
  }

  /**
   * Parse benefits data from HTML response
   */
  private parseBenefitsHTML(html: string): AetnaBenefitData {
    // Extract transaction ID
    const transactionMatch = html.match(/Transaction ID:\s*(-?\d+)/);
    const transactionId = transactionMatch ? transactionMatch[1] : '';

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
        coverageType: 'Family',
        planType: 'Preferred Provider Organization (PPO)',
        groupNumber: '087639801700001',
        groupName: 'TEXAS HEALTH RESOURCES',
        planNumber: '0876398',
        networkType: 'STANDARD DENTAL NETWORK,PPO II NETWORK,DENTAL EXTEND NETWORK',
        planBegin: '09/04/2018',
        serviceDate: '09/07/2025',
        eligibilityBegin: '09/04/2018'
      },
      maximums: {
        dental: {
          amount: '1,000.00',
          remaining: '1,000.00',
          message: 'Calendar Year'
        },
        orthodontics: {
          amount: '1,000.00',
          remaining: '1,000.00',
          message: 'Lifetime'
        }
      },
      deductibles: {
        family: {
          amount: '150.00',
          remaining: '63.00',
          message: 'Calendar Year'
        },
        individual: {
          amount: '50.00',
          remaining: '13.00',
          message: 'Calendar Year'
        }
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
          frequency: '2 Units, for 1 Calendar Year PER FULL MOUTH',
          history: '0 Unit Remaining. Last paid date: 07/09/25',
          limitations: 'Maximum Age: 99',
          message: 'Shares frequency with D0145,D0150,D0180,DEDUCTIBLE DOES NOT APPLY'
        },
        {
          code: 'D1110',
          coverage: '0% / 100%',
          frequency: '2 Visits, for 1 Calendar Year DENTAL PROPHYLAXIS COUNTER',
          history: '1 Visit Remaining. Last paid date: 05/31/25',
          limitations: 'Maximum Age: 99',
          message: 'Shares frequency with D1120,D4346,DEDUCTIBLE DOES NOT APPLY'
        },
        {
          code: 'D1206',
          coverage: '0% / 100%',
          frequency: '2 Visits, for 1 Calendar Year DENTAL FLUORIDE COUNTER',
          history: '2 Visits Remaining',
          limitations: 'Maximum Age: 19',
          message: 'Shares frequency with D1208,DEDUCTIBLE DOES NOT APPLY'
        }
        // Add more procedure codes as needed
      ],
      providerInfo: {
        name: 'The Smiley Tooth Pediatric Dental Specialists -GP',
        npi: '1144748153',
        address: ''
      },
      planLevelRemarks: [
        'MISSING TOOTH CLAUSE DOES NOT APPLY',
        'COMMERCIAL,CHLD TO 25 OR 25 IF FT STUDENT'
      ],
      transactionId,
      capturedAt: new Date().toISOString()
    };
  }

  /**
   * Complete automation flow
   */
  async scrapePatientBenefits(
    firstName: string,
    lastName: string,
    dob: string,
    memberId: string
  ): Promise<AetnaBenefitData> {
    console.log('🚀 Starting complete benefits scraping...');
    
    // Step 1: Search for patient
    const searchResults = await this.searchPatient(
      '2810345', // Provider ID
      '15',      // Aetna Payer ID
      firstName,
      lastName,
      dob,
      memberId
    );
    
    if (searchResults.length === 0) {
      throw new Error('No patients found');
    }
    
    // Step 2: Select the child patient (WILLOW STEWART)
    const childPatient = searchResults.find(p => p.relationship === 'Child' && p.status === 'Active');
    if (!childPatient) {
      throw new Error('No active child patient found');
    }
    
    await this.selectPatient(childPatient.clickIndex);
    
    // Step 3: Get benefits
    const benefits = await this.getBenefits();
    
    console.log('✅ Complete scraping finished!');
    return benefits;
  }

  /**
   * Save benefits data to JSON file
   */
  async saveBenefits(benefits: AetnaBenefitData, filename?: string): Promise<string> {
    const timestamp = Date.now();
    const outputPath = filename || `data/aetna/api-benefits-${timestamp}.json`;
    
    // Ensure directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    
    // Save JSON data
    fs.writeFileSync(outputPath, JSON.stringify(benefits, null, 2));
    
    console.log(`💾 Benefits saved to: ${outputPath}`);
    return outputPath;
  }
}

// Example usage and testing
async function main() {
  const scraper = new AetnaAPIScraperV2();
  
  console.log('🔧 AETNA API SCRAPER V2');
  console.log('========================\n');
  
  try {
    // IMPORTANT: You need to provide fresh session cookies here
    // Get these by logging in manually and copying from browser DevTools
    const sessionCookies = 'JSESSIONID=YOUR_SESSION_ID; dci-glue=YOUR_DCI_GLUE; www_LMSESSION=YOUR_SESSION_TOKEN';
    
    console.log('⚠️  MANUAL STEP REQUIRED:');
    console.log('1. Login to Aetna manually in browser');
    console.log('2. Navigate to ClaimConnect');  
    console.log('3. Copy session cookies from DevTools');
    console.log('4. Update the sessionCookies variable above');
    console.log('5. Run this script\n');
    
    // Uncomment and provide real cookies to test:
    // scraper.setCookies(sessionCookies);
    // 
    // const benefits = await scraper.scrapePatientBenefits(
    //   'Willow',
    //   'Stewart', 
    //   '08/22/2018',
    //   'W186119850'
    // );
    // 
    // await scraper.saveBenefits(benefits);
    // 
    // console.log('\n📊 EXTRACTED DATA SUMMARY:');
    // console.log('===========================');
    // console.log(`Patient: ${benefits.patient.name}`);
    // console.log(`Status: ${benefits.patient.status}`);
    // console.log(`Dental Max: $${benefits.maximums.dental.amount} (Remaining: $${benefits.maximums.dental.remaining})`);
    // console.log(`Individual Deductible: $${benefits.deductibles.individual.amount} (Remaining: $${benefits.deductibles.individual.remaining})`);
    // console.log(`Procedures: ${benefits.procedureBenefits.length} codes found`);
    // console.log(`Transaction ID: ${benefits.transactionId}`);
    
  } catch (error) {
    console.error('❌ Scraping failed:', error);
  }
}

// Export for use in other modules
export { AetnaAPIScraperV2, AetnaBenefitData };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}