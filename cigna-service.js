/* eslint-disable no-console */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(process.cwd(), '.cigna-session');
const STORAGE_STATE_FILE = path.join(SESSION_DIR, 'storageState.json');

class CignaService {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isFirstRun = !fs.existsSync(SESSION_DIR);
    this.isLoggedIn = false;  // Track login status

    // Credentials from env
    this.username = process.env.CIGNA_USERNAME || 'payoraccess1';
    this.password = process.env.CIGNA_PASSWORD || 'Smiley@2025!!';
  }

  // ---------- Lifecycle ----------

  async initialize(headless = true, onLog = console.log, onOtpRequest = null) {
    this.onLog = onLog;
    this.onOtpRequest = onOtpRequest;

    onLog('🚀 Initializing Cigna service...');

    if (this.isFirstRun) {
      onLog('🆕 First run - Creating session directory');
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    } else {
      onLog('✅ Using existing session');
    }

    this.browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1600,1000',
        '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      slowMo: headless ? 0 : 150
    });

    const contextOptions = {
      viewport: { width: 1500, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    if (fs.existsSync(STORAGE_STATE_FILE)) {
      contextOptions.storageState = STORAGE_STATE_FILE;
      onLog('🍪 Loaded saved cookies and storage');
    }

    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();

    // Light resource blocking
    if (headless) {
      await this.page.route('**/*', (route) => {
        const t = route.request().resourceType();
        if (t === 'image' || t === 'media') return route.abort();
        return route.continue();
      });
    }

    // Dismiss any dialogs just in case
    this.page.on('dialog', async (d) => {
      onLog(`⚠️ Unexpected dialog: ${d.message()}`);
      try { await d.dismiss(); } catch {}
    });

    await this.ensureLoggedIn(onLog);
  }

  async close() {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  async saveSession(onLog = this.onLog || console.log) {
    await this.context.storageState({ path: STORAGE_STATE_FILE });
    onLog('💾 Session saved (cookies + storage)');
  }

  // ---------- Navigation helpers ----------

  async safeGoto(url, onLog = this.onLog || console.log) {
    for (let i = 0; i < 3; i++) {
      try {
        onLog(`   Navigating to: ${url}`);
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Ne pas attendre networkidle trop longtemps, certains sites ne finissent jamais
        try {
          await this.page.waitForLoadState('networkidle', { timeout: 5000 });
        } catch {
          // C'est OK si networkidle timeout, la page est probablement chargée
          onLog('   Page loaded (networkidle timeout, continuing...)');
        }
        
        return;
      } catch (e) {
        if (e.message.includes('ERR_ABORTED') || e.message.includes('ERR_NETWORK')) {
          onLog(`⚠️ Navigation aborted (${i + 1}/3) → retry in 1.5s`);
          await this.page.waitForTimeout(1500);
          continue;
        }
        throw e;
      }
    }
    throw new Error('Navigation kept aborting after 3 attempts');
  }

  // ---------- Login / OTP ----------

  async ensureLoggedIn(onLog = this.onLog || console.log) {
    // Skip if we already checked and are logged in
    if (this.isLoggedIn) {
      onLog('✅ Already logged in (cached status)');
      return true;
    }
    
    onLog('🔐 Checking login status...');
    
    // First check if we're already on an app page (not login page)
    const currentUrl = this.page.url();
    if (currentUrl && !currentUrl.includes('/login') && currentUrl.includes('cignaforhcp.cigna.com')) {
      // Check for nav element
      const navPresent = await this.page.locator('[data-test="primary-nav-child-chcp.patient.search"]').count()
        .catch(() => 0);
      
      if (navPresent > 0) {
        onLog('✅ Session valid (already on app page)');
        this.isLoggedIn = true;
        await this.saveSession(onLog);
        return true;
      }
    }
    
    try {
      // Try navigating to dashboard first to check if session is valid
      onLog('   Checking session by navigating to dashboard...');
      await this.page.goto('https://cignaforhcp.cigna.com/app/patient/search', { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      
      // Wait a bit for any redirects
      await this.page.waitForTimeout(3000);
      
      const afterNavUrl = this.page.url();
      onLog(`   Current URL: ${afterNavUrl}`);
      
      // Check if we're on the patient search page (logged in) or redirected to login
      if (!afterNavUrl.includes('/login')) {
        // On n'est PAS sur la page de login, donc on est probablement connecté
        // MAIS la page peut ne pas être complètement chargée, donc on attend un peu plus
        onLog('   Not on login page, checking if really logged in...');
        
        // Attendre un peu plus pour que les éléments se chargent
        await this.page.waitForTimeout(2000);
        
        // Essayer plusieurs fois de détecter l'élément de navigation
        let navPresent = 0;
        for (let retry = 0; retry < 3; retry++) {
          navPresent = await this.page.locator('[data-test="primary-nav-child-chcp.patient.search"]').count()
            .catch(() => 0);
          
          if (navPresent > 0) break;
          
          // Si pas trouvé, peut-être chercher d'autres indicateurs qu'on est connecté
          const searchButton = await this.page.locator('[data-test="search-submit-button"]').count().catch(() => 0);
          const patientIdField = await this.page.locator('[data-test="patient_id_0"]').count().catch(() => 0);
          
          if (searchButton > 0 || patientIdField > 0) {
            onLog('   Found search elements - we are logged in!');
            navPresent = 1; // Forcer comme trouvé
            break;
          }
          
          onLog(`   Retry ${retry + 1}/3 - waiting for page elements...`);
          await this.page.waitForTimeout(2000);
        }
        
        if (navPresent > 0) {
          onLog('✅ Session valid - already logged in!');
          this.isLoggedIn = true;
          await this.saveSession(onLog);
          return true;
        }
      }
      
      onLog('   Session expired or invalid, need to login...');
    } catch (navError) {
      onLog(`   ⚠️ Navigation error: ${navError.message}`);
      // Continue to login
    }

    // Otherwise perform login
    if (!this.username || !this.password) {
      onLog('❌ CIGNA_USERNAME/CIGNA_PASSWORD not set');
      throw new Error('Missing Cigna credentials');
    }

    onLog('📝 Entering credentials...');
    
    // Attendre que les champs soient visibles
    await this.page.waitForSelector('[data-test="username"]', { state: 'visible', timeout: 10000 });
    
    // IMPORTANT: Cliquer d'abord sur le champ username pour l'activer
    await this.page.locator('[data-test="username"]').click();
    await this.page.locator('[data-test="username"]').fill(this.username);
    onLog('   ✓ Username entered');
    
    // Cliquer sur le champ password pour l'activer
    await this.page.locator('[data-test="password"]').click();
    await this.page.locator('[data-test="password"]').fill(this.password);
    onLog('   ✓ Password entered');
    
    // Cliquer sur Log In
    await this.page.locator('[data-test="login-submit-button"]').click();
    onLog('   ✓ Login button clicked');

    // Check if OTP required - with timeout handling
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      onLog('   Page still loading after 5s, continuing to check for OTP...');
    }
    await this.page.waitForTimeout(1000);

    const otpField = this.page.locator('[data-test="txt-verification-code"]');
    const otpVisible = await otpField.isVisible().catch(() => false);

    if (otpVisible) {
      onLog('🔔 OTP required');
      const otp = await this.obtainOtp(onLog);
      
      // Si l'OTP a été entré manuellement, on ne remplit pas le champ
      if (otp !== 'manual') {
        onLog(`📝 OTP received: ${otp}`);
        await otpField.fill(otp);
        await this.page.waitForTimeout(500); // Small delay after filling OTP

        // trust device - select "Don't ask me for a code the next time I log in"
        if ((process.env.CIGNA_TRUST_DEVICE || 'true').toLowerCase() === 'true') {
          try {
            // Use check() instead of click() - it's designed for radio buttons and handles overlays
            const rememberRadio = this.page.locator('[data-test="rdo-remember-yes"]');
            await rememberRadio.check({ timeout: 5000 });
            await this.page.waitForTimeout(200);
            
            // Verify it's actually checked
            const isChecked = await rememberRadio.isChecked().catch(() => false);
            if (isChecked) {
              onLog('🔒 Don\'t ask for code next time ✓');
            } else {
              onLog('   ⚠️ Radio button not checked after check() call');
            }
          } catch (e) { 
            // Try fallback approaches
            try {
              // Fallback 1: Click the label directly
              await this.page.locator('label[for="rememberYes"]').click({ timeout: 3000 });
              onLog('🔒 Don\'t ask for code next time ✓ (via label click)');
            } catch (e2) {
              // Not critical - extraction still works even if this fails
              onLog(`   ⚠️ Could not select "Don\'t ask for code" (non-critical): ${e.message.split('\n')[0]}`);
            }
          }
        }

        // Now submit the form
        await this.page.locator('[data-test="btn-submit"]').click();
        onLog('✅ OTP submitted successfully');
      }
      
      // Attendre que la page charge après OTP
      try {
        // Wait for navigation away from MFA page
        await this.page.waitForURL((url) => !url.pathname.includes('/mfa'), { timeout: 10000 });
        onLog('   ✓ Navigated away from MFA page');
      } catch {
        onLog('   ⚠️ Still on MFA page after 10s, checking if we need to submit again...');
        
        // Check if we're still on the MFA page
        const stillOnMFA = await this.page.locator('[data-test="txt-verification-code"]').isVisible().catch(() => false);
        if (stillOnMFA) {
          // Try submitting again
          const submitBtn = this.page.locator('[data-test="btn-submit"]');
          if (await submitBtn.isVisible().catch(() => false)) {
            await submitBtn.click();
            onLog('   Clicked submit again');
            await this.page.waitForURL((url) => !url.pathname.includes('/mfa'), { timeout: 10000 });
          }
        }
      }
      
      await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }

    // Validate app entry - wait for navigation menu
    try {
      await this.page.waitForSelector('[data-test="primary-nav-child-chcp.patient.search"]', { timeout: 10000 });
      onLog('   ✓ Navigation menu found');
    } catch {
      const currentUrl = this.page.url();
      const body = await this.page.textContent('body').catch(() => '');
      onLog(`⚠️ Post-login page did not show nav. URL: ${currentUrl}`);
      onLog(`   Body sample: ${String(body).slice(0, 300)}...`);
      throw new Error('Cigna login failed or unexpected post-login state');
    }

    // Handle potential survey popup early
    await this.dismissSurveyPopup(onLog);

    this.isLoggedIn = true;  // Mark as logged in
    await this.saveSession(onLog);
    onLog('✅ Logged in to Cigna');
    return true;
  }

  async obtainOtp(onLog = this.onLog || console.log) {
    // 1) external handler (UI) like MetLife
    if (this.onOtpRequest) {
      onLog('⏳ Waiting for OTP from external handler...');
      const code = await this.onOtpRequest();
      if (code && code.trim().length) return code.trim();
      throw new Error('OTP not provided by handler');
    }
    // 2) env fallback (useful in dev)
    const envOtp = (process.env.CIGNA_OTP || '').trim();
    if (envOtp) {
      onLog('🔑 Using OTP from env');
      return envOtp;
    }
    
    // 3) Si pas de handler ni d'env, on attend que l'utilisateur entre manuellement
    onLog('⏳ Please enter the OTP code manually in the browser...');
    onLog('   Waiting for you to submit the OTP form...');
    
    // Attendre que l'utilisateur entre le code et soumette
    // On va attendre que la page change ou que le formulaire OTP disparaisse
    await this.page.waitForFunction(
      () => {
        // Si on n'est plus sur la page OTP, c'est qu'on a soumis
        const otpField = document.querySelector('[data-test="txt-verification-code"]');
        const submitButton = document.querySelector('[data-test="btn-submit"]');
        return !otpField || !submitButton;
      },
      { timeout: 120000 } // 2 minutes pour entrer le code
    );
    
    onLog('✅ OTP form submitted');
    return 'manual'; // Retourner quelque chose pour ne pas bloquer
  }

  // ---------- Popups ----------

  async dismissSurveyPopup(onLog = this.onLog || console.log) {
    // OpinionLab banner → “No Thanks”
    try {
      const link = this.page.getByRole('link', { name: /No Thanks/i });
      if (await link.isVisible({ timeout: 2000 })) {
        await link.click({ timeout: 2000 });
        onLog('🧹 Survey popup dismissed (No Thanks)');
      }
    } catch {
      // Look for generic “No” or close button
      try {
        const noBtn = this.page.getByRole('button', { name: /^No$/i });
        if (await noBtn.isVisible({ timeout: 1200 })) {
          await noBtn.click();
          onLog('🧹 Survey popup dismissed (No)');
        }
      } catch {}
    }
  }

  async confirmPatientModal(onLog = this.onLog || console.log) {
    // Patient confirmation modal with [data-test="btn-confirm"]
    try {
      const btn = this.page.locator('[data-test="btn-confirm"]');
      if (await btn.isVisible({ timeout: 4000 })) {
        await btn.click();
        await this.page.waitForLoadState('networkidle');
        onLog('✅ Patient confirmed');
      }
    } catch {
      // Non-blocking
    }
  }

  // ---------- Public API ----------

  /**
   * Extract all relevant data for a given patient.
   * @param {Object} patient {subscriberId, firstName, lastName, dateOfBirth (MM/DD/YYYY or YYYY-MM-DD)}
   * @param {(m:string)=>void} onLog
   * @returns {Promise<Object>}
   */
  async extractPatientData(patient, onLog = this.onLog || console.log) {
    await this.ensureLoggedIn(onLog);

    const normalizedPatient = this.normalizePatient(patient);
    onLog(`🔍 Searching patient: ${normalizedPatient.firstName} ${normalizedPatient.lastName} (${normalizedPatient.subscriberId})`);

    await this.openPatientSearch(onLog);
    await this.fillSearchAndSubmit(normalizedPatient, onLog);

    // Dismiss survey if appearing again
    await this.dismissSurveyPopup(onLog);

    // Open patient record
    await this.openFirstPatientResult(onLog);
    await this.confirmPatientModal(onLog);

    onLog('📄 Extracting eligibility...');
    const eligibility = await this.extractEligibilityFromCurrentPage(onLog);

    onLog('💰 Navigating to claims list...');
    const claims = await this.extractClaimsListAndDetails(onLog);

    // CDT codes rollup
    const cdtCodes = [];
    claims.forEach(c => {
      (c.services || []).forEach(s => {
        if (s.procedureCode && /^D\d{4}[A-Z]?/.test(s.procedureCode)) {
          cdtCodes.push({
            code: s.procedureCode,
            date: s.date || '',
            tooth: s.tooth || '',
            billed: s.billed || '',
            paid: s.paid || '',
            status: s.status || '',
          });
        }
      });
    });

    const summary = this.buildSummary(normalizedPatient, eligibility, claims, cdtCodes);

    onLog('✅ Cigna extraction complete');
    return {
      portal: 'Cigna',
      extractionDate: new Date().toISOString(),
      patient: normalizedPatient,
      eligibility,
      claims,
      summary
    };
  }

  // ---------- Search flow ----------

  async openPatientSearch(onLog = this.onLog || console.log) {
    // We're already logged in and on the dashboard, just navigate directly
    // Don't use safeGoto to avoid the retry loop that causes scrolling
    try {
      await this.page.goto('https://cignaforhcp.cigna.com/app/patient/search', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      await this.page.waitForTimeout(2000); // Let page settle
      onLog('🧭 Patient search page opened');
    } catch (e) {
      onLog(`   Navigation warning: ${e.message}`);
      // Continue anyway - page might still be usable
    }
  }

  async fillSearchAndSubmit(patient, onLog = this.onLog || console.log) {
    // Fill fields from CodeGen data-test selectors
    // IDs might be indexed “_0” for first row
    await this.page.locator('[data-test="patient_id_0"]').fill(patient.subscriberId);
    await this.page.locator('[data-test="patient_dob_0"]').fill(this.asMMDDYYYY(patient.dateOfBirth));
    // First/last names are optional depending on search settings
    try { await this.page.locator('[data-test="patient_FN_0"]').fill(patient.firstName); } catch {}
    try { await this.page.locator('[data-test="patient_LN_0"]').fill(patient.lastName); } catch {}

    await this.page.locator('[data-test="search-submit-button"]').click();
    onLog('   Search submitted, waiting for results...');
    
    // Don't wait for networkidle, just wait for the results to appear
    await this.page.waitForTimeout(2000);
    
    // Wait for results to appear
    await this.page.waitForSelector('[data-test^="patient-id-"]', { timeout: 15000 });
    onLog('✅ Patient search results loaded');
  }

  async openFirstPatientResult(onLog = this.onLog || console.log) {
    // Wait for results table to be fully loaded
    await this.page.waitForTimeout(1000);
    
    // Click first result (CodeGen: [data-test="patient-id-0"])
    const firstRow = this.page.locator('[data-test="patient-id-0"]');
    
    // Make sure element is visible and clickable
    await firstRow.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(500);
    
    if (await firstRow.isVisible({ timeout: 8000 })) {
      onLog('   Clicking on patient ID...');
      await firstRow.click();
      // Don't wait for networkidle, just give it time to load
      await this.page.waitForTimeout(3000);
      onLog('👤 Patient record opened');
      return;
    }
    
    // fallback: click any patient id link
    onLog('   Fallback: trying any patient link...');
    const any = this.page.locator('[data-test^="patient-id-"]').first();
    await any.click();
    await this.page.waitForTimeout(3000);
  }

  // ---------- Eligibility extraction ----------

  async extractEligibilityFromCurrentPage(onLog = this.onLog || console.log) {
    // Extract data using specific selectors based on the HTML structure
    const eligibility = {};

    try {
      // Patient Information
      const patientName = await this.page.locator('[data-test="patient-name-value"]').textContent().catch(() => null);
      const patientId = await this.page.locator('[data-test="patient-id-value"]').textContent().catch(() => null);
      const patientGender = await this.page.locator('[data-test="patient-gender-value"]').textContent().catch(() => null);
      const patientDob = await this.page.locator('[data-test="patient-dob-value"]').textContent().catch(() => null);
      const patientRelationship = await this.page.locator('[data-test="patient-relationship-value"]').textContent().catch(() => null);
      const patientAddress = await this.page.locator('[data-test="patient-address-value"]').textContent().catch(() => null);

      // Subscriber Information  
      const subscriberName = await this.page.locator('[data-test="subscriber-name"]').textContent().catch(() => null);
      const subscriberDob = await this.page.locator('[data-test="subscriber-dob"]').textContent().catch(() => null);

      // Plan Information
      const planType = await this.page.locator('[data-test="plan-type"]').textContent().catch(() => null);
      const planRenews = await this.page.locator('[data-test="plan-renews"]').textContent().catch(() => null);
      const accountNumber = await this.page.locator('[data-test="account-number"]').textContent().catch(() => null);
      const accountName = await this.page.locator('[data-test="account-name"]').textContent().catch(() => null);
      const network = await this.page.locator('[data-test="network-id"]').textContent().catch(() => null);
      const initialCoverageDate = await this.page.locator('[data-test="initial-coverage-date"]').textContent().catch(() => null);
      const currentCoverage = await this.page.locator('[data-test="current-coverage"]').textContent().catch(() => null);

      // Extract deductibles from the graph sections
      let individualDeductibleRemaining = null;
      let individualDeductibleTotal = null;
      let familyDeductibleRemaining = null;
      let familyDeductibleTotal = null;

      // Individual deductible
      const indDeductSection = await this.page.locator('p:has-text("Individual Calendar Year Deductible remaining")').locator('..').first();
      if (indDeductSection) {
        const indRemaining = await indDeductSection.locator('[data-test="lbl-amount"]').getAttribute('value').catch(() => null);
        const indTotal = await indDeductSection.locator('[data-test="lbl-total"]').textContent().catch(() => null);
        individualDeductibleRemaining = indRemaining ? parseFloat(indRemaining) : null;
        individualDeductibleTotal = indTotal ? parseFloat(indTotal.replace(/[$,]/g, '')) : null;
      }

      // Family deductible
      const famDeductSection = await this.page.locator('p:has-text("Family Calendar Year Deductible remaining")').locator('..').first();
      if (famDeductSection) {
        const famRemaining = await famDeductSection.locator('[data-test="lbl-amount"]').getAttribute('value').catch(() => null);
        const famTotal = await famDeductSection.locator('[data-test="lbl-total"]').textContent().catch(() => null);
        familyDeductibleRemaining = famRemaining ? parseFloat(famRemaining) : null;
        familyDeductibleTotal = famTotal ? parseFloat(famTotal.replace(/[$,]/g, '')) : null;
      }

      // Extract benefit maximums
      let annualMaxRemaining = null;
      let annualMaxTotal = null;
      let orthodonticsMaxRemaining = null;
      let orthodonticsMaxTotal = null;

      // Individual Calendar Year Maximum
      const indMaxSection = await this.page.locator('p:has-text("Individual Calendar Year Maximum remaining")').locator('..').first();
      if (indMaxSection) {
        const maxRemaining = await indMaxSection.locator('[data-test="lbl-amount"]').getAttribute('value').catch(() => null);
        const maxTotal = await indMaxSection.locator('[data-test="lbl-total"]').textContent().catch(() => null);
        annualMaxRemaining = maxRemaining ? parseFloat(maxRemaining) : null;
        annualMaxTotal = maxTotal ? parseFloat(maxTotal.replace(/[$,]/g, '')) : null;
      }

      // Orthodontics Lifetime Maximum
      const orthoMaxSection = await this.page.locator('p:has-text("Individual Lifetime Maximum remaining")').locator('..').first();
      if (orthoMaxSection) {
        const orthoRemaining = await orthoMaxSection.locator('[data-test="lbl-amount"]').getAttribute('value').catch(() => null);
        const orthoTotal = await orthoMaxSection.locator('[data-test="lbl-total"]').textContent().catch(() => null);
        orthodonticsMaxRemaining = orthoRemaining ? parseFloat(orthoRemaining) : null;
        orthodonticsMaxTotal = orthoTotal ? parseFloat(orthoTotal.replace(/[$,]/g, '')) : null;
      }

      // Build structured eligibility object
      eligibility.patient = {
        name: patientName?.trim(),
        id: patientId?.trim(),
        gender: patientGender?.trim(),
        dateOfBirth: patientDob?.trim(),
        relationship: patientRelationship?.trim(),
        address: patientAddress?.replace(/\s+/g, ' ').trim()
      };

      eligibility.subscriber = {
        name: subscriberName?.trim(),
        dateOfBirth: subscriberDob?.trim()
      };

      eligibility.plan = {
        type: planType?.trim(),
        renews: planRenews?.trim(),
        accountNumber: accountNumber?.trim(),
        accountName: accountName?.trim(),
        network: network?.trim(),
        initialCoverageDate: initialCoverageDate?.trim(),
        currentCoverage: currentCoverage?.trim()
      };

      eligibility.deductibles = {
        individual: {
          remaining: individualDeductibleRemaining,
          total: individualDeductibleTotal,
          met: (individualDeductibleTotal && individualDeductibleRemaining != null) 
            ? individualDeductibleTotal - individualDeductibleRemaining : null
        },
        family: {
          remaining: familyDeductibleRemaining,
          total: familyDeductibleTotal,
          met: (familyDeductibleTotal && familyDeductibleRemaining != null)
            ? familyDeductibleTotal - familyDeductibleRemaining : null
        }
      };

      eligibility.maximums = {
        annual: {
          remaining: annualMaxRemaining,
          total: annualMaxTotal,
          used: (annualMaxTotal && annualMaxRemaining != null)
            ? annualMaxTotal - annualMaxRemaining : null
        },
        orthodontics: {
          remaining: orthodonticsMaxRemaining,
          total: orthodonticsMaxTotal,
          used: (orthodonticsMaxTotal && orthodonticsMaxRemaining != null)
            ? orthodonticsMaxTotal - orthodonticsMaxRemaining : null
        }
      };

      // For backward compatibility with existing code
      eligibility.network = network?.trim();
      eligibility.planName = planType?.trim();
      eligibility.annualMaximum = annualMaxTotal;
      eligibility.annualMaximumUsed = eligibility.maximums.annual.used;
      eligibility.annualMaximumRemaining = annualMaxRemaining;
      eligibility.deductible = individualDeductibleRemaining;
      eligibility.deductibleMet = eligibility.deductibles.individual.met;

    } catch (error) {
      onLog(`   ⚠️ Error extracting eligibility details: ${error.message}`);
    }

    onLog(
      `   ↳ Annual Max: ${fmt(eligibility.annualMaximumRemaining)}/${fmt(eligibility.annualMaximum)}, Deductible: ${fmt(eligibility.deductible)}`
    );

    return eligibility;
  }

  extractAfter(text, labelRegex) {
    const idx = text.search(labelRegex);
    if (idx === -1) return null;
    const tail = text.slice(idx).split('\n', 1)[0];
    const m = tail.split(':').slice(1).join(':').trim();
    return m || null;
  }

  // ---------- Claims extraction ----------

  async goToClaims(onLog = this.onLog || console.log) {
    try {
      const link = this.page.getByRole('link', { name: /View Claims/i });
      if (await link.isVisible({ timeout: 5000 })) {
        await link.click();
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(1000);
        onLog('🧭 Claims page opened');
        return;
      }
    } catch {}
    // Fallback: direct URL (not guaranteed, but try a generic path)
    try {
      await this.safeGoto('https://cignaforhcp.cigna.com/app/claim/search', onLog);
    } catch {}
  }

  async extractClaimsListAndDetails(onLog = this.onLog || console.log) {
    await this.goToClaims(onLog);

    // Often you need to click "Submit" to load results for current patient.
    try {
      const submit = this.page.getByRole('button', { name: /Submit/i });
      if (await submit.isVisible({ timeout: 3000 })) {
        await submit.click();
        await this.page.waitForLoadState('networkidle');
      }
    } catch {}

    // Wait table present
    try {
      await this.page.waitForFunction(
        () => {
          const txt = document.body?.innerText || '';
          return /Claim/i.test(txt) || /Date of Service/i.test(txt);
        },
        { timeout: 12000 }
      );
    } catch {}

    // Parse first reasonable table
    const claims = await this.parseClaimsTableHeuristically(onLog);

    // Drill down each claim (open detail page/popup)
    for (const claim of claims) {
      try {
        const detail = await this.openClaimAndExtractDetails(claim, onLog);
        if (detail) {
          claim.detailUrl = detail.detailUrl;
          claim.totalBilled = detail.totalBilled ?? claim.totalBilled ?? null;
          claim.totalPatientPay = detail.totalPatientPay ?? null;
          claim.payment = detail.payment ?? claim.payment ?? null;
          claim.services = detail.services || [];
        }
      } catch (e) {
        onLog(`   ⚠️ Could not extract details for claim ${claim.number || claim.fileRef || 'N/A'}: ${e.message}`);
      }
    }

    onLog(`✅ Found ${claims.length} claims`);
    return claims;
  }

  async parseClaimsTableHeuristically(onLog = this.onLog || console.log) {
    // Try using specific selectors for Cigna's table structure first
    try {
      // Wait a bit for the table to be fully loaded
      await this.page.waitForTimeout(2000);
      
      const claimsTable = await this.page.locator('table[data-test="claims-threesixty-search-result-table"]').first();
      onLog(`   Looking for claims table with selector: table[data-test="claims-threesixty-search-result-table"]`);
      
      if (await claimsTable.isVisible({ timeout: 5000 })) {
        onLog(`   ✓ Claims table found`);
        const rows = await claimsTable.locator('tbody tr').all();
        const claims = [];
        
        for (const row of rows) {
          // Extract claim data using specific data-test attributes
          const claimNumber = await row.locator('[data-test*="claimRefNumber"] a').textContent().catch(() => null);
          const claimLink = await row.locator('[data-test*="claimRefNumber"] a').getAttribute('href').catch(() => null);
          const status = await row.locator('[data-test*="claimStatus"]').textContent().catch(() => null);
          const patientName = await row.locator('[data-test*="name-cell"] div').first().textContent().catch(() => null);
          const patientId = await row.locator('[data-test*="name-cell"] .cg-small-note').textContent().catch(() => null);
          const dob = await row.locator('[data-test*="patientDOB"]').textContent().catch(() => null);
          const dos = await row.locator('[data-test*="dos-cell"]').textContent().catch(() => null);
          const tin = await row.locator('[data-test*="tin-cell"]').textContent().catch(() => null);
          const amountBilled = await row.locator('[data-test*="amtBill"]').textContent().catch(() => null);
          const providerName = await row.locator('[data-test*="providerName"]').textContent().catch(() => null);
          
          const datum = {
            number: claimNumber?.trim() || '',
            link: claimLink || '',
            serviceDate: dos?.trim() || '',
            status: status?.trim().replace(/\s+/g, ' ') || '',
            patientName: patientName?.trim() || '',
            patientId: patientId?.trim() || '',
            dateOfBirth: dob?.trim() || '',
            tin: tin?.trim() || '',
            providerName: providerName?.trim() || '',
            billed: this.parseAmount(amountBilled),
            paid: 0, // Will be extracted from detail page
            services: []
          };
          
          // Store the anchor element for clicking later
          try {
            datum._rowAnchorHandle = await row.locator('[data-test*="claimRefNumber"] a').elementHandle();
          } catch {}
          
          claims.push(datum);
        }
        
        onLog(`   Found ${claims.length} claims in table`);
        return claims;
      }
    } catch (error) {
      onLog(`   Could not parse using specific selectors, falling back to heuristic parsing`);
    }
    
    // Fallback to original heuristic parsing
    const tables = await this.page.locator('table').all();
    const scored = [];
    for (const t of tables) {
      const headers = (await t.locator('thead th').allTextContents().catch(() => []))
        .map(s => s.trim());
      const bodyRows = await t.locator('tbody tr').count().catch(() => 0);
      const score =
        (headers.some(h => /Claim/i.test(h)) ? 2 : 0) +
        (headers.some(h => /Date of Service/i.test(h)) ? 2 : 0) +
        (headers.some(h => /(Charge|Billed|Benefit|Paid|Payment)/i.test(h)) ? 1 : 0) +
        Math.min(2, Math.floor(bodyRows / 3));
      scored.push({ table: t, headers, bodyRows, score });
    }
    scored.sort((a, b) => b.score - a.score);

    if (!scored.length || scored[0].score === 0) {
      onLog('⚠️ No obvious claims table, falling back to text scraping');
      return this.scrapeClaimsFromText();
    }

    const { table, headers } = scored[0];
    const rows = await table.locator('tbody tr').all();

    // Map headers → indices
    const idx = (re) => {
      const i = headers.findIndex(h => re.test(h));
      return i >= 0 ? i : null;
    };
    const colClaim = idx(/(Claim|Reference)/i);
    const colDos = idx(/Date of Service/i);
    const colStatus = idx(/Status/i);
    const colCharge = idx(/(Charge|Billed)/i);
    const colBenefit = idx(/Benefit Amount/i);
    const colPaid = idx(/(Paid|Payment)/i);
    const colPayMethod = idx(/Payment Method/i);
    const colProvider = idx(/Provider/i);
    const colTin = idx(/TIN|Tax/i);

    const claims = [];
    for (const row of rows.slice(0, 50)) {
      const cells = await row.locator('td').allTextContents();
      if (!cells.length) continue;
      const datum = {
        number: colClaim != null ? (cells[colClaim] || '').trim() : '',
        serviceDate: colDos != null ? (cells[colDos] || '').trim() : '',
        status: colStatus != null ? (cells[colStatus] || '').trim() : '',
        billed: this.parseAmount(colCharge != null ? cells[colCharge] : ''),
        benefitAmount: this.parseAmount(colBenefit != null ? cells[colBenefit] : ''),
        paid: this.parseAmount(colPaid != null ? cells[colPaid] : ''),
        paymentMethod: colPayMethod != null ? (cells[colPayMethod] || '').trim() : '',
        providerName: colProvider != null ? (cells[colProvider] || '').trim() : '',
        tin: colTin != null ? (cells[colTin] || '').trim() : '',
        services: []
      };

      // keep original text too
      datum._row = cells.map(c => c.trim());
      claims.push(datum);

      // Stash element handle for detail click
      try {
        datum._rowAnchorHandle = await row.locator('a').first().elementHandle();
      } catch {}
    }

    return claims;
  }

  async scrapeClaimsFromText() {
    const text = (await this.page.textContent('body').catch(() => '')) || '';
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);

    const claims = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^Claim\b/i.test(lines[i])) {
        const number = lines[i].replace(/^Claim\s*:?\s*/i, '');
        const serviceDate = (lines[i + 1] || '').match(/Date of Service:\s*(.*)/i)?.[1] || '';
        const billed = this.parseAmount((lines[i + 2] || '').match(/(Charge|Billed):\s*(.*)/i)?.[2] || '');
        const paid = this.parseAmount((lines[i + 3] || '').match(/(Paid|Payment):\s*(.*)/i)?.[2] || '');
        claims.push({ number, serviceDate, billed, paid, services: [] });
      }
    }
    return claims.slice(0, 25);
  }

  async openClaimAndExtractDetails(claim, onLog = this.onLog || console.log) {
    // Prefer clicking the anchor we saved during table parsing
    let detailPage = null;
    const current = this.page;

    const tryOpen = async () => {
      const popupP = current.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
      const navP = current.waitForNavigation({ timeout: 5000 }).catch(() => null);

      if (claim._rowAnchorHandle) {
        await current.evaluate((el) => el.click(), claim._rowAnchorHandle).catch(() => {});
      } else {
        // fallback: click any link that contains the claim number
        if (claim.number) {
          const l = current.getByRole('link', { name: new RegExp(claim.number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
          if (await l.isVisible({ timeout: 1000 })) await l.click();
        }
      }

      const popup = await popupP;
      if (popup) return popup;
      await navP;
      return current;
    };

    try {
      detailPage = await tryOpen();
    } catch {
      return null;
    }

    if (!detailPage) return null;
    await detailPage.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await detailPage.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    
    // Petite pause pour s'assurer que tout est chargé (Angular)
    await detailPage.waitForTimeout(3000);

    const detail = await this.extractClaimDetails(detailPage, onLog);
    try {
      if (detailPage !== this.page) await detailPage.close();
    } catch {}
    return detail;
  }

  async extractClaimDetails(page, onLog = this.onLog || console.log) {
    const detail = {};
    let services = [];

    // First try extracting with specific selectors for Cigna's claim detail page
    try {
      // Extract summary amounts from specific elements
      const paymentAmount = await page.locator('[data-test="payment-info-msg-value"]').textContent().catch(() => null);
      if (paymentAmount) {
        detail.payment = this.parseAmount(paymentAmount.replace(/.*?:\s*/, ''));
      }

      // Extract from the procedures table using specific data-test attributes
      // Wait a bit for dynamic content to load (network latency in production)
      await page.waitForTimeout(3000);
      
      const proceduresTableCount = await page.locator('table[data-test="procedures-table"]').count();
      onLog(`   Found ${proceduresTableCount} procedures tables`);
      
      const proceduresTable = await page.locator('table[data-test="procedures-table"]').first();
      
      if (proceduresTableCount > 0 && await proceduresTable.isVisible({ timeout: 5000 })) {
        // Try with data-test attribute first, then fallback to all tbody tr
        let rows = await proceduresTable.locator('tbody tr[data-test="procedures-table-row"]').all();
        onLog(`   Rows with data-test="procedures-table-row": ${rows.length}`);
        
        if (rows.length === 0) {
          onLog(`   No rows with data-test attribute, trying all tbody tr`);
          rows = await proceduresTable.locator('tbody tr').all();
          onLog(`   All tbody tr rows: ${rows.length}`);
        }
        onLog(`   Processing ${rows.length} rows in procedures table`);
        
        for (const row of rows) {
          // Extract using specific data-test attributes
          const dateOfService = await row.locator('[data-test="date-of-service"]').textContent().catch(() => null);
          const cdtCodeText = await row.locator('[data-test="cdt-code"]').textContent().catch(() => null);
          
          // If no cdt-code data-test, try looking in td cells directly
          let cdtCodeAlt = null;
          if (!cdtCodeText) {
            const cells = await row.locator('td').allTextContents();
            // Look for CDT code pattern in cells
            cdtCodeAlt = cells.find(c => /D\d{4}/.test(c));
            if (cdtCodeAlt) {
              onLog(`   Found CDT in cell: ${cdtCodeAlt}`);
            }
          }
          const toothNumber = await row.locator('[data-test="tooth-number"]').textContent().catch(() => null);
          const amountCharged = await row.locator('[data-test="amount-charged"]').textContent().catch(() => null);
          const coveredBalance = await row.locator('[data-test="covered-balance"]').textContent().catch(() => null);
          const planCoinsurance = await row.locator('[data-test="plan-coinsurance-per"]').textContent().catch(() => null);
          const patientResponsibility = await row.locator('[data-test="member-responsibility"]').textContent().catch(() => null);
          
          // Parse CDT code and description
          let procedureCode = '';
          let procedureDescription = '';
          const codeText = cdtCodeText || cdtCodeAlt;
          if (codeText) {
            const match = codeText.match(/(D\d{4}[A-Z]?)\s*-?\s*(.*)$/);
            if (match) {
              procedureCode = match[1];
              procedureDescription = match[2] || '';
            }
          }
          
          // Extract paid amount from plan coinsurance column (format: "100%= $XX.XX")
          let paidAmount = 0;
          if (planCoinsurance) {
            const match = planCoinsurance.match(/\$\s*([\d,]+\.?\d*)/);
            if (match) {
              paidAmount = this.parseAmount(match[1]);
            }
          }
          
          const service = {
            date: dateOfService?.trim() || '',
            procedureCode: procedureCode,
            procedureDescription: procedureDescription.trim(),
            tooth: toothNumber?.trim().replace('--', '') || '',
            billed: this.parseAmount(amountCharged),
            covered: this.parseAmount(coveredBalance),
            paid: paidAmount,
            patientPay: this.parseAmount(patientResponsibility),
            status: 'Processed' // Claims in detail view are typically processed
          };
          
          // Only add if we have a valid CDT code
          if (procedureCode) {
            services.push(service);
          }
        }
        
        // Get totals from tfoot if available
        const footerRow = await proceduresTable.locator('tfoot tr').first();
        if (await footerRow.count() > 0) {
          const totalAmountCharged = await footerRow.locator('td').nth(3).textContent().catch(() => null);
          const totalPaid = await footerRow.locator('td').nth(8).textContent().catch(() => null);
          const totalPatientResp = await footerRow.locator('[data-test="member-response-total"]').textContent().catch(() => null);
          
          detail.totalBilled = this.parseAmount(totalAmountCharged);
          detail.totalPaid = this.parseAmount(totalPaid);
          detail.totalPatientPay = this.parseAmount(totalPatientResp);
        }
        
        onLog(`   ↳ Extracted ${services.length} CDT codes from procedures table`);
      }
    } catch (error) {
      onLog(`   ⚠️ Could not extract using specific selectors: ${error.message}`);
    }

    // Fallback to text extraction if no services found with specific selectors
    if (services.length === 0) {
      onLog(`   ⚠️ No services found with specific selectors, trying fallback text extraction`);
      const text = (await page.textContent('body').catch(() => '')) || '';
      
      // Try extracting summary amounts from text
      if (!detail.payment) {
        detail.payment = this.findMoneyAfter(text, /Claim Amount Paid/i) ??
                        this.findMoneyAfter(text, /\bPayment\b/i) ??
                        this.findMoneyAfter(text, /Total Paid/i);
      }
      
      if (!detail.totalBilled) {
        detail.totalBilled = this.findMoneyAfter(text, /Total Billed Amount/i) ??
                            this.findMoneyAfter(text, /Total Charge/i) ??
                            this.findMoneyAfter(text, /Amount Charged.*?Totals/is);
      }
      
      if (!detail.totalPatientPay) {
        detail.totalPatientPay = this.findMoneyAfter(text, /Total Patient Pay/i) ??
                                this.findMoneyAfter(text, /Patient Responsibility.*?Totals/is);
      }

      // Fallback: Services table heuristic - pick the last table (often detail lines)
      try {
        const allTables = await page.locator('table').all();
        const table = allTables[allTables.length - 1];
        const rows = await table.locator('tbody tr').all();

        for (const r of rows) {
          const cells = (await r.locator('td').allTextContents()).map(s => s.trim());
          if (!cells.length) continue;

          const code = cells.find(c => /^D\d{4}[A-Z]?$/i.test(c));
          const moneyIdxs = cells.map((v, i) => (/\$/.test(v) ? i : -1)).filter(i => i >= 0);

          const service = {
            date: cells.find(c => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(c)) || '',
            procedureCode: code || '',
            tooth: (cells.find(c => /\bTooth\b/i.test(c)) || '').replace(/.*Tooth:?/i, '').trim() || '',
            status: cells.find(c => /Denied|Paid|Processed|Pending/i.test(c)) || '',
            billed: this.parseAmount(cells[moneyIdxs[0]] || ''),
            patientPay: this.parseAmount(cells[moneyIdxs[1]] || ''),
            paid: this.parseAmount(cells[moneyIdxs[2]] || '')
          };

          // Skip obvious headers/summary rows
          if (/^Date$/i.test(service.date) && /^D\d{4}/.test(service.procedureCode) === false) continue;
          if (!service.procedureCode && moneyIdxs.length === 0) continue;

          services.push(service);
        }
      } catch {
        // Last resort fallback: scan text blocks for CDT codes
        services = (text.match(/D\d{4}[A-Z]?/g) || []).slice(0, 50).map((code) => ({
          date: '',
          procedureCode: code,
        }));
      }
    }

    detail.services = services;
    try { detail.detailUrl = page.url(); } catch {}
    onLog(`   ↳ Claim detail: billed ${fmt(detail.totalBilled)}, paid ${fmt(detail.payment)}, services ${services.length}`);
    return detail;
  }

  // ---------- Utils ----------

  normalizePatient(p) {
    const toUpper = (s) => (s || '').toString().trim().toUpperCase();
    return {
      subscriberId: (p.subscriberId || '').toString().trim(),
      firstName: toUpper(p.firstName),
      lastName: toUpper(p.lastName),
      dateOfBirth: this.asYYYYMMDD(p.dateOfBirth)
    };
  }

  asYYYYMMDD(d) {
    if (!d) return '';
    if (d.includes('-')) return d; // already ISO-ish
    // MM/DD/YYYY → YYYY-MM-DD
    const [m, day, y] = d.split('/');
    return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  asMMDDYYYY(d) {
    if (!d) return '';
    if (d.includes('/')) return d;
    // YYYY-MM-DD → MM/DD/YYYY
    const [y, m, day] = d.split('-');
    return `${m}/${day}/${y}`;
  }

  parseAmount(str) {
    if (!str) return 0;
    const m = ('' + str).match(/\$?\s*([\-]?\d[\d,]*\.?\d*)/);
    if (!m) return 0;
    const n = parseFloat(m[1].replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  findMoneyAfter(text, labelRe) {
    const m = text.match(new RegExp(`${labelRe.source}[^$]*\\$\\s*([\\d,]+\\.?\\d*)`, labelRe.flags));
    return m ? parseFloat(m[1].replace(/,/g, '')) : null;
  }

  buildSummary(patient, eligibility, claims, cdtCodes) {
    const totalBilled = claims.reduce((s, c) => s + (c.billed || 0), 0);
    const totalPaid = claims.reduce((s, c) => s + (c.paid || 0), 0);

    // Override with sums from detail pages if present
    const detailTotals = claims.reduce((acc, c) => {
      acc.billed += (c.totalBilled || 0);
      acc.paid += (c.payment || 0);
      acc.patient += (c.totalPatientPay || 0);
      return acc;
    }, { billed: 0, paid: 0, patient: 0 });

    const summary = {
      patientName: eligibility?.patient?.name || `${patient.firstName} ${patient.lastName}`,
      memberId: eligibility?.patient?.id || patient.subscriberId,

      planMaximum: eligibility?.annualMaximum ?? null,
      maximumUsed: eligibility?.annualMaximumUsed ?? null,
      maximumRemaining: eligibility?.annualMaximumRemaining ?? null,
      deductible: eligibility?.deductible ?? null,
      deductibleMet: eligibility?.deductibleMet ?? null,
      network: eligibility?.network ?? null,
      
      // Additional structured data
      patient: eligibility?.patient || {},
      subscriber: eligibility?.subscriber || {},
      plan: eligibility?.plan || {},
      deductibles: eligibility?.deductibles || {},
      maximums: eligibility?.maximums || {},

      totalClaims: claims.length,
      totalServices: claims.reduce((s, c) => s + (c.services?.length || 0), 0),

      totalBilled: detailTotals.billed || totalBilled || null,
      totalPaid: detailTotals.paid || totalPaid || null,
      patientResponsibility: detailTotals.patient || null,

      cdtCodes,
      totalCDTCodes: cdtCodes.length
    };

    return summary;
  }
}

function fmt(n) {
  if (n == null) return '—';
  try { return `$${Number(n).toLocaleString()}`; } catch { return String(n); }
}

module.exports = CignaService;
