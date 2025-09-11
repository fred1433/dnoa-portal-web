const axios = require('axios');
const fs = require('fs');
const path = require('path');

class AetnaManualAPI {
  constructor() {
    this.apiClient = axios.create({
      baseURL: 'https://claimconnect.dentalxchange.com',
      timeout: 30000,
      headers: {
        'Accept': 'text/xml',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Wicket-Ajax': 'true',
        'Origin': 'https://claimconnect.dentalxchange.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      }
    });
    
    this.currentPageId = 4; // Start from page 4 (benefits page)
  }

  /**
   * Set cookies manually copied from browser
   */
  setCookies(cookieString) {
    this.apiClient.defaults.headers['Cookie'] = cookieString;
    console.log('✅ Session cookies configured');
  }

  /**
   * Search for patient
   */
  async searchPatient(firstName, lastName, dob, memberId) {
    console.log(`🔍 Searching: ${firstName} ${lastName}`);
    
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
      console.log('✅ Search completed');
      console.log('Response length:', response.data.length);
      return response.data;

    } catch (error) {
      console.error('❌ Search failed:', error.message);
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Response:', error.response.data.substring(0, 200));
      }
      throw error;
    }
  }

  /**
   * Select patient (usually index 1 for child)
   */
  async selectPatient(patientIndex = 1) {
    console.log(`👆 Selecting patient ${patientIndex}`);
    
    try {
      const random = Math.random();
      
      const response = await this.apiClient.post(
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
      return response.data;

    } catch (error) {
      console.error('❌ Selection failed:', error.message);
      throw error;
    }
  }

  /**
   * Get benefits
   */
  async getBenefits() {
    console.log('📊 Getting benefits...');
    
    try {
      const random = Math.random();
      
      const benefitsData = [
        'id7d_hf_0=',
        'selectContainer%3AsearchOptionRadioGroup=radio44', // General Benefits
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

      console.log('✅ Benefits retrieved');
      console.log('Response length:', response.data.length);
      
      // ZERO MOCKING - RETURN RAW DATA FOR NOW
      const benefits = {
        success: true,
        timestamp: new Date().toISOString(),
        rawResponse: response.data,
        responseLength: response.data.length
      };

      // Log first 500 chars to see what we got
      console.log('Raw response preview:', response.data.substring(0, 500));

      return benefits;

    } catch (error) {
      console.error('❌ Benefits failed:', error.message);
      throw error;
    }
  }

  /**
   * Complete flow
   */
  async scrapeWithCookies(cookieString, firstName, lastName, dob, memberId) {
    try {
      console.log('🚀 MANUAL + API SCRAPER');
      console.log('=======================\n');

      this.setCookies(cookieString);

      console.log('Step 1: Search Patient');
      await this.searchPatient(firstName, lastName, dob, memberId);

      console.log('\nStep 2: Select Patient');
      await this.selectPatient(1);

      console.log('\nStep 3: Get Benefits');
      const benefits = await this.getBenefits();

      console.log('\n✅ SUCCESS!');
      return benefits;

    } catch (error) {
      console.error('❌ Scraping failed:', error.message);
      throw error;
    }
  }

  /**
   * Save results
   */
  saveResults(benefits) {
    const timestamp = Date.now();
    const outputDir = path.join(process.cwd(), 'data', 'aetna');
    const outputPath = path.join(outputDir, `manual-api-benefits-${timestamp}.json`);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(benefits, null, 2));
    console.log(`💾 Saved: ${outputPath}`);
    return outputPath;
  }
}

// Example usage
async function testWithManualCookies() {
  const scraper = new AetnaManualAPI();

  console.log('🔧 MANUAL COOKIE TEST');
  console.log('====================\n');

  console.log('⚠️  INSTRUCTIONS:');
  console.log('1. Navigate manually to ClaimConnect in your browser');
  console.log('2. Open DevTools > Application > Cookies');
  console.log('3. Copy all cookies for claimconnect.dentalxchange.com');
  console.log('4. Update the cookieString below');
  console.log('5. Run this script\n');

  // LATEST COOKIES FROM BENEFITS PAGE
  const cookieString = 'JSESSIONID=6289febcd98a5f44914f16122819; dci-glue=!MW4NnHgerJ4LTXkGg009PQW5LrBQEV+ctiesgoTIYNt+4mSHx869ST1HY5CxcRX+ZE9BJWWDs7P1plI=; dxc-glue=!9qkZHCjmsCyrPx0Gg009PQW5LrBQEWzTP7NFR8fLByfghlmU1tT5iXEOYrPdoeg2WDJyPlmsQFyqPTg=; www_LMSESSION=encs%3A%3ASxU1sEp4XjLuP%2FvmOi6Xp0oP7CRlArhWJrAWVxuWbvrO0NInu9k7piIHUz1bC%2B0wZJ79BsGd2GALuZeDCyleV9bofOz2jVHaVAXqDo67bwadd68yTVv4EhiCBgu%2BGCFEcbsSngoi7imOPRkiSxKzbQ4tPF30AmtttJ7U7Berq4oL07t0eqUWTw%3D%3D; TS0167e87b=014e6e52b8003f01bebb2c439d9a323fa555f657d21103d8ca50334ae5015903a7b831e248cbcfbf1d89cb949164e4c25d3c44d0bf; TS01fa2629=014e6e52b8a3576fafdf46df3bcfde4b3d209fc2e7bf2106ae85acf888a3aa572a050ed788025653d042580eecb29cbe6bbbceb3ab; _ga=GA1.2.1897523849.1757166754; _gid=GA1.2.1871624999.1757274058; _ga_8N8ZN4XDLZ=GS2.2.s1757283935$o5$g1$t1757284842$j20$l0$h0';

  try {
    const benefits = await scraper.scrapeWithCookies(
      cookieString,
      'Willow',
      'Stewart', 
      '08/22/2018',
      'W186119850'
    );

    scraper.saveResults(benefits);

    console.log('\n📊 SUMMARY:');
    console.log(`Patient: ${benefits.patient.name}`);
    console.log(`Dental Max Remaining: $${benefits.maximums.dental.remaining}`);
    console.log(`Individual Deductible Remaining: $${benefits.deductibles.individual.remaining}`);

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

module.exports = AetnaManualAPI;

// Run test if called directly
if (require.main === module) {
  testWithManualCookies();
}