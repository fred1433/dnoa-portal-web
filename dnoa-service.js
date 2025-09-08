const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(process.cwd(), '.dnoa-session');

class DNOAService {
  constructor() {
    this.context = null;
    this.page = null;
    this.isFirstRun = !fs.existsSync(SESSION_DIR);
  }

  async initialize(headless = true, onLog = console.log) {
    onLog('🚀 Initializing DNOA service...');
    
    if (this.isFirstRun) {
      onLog('🆕 First run - Creating persistent profile');
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    } else {
      onLog('✅ Using existing session profile');
    }

    // Use launchPersistentContext for session persistence
    this.context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless,
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      args: ['--disable-blink-features=AutomationControlled']
    });

    this.page = await this.context.newPage();
    onLog('✅ Browser context created');
  }

  async ensureLoggedIn(onLog = console.log) {
    onLog('🔐 Checking login status...');
    
    await this.page.goto('https://www.dnoaconnect.com/#!/', { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    await this.page.waitForTimeout(3000);
    
    // Check if we need to login by looking for login form elements
    const bodyText = await this.page.textContent('body') || '';
    const needsLogin = bodyText.includes('User ID') || bodyText.includes('Password');
    
    if (needsLogin) {
      onLog('📝 Logging in...');
      
      const username = process.env.DNOA_USERNAME || 'payorportalsdbmail';
      const password = process.env.DNOA_PASSWORD || 'payoraccess1';
      
      try {
        await this.page.getByRole('textbox', { name: 'User ID' }).fill(username);
        await this.page.getByRole('textbox', { name: 'Password' }).fill(password);
        
        const rememberCheckbox = this.page.getByRole('checkbox', { name: 'Remember my User ID' });
        if (await rememberCheckbox.isVisible()) {
          await rememberCheckbox.check();
        }
        
        await this.page.getByRole('button', { name: 'Login' }).click();
        await this.page.waitForTimeout(5000);
        onLog('✅ Logged in successfully');
      } catch (e) {
        onLog('⚠️ Login form not found, may already be logged in');
      }
    } else {
      onLog('✅ Already logged in - session valid');
    }
    
    // Wait a bit more to ensure page is fully loaded
    await this.page.waitForTimeout(2000);
    
    // Get auth token - try multiple methods
    const authData = await this.page.evaluate(() => {
      // Try localStorage first
      const localToken = localStorage.getItem('x-auth-token');
      if (localToken) {
        return { token: localToken, source: 'localStorage' };
      }
      
      // Try cookies
      const cookieMatch = document.cookie.match(/x-auth-token=([^;]+)/);
      if (cookieMatch) {
        return { token: cookieMatch[1], source: 'cookie' };
      }
      
      // Try sessionStorage
      const sessionToken = sessionStorage.getItem('x-auth-token');
      if (sessionToken) {
        return { token: sessionToken, source: 'sessionStorage' };
      }
      
      // Check all localStorage keys
      const allKeys = Object.keys(localStorage);
      const tokenKey = allKeys.find(key => key.includes('token') || key.includes('auth'));
      if (tokenKey) {
        return { token: localStorage.getItem(tokenKey), source: `localStorage[${tokenKey}]` };
      }
      
      return { token: null, allKeys, cookies: document.cookie };
    });
    
    if (!authData.token) {
      onLog(`⚠️ No token found. Debug info: ${JSON.stringify(authData)}`);
      // Continue anyway - maybe the API doesn't need token for this session
      onLog('⚠️ Continuing without token (session might be valid)');
      return 'session-valid-no-token';
    }
    
    onLog(`🔑 Auth token retrieved from ${authData.source}`);
    return authData.token;
  }

  async extractPatientData(patient, onLog = console.log) {
    const token = await this.ensureLoggedIn(onLog);
    
    onLog(`🔍 Searching for patient: ${patient.firstName} ${patient.lastName}`);
    
    const allData = {
      patient,
      extractionDate: new Date().toISOString(),
      portal: 'DNOA'
    };
    
    try {
      // 1. Get member hash
      onLog('📥 Fetching member data...');
      const membersUrl = `https://www.dnoaconnect.com/members?dateOfBirth=${patient.dateOfBirth}&subscriberId=${patient.subscriberId}`;
      
      // Prepare headers - only add token if we have one
      const headers = {};
      if (token && token !== 'session-valid-no-token') {
        headers['x-auth-token'] = token;
      }
      
      const membersResp = await this.page.request.get(membersUrl, { headers });
      
      if (!membersResp.ok()) {
        throw new Error(`API error: ${membersResp.status()}`);
      }
      
      const membersText = await membersResp.text();
      if (!membersText.trim()) {
        throw new Error('Patient not found');
      }
      
      const members = JSON.parse(membersText);
      if (!members || members.length === 0) {
        throw new Error('No members found for this patient');
      }
      
      allData.members = members;
      const memberHash = members[0]?.policies?.[0]?.referenceId;
      
      if (!memberHash) {
        throw new Error('Patient has no active policy');
      }
      
      onLog(`✅ Found patient - Policy: ${members[0]?.policies?.[0]?.groupName || 'Unknown'}`);
      
      // 2. Get associated members
      onLog('📥 Fetching family members...');
      const assocUrl = `https://www.dnoaconnect.com/members/${memberHash}/associatedMembers?dateOfBirth=${patient.dateOfBirth}&subscriberId=${patient.subscriberId}`;
      const assocResp = await this.page.request.get(assocUrl, { headers });
      allData.associatedMembers = await assocResp.json();
      onLog(`✅ Found ${allData.associatedMembers.length} family members`);
      
      // 3. Get plan accumulators (deductibles, maximums)
      onLog('📥 Fetching deductibles and maximums...');
      const accumUrl = `https://www.dnoaconnect.com/members/${memberHash}/planAccumulators?dateOfBirth=${patient.dateOfBirth}&subscriberId=${patient.subscriberId}`;
      const accumResp = await this.page.request.get(accumUrl, { headers });
      allData.planAccumulators = await accumResp.json();
      
      const deduct = allData.planAccumulators?.deductible?.benefitPeriod?.individual;
      if (deduct) {
        onLog(`✅ Deductible: $${deduct.amountInNetwork} (Remaining: $${deduct.remainingInNetwork})`);
      }
      
      const max = allData.planAccumulators?.maximum?.benefitPeriod?.individual;
      if (max) {
        onLog(`✅ Annual Maximum: $${max.amountInNetwork} (Remaining: $${max.remainingInNetwork})`);
      }
      
      // 4. Get benefits
      onLog('📥 Fetching coverage details...');
      const benefitsUrl = `https://www.dnoaconnect.com/members/${memberHash}/benefits?dateOfBirth=${patient.dateOfBirth}&subscriberId=${patient.subscriberId}`;
      const benefitsResp = await this.page.request.get(benefitsUrl, { headers });
      allData.benefits = await benefitsResp.json();
      onLog(`✅ Found ${allData.benefits?.categories?.length || 0} benefit categories`);
      
      // 5. Get procedure history
      onLog('📥 Fetching procedure history...');
      const historyUrl = `https://www.dnoaconnect.com/members/${memberHash}/procedureHistory`;
      const historyResp = await this.page.request.get(historyUrl, { headers });
      allData.procedureHistory = await historyResp.json();
      onLog(`✅ Found ${allData.procedureHistory?.data?.length || allData.procedureHistory?.length || 0} procedures in history`);
      
      // 6. Get plan summary
      onLog('📥 Fetching plan summary...');
      const summaryUrl = `https://www.dnoaconnect.com/members/${memberHash}/planSummary?dateOfBirth=${patient.dateOfBirth}&subscriberId=${patient.subscriberId}`;
      const summaryResp = await this.page.request.get(summaryUrl, { headers });
      allData.planSummary = await summaryResp.json();
      
      onLog('✅ Extraction complete!');
      
      // Create summary for display
      allData.summary = {
        patientName: `${patient.firstName} ${patient.lastName}`,
        memberId: patient.subscriberId,
        planName: members[0]?.policies?.[0]?.groupName || 'Unknown',
        status: members[0]?.policies?.[0]?.status || 'Unknown',
        deductible: deduct ? {
          amount: deduct.amountInNetwork,
          met: deduct.amountInNetwork - deduct.remainingInNetwork,
          remaining: deduct.remainingInNetwork
        } : null,
        annualMaximum: max ? {
          amount: max.amountInNetwork,
          used: max.amountInNetwork - max.remainingInNetwork,
          remaining: max.remainingInNetwork
        } : null,
        benefitCategories: allData.benefits?.categories?.length || 0,
        procedureHistory: allData.procedureHistory?.data?.length || allData.procedureHistory?.length || 0
      };
      
      return allData;
      
    } catch (error) {
      onLog(`❌ Error: ${error.message}`);
      throw error;
    }
  }

  async close() {
    if (this.context) {
      await this.context.close();
    }
  }
}

module.exports = DNOAService;