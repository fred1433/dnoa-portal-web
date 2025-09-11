const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(process.cwd(), '.dentaquest-session');
const STORAGE_STATE_FILE = path.join(SESSION_DIR, 'storageState.json');

class DentaQuestService {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isFirstRun = !fs.existsSync(SESSION_DIR);
    // Credentials stored in environment or passed during initialization
    this.locationId = process.env.DENTAQUEST_LOCATION_ID || '0013o00002Yco80AAB';
    this.providerId = process.env.DENTAQUEST_PROVIDER_ID || '001f400000CNoznAAD';
  }

  async initialize(headless = true, onLog = console.log) {
    onLog('🚀 Initializing DentaQuest service...');
    
    if (this.isFirstRun) {
      onLog('🆕 First run - Creating session directory');
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    } else {
      onLog('✅ Using existing session');
    }

    // EXACT MetLife architecture: browser + newContext
    this.browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',  // Critical for Docker
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const contextOptions = {
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York'
      // Removed incomplete userAgent - let Playwright use its default
    };

    // Load saved storage state if it exists
    if (fs.existsSync(STORAGE_STATE_FILE)) {
      contextOptions.storageState = STORAGE_STATE_FILE;
      onLog('🍪 Loaded saved cookies and storage');
    }

    // Create context from browser (MetLife style)
    this.context = await this.browser.newContext(contextOptions);

    this.page = await this.context.newPage();
    onLog('✅ Browser context created');
  }

  async safeGoto(url, onLog = console.log) {
    for (let i = 0; i < 3; i++) {
      try {
        await this.page.goto(url, { waitUntil: 'commit', timeout: 300000 });
        await this.page.waitForLoadState('domcontentloaded', { timeout: 300000 });
        return;
      } catch (e) {
        if (e.message.includes('ERR_ABORTED') || e.message.includes('ERR_NETWORK')) {
          onLog(`⚠️ Navigation aborted (${i+1}/3) → retry in 1.5s`);
          await this.page.waitForTimeout(1500);
          continue;
        }
        throw e;
      }
    }
    throw new Error('Navigation kept aborting after 3 attempts');
  }

  async ensureLoggedIn(onLog = console.log) {
    onLog('🔐 Checking login status...');
    
    // Check if we're already logged in by going to the main page
    await this.safeGoto('https://provideraccess.dentaquest.com/s/', onLog);
    
    // Check if we're on the login page or already in the app
    const currentUrl = this.page.url();
    const isLoggedIn = currentUrl.includes('provideraccess.dentaquest.com/s/');
    
    if (!isLoggedIn || currentUrl.includes('SSOProviderLogin')) {
      onLog('📝 Logging in...');
      
      const username = process.env.DENTAQUEST_USERNAME || 'payoraccessSDB';
      const password = process.env.DENTAQUEST_PASSWORD || 'Changeme2023!';
      
      // Navigate to SSO login if not already there
      if (!currentUrl.includes('SSOProviderLogin')) {
        const ssoUrl = 'https://connectsso.dentaquest.com/authsso/providersso/SSOProviderLogin.aspx?TYPE=33554433&REALMOID=06-6a4c193d-7520-4f3d-b194-83367a3ef454&GUID=&SMAUTHREASON=0&METHOD=GET&SMAGENTNAME=-SM-kSqO3O4jRCSk9qqzbPcoTSjt1%2fdC6MLuwWf19frmMVfjO3ky%2bv6P02wHtOYGhNQ3Uqgm662bIsg0jgE%2bG59NfYnZup3NqXTz&TARGET=-SM-https%3a%2f%2fconnectsso%2edentaquest%2ecom%2fprovideraccessv2%2findex%2ehtml';
        await this.page.goto(ssoUrl, { waitUntil: 'domcontentloaded' });
      }
      
      try {
        await this.page.getByRole('textbox', { name: 'Username' }).fill(username);
        await this.page.getByRole('textbox', { name: 'Password' }).fill(password);
        await this.page.getByRole('button', { name: 'Sign in' }).click();
        
        await this.page.waitForURL('**/provideraccess.dentaquest.com/**', { timeout: 30000 });
        onLog('✅ Logged in successfully');
        
        // Save the session after successful login
        await this.saveSession(onLog);
      } catch (e) {
        onLog('⚠️ Login may have failed or already logged in');
      }
    } else {
      onLog('✅ Already logged in - session valid');
    }
  }

  async saveSession(onLog = console.log) {
    // Save the complete storage state (cookies, localStorage, sessionStorage)
    await this.context.storageState({ path: STORAGE_STATE_FILE });
    onLog('💾 Session saved (cookies + storage)');
  }

  async extractPatientData(patient, onLog = console.log) {
    await this.ensureLoggedIn(onLog);
    
    onLog(`🔍 Searching for patient: ${patient.firstName} ${patient.lastName}`);
    
    const allData = {
      patient,
      extractionDate: new Date().toISOString(),
      portal: 'DentaQuest',
      serviceHistory: [],
      eligibilityHistory: [],
      claims: [],
      claimsDetails: [],
      overview: null,
      summary: {}
    };
    
    try {
      // Navigate to search page only if not already there
      const currentUrl = this.page.url();
      if (!currentUrl.includes('provideraccess.dentaquest.com/s/')) {
        await this.safeGoto('https://provideraccess.dentaquest.com/s/', onLog);
      }
      
      // Select location and provider
      onLog('📍 Setting location and provider...');
      await this.page.getByLabel('Service Location*').selectOption(this.locationId);
      await this.page.getByLabel('Provider*').selectOption(this.providerId);
      await this.page.waitForTimeout(2000);
      
      // Fill search form
      onLog('📝 Filling search form...');
      const firstRow = await this.page.locator('tr').filter({ hasText: '$Label.' }).first();
      
      // Date of Birth
      const dobField = await firstRow.getByRole('textbox').nth(1);
      await dobField.click();
      await dobField.fill(patient.dateOfBirth);
      
      // Member ID
      await firstRow.getByPlaceholder('Member Number').fill(patient.subscriberId);
      
      // Name
      await firstRow.getByPlaceholder('First Name').fill(patient.firstName);
      await firstRow.getByPlaceholder('Last Name').fill(patient.lastName);
      
      // Search
      await this.page.getByRole('link', { name: 'Search', exact: true }).click();
      
      // Wait for results
      await this.page.waitForSelector(
        `text="${patient.firstName.toUpperCase()} ${patient.lastName.toUpperCase()}"`, 
        { timeout: 10000 }
      );
      onLog('✅ Patient found');
      
      // Open patient details in new window
      const patientLinkPromise = this.page.waitForEvent('popup');
      await this.page.getByRole('link', { 
        name: `${patient.firstName.toUpperCase()} ${patient.lastName.toUpperCase()}` 
      }).click();
      const patientPage = await patientLinkPromise;
      
      await patientPage.waitForLoadState('networkidle', { timeout: 300000 });
      
      // 1. Extract Overview
      onLog('📄 Extracting overview...');
      try {
        const overviewContent = await patientPage.locator('.slds-tabs__content, [role="tabpanel"]').first().textContent();
        allData.overview = overviewContent;
      } catch (e) {
        onLog('⚠️ Could not extract overview');
      }
      
      // 2. Extract Claims (with retry logic)
      onLog('💰 Extracting claims...');
      let claimsExtracted = false;
      let retryCount = 0;
      
      while (!claimsExtracted && retryCount < 2) {
        try {
          if (retryCount > 0) {
            onLog('  🔄 Retrying claims extraction...');
            await patientPage.waitForTimeout(3000);
          }
          
          // Try multiple selectors for claims tab
          try {
            await patientPage.locator('#claims-tab__item').click();
          } catch (e) {
            try {
              await patientPage.getByRole('tab', { name: /Claim.*Authorization/i }).click();
            } catch (e2) {
              await patientPage.locator('[id*="claim" i], [aria-label*="Claim" i]').first().click();
            }
          }
          await patientPage.waitForTimeout(3000);
        
        // Extract claims table
        const claimsTable = await patientPage.locator('#claimTable, table').first();
        const claimsRows = await claimsTable.locator('tbody tr').all();
        
        for (const row of claimsRows) {
          const cells = await row.locator('td').allTextContents();
          if (cells.length >= 7) {
            const claim = {
              number: cells[0],
              serviceDate: cells[1],
              provider: cells[2],
              location: cells[3],
              status: cells[4],
              billed: this.parseAmount(cells[5]),
              paid: this.parseAmount(cells[6])
            };
            allData.claims.push(claim);
            
            // Try to get claim details
            try {
              const claimLink = row.locator('a').first();
              if (await claimLink.isVisible()) {
                onLog(`  📋 Opening claim ${claim.number}...`);
                
                const claimDetailPromise = patientPage.waitForEvent('popup');
                await claimLink.click();
                const claimDetailPage = await claimDetailPromise;
                
                await claimDetailPage.waitForLoadState('networkidle', { timeout: 300000 });
                
                const claimDetail = await this.extractClaimDetails(claimDetailPage);
                allData.claimsDetails.push({
                  claimNumber: claim.number,
                  ...claimDetail
                });
                
                await claimDetailPage.close();
              }
            } catch (e) {
              onLog(`  ⚠️ Could not open claim details for ${claim.number}`);
            }
          }
        }
        
        // Check if we found claims
        if (allData.claims.length > 0) {
          claimsExtracted = true;
          onLog(`✅ Found ${allData.claims.length} claims`);
        } else if (retryCount === 0) {
          onLog('  ⚠️ No claims found, will retry...');
        }
        
        retryCount++;
        
        } catch (e) {
          if (retryCount === 0) {
            onLog('  ⚠️ Claims extraction failed, retrying...');
            retryCount++;
          } else {
            onLog('⚠️ Could not extract claims after retry');
            break;
          }
        }
      }
      
      // 3. Extract Service History (with retry logic)
      onLog('📋 Extracting service history...');
      let historyExtracted = false;
      let historyRetryCount = 0;
      const procedures = [];
      
      while (!historyExtracted && historyRetryCount < 2) {
        try {
          if (historyRetryCount > 0) {
            onLog('  🔄 Retrying service history extraction...');
            procedures.length = 0; // Clear previous attempt
          }
          
          await patientPage.getByRole('tab', { name: 'Service History' }).click();
          await patientPage.waitForTimeout(4000); // Increased timeout
          
          let pageNum = 1;
          let hasNextPage = true;
          
          while (hasNextPage) {
            onLog(`  📄 Page ${pageNum}...`);
            
            // Wait for table to load
            await patientPage.waitForSelector('table tbody tr', { timeout: 5000 });
            
            // Extract procedures from current page
            const tableRows = await patientPage.locator('table tbody tr').all();
          for (const row of tableRows) {
            const cells = await row.locator('td').allTextContents();
            if (cells.length >= 4) {
              // Look for CDT codes (format: D####)
              const procedureCode = cells[1] || cells[2];
              if (procedureCode && procedureCode.match(/^D\d{4}/)) {
                procedures.push({
                  date: cells[0],
                  code: procedureCode,
                  description: cells[3] || cells[2],
                  provider: cells[4] || ''
                });
              }
            }
          }
          
          // Check for next page
          try {
            const nextButton = patientPage.getByRole('link', { name: 'Next' });
            const isVisible = await nextButton.isVisible({ timeout: 2000 });
            
            if (isVisible) {
              const isDisabled = await nextButton.evaluate(el => 
                el.classList.contains('disabled') || 
                el.getAttribute('aria-disabled') === 'true'
              );
              
              if (!isDisabled) {
                await nextButton.click();
                await patientPage.waitForTimeout(2000); // Increased from 1000
                pageNum++;
              } else {
                hasNextPage = false;
              }
            } else {
              hasNextPage = false;
            }
          } catch (e) {
            hasNextPage = false;
          }
        }
        
        // Check if we found procedures
        if (procedures.length > 0 || pageNum > 1) {
          historyExtracted = true;
          allData.serviceHistory = procedures;
          onLog(`✅ Found ${procedures.length} procedures in ${pageNum} pages`);
        } else if (historyRetryCount === 0) {
          onLog('  ⚠️ No procedures found, will retry...');
        }
        
        historyRetryCount++;
        
        } catch (e) {
          if (historyRetryCount === 0) {
            onLog('  ⚠️ Service history extraction failed, retrying...');
            historyRetryCount++;
          } else {
            onLog('⚠️ Could not extract service history after retry');
            break;
          }
        }
      }
      
      // 4. Extract Eligibility History
      onLog('✅ Extracting eligibility...');
      try {
        await patientPage.getByRole('tab', { name: 'Eligibility History' }).click();
        await patientPage.waitForTimeout(2000);
        
        const eligibilityTable = await patientPage.locator('table').first();
        const headers = await eligibilityTable.locator('th').allTextContents();
        const rows = await eligibilityTable.locator('tbody tr').all();
        
        for (const row of rows) {
          const cells = await row.locator('td').allTextContents();
          if (cells.length > 0) {
            const record = {};
            headers.forEach((header, index) => {
              record[header] = cells[index] || '';
            });
            allData.eligibilityHistory.push(record);
            
            // Check eligibility status
            if (record['Termination Date']) {
              allData.summary.coverageEndDate = record['Termination Date'];
              allData.summary.isEligible = !record['Termination Date'] || 
                new Date(record['Termination Date']) > new Date();
            }
          }
        }
        
        onLog(`✅ Found ${allData.eligibilityHistory.length} eligibility records`);
        
      } catch (e) {
        onLog('⚠️ Could not extract eligibility');
      }
      
      await patientPage.close();
      
      // Calculate summary
      this.calculateSummary(allData);
      
      // Extract CDT codes
      const cdtCodes = [];
      
      // From service history
      if (allData.serviceHistory) {
        allData.serviceHistory.forEach(proc => {
          if (proc.code && proc.code.match(/^D\d{4}/)) {
            cdtCodes.push({
              code: proc.code,
              description: proc.description || 'N/A',
              date: proc.date || 'N/A',
              provider: proc.provider || 'N/A'
            });
          }
        });
      }
      
      // From claim details
      if (allData.claimsDetails) {
        allData.claimsDetails.forEach(claim => {
          if (claim.services) {
            claim.services.forEach(service => {
              if (service.procedureCode && service.procedureCode.match(/^D\d{4}/)) {
                if (!cdtCodes.find(c => c.code === service.procedureCode && c.date === service.date)) {
                  cdtCodes.push({
                    code: service.procedureCode,
                    description: `Tooth ${service.tooth || 'N/A'}`,
                    date: service.date || 'N/A',
                    billed: service.billed || 'N/A'
                  });
                }
              }
            });
          }
        });
      }
      
      allData.summary.cdtCodes = cdtCodes;
      allData.summary.totalCDTCodes = cdtCodes.length;
      
      onLog(`✅ Extraction complete! Found ${cdtCodes.length} CDT codes`);
      
      return allData;
      
    } catch (error) {
      onLog(`❌ Error: ${error.message}`);
      throw error;
    }
  }

  async extractClaimDetails(claimPage) {
    const details = {};
    
    try {
      const pageText = await claimPage.locator('body').textContent();
      
      // Extract amounts
      const billedMatch = pageText?.match(/Total Billed Amount:\s*\$?([\d,]+\.?\d*)/);
      if (billedMatch) {
        details.totalBilled = parseFloat(billedMatch[1].replace(',', ''));
      }
      
      const patientPayMatch = pageText?.match(/Total Patient Pay:\s*\$?([\d,]+\.?\d*)/);
      if (patientPayMatch) {
        details.totalPatientPay = parseFloat(patientPayMatch[1].replace(',', ''));
      }
      
      const paymentMatch = pageText?.match(/Payment:\s*\$?([\d,]+\.?\d*)/);
      if (paymentMatch) {
        details.payment = parseFloat(paymentMatch[1].replace(',', ''));
      }
      
      // Extract services table
      const servicesTable = await claimPage.locator('table').last();
      const serviceRows = await servicesTable.locator('tbody tr').all();
      
      details.services = [];
      for (const row of serviceRows) {
        const cells = await row.locator('td').allTextContents();
        if (cells.length >= 8) {
          details.services.push({
            date: cells[0],
            procedureCode: cells[1],
            tooth: cells[2],
            quantity: cells[3],
            status: cells[4],
            billed: cells[6],
            patientPay: cells[7],
            paid: cells[8]
          });
        }
      }
      
    } catch (e) {
      console.log('⚠️ Error extracting claim details:', e.message);
    }
    
    return details;
  }

  calculateSummary(data) {
    // Calculate totals from claims
    if (data.claims.length > 0) {
      data.summary.totalBilled = data.claims.reduce((sum, claim) => 
        sum + (claim.billed || 0), 0);
      
      data.summary.totalPaid = data.claims.reduce((sum, claim) => 
        sum + (claim.paid || 0), 0);
    }
    
    // From claim details
    if (data.claimsDetails.length > 0) {
      const detailBilled = data.claimsDetails.reduce((sum, claim) => 
        sum + (claim.totalBilled || 0), 0);
      
      const detailPaid = data.claimsDetails.reduce((sum, claim) => 
        sum + (claim.payment || 0), 0);
      
      const detailPatient = data.claimsDetails.reduce((sum, claim) => 
        sum + (claim.totalPatientPay || 0), 0);
      
      if (detailBilled > 0) data.summary.totalBilled = detailBilled;
      if (detailPaid > 0) data.summary.totalPaid = detailPaid;
      data.summary.patientResponsibility = detailPatient;
    }
    
    // Check eligibility
    if (!data.summary.isEligible && data.eligibilityHistory?.length > 0) {
      const latestEligibility = data.eligibilityHistory[0];
      data.summary.isEligible = !latestEligibility['Termination Date'] || 
        new Date(latestEligibility['Termination Date']) > new Date();
    }
    
    // Add summary fields
    data.summary.patientName = `${data.patient.firstName} ${data.patient.lastName}`;
    data.summary.memberId = data.patient.subscriberId;
    data.summary.totalClaims = data.claims.length;
    data.summary.totalServices = data.serviceHistory.length;
  }

  parseAmount(amountStr) {
    if (!amountStr) return 0;
    return parseFloat(amountStr.replace(/[$,]/g, '')) || 0;
  }

  async close() {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = DentaQuestService;