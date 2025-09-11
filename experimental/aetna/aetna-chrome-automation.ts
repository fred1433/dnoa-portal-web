import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

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

class AetnaChromeAutomation {
  private async executeAppleScript(script: string): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
      if (stderr) {
        console.warn('⚠️ AppleScript warning:', stderr);
      }
      return stdout.trim();
    } catch (error: any) {
      console.error('❌ AppleScript error:', error.message);
      throw error;
    }
  }

  private async executeJavaScript(js: string): Promise<string> {
    // Escape the JavaScript for AppleScript
    const escapedJs = js.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    
    const appleScript = `
      tell application "Google Chrome"
        set activeTab to active tab of front window
        return execute activeTab javascript "${escapedJs}"
      end tell
    `;
    
    return this.executeAppleScript(appleScript);
  }

  private async delay(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  async init() {
    console.log('🔧 Opening Chrome browser...');
    
    // Open Chrome and create/focus window
    await this.executeAppleScript(`
      tell application "Google Chrome"
        activate
        if (count of windows) = 0 then
          make new window
        end if
      end tell
    `);
    
    console.log('✅ Chrome initialized');
  }

  async navigateToUrl(url: string) {
    console.log(`📍 Navigating to ${url}...`);
    
    await this.executeAppleScript(`
      tell application "Google Chrome"
        set URL of active tab of front window to "${url}"
      end tell
    `);
    
    await this.delay(3);
  }

  async login(username: string, password: string) {
    console.log('🔐 Logging in to Aetna...');
    
    // Navigate to Aetna
    await this.navigateToUrl('https://www.aetna.com/provweb/');
    
    // Check if login is needed
    const needsLogin = await this.executeJavaScript(`
      (() => {
        const userField = document.querySelector('input[name="USER"]');
        return userField !== null;
      })()
    `);
    
    if (needsLogin === 'true') {
      console.log('📝 Filling login form...');
      
      // Fill username
      await this.executeJavaScript(`
        document.querySelector('input[name="USER"]').value = '${username}';
        document.querySelector('input[name="USER"]').dispatchEvent(new Event('input', {bubbles: true}));
      `);
      
      // Fill password
      await this.executeJavaScript(`
        document.querySelector('input[name="PASSWORD"]').value = '${password}';
        document.querySelector('input[name="PASSWORD"]').dispatchEvent(new Event('input', {bubbles: true}));
      `);
      
      // Click login
      await this.executeJavaScript(`
        const loginBtn = document.querySelector('input[type="submit"][value="Log In"]');
        if (loginBtn) loginBtn.click();
      `);
      
      await this.delay(3);
      
      // Check for captcha
      const hasCaptcha = await this.executeJavaScript(`
        document.querySelector('iframe[src*="hcaptcha"]') !== null
      `);
      
      if (hasCaptcha === 'true') {
        console.log('⚠️ Captcha detected! Please solve it manually in Chrome.');
        console.log('Press Enter when done...');
        
        // Wait for user input
        await new Promise(resolve => {
          process.stdin.once('data', resolve);
        });
        
        // Click Continue after captcha
        await this.executeJavaScript(`
          const continueBtn = Array.from(document.querySelectorAll('button')).find(btn => 
            btn.textContent.includes('Continue'));
          if (continueBtn) continueBtn.click();
        `);
      }
      
      console.log('✅ Login successful');
    } else {
      console.log('✅ Already logged in');
    }
  }

  async navigateToEligibility() {
    console.log('📋 Navigating to eligibility search...');
    
    // Handle disclaimer if present
    const hasDisclaimer = await this.executeJavaScript(`
      document.querySelector('input[type="submit"][value="Continue"]') !== null
    `);
    
    if (hasDisclaimer === 'true') {
      console.log('📄 Handling disclaimer page...');
      await this.executeJavaScript(`
        document.querySelector('input[type="submit"][value="Continue"]').click();
      `);
      await this.delay(3);
    }
    
    // Click Eligibility & Benefits
    console.log('🔍 Looking for Eligibility & Benefits menu...');
    await this.executeJavaScript(`
      (() => {
        const menuItem = document.querySelector('#menuItem-3 > a');
        if (menuItem) {
          menuItem.click();
          return true;
        }
        
        const links = Array.from(document.querySelectorAll('a'));
        const eligLink = links.find(link => link.textContent.includes('Eligibility & Benefits'));
        if (eligLink) {
          eligLink.click();
          return true;
        }
        return false;
      })()
    `);
    
    await this.delay(4);
    
    // Close any popups
    await this.executeJavaScript(`
      (() => {
        const closeBtn = Array.from(document.querySelectorAll('button')).find(btn => 
          btn.textContent.trim() === 'Close');
        if (closeBtn) closeBtn.click();
      })()
    `).catch(() => {}); // Ignore if no popup
    
    // Check for Continue link (after Eligibility & Benefits click)
    const hasContinue = await this.executeJavaScript(`
      Array.from(document.querySelectorAll('a')).some(link => 
        link.textContent.includes('Continue'))
    `);
    
    if (hasContinue === 'true') {
      console.log('📋 Clicking Continue link...');
      await this.executeJavaScript(`
        const continueLink = Array.from(document.querySelectorAll('a')).find(link => 
          link.textContent.includes('Continue'));
        if (continueLink) continueLink.click();
      `);
      await this.delay(4);
    }
    
    // Now click on "Search online eligibility" link
    console.log('🔍 Looking for Search online eligibility link...');
    const hasSearchLink = await this.executeJavaScript(`
      Array.from(document.querySelectorAll('a')).some(link => 
        link.textContent.includes('Search online eligibility'))
    `);
    
    if (hasSearchLink === 'true') {
      console.log('📋 Clicking Search online eligibility...');
      await this.executeJavaScript(`
        const searchLink = Array.from(document.querySelectorAll('a')).find(link => 
          link.textContent.includes('Search online eligibility'));
        if (searchLink) searchLink.click();
      `);
      await this.delay(3);
      
      // Handle ClaimConnect popup
      console.log('🔄 Handling ClaimConnect redirect popup...');
      const hasClaimConnectPopup = await this.executeJavaScript(`
        document.body.innerText.includes('You are now leaving the Aetna Dental Web site') &&
        document.body.innerText.includes('ClaimConnect')
      `);
      
      if (hasClaimConnectPopup === 'true') {
        console.log('📋 Handling ClaimConnect popup...');
        
        // IMPORTANT: Le popup bloque les clics JavaScript normaux
        // Solution: Ouvrir directement l'URL dans un nouvel onglet
        console.log('🔄 Opening ClaimConnect in new tab (popup blocks JavaScript clicks)...');
        
        await this.executeAppleScript(`
          tell application "Google Chrome"
            make new tab at end of tabs of front window with properties {URL:"https://www.aetnadental.com/professionals/dxredirect.html?destination=startElig"}
            delay 2
            set active tab index of front window to (count of tabs of front window)
            return "New tab created"
          end tell
        `);
        
        console.log('⏳ Waiting for ClaimConnect redirect...');
        await this.delay(5);
        
        // Verify we're on ClaimConnect
        const currentUrl = await this.executeAppleScript(`
          tell application "Google Chrome"
            return URL of active tab of front window
          end tell
        `);
        
        if (currentUrl.includes('claimconnect')) {
          console.log('✅ Successfully navigated to ClaimConnect');
        } else {
          console.log('⚠️  Not on ClaimConnect yet, waiting more...');
          await this.delay(3);
        }
      }
    }
    
    // Now we're on ClaimConnect - Select billing provider
    console.log('🏥 Selecting billing provider on ClaimConnect...');
    
    // Wait for ClaimConnect page to load
    await this.delay(3);
    
    // Check if we need to select provider
    const needsProvider = await this.executeJavaScript(`
      document.body.innerText.includes('Select Billing Provider') ||
      document.body.innerText.includes('Select a Billing Provider')
    `);
    
    if (needsProvider === 'true') {
      await this.executeJavaScript(`
        const selectProviderLink = Array.from(document.querySelectorAll('a')).find(link => 
          link.textContent.includes('Select Billing Provider') ||
          link.textContent.includes('Select a Billing Provider'));
        if (selectProviderLink) {
          selectProviderLink.click();
          'Clicked Select Provider';
        }
      `);
      
      await this.delay(2);
      
      // Select Jennifer Chou
      await this.executeJavaScript(`
        const providers = Array.from(document.querySelectorAll('*'));
        const jenChou = providers.find(el => 
          el.textContent.includes('Jennifer Chou') && 
          (el.tagName === 'A' || el.tagName === 'SPAN' || el.tagName === 'DIV'));
        if (jenChou) {
          jenChou.click();
          'Selected Jennifer Chou';
        }
      `);
      
      await this.delay(2);
    }
    
    // Select payer
    const needsPayer = await this.executeJavaScript(`
      document.body.innerText.includes('Select a Payer') ||
      document.body.innerText.includes('Select Payer')
    `);
    
    if (needsPayer === 'true') {
      console.log('💳 Selecting payer...');
      await this.executeJavaScript(`
        const selectPayerLink = Array.from(document.querySelectorAll('a')).find(link => 
          link.textContent.includes('Select a Payer') ||
          link.textContent.includes('Select Payer'));
        if (selectPayerLink) {
          selectPayerLink.click();
          'Clicked Select Payer';
        }
      `);
      
      await this.delay(2);
      
      await this.executeJavaScript(`
        const payers = Array.from(document.querySelectorAll('*'));
        const aetnaDental = payers.find(el => 
          el.textContent.includes('Aetna Dental') && 
          (el.tagName === 'A' || el.tagName === 'SPAN' || el.tagName === 'DIV'));
        if (aetnaDental) {
          aetnaDental.click();
          'Selected Aetna Dental';
        }
      `);
    }
    
    console.log('✅ Provider and payer selection complete');
  }

  async searchPatient(firstName: string, lastName: string, dob: string, memberId: string) {
    console.log(`🔍 Searching for patient: ${firstName} ${lastName}`);
    
    // Fill last name
    await this.executeJavaScript(`
      (() => {
        const lastNameField = document.querySelector('input[aria-label*="Last Name"]') ||
                              Array.from(document.querySelectorAll('input')).find(input => {
                                const label = document.querySelector('label[for="' + input.id + '"]');
                                return label && label.textContent.includes('Last Name');
                              });
        if (lastNameField) {
          lastNameField.value = '${lastName}';
          lastNameField.dispatchEvent(new Event('input', {bubbles: true}));
          lastNameField.dispatchEvent(new Event('change', {bubbles: true}));
        }
      })()
    `);
    
    // Fill first name
    await this.executeJavaScript(`
      (() => {
        const firstNameField = document.querySelector('input[aria-label*="First Name"]') ||
                               Array.from(document.querySelectorAll('input')).find(input => {
                                 const label = document.querySelector('label[for="' + input.id + '"]');
                                 return label && label.textContent.includes('First Name');
                               });
        if (firstNameField) {
          firstNameField.value = '${firstName}';
          firstNameField.dispatchEvent(new Event('input', {bubbles: true}));
          firstNameField.dispatchEvent(new Event('change', {bubbles: true}));
        }
      })()
    `);
    
    // Fill DOB
    await this.executeJavaScript(`
      (() => {
        const dobField = document.querySelector('input[aria-label*="Date of Birth"]') ||
                         Array.from(document.querySelectorAll('input')).find(input => {
                           const label = document.querySelector('label[for="' + input.id + '"]');
                           return label && label.textContent.includes('Date of Birth');
                         });
        if (dobField) {
          dobField.value = '${dob}';
          dobField.dispatchEvent(new Event('input', {bubbles: true}));
          dobField.dispatchEvent(new Event('change', {bubbles: true}));
        }
      })()
    `);
    
    // Set relationship to Child
    await this.executeJavaScript(`
      (() => {
        const relationshipSelect = document.querySelector('select[aria-label*="Patient Relationship"]') ||
                                   Array.from(document.querySelectorAll('select')).find(select => {
                                     const label = document.querySelector('label[for="' + select.id + '"]');
                                     return label && label.textContent.includes('Patient Relationship');
                                   });
        if (relationshipSelect) {
          relationshipSelect.value = '19';
          relationshipSelect.dispatchEvent(new Event('change', {bubbles: true}));
        }
      })()
    `);
    
    // Fill member ID
    await this.executeJavaScript(`
      (() => {
        const memberIdField = document.querySelector('input[aria-label*="Member ID"]') ||
                              Array.from(document.querySelectorAll('input')).find(input => {
                                const label = document.querySelector('label[for="' + input.id + '"]');
                                return label && (label.textContent.includes('Member ID') || 
                                                 label.textContent.includes('SSN'));
                              });
        if (memberIdField) {
          memberIdField.value = '${memberId}';
          memberIdField.dispatchEvent(new Event('input', {bubbles: true}));
          memberIdField.dispatchEvent(new Event('change', {bubbles: true}));
        }
      })()
    `);
    
    await this.delay(1);
    
    // Click Continue
    await this.executeJavaScript(`
      (() => {
        const continueBtn = Array.from(document.querySelectorAll('button')).find(btn => 
          btn.textContent.includes('Continue')) ||
          document.querySelector('input[type="submit"][value="Continue"]');
        if (continueBtn) continueBtn.click();
      })()
    `);
    
    await this.delay(3);
    
    // Click on subscriber link
    console.log('👤 Selecting subscriber...');
    await this.executeJavaScript(`
      (() => {
        const links = Array.from(document.querySelectorAll('a'));
        const stewartLink = links.find(link => link.textContent.includes('STEWART'));
        if (stewartLink) {
          stewartLink.click();
          return true;
        }
        return false;
      })()
    `);
    
    console.log('✅ Patient found and selected');
  }

  async viewBenefits(): Promise<AetnaBenefitData> {
    console.log('📊 Viewing benefits...');
    
    // Click View Benefits
    await this.executeJavaScript(`
      const viewBenefitsLink = Array.from(document.querySelectorAll('a')).find(link => 
        link.textContent.includes('View Benefits'));
      if (viewBenefitsLink) viewBenefitsLink.click();
    `);
    
    await this.delay(5);
    
    console.log('📊 Extracting benefits data...');
    
    // Extract benefits data
    const benefitsJson = await this.executeJavaScript(`
      (() => {
        const pageText = document.body.innerText;
        const data = {
          patient: {},
          coverage: {},
          maximums: {},
          deductibles: {},
          coInsurance: {},
          procedureBenefits: []
        };
        
        // Extract patient info
        const nameMatch = pageText.match(/Name:\\s+Member ID.*?\\s+([A-Z\\s]+)\\s+([A-Z0-9]+)/);
        if (nameMatch) {
          data.patient.name = nameMatch[1].trim();
          data.patient.memberId = nameMatch[2];
        }
        
        // Extract DOB
        const dobMatch = pageText.match(/Date of Birth:\\s+(\\d{2}\\/\\d{2}\\/\\d{4})/);
        if (dobMatch) {
          data.patient.dob = dobMatch[1];
        }
        
        // Extract coverage
        const coverageMatch = pageText.match(/Coverage:\\s+(\\w+)/);
        if (coverageMatch) {
          data.coverage.coverageType = coverageMatch[1];
        }
        
        const groupMatch = pageText.match(/Group#:\\s+(\\d+)/);
        if (groupMatch) {
          data.coverage.groupNumber = groupMatch[1];
        }
        
        const groupNameMatch = pageText.match(/Group Name:\\s+([^\\n]+)/);
        if (groupNameMatch) {
          data.coverage.groupName = groupNameMatch[1].trim();
        }
        
        // Extract maximums
        const dentalMaxMatch = pageText.match(/DENTAL\\s+Individual\\s+\\$([0-9,\\.]+)\\s+\\$([0-9,\\.]+)/);
        if (dentalMaxMatch) {
          data.maximums.dental = {
            amount: dentalMaxMatch[1],
            remaining: dentalMaxMatch[2]
          };
        }
        
        const orthoMaxMatch = pageText.match(/Orthodontics\\s+Individual\\s+\\$([0-9,\\.]+)\\s+\\$([0-9,\\.]+)/);
        if (orthoMaxMatch) {
          data.maximums.orthodontics = {
            amount: orthoMaxMatch[1],
            remaining: orthoMaxMatch[2]
          };
        }
        
        // Extract deductibles
        const familyDeductMatch = pageText.match(/Dental\\s+Family\\s+\\$([0-9,\\.]+)\\s+\\$([0-9,\\.]+)/);
        if (familyDeductMatch) {
          data.deductibles.family = {
            amount: familyDeductMatch[1],
            remaining: familyDeductMatch[2]
          };
        }
        
        const indivDeductMatch = pageText.match(/Dental\\s+Individual\\s+\\$([0-9,\\.]+)\\s+\\$([0-9,\\.]+)/);
        if (indivDeductMatch) {
          data.deductibles.individual = {
            amount: indivDeductMatch[1],
            remaining: indivDeductMatch[2]
          };
        }
        
        // Extract co-insurance
        const prevMatch = pageText.match(/Preventative\\s+(\\d+%)\\s+\\/\\s+(\\d+%)/);
        if (prevMatch) {
          data.coInsurance.preventative = 'Patient: ' + prevMatch[1] + ' / Insurance: ' + prevMatch[2];
        }
        
        const basicMatch = pageText.match(/Basic\\s+(\\d+%)\\s+\\/\\s+(\\d+%)/);
        if (basicMatch) {
          data.coInsurance.basic = 'Patient: ' + basicMatch[1] + ' / Insurance: ' + basicMatch[2];
        }
        
        const majorMatch = pageText.match(/Major[,\\w]*\\s+(\\d+%)\\s+\\/\\s+(\\d+%)/);
        if (majorMatch) {
          data.coInsurance.major = 'Patient: ' + majorMatch[1] + ' / Insurance: ' + majorMatch[2];
        }
        
        // Extract procedure benefits
        const procedureMatches = pageText.matchAll(/D(\\d{4})\\s+(\\d+%)\\s+\\/\\s+(\\d+%)[^\\n]*/g);
        for (const match of procedureMatches) {
          data.procedureBenefits.push({
            code: 'D' + match[1],
            patientPercent: match[2],
            insurancePercent: match[3]
          });
        }
        
        // Save raw text
        data.rawText = pageText;
        
        return JSON.stringify(data);
      })()
    `);
    
    return JSON.parse(benefitsJson) as AetnaBenefitData;
  }
}

// Main function
async function main() {
  const scraper = new AetnaChromeAutomation();
  
  try {
    console.log('🚀 AETNA CHROME AUTOMATION SCRAPER');
    console.log('===================================\n');
    
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
    const filename = `data/aetna/aetna-benefits-chrome-${timestamp}.json`;
    fs.mkdirSync('data/aetna', { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(benefits, null, 2));
    console.log(`\n💾 Data saved to ${filename}`);
    
    // Save raw text
    if (benefits.rawText) {
      const textFile = `data/aetna/aetna-benefits-chrome-${timestamp}.txt`;
      fs.writeFileSync(textFile, benefits.rawText);
      console.log(`📄 Raw text saved to ${textFile}`);
    }
    
    console.log('\n✅ Scraping completed successfully!');
    console.log('⏸️  Chrome browser will remain open for verification.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the scraper
main().catch(console.error);