const axios = require('axios');
const fs = require('fs');
const path = require('path');

class DirectBenefitsScraper {
  constructor() {
    this.cookieString = '';
  }

  setCookies(cookieString) {
    this.cookieString = cookieString;
    console.log('✅ Session cookies configured');
  }

  async getCurrentPageData() {
    console.log('📄 Fetching current benefits page...');
    
    // Updated cookies from console
    const fullCookieString = 'JSESSIONID=6289febcd98a5f44914f16122819; dci-glue=!MW4NnHgerJ4LTXkGg009PQW5LrBQEV+ctiesgoTIYNt+4mSHx869ST1HY5CxcRX+ZE9BJWWDs7P1plI=; dxc-glue=!9qkZHCjmsCyrPx0Gg009PQW5LrBQEWzTP7NFR8fLByfghlmU1tT5iXEOYrPdoeg2WDJyPlmsQFyqPTg=; www_LMSESSION=encs%3A%3ASxU1sEp4XjLuP%2FvmOi6Xp0oP7CRlArhWJrAWVxuWbvrO0NInu9k7piIHUz1bC%2B0wZJ79BsGd2GALuZeDCyleV9bofOz2jVHaVAXqDo67bwadd68yTVv4EhiCBgu%2BGCFEcbsSngoi7imOPRkiSxKzbQ4tPF30AmtttJ7U7Berq4oL07t0eqUWTw%3D%3D; TS0167e87b=014e6e52b8003f01bebb2c439d9a323fa555f657d21103d8ca50334ae5015903a7b831e248cbcfbf1d89cb949164e4c25d3c44d0bf; TS01fa2629=014e6e52b8c8a5fd08b2ce390653bd999960e7cf31c337ce65d5592291ccb85d660bda22737c9516f239534070101f18b2c01a9765; _ga=GA1.2.1897523849.1757166754; _gid=GA1.2.1871624999.1757274058; _ga_LPWN7HY3CN=GS2.2.s1757277218$o1$g0$t1757277218$j60$l0$h0; _ga_8N8ZN4XDLZ=GS2.2.s1757283935$o5$g1$t1757286559$j33$l0$h0';

    try {
      const response = await axios.get('https://claimconnect.dentalxchange.com/dci/wicket/page?6', {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en,pt-BR;q=0.9,pt;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
          'Cookie': fullCookieString,
          'Referer': 'https://claimconnect.dentalxchange.com/dci/wicket/page?6',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin'
        }
      });

      console.log('✅ Page retrieved:', response.data.length, 'characters');
      return response.data;

    } catch (error) {
      console.error('❌ Failed to fetch page:', error.message);
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Headers:', JSON.stringify(error.response.headers, null, 2));
      }
      throw error;
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
      const patientBlock = html.match(/Name:<br\s*\/?>Member ID or SSN:<br\s*\/?>Date of Birth:<\/td>\s*<td>([^<]+)<br\s*\/?>(W[^<]+)<br\s*\/?>([\d\/]+)/i);
      if (patientBlock) {
        benefits.patient.name = patientBlock[1].trim();
        benefits.patient.memberId = patientBlock[2].trim();
        benefits.patient.dob = patientBlock[3].trim();
        console.log('✅ Patient:', benefits.patient.name);
      }

      // Provider Information
      const providerMatch = html.match(/Provider Name:<\/td>\s*<td>([^<]+)/i);
      if (providerMatch) {
        benefits.providerInfo.name = providerMatch[1].trim();
      }

      const npiMatch = html.match(/NPI:<\/td>\s*<td>([^<]+)/i);
      if (npiMatch) {
        benefits.providerInfo.npi = npiMatch[1].trim();
      }

      // Coverage Information
      const payerMatch = html.match(/Payer:<\/td>\s*<td>([^<]+)/i);
      if (payerMatch) {
        benefits.coverage.payerName = payerMatch[1].trim();
      }

      const groupMatch = html.match(/Group Number:<\/td>\s*<td>([^<]+)/i);
      if (groupMatch) {
        benefits.coverage.groupNumber = groupMatch[1].trim();
      }

      const groupNameMatch = html.match(/Group Name:<\/td>\s*<td>([^<]+)/i);
      if (groupNameMatch) {
        benefits.coverage.groupName = groupNameMatch[1].trim();
      }

      // Maximums - Enhanced parsing
      console.log('🔍 Looking for maximums...');
      
      // Look for the maximums table structure
      const maxTableRegex = /<tr[^>]*>\s*<td[^>]*>\s*<span>DENTAL<\/span>\s*<\/td><td[^>]*>\s*<span>Individual<\/span>\s*<\/td><td[^>]*>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>\s*<\/td><td[^>]*>\s*<span>\$([0-9,]+\.[0-9]{2})<\/span>\s*<\/td><td[^>]*>\s*<span>([^<]+)<\/span>/i;
      const dentalMax = html.match(maxTableRegex);
      
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

      // Deductibles - Enhanced parsing
      console.log('🔍 Looking for deductibles...');
      
      // Family deductible
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

      // Co-Insurance
      console.log('🔍 Looking for co-insurance...');
      
      const preventativeMatch = html.match(/Preventative[^<]*<\/td><td[^>]*>\s*<span>(\d+%)\s*\/\s*(\d+%)<\/span>/i);
      if (preventativeMatch) {
        benefits.coInsurance.preventative = `${preventativeMatch[1]} / ${preventativeMatch[2]}`;
      }

      const basicMatch = html.match(/Basic[^<]*<\/td><td[^>]*>\s*<span>(\d+%)\s*\/\s*(\d+%)<\/span>/i);
      if (basicMatch) {
        benefits.coInsurance.basic = `${basicMatch[1]} / ${basicMatch[2]}`;
      }

      const majorMatch = html.match(/Major[^<]*<\/td><td[^>]*>\s*<span>(\d+%)\s*\/\s*(\d+%)<\/span>/i);
      if (majorMatch) {
        benefits.coInsurance.major = `${majorMatch[1]} / ${majorMatch[2]}`;
      }

      // Procedure Codes
      console.log('🔍 Looking for procedure codes...');
      
      // Enhanced procedure parsing
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

      console.log('✅ Found', benefits.procedureBenefits.length, 'procedure codes');

      // Plan Level Remarks
      const remarksMatch = html.match(/Plan Level Remarks[^<]*<\/[^>]+>\s*([^<]+)/i);
      if (remarksMatch) {
        const remarks = remarksMatch[1].split(/[,\n]/).map(r => r.trim()).filter(r => r);
        benefits.planLevelRemarks = remarks;
      }

      return benefits;

    } catch (error) {
      console.error('⚠️ Parsing error:', error.message);
      benefits.parsingError = error.message;
      return benefits;
    }
  }

  async scrapeCurrentPage() {
    console.log('🚀 DIRECT BENEFITS SCRAPER');
    console.log('==========================\n');

    try {
      const html = await this.getCurrentPageData();
      const benefits = this.parseHtmlBenefits(html);
      
      console.log('\n✅ SCRAPING COMPLETED!');
      return benefits;

    } catch (error) {
      console.error('\n❌ SCRAPING FAILED:', error.message);
      throw error;
    }
  }

  saveResults(benefits) {
    const timestamp = Date.now();
    const outputPath = `data/aetna/direct-benefits-${timestamp}.json`;
    
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(benefits, null, 2));
    
    console.log(`💾 Data saved: ${outputPath}`);
    return outputPath;
  }
}

// Test execution
async function main() {
  const scraper = new DirectBenefitsScraper();

  try {
    const benefits = await scraper.scrapeCurrentPage();
    const savedPath = scraper.saveResults(benefits);
    
    console.log('\n📊 RESULTS SUMMARY:');
    console.log('===================');
    console.log(`Patient: ${benefits.patient.name || 'Not extracted'}`);
    console.log(`Member ID: ${benefits.patient.memberId || 'Not extracted'}`);
    console.log(`DOB: ${benefits.patient.dob || 'Not extracted'}`);
    console.log(`Provider: ${benefits.providerInfo.name || 'Not extracted'}`);
    console.log(`Dental Max: $${benefits.maximums.dental?.amount || 'Not found'} (Remaining: $${benefits.maximums.dental?.remaining || 'Not found'})`);
    console.log(`Ortho Max: $${benefits.maximums.orthodontics?.amount || 'Not found'} (Remaining: $${benefits.maximums.orthodontics?.remaining || 'Not found'})`);
    console.log(`Family Deductible: $${benefits.deductibles.family?.amount || 'Not found'} (Remaining: $${benefits.deductibles.family?.remaining || 'Not found'})`);
    console.log(`Individual Deductible: $${benefits.deductibles.individual?.amount || 'Not found'} (Remaining: $${benefits.deductibles.individual?.remaining || 'Not found'})`);
    console.log(`Co-Insurance Preventative: ${benefits.coInsurance.preventative || 'Not found'}`);
    console.log(`Co-Insurance Basic: ${benefits.coInsurance.basic || 'Not found'}`);
    console.log(`Co-Insurance Major: ${benefits.coInsurance.major || 'Not found'}`);
    console.log(`Procedures Found: ${benefits.procedureBenefits.length}`);
    console.log(`Plan Remarks: ${benefits.planLevelRemarks.length} items`);
    console.log(`Saved to: ${savedPath}`);
    
    if (benefits.procedureBenefits.length > 0) {
      console.log('\n🦷 Sample Procedures:');
      benefits.procedureBenefits.slice(0, 5).forEach(proc => {
        console.log(`  ${proc.code}: ${proc.coverage} - ${proc.frequency}`);
      });
    }
    
    console.log('\n🎉 DIRECT SCRAPING SUCCESSFUL!');
    console.log('This approach works without any API calls - just pure HTML extraction!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

module.exports = DirectBenefitsScraper;

if (require.main === module) {
  main();
}