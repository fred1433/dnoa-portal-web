const axios = require('axios');
const fs = require('fs');
const path = require('path');

class AetnaFinalScraper {
  constructor() {
    this.client = axios.create({
      baseURL: 'https://claimconnect.dentalxchange.com',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Accept-Language': 'en,pt-BR;q=0.9,pt;q=0.8',
        'Connection': 'keep-alive'
      },
      // CRITICAL: Don't follow redirects automatically - we need to handle them manually
      maxRedirects: 0,
      validateStatus: (status) => status < 400 || [302, 303].includes(status)
    });
    
    this.currentPageId = 6; // You're on page 6 already
    this.sessionCookies = '';
  }

  setCookies(cookieString) {
    this.sessionCookies = cookieString;
    this.client.defaults.headers['Cookie'] = cookieString;
    console.log('✅ Session cookies configured');
  }

  async searchPatient(firstName, lastName, dob, memberId) {
    console.log(`🔍 Step 1: Searching ${firstName} ${lastName}...`);
    
    const searchData = [
      `selectProviderArea%3AselectProviderPanel%3AbillingProvider=2810345`,
      `selectPayerArea%3AselectPayerPanel%3Apayer=15`,
      `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3Assn=${encodeURIComponent(memberId)}`,
      `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientSubscriberRelationship=19`,
      `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientLastName=${encodeURIComponent(lastName)}`,
      `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientFirstName=${encodeURIComponent(firstName)}`,
      `identifyPatientArea%3AeligibilityIdentifyPatientPanel%3ApatientDob=${encodeURIComponent(dob)}`
    ].join('&');

    try {
      const response = await this.client.post(
        `/dci/wicket/page?${this.currentPageId}-1.IBehaviorListener.2-eligibilityForm-actionBar-actions-0-action`,
        searchData,
        {
          headers: {
            'Accept': 'text/xml',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'Referer': `https://claimconnect.dentalxchange.com/dci/eligibility/EligSearchPage?${this.currentPageId}&r=1`,
            'Wicket-Ajax': 'true',
            'Origin': 'https://claimconnect.dentalxchange.com'
          }
        }
      );

      this.currentPageId++;
      console.log('✅ Patient search completed');
      return true;

    } catch (error) {
      console.error('❌ Search failed:', error.message);
      return false;
    }
  }

  async selectPatient(patientIndex = 1) {
    console.log(`👆 Step 2: Selecting patient ${patientIndex}...`);
    
    try {
      const random = Math.random();
      
      const response = await this.client.post(
        `/dci/wicket/page?${this.currentPageId}-2.IBehaviorListener.1-eligibilityPatientListArea-eligibilityPatientListPanel-patientListForm-listArea-eligMemberList-${patientIndex}-nameLink&random=${random}`,
        `id55_hf_0=&listArea%3AeligMemberList%3A${patientIndex}%3AnameLink=1`,
        {
          headers: {
            'Accept': 'text/xml',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'Referer': `https://claimconnect.dentalxchange.com/dci/wicket/page?${this.currentPageId}`,
            'Wicket-Ajax': 'true',
            'Origin': 'https://claimconnect.dentalxchange.com'
          }
        }
      );

      this.currentPageId++;
      console.log('✅ Patient selected successfully');
      return true;

    } catch (error) {
      console.error('❌ Patient selection failed:', error.message);
      return false;
    }
  }

  async getBenefitsWithRedirect() {
    console.log('📊 Step 3: Getting benefits (handling redirect)...');
    
    try {
      const random = Math.random();
      
      const benefitsData = [
        'id7d_hf_0=',
        'selectContainer%3AsearchOptionRadioGroup=radio44', // General Benefits
        'processingIndicatorContainer%3AviewBenefitsButton=1'
      ].join('&');

      // STEP 3A: Make the benefits request (expect redirect)
      console.log('📤 Making benefits API call...');
      
      let response;
      try {
        response = await this.client.post(
          `/dci/wicket/page?${this.currentPageId}-3.IBehaviorListener.1-benefitsSearchPanel-benefitsSearchForm-processingIndicatorContainer-viewBenefitsButton&random=${random}`,
          benefitsData,
          {
            headers: {
              'Accept': 'text/xml',
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
              'Referer': `https://claimconnect.dentalxchange.com/dci/wicket/page?${this.currentPageId}`,
              'Wicket-Ajax': 'true',
              'Origin': 'https://claimconnect.dentalxchange.com'
            }
          }
        );
      } catch (error) {
        // Handle redirect response
        if (error.response && [302, 303].includes(error.response.status)) {
          response = error.response;
          console.log('📍 Redirect detected:', response.status);
        } else {
          throw error;
        }
      }

      // STEP 3B: Check for redirect in response
      let finalHtml = '';
      
      if ([302, 303].includes(response.status)) {
        const redirectLocation = response.headers['location'];
        console.log('🔄 Following redirect to:', redirectLocation);
        
        // Build full URL
        const redirectUrl = redirectLocation.startsWith('http') 
          ? redirectLocation 
          : `https://claimconnect.dentalxchange.com/dci/wicket/${redirectLocation}`;
        
        // Follow the redirect with proper headers
        const htmlResponse = await this.client.get(redirectUrl, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': `https://claimconnect.dentalxchange.com/dci/wicket/page?${this.currentPageId}`,
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin'
          },
          maxRedirects: 5 // Allow normal redirects for the HTML page
        });
        
        finalHtml = htmlResponse.data;
        console.log('✅ HTML page retrieved:', finalHtml.length, 'characters');
        
      } else if (response.data && response.data.includes('<ajax-response><redirect>')) {
        // Handle Wicket AJAX redirect
        const redirectMatch = response.data.match(/<redirect><!\[CDATA\[(.*?)\]\]><\/redirect>/);
        
        if (redirectMatch) {
          const wicketRedirect = redirectMatch[1];
          console.log('🔄 Following Wicket redirect to:', wicketRedirect);
          
          const redirectUrl = wicketRedirect.startsWith('http') 
            ? wicketRedirect 
            : `https://claimconnect.dentalxchange.com/dci/wicket/${wicketRedirect}`;
          
          const htmlResponse = await this.client.get(redirectUrl, {
            headers: {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Referer': `https://claimconnect.dentalxchange.com/dci/wicket/page?${this.currentPageId}`,
              'Upgrade-Insecure-Requests': '1'
            },
            maxRedirects: 5
          });
          
          finalHtml = htmlResponse.data;
          console.log('✅ HTML page retrieved via Wicket redirect:', finalHtml.length, 'characters');
        }
      } else {
        // Direct HTML response
        finalHtml = response.data;
        console.log('✅ Direct HTML response:', finalHtml.length, 'characters');
      }

      // STEP 3C: Parse the HTML for real data
      console.log('🔍 Parsing benefits data from HTML...');
      const benefitsData_parsed = this.parseHtmlBenefits(finalHtml);
      
      return benefitsData_parsed;

    } catch (error) {
      console.error('❌ Benefits retrieval failed:', error.message);
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Headers:', error.response.headers);
        console.log('Data preview:', error.response.data?.substring(0, 200));
      }
      throw error;
    }
  }

  parseHtmlBenefits(html) {
    console.log('📋 Extracting structured data from HTML...');
    
    // Initialize result object
    const benefits = {
      patient: {},
      coverage: {},
      maximums: {},
      deductibles: {},
      coInsurance: {},
      procedureBenefits: [],
      providerInfo: {},
      planLevelRemarks: [],
      rawHtml: html,
      capturedAt: new Date().toISOString()
    };

    try {
      // Extract patient information
      const patientMatch = html.match(/Name:<br\s*\/?>Member ID or SSN:<br\s*\/?>Date of Birth:<\/td>\s*<td>([^<]+)<br\s*\/?>(W[^<]+)<br\s*\/?>([\d\/]+)/i);
      if (patientMatch) {
        benefits.patient.name = patientMatch[1].trim();
        benefits.patient.memberId = patientMatch[2].trim();
        benefits.patient.dob = patientMatch[3].trim();
        console.log('✅ Patient info extracted:', benefits.patient.name);
      }

      // Extract maximums using the pattern we saw
      const maxMatches = html.matchAll(/<span>([^<]+)<\/span>\s*<\/td><td>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>\s*<\/td><td>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>\s*<\/td><td>\s*<span>([^<]+)<\/span>/g);
      
      for (const match of maxMatches) {
        const [, type, amount, remaining, period] = match;
        
        if (type.includes('Individual') && !type.includes('Orthodontics')) {
          benefits.maximums.dental = {
            amount: amount,
            remaining: remaining,
            period: period.trim()
          };
          console.log('✅ Dental maximum extracted:', amount);
        } else if (type.includes('Orthodontics')) {
          benefits.maximums.orthodontics = {
            amount: amount,
            remaining: remaining, 
            period: period.trim()
          };
          console.log('✅ Orthodontics maximum extracted:', amount);
        }
      }

      // Extract deductibles with family/individual distinction
      const deductibleMatches = html.matchAll(/Dental\s+<\/td><td>\s*<span>([^<]+)<\/span>\s*<\/td><td>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>\s*<\/td><td>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>/g);
      
      for (const match of deductibleMatches) {
        const [, type, amount, remaining] = match;
        
        if (type.includes('Family')) {
          benefits.deductibles.family = {
            amount: amount,
            remaining: remaining
          };
          console.log('✅ Family deductible extracted:', amount);
        } else if (type.includes('Individual')) {
          benefits.deductibles.individual = {
            amount: amount, 
            remaining: remaining
          };
          console.log('✅ Individual deductible extracted:', amount);
        }
      }

      // Extract co-insurance percentages
      const coInsuranceMatches = html.matchAll(/([^<\n]+)\s*<\/td><td[^>]*>\s*<span>(\d+%)\s*\/\s*(\d+%)<\/span>/g);
      
      for (const match of coInsuranceMatches) {
        const [, type, patientPercent, insurancePercent] = match;
        const typeClean = type.trim().toLowerCase();
        
        if (typeClean.includes('preventative')) {
          benefits.coInsurance.preventative = `${patientPercent} / ${insurancePercent}`;
        } else if (typeClean.includes('basic')) {
          benefits.coInsurance.basic = `${patientPercent} / ${insurancePercent}`;
        } else if (typeClean.includes('major') || typeClean.includes('ortho')) {
          benefits.coInsurance.major = `${patientPercent} / ${insurancePercent}`;
        }
      }

      // Extract procedure codes with detailed information
      const procedureMatches = html.matchAll(/<span>(D\d{4})<\/span>\s*<\/td><td[^>]*>\s*<span>([^<]+)<\/span>.*?<span>([^<]+)<\/span>.*?<span>([^<]+)<\/span>/g);
      
      for (const match of procedureMatches) {
        const [, code, coverage, frequency, message] = match;
        
        benefits.procedureBenefits.push({
          code: code,
          coverage: coverage.trim(),
          frequency: frequency.trim(),
          message: message.trim()
        });
      }

      console.log('✅ Extracted', benefits.procedureBenefits.length, 'procedure codes');

      // Extract provider information
      const providerMatch = html.match(/Provider Name:<\/td>\s*<td>([^<]+)</);
      if (providerMatch) {
        benefits.providerInfo.name = providerMatch[1].trim();
      }

      const npiMatch = html.match(/NPI:<\/td>\s*<td>([^<]+)</);
      if (npiMatch) {
        benefits.providerInfo.npi = npiMatch[1].trim();
      }

      // Extract plan level remarks
      const remarksMatch = html.match(/Plan Level Remarks[^<]*<\/[^>]+>\s*([^<]+)/i);
      if (remarksMatch) {
        const remarks = remarksMatch[1].split(/[,\n]/).map(r => r.trim()).filter(r => r);
        benefits.planLevelRemarks = remarks;
      }

      console.log('📊 Benefits parsing completed successfully');
      return benefits;

    } catch (error) {
      console.error('⚠️ Parsing error:', error.message);
      // Return partial data with error info
      benefits.parsingError = error.message;
      return benefits;
    }
  }

  async scrapeComplete(cookieString, firstName, lastName, dob, memberId) {
    console.log('🚀 AETNA FINAL SCRAPER - COMPLETE FLOW');
    console.log('=====================================\n');

    try {
      this.setCookies(cookieString);

      // Execute the complete flow
      const searchSuccess = await this.searchPatient(firstName, lastName, dob, memberId);
      if (!searchSuccess) throw new Error('Patient search failed');

      const selectSuccess = await this.selectPatient(1);
      if (!selectSuccess) throw new Error('Patient selection failed');

      const benefits = await this.getBenefitsWithRedirect();

      console.log('\n✅ SCRAPING COMPLETED SUCCESSFULLY!');
      return benefits;

    } catch (error) {
      console.error('\n❌ SCRAPING FAILED:', error.message);
      throw error;
    }
  }

  saveResults(benefits, filename) {
    const timestamp = Date.now();
    const outputPath = filename || `data/aetna/final-benefits-${timestamp}.json`;
    
    // Ensure directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    
    // Save structured JSON (without rawHtml to keep file size reasonable)
    const jsonData = { ...benefits };
    delete jsonData.rawHtml; // Remove raw HTML from JSON file
    
    fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2));
    
    // Save raw HTML separately for debugging
    const htmlPath = outputPath.replace('.json', '.html');
    fs.writeFileSync(htmlPath, benefits.rawHtml || '');
    
    console.log(`💾 Benefits JSON saved: ${outputPath}`);
    console.log(`💾 Raw HTML saved: ${htmlPath}`);
    return outputPath;
  }
}

// Test execution
async function main() {
  const scraper = new AetnaFinalScraper();

  try {
    // Use latest cookies from your session
    const cookieString = 'JSESSIONID=6289febcd98a5f44914f16122819; dci-glue=!MW4NnHgerJ4LTXkGg009PQW5LrBQEWzTP7NFR8fLByfghlmU1tT5iXEOYrPdoeg2WDJyPlmsQFyqPTg=; dxc-glue=!9qkZHCjmsCyrPx0Gg009PQW5LrBQEWzTP7NFR8fLByfghlmU1tT5iXEOYrPdoeg2WDJyPlmsQFyqPTg=; www_LMSESSION=encs%3A%3ASxU1sEp4XjLuP%2FvmOi6Xp0oP7CRlArhWJrAWVxuWbvrO0NInu9k7piIHUz1bC%2B0wZJ79BsGd2GALuZeDCyleV9bofOz2jVHaVAXqDo67bwadd68yTVv4EhiCBgu%2BGCFEcbsSngoi7imOPRkiSxKzbQ4tPF30AmtttJ7U7Berq4oL07t0eqUWTw%3D%3D; TS0167e87b=014e6e52b8003f01bebb2c439d9a323fa555f657d21103d8ca50334ae5015903a7b831e248cbcfbf1d89cb949164e4c25d3c44d0bf; TS01fa2629=014e6e52b8c8a5fd08b2ce390653bd999960e7cf31c337ce65d5592291ccb85d660bda22737c9516f239534070101f18b2c01a9765; _ga=GA1.2.1897523849.1757166754; _gid=GA1.2.1871624999.1757274058; _ga_8N8ZN4XDLZ=GS2.2.s1757283935$o5$g1$t1757286532$j60$l0$h0; _gat=1';

    const benefits = await scraper.scrapeComplete(
      cookieString,
      'Willow',
      'Stewart',
      '08/22/2018',
      'W186119850'
    );

    const savedPath = scraper.saveResults(benefits);
    
    console.log('\n📊 FINAL RESULTS SUMMARY:');
    console.log('=========================');
    console.log(`Patient: ${benefits.patient.name || 'Not found'}`);
    console.log(`Member ID: ${benefits.patient.memberId || 'Not found'}`);
    console.log(`Dental Maximum: $${benefits.maximums.dental?.amount || 'Not found'} (Remaining: $${benefits.maximums.dental?.remaining || 'Not found'})`);
    console.log(`Individual Deductible: $${benefits.deductibles.individual?.amount || 'Not found'} (Remaining: $${benefits.deductibles.individual?.remaining || 'Not found'})`);
    console.log(`Procedures Found: ${benefits.procedureBenefits.length}`);
    console.log(`Saved to: ${savedPath}`);
    
    if (benefits.procedureBenefits.length > 0) {
      console.log('\n🦷 Sample Procedures:');
      benefits.procedureBenefits.slice(0, 3).forEach(proc => {
        console.log(`  ${proc.code}: ${proc.coverage} - ${proc.frequency}`);
      });
    }
    
    console.log('\n🎉 MISSION ACCOMPLISHED!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

module.exports = AetnaFinalScraper;

// Run if called directly
if (require.main === module) {
  main();
}