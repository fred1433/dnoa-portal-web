const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class MetLifeService {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    
    // Configuration
    this.credentials = {
      username: 'payorportal4771',
      password: 'Dental24!'
    };
    
    this.urls = {
      home: 'https://dentalprovider.metlife.com/home',
      presignin: 'https://dentalprovider.metlife.com/presignin'
    };
    
    // Dossiers de session
    const baseDir = path.join(__dirname, '.metlife-session');
    this.sessionFile = path.join(baseDir, 'auth.json');
    this.userDataDir = path.join(baseDir, 'chrome-profile');
    
    // Créer les dossiers si nécessaire
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
  }

  async initialize(headless = true, onLog = console.log, onOtpRequest = null) {
    onLog('🚀 Initializing MetLife...');
    
    const args = [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--start-maximized',
      '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    this.browser = await chromium.launch({
      headless,
      args,
      slowMo: headless ? 0 : 500
    });

    // Configuration du contexte avec session persistante
    const contextOptions = {
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      timezoneId: 'America/New_York'
    };
    
    // Enable tracing for debugging (especially in production)
    const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
    if (isProduction || process.env.ENABLE_TRACE) {
      this.traceFile = path.join(__dirname, `metlife-trace-${Date.now()}.zip`);
      onLog(`🎬 Recording trace to: ${this.traceFile}`);
    }

    // Charger le profil Chrome persistant si existe
    if (fs.existsSync(this.userDataDir)) {
      contextOptions.userDataDir = this.userDataDir;
      onLog('📁 Chrome profile loaded');
    }

    // Charger les cookies de session si existent
    if (fs.existsSync(this.sessionFile)) {
      contextOptions.storageState = this.sessionFile;
      onLog('🍪 Previous session loaded');
    }

    this.context = await this.browser.newContext(contextOptions);
    
    // Start tracing if enabled
    if (this.traceFile) {
      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });
    }
    
    this.page = await this.context.newPage();
    
    // NE PAS bloquer les fonts ! MetLife en a besoin pour le rendu
    if (headless) {
      // Utiliser resourceType (plus propre que les extensions)
      await this.page.route('**/*', route => {
        const type = route.request().resourceType();
        // Bloquer seulement images et media, PAS les fonts/css/js !
        if (type === 'image' || type === 'media') {
          return route.abort();
        }
        return route.continue();
      });
    }

    // Tenter l'authentification
    const authResult = await this.ensureAuthenticated(onLog, onOtpRequest);
    if (!authResult.success) {
      throw new Error(`MetLife authentication failed: ${authResult.error || 'Unknown error'}`);
    }

    return true;
  }

  async ensureAuthenticated(onLog = console.log, onOtpRequest = null) {
    onLog('🔐 Checking authentication...');
    
    try {
      // Log session file status
      if (fs.existsSync(this.sessionFile)) {
        const stats = fs.statSync(this.sessionFile);
        onLog(`   Session file exists (${stats.size} bytes, modified: ${stats.mtime.toISOString()})`);
      } else {
        onLog('   No session file found');
      }
      
      // Navigate to home page
      onLog(`   Navigating to: ${this.urls.home}`);
      await this.page.goto(this.urls.home, { waitUntil: 'networkidle', timeout: 60000 });
      await this.page.waitForTimeout(2000);
    } catch (navError) {
      onLog(`⚠️ Navigation error: ${navError.message}`);
      onLog(`   Error stack: ${navError.stack}`);
      // Continue anyway to try login
    }
    
    const currentUrl = this.page.url();
    onLog(`   Current URL: ${currentUrl}`);
    
    // Log page title for debugging
    const pageTitle = await this.page.title().catch(() => 'N/A');
    onLog(`   Page title: ${pageTitle}`);
    
    // Check if already logged in
    if (currentUrl.includes('/home') && !this.isLoginPage(currentUrl)) {
      onLog('✅ Already logged in with saved session');
      await this.saveSession();
      return { success: true };
    }

    // Login required
    onLog('⚠️ Login required...');
    onLog(`   Redirected to: ${currentUrl}`);
    return await this.performLogin(onLog, onOtpRequest);
  }

  async performLogin(onLog = console.log, onOtpRequest = null) {
    try {
      onLog('📝 Starting login process...');
      
      // Log current page content for debugging
      const pageText = await this.page.innerText('body').catch(() => '');
      if (pageText.length < 100) {
        onLog(`   ⚠️ Page seems empty or not loaded properly (${pageText.length} chars)`);
      }
      
      // Check for "Sign in" button
      try {
        const signInButton = this.page.getByRole('button', { name: 'Sign in' });
        if (await signInButton.isVisible({ timeout: 3000 })) {
          await signInButton.click();
          onLog('   Clicked Sign in button');
          await this.page.waitForLoadState('networkidle');
        }
      } catch (e) {
        onLog('   Sign in button not found, continuing...');
      }

      // Enter credentials
      try {
        onLog('   Looking for login form...');
        await this.page.getByRole('textbox', { name: 'username' }).fill(this.credentials.username);
        await this.page.getByRole('textbox', { name: 'password' }).fill(this.credentials.password);
        await this.page.getByRole('button', { name: 'Log in' }).click();
        onLog('   Credentials submitted via primary method');
      } catch (e) {
        onLog(`   ⚠️ Primary login method failed: ${e.message}`);
        // Try alternative selectors
        try {
          onLog('   Trying alternative selectors...');
          const usernameField = await this.page.locator('#username').isVisible();
          const passwordField = await this.page.locator('#password').isVisible();
          onLog(`   Username field visible: ${usernameField}, Password field visible: ${passwordField}`);
          
          await this.page.locator('#username').fill(this.credentials.username);
          await this.page.locator('#password').fill(this.credentials.password);
          await this.page.locator('button[type="submit"]').click();
          onLog('   Credentials submitted via alternative method');
        } catch (e2) {
          // Log page HTML for debugging
          const pageHtml = await this.page.content();
          onLog(`   Current page HTML length: ${pageHtml.length} chars`);
          if (pageHtml.includes('maintenance')) {
            throw new Error('MetLife portal is under maintenance');
          }
          throw new Error(`Login form not found: ${e2.message}`);
        }
      }
      
      // Attendre la navigation
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(3000);
      
      // Check if OTP is required
      if (await this.isOtpRequired()) {
        onLog('🔔 OTP required! Selecting email method...');
        
        try {
          // Click on email method button (various possible selectors)
          const emailSelectors = [
            'button:has-text("Email")',
            'button:has-text("pa****@sdbmail.com")',
            '[aria-label*="Email"]',
            'text=/Email.*pa.*@/'
          ];
          
          let clicked = false;
          for (const selector of emailSelectors) {
            try {
              await this.page.locator(selector).first().click({ timeout: 3000 });
              onLog('   ✓ Email method selected');
              clicked = true;
              break;
            } catch (e) {
              // Try next selector
            }
          }
          
          if (!clicked) {
            onLog('   ⚠️ Could not find email button, continuing anyway...');
          }
          
          await this.page.waitForTimeout(2000);
          
          // Request OTP from handler
          if (onOtpRequest) {
            onLog('   ⏳ Waiting for OTP code...');
            const otp = await onOtpRequest();
            
            if (!otp) {
              throw new Error('OTP not provided');
            }
            
            onLog(`   📝 Entering OTP: ${otp}`);
            
            // Try different OTP input selectors
            const otpSelectors = ['#passcode', '#otp', 'input[type="text"]', 'input[name*="code"]'];
            let entered = false;
            
            for (const selector of otpSelectors) {
              try {
                await this.page.locator(selector).fill(otp);
                onLog(`   ✓ OTP entered in ${selector}`);
                entered = true;
                break;
              } catch (e) {
                // Try next selector
              }
            }
            
            if (!entered) {
              throw new Error('Could not find OTP input field');
            }
            
            // Submit OTP (try different submit buttons)
            const submitSelectors = [
              'button:has-text("Sign On")',
              'button:has-text("Submit")',
              'button:has-text("Continue")',
              'button[type="submit"]'
            ];
            
            for (const selector of submitSelectors) {
              try {
                await this.page.locator(selector).click({ timeout: 3000 });
                onLog(`   ✓ OTP submitted`);
                break;
              } catch (e) {
                // Try next selector
              }
            }
            
            await this.page.waitForLoadState('networkidle');
            await this.page.waitForTimeout(3000);
            
            onLog('   ✅ OTP process completed');
          } else {
            throw new Error('OTP required but no handler provided');
          }
        } catch (otpError) {
          onLog(`   ❌ OTP handling error: ${otpError.message}`);
          throw otpError;
        }
      }
      
      // Check if successfully logged in
      const finalUrl = this.page.url();
      onLog(`   Final URL after login: ${finalUrl}`);
      
      if (finalUrl.includes('/home')) {
        onLog('✅ Login successful!');
        await this.saveSession();
        return { success: true };
      } else {
        // Log why login might have failed
        const pageContent = await this.page.innerText('body').catch(() => '');
        if (pageContent.includes('invalid') || pageContent.includes('incorrect')) {
          onLog('   ❌ Invalid credentials');
        } else if (pageContent.includes('locked') || pageContent.includes('blocked')) {
          onLog('   ❌ Account may be locked');
        } else {
          onLog(`   ❌ Login failed - unexpected page state`);
        }
      }
      
      return { success: false, error: 'Login failed' };
      
    } catch (error) {
      onLog(`❌ Login error: ${error.message}`);
      onLog(`   Error stack: ${error.stack}`);
      
      // Take screenshot for debugging (in production)
      if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
        try {
          const screenshotPath = path.join(__dirname, 'login-error.png');
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
          onLog(`   Screenshot saved to: ${screenshotPath}`);
        } catch (screenshotError) {
          onLog(`   Could not save screenshot: ${screenshotError.message}`);
        }
      }
      
      return { success: false, error: error.message };
    }
  }

  isLoginPage(url) {
    return url.includes('login') || 
           url.includes('signin') || 
           url.includes('sso') || 
           url.includes('authorization');
  }

  async isOtpRequired() {
    const pageText = await this.page.textContent('body') || '';
    return pageText.includes('verification') || 
           pageText.includes('passcode') || 
           pageText.includes('Enter the code') ||
           pageText.includes('authentication method') ||
           pageText.includes('Email 1');
  }

  async saveSession() {
    try {
      await this.context.storageState({ path: this.sessionFile });
      const stats = fs.statSync(this.sessionFile);
      console.log(`💾 Session saved (${stats.size} bytes)`);
    } catch (error) {
      console.log(`❌ Failed to save session: ${error.message}`);
    }
  }

  async extractPatientData(subscriberId, lastName, dateOfBirth, firstName, onLog = console.log) {
    try {
      onLog(`\n🔍 Searching patient: ${firstName} ${lastName} (${subscriberId})`);
      
      // Navigation vers la recherche
      await this.page.waitForTimeout(2000);
      
      // Cliquer sur le champ de recherche
      await this.page.locator('div').filter({ hasText: /^Subscriber ID or Social Security Number$/ }).nth(2).click();
      await this.page.getByTestId('input-default-input').fill(subscriberId);
      await this.page.getByRole('button', { name: 'Submit' }).click();
      
      // Attendre le chargement
      onLog('⏳ Loading...');
      await this.page.waitForLoadState('networkidle');
      
      // Attendre que le contenu apparaisse (AVEC firstName passé en argument !)
      try {
        await this.page.waitForFunction(
          (name) => {
            const text = document.body?.innerText || '';
            return text.includes('Duplicate identification') || 
                   text.includes('Select a patient') || 
                   text.toUpperCase().includes(name.toUpperCase());
          },
          firstName, // IMPORTANT: passer firstName comme argument !
          { timeout: 30000 } // Increased timeout for slow loading
        );
      } catch (e) {
        onLog('⚠️ Timeout waiting for content');
      }
      
      await this.page.waitForTimeout(2000);
      
      // Vérifier si désambiguïsation requise
      const pageText = await this.page.innerText('body').catch(() => '');
      
      if (pageText.includes('Duplicate identification') || pageText.includes('last name')) {
        onLog('⚠️ Disambiguation detected');
        
        // Saisir le nom de famille
        await this.page.waitForSelector('#lastName', { timeout: 5000 });
        await this.page.locator('#lastName').fill(lastName);
        onLog(`   Entered last name: ${lastName}`);
        
        // Soumettre
        await this.page.getByRole('link', { name: 'submit' }).click();
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(3000);
      }

      // Sélection du patient (méthode robuste)
      onLog('👤 Selecting patient...');
      
      // Attendre que la page soit prête
      await Promise.race([
        this.page.getByText(/Select a patient/i).waitFor({ timeout: 10000 }).catch(() => {}),
        this.page.waitForSelector('table, [role="table"], .table', { state: 'attached', timeout: 10000 }).catch(() => {})
      ]).catch(() => {});
      
      await this.page.waitForTimeout(2000);
      
      try {
        // D'abord, essayer de scroller tous les conteneurs pour déclencher le rendu
        onLog('📜 Scrolling to trigger virtualized rendering...');
        await this.page.evaluate(() => {
          // Trouver tous les conteneurs scrollables
          const scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
            const style = getComputedStyle(el);
            return (el.scrollHeight > el.clientHeight + 10) && 
                   (style.overflowY === 'auto' || style.overflowY === 'scroll');
          });
          
          // Scroller chaque conteneur
          scrollables.forEach(el => {
            el.scrollTop = el.scrollHeight;
            el.scrollTop = 0;
          });
          
          // Aussi scroller la page principale
          window.scrollTo(0, document.body.scrollHeight);
          window.scrollTo(0, 0);
        });
        
        await this.page.waitForTimeout(1000);
        
        // Utiliser getByRole avec regex (plus robuste)
        const nameRegex = new RegExp(`\\b${firstName}\\b`, 'i');
        const patientLink = this.page.getByRole('link', { name: nameRegex }).first();
        
        // Attendre que l'élément soit attaché (pas forcément visible)
        await patientLink.waitFor({ state: 'attached', timeout: 30000 });
        
        // Scroller si nécessaire
        await patientLink.scrollIntoViewIfNeeded().catch(() => {});
        
        // Essayer de cliquer
        try {
          await patientLink.click({ timeout: 5000 });
        } catch (clickError) {
          onLog('⚠️ Standard click failed, trying JS click...');
          // Fallback: click via JavaScript
          const handle = await patientLink.elementHandle();
          if (handle) {
            await this.page.evaluate(el => el.click(), handle);
          } else {
            throw clickError;
          }
        }
        
        onLog(`✓ Patient ${firstName} ${lastName} selected`);
        await this.page.waitForLoadState('domcontentloaded');
        
        // Gestion Multiple Providers si nécessaire
        await this.page.waitForTimeout(3000);
        const currentUrl = this.page.url();
        
        if (currentUrl.includes('MultipleProviders')) {
          onLog('⚠️ Selecting provider...');
          
          // Sélectionner le premier provider disponible
          const providerLink = this.page.locator('table a').first();
          if (await providerLink.count() > 0) {
            await providerLink.click();
            onLog('✓ Provider selected');
          }
          
          await this.page.waitForLoadState('networkidle');
          await this.page.waitForTimeout(3000);
        }
        
        // Extraction des données d'éligibilité
        onLog('\n📊 Extracting data...');
        
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(5000);
        
        // Attendre les données d'éligibilité
        try {
          await this.page.waitForFunction(
            () => {
              const text = document.body?.innerText || '';
              return text.includes('Plan Maximum') || 
                     text.includes('Annual Maximum') || 
                     text.includes('Deductible');
            },
            { timeout: 10000 }
          );
        } catch (e) {
          onLog('⚠️ Timeout waiting for eligibility data');
        }
        
        // Extraire les données
        const eligPageText = await this.page.innerText('body').catch(() => '');
        
        let eligibilityData = {
          patientInfo: {
            subscriber: `${firstName} ${lastName}`,
            patient: `${firstName} ${lastName}`,
            subscriberId: subscriberId
          },
          basicPlan: {},
          orthodontics: {},
          tmj: {},
          periodontics: {}
        };
        
        // Extraire les informations patient
        const patientInfoElement = await this.page.locator('p.empdemocolumn').first();
        if (await patientInfoElement.count() > 0) {
          const infoHTML = await patientInfoElement.innerHTML();
          const lines = infoHTML.split('<br>').map(line => 
            line.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
          );
          
          for (const line of lines) {
            if (line.includes(':')) {
              const [key, value] = line.split(':').map(s => s.trim());
              if (key && value) {
                if (key.includes('Network')) eligibilityData.patientInfo.network = value;
                if (key.includes('Plan Benefits as of')) eligibilityData.patientInfo.benefitsAsOf = value;
                if (key.includes('Plan Benefits Start Date')) eligibilityData.patientInfo.startDate = value;
              }
            }
          }
        }
        
        // Extraire les montants du plan
        const planMaxMatch = eligPageText.match(/Plan Maximum[^$]*\$([0-9,]+)/);
        const usedMatch = eligPageText.match(/Maximum Used to Date[^$]*\$([0-9,]+)/);
        const deductibleMatch = eligPageText.match(/Deductible[^$]*\$([0-9,]+)/);
        const deductibleMetMatch = eligPageText.match(/Deductible Met to Date[^$]*\$([0-9,]+)/);
        
        if (planMaxMatch) eligibilityData.basicPlan.planMaximum = '$' + planMaxMatch[1];
        if (usedMatch) eligibilityData.basicPlan.maximumUsed = '$' + usedMatch[1];
        if (deductibleMatch) eligibilityData.basicPlan.deductible = '$' + deductibleMatch[1];
        if (deductibleMetMatch) eligibilityData.basicPlan.deductibleMet = '$' + deductibleMetMatch[1];
        
        // Calculer le restant
        if (planMaxMatch && usedMatch) {
          const max = parseInt(planMaxMatch[1].replace(/,/g, ''));
          const used = parseInt(usedMatch[1].replace(/,/g, ''));
          eligibilityData.basicPlan.maximumRemaining = '$' + (max - used).toLocaleString();
        }
        
        onLog('✓ Eligibility data extracted');
        
        // Récupération des claims
        onLog('\n📋 Retrieving claims...');
        let claimsData = [];
        
        try {
          // Naviguer vers View Claims
          await this.page.getByRole('link', { name: 'View Claims' }).click();
          await this.page.waitForLoadState('networkidle');
          await this.page.waitForTimeout(3000);
          
          // Soumettre pour voir les claims
          await this.page.getByRole('button', { name: 'submit' }).click();
          await this.page.waitForLoadState('networkidle');
          
          // Attendre les claims
          try {
            await this.page.waitForFunction(
              () => {
                const text = document.body?.innerText || '';
                return text.includes('Date of Service') || 
                       text.includes('Claim Number') || 
                       text.includes('Provider');
              },
              { timeout: 10000 }
            );
          } catch (e) {
            onLog('⚠️ Timeout claims');
          }
          
          await this.page.waitForTimeout(3000);
          
          // Extraire les claims du tableau
          const claimsTable = this.page.locator('#claimSumTable');
          if (await claimsTable.count() > 0) {
            const dataRows = await claimsTable.locator('tbody > tr').all();
            onLog(`   ${dataRows.length - 1} claims trouvés`);
            
            // Parcourir les claims (max 10)
            const maxClaims = Math.min(10, dataRows.length - 1);
            for (let i = 1; i <= maxClaims; i++) {
              const row = dataRows[i];
              const cells = await row.locator('td').all();
              
              if (cells.length >= 8) {
                const claimDatesText = await cells[0].innerText();
                const dateMatch = claimDatesText.match(/Received:\s*(\S+)[\s\S]*Processed:\s*(\S+)/);
                
                const patientInfoText = await cells[3].innerText();
                const serviceMatch = patientInfoText.match(/Date of Service:\s*([^\n]+)/);
                
                const serviceTotalsText = await cells[4].innerText();
                const chargeMatch = serviceTotalsText.match(/Charge:\s*(\$[\d,\.]+)/);
                const benefitMatch = serviceTotalsText.match(/Benefit Amount:\s*(\$[\d,\.]+)/);
                
                const claim = {
                  fileRefNumber: await cells[1].innerText(),
                  receivedDate: dateMatch?.[1] || '',
                  processedDate: dateMatch?.[2] || '',
                  serviceDate: serviceMatch?.[1] || '',
                  charge: chargeMatch?.[1] || '',
                  benefitAmount: benefitMatch?.[1] || '',
                  totalPayment: await cells[5].innerText(),
                  paymentMethod: await cells[6].innerText(),
                  procedureCodes: []
                };
                
                // Extraire les codes CDT (popup)
                try {
                  const refLink = row.locator('td:nth-child(2) > a').first();
                  if (await refLink.count() > 0) {
                    // Préparer l'interception de la popup
                    const popupPromise = this.page.context().waitForEvent('page');
                    
                    // Cliquer sur le lien
                    await refLink.click();
                    
                    // Attendre la popup
                    const popup = await popupPromise;
                    await popup.waitForLoadState('networkidle');
                    await popup.waitForTimeout(2000);
                    
                    // Extraire le HTML
                    const popupHTML = await popup.content();
                    
                    // Extraire les codes CDT
                    const serviceRows = popupHTML.match(/<tr align="center" class="innerTable">[\s\S]*?<\/tr>/g);
                    
                    if (serviceRows) {
                      for (const serviceRow of serviceRows) {
                        if (serviceRow.includes('Issued') || serviceRow.includes('Payment Date')) continue;
                        
                        const descMatch = serviceRow.match(/<td[^>]*>([^(]+)\s*\(([D]\d{4}[A-Z]?)\)&nbsp;<\/td>/);
                        if (descMatch) {
                          claim.procedureCodes.push({
                            code: descMatch[2],
                            description: descMatch[1].trim()
                          });
                        }
                      }
                    }
                    
                    // Fermer la popup
                    await popup.close();
                  }
                } catch (error) {
                  onLog(`   ⚠️ Erreur extraction CDT: ${error.message}`);
                }
                
                claimsData.push(claim);
              }
            }
            
            onLog(`✓ ${claimsData.length} claims extraits`);
          }
          
        } catch (err) {
          onLog(`⚠️ Erreur claims: ${err.message}`);
        }
        
        // Retourner les résultats
        return {
          success: true,
          data: {
            timestamp: new Date().toISOString(),
            patient: {
              subscriberId,
              firstName,
              lastName,
              dateOfBirth
            },
            eligibility: eligibilityData,
            claims: claimsData
          }
        };
        
      } catch (error) {
        onLog(`❌ Patient not found: ${error.message}`);
        return {
          success: false,
          error: `Patient not found or extraction error: ${error.message}`
        };
      }
      
    } catch (error) {
      onLog(`❌ Erreur extraction: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async close() {
    // Stop tracing and save if enabled
    if (this.traceFile && this.context) {
      try {
        await this.context.tracing.stop({ path: this.traceFile });
        console.log(`📦 Trace saved to: ${this.traceFile}`);
        console.log(`   View with: npx playwright show-trace ${this.traceFile}`);
        
        // Store trace path for later retrieval
        this.lastTraceFile = this.traceFile;
      } catch (error) {
        console.error('Failed to save trace:', error);
      }
    }
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
  
  getLastTraceFile() {
    return this.lastTraceFile;
  }
}

module.exports = MetLifeService;