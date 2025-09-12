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
        '--window-size=1600,1000'
      ],
      slowMo: headless ? 0 : 150
    });

    const contextOptions = {
      viewport: { width: 1500, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
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
        // We're not on login page, check for nav element to confirm
        const navPresent = await this.page.locator('[data-test="primary-nav-child-chcp.patient.search"]').count()
          .catch(() => 0);
        
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
        await otpField.fill(otp);

        // trust device
        if ((process.env.CIGNA_TRUST_DEVICE || 'true').toLowerCase() === 'true') {
          try {
            await this.page.locator('label', { hasText: "Don't ask me for a code" }).locator('i').click();
            onLog('🔒 Trust this device ✓');
          } catch { /* non-blocking */ }
        }

        await this.page.locator('[data-test="btn-submit"]').click();
      }
      
      // Attendre que la page charge après OTP
      try {
        await this.page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch {
        onLog('   Page still loading after OTP, continuing...');
      }
    }

    // Validate app entry
    await this.page.waitForTimeout(1500);
    const logged = await this.page.locator('[data-test="primary-nav-child-chcp.patient.search"]').count()
      .catch(() => 0);
    if (logged === 0) {
      const body = await this.page.textContent('body').catch(() => '');
      onLog(`⚠️ Post-login page did not show nav. Body sample: ${String(body).slice(0, 300)}...`);
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
    // From top nav
    try {
      const nav = this.page.locator('[data-test="primary-nav-child-chcp.patient.search"]');
      if (await nav.isVisible({ timeout: 8000 })) {
        await nav.click();
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(800);
        onLog('🧭 Patient search page opened');
        return;
      }
    } catch {}
    // Direct URL (fallback)
    await this.safeGoto('https://cignaforhcp.cigna.com/app/patient/search', onLog);
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
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(1000);

    // Wait for results to appear
    await this.page.waitForSelector('[data-test^="patient-id-"]', { timeout: 15000 });
    onLog('✅ Patient search results loaded');
  }

  async openFirstPatientResult(onLog = this.onLog || console.log) {
    // Click first result (CodeGen: [data-test="patient-id-0"])
    const firstRow = this.page.locator('[data-test="patient-id-0"]');
    if (await firstRow.isVisible({ timeout: 8000 })) {
      await firstRow.click();
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(800);
      onLog('👤 Patient record opened');
      return;
    }
    // fallback: click any patient id link
    const any = this.page.locator('[data-test^="patient-id-"]').first();
    await any.click();
    await this.page.waitForLoadState('networkidle');
  }

  // ---------- Eligibility extraction ----------

  async extractEligibilityFromCurrentPage(onLog = this.onLog || console.log) {
    // The exact DOM can vary. We’ll parse visible text heuristically.
    const text = (await this.page.textContent('body').catch(() => '')) || '';

    const getMoney = (labelRegex) => {
      const m = text.match(new RegExp(`${labelRegex}[^$]*\\$\\s*([\\d,]+\\.?\\d*)`, 'i'));
      return m ? parseFloat(m[1].replace(/,/g, '')) : null;
    };

    const eligibility = {
      network: this.extractAfter(text, /Network[:\s]/i),
      planName: this.extractAfter(text, /(Plan|Program) (Name|Type)[:\s]/i),
      benefitsAsOf: this.extractAfter(text, /Benefits as of[:\s]/i),
      planStartDate: this.extractAfter(text, /(Plan|Benefit) (Start|Effective) Date[:\s]/i),

      annualMaximum: getMoney('(Annual|Plan)\\s+Maximum'),
      annualMaximumUsed: getMoney('(Maximum Used|Used to Date)'),
      annualMaximumRemaining: null,

      deductible: getMoney('Deductible(?!\\s*Met)'),
      deductibleMet: getMoney('Deductible\\s*Met'),
    };

    if (eligibility.annualMaximum != null && eligibility.annualMaximumUsed != null) {
      eligibility.annualMaximumRemaining = Math.max(
        0,
        eligibility.annualMaximum - eligibility.annualMaximumUsed
      );
    }

    // Try to pick some coinsurance hints (preventive/basic/major)
    const coinsurance = {};
    const coinMatches = text.matchAll(/(Preventive|Basic|Major)[^%\n]*?(\d{1,2})%\s*(?:in[-\s]*network)?/gi);
    for (const m of coinMatches) {
      coinsurance[m[1].toLowerCase()] = Number(m[2]);
    }
    if (Object.keys(coinsurance).length) eligibility.coinsurance = coinsurance;

    onLog(
      `   ↳ Annual Max: ${fmt(eligibility.annualMaximum)}, Used: ${fmt(eligibility.annualMaximumUsed)}, Deductible: ${fmt(eligibility.deductible)}`
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
    // Look for the most "claim-looking" table (with Claim/Service headers)
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
    await detailPage.waitForTimeout(500);

    const detail = await this.extractClaimDetails(detailPage, onLog);
    try {
      if (detailPage !== this.page) await detailPage.close();
    } catch {}
    return detail;
  }

  async extractClaimDetails(page, onLog = this.onLog || console.log) {
    const text = (await page.textContent('body').catch(() => '')) || '';
    const detail = {};

    detail.totalBilled = this.findMoneyAfter(text, /Total Billed Amount/i) ??
                         this.findMoneyAfter(text, /Total Charge/i);
    detail.totalPatientPay = this.findMoneyAfter(text, /Total Patient Pay/i) ??
                             this.findMoneyAfter(text, /Patient Responsibility/i);
    detail.payment = this.findMoneyAfter(text, /\bPayment\b/i) ??
                     this.findMoneyAfter(text, /Total Paid/i);

    // Services table heuristic: pick the last table (often detail lines)
    let services = [];
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
      // fallback: scan text blocks for CDT codes
      services = (text.match(/D\d{4}[A-Z]?/g) || []).slice(0, 50).map((code) => ({
        date: '',
        procedureCode: code,
      }));
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
      patientName: `${patient.firstName} ${patient.lastName}`,
      memberId: patient.subscriberId,

      planMaximum: eligibility?.annualMaximum ?? null,
      maximumUsed: eligibility?.annualMaximumUsed ?? null,
      maximumRemaining: eligibility?.annualMaximumRemaining ?? null,
      deductible: eligibility?.deductible ?? null,
      deductibleMet: eligibility?.deductibleMet ?? null,
      network: eligibility?.network ?? null,

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
