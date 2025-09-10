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
    onLog('🚀 Initialisation MetLife...');
    
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

    // Charger le profil Chrome persistant si existe
    if (fs.existsSync(this.userDataDir)) {
      contextOptions.userDataDir = this.userDataDir;
      onLog('📁 Profil Chrome chargé');
    }

    // Charger les cookies de session si existent
    if (fs.existsSync(this.sessionFile)) {
      contextOptions.storageState = this.sessionFile;
      onLog('🍪 Session précédente chargée');
    }

    this.context = await this.browser.newContext(contextOptions);
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
    const isAuthenticated = await this.ensureAuthenticated(onLog, onOtpRequest);
    if (!isAuthenticated) {
      throw new Error('Échec de l\'authentification MetLife');
    }

    return true;
  }

  async ensureAuthenticated(onLog = console.log, onOtpRequest = null) {
    onLog('🔐 Vérification authentification...');
    
    // Naviguer vers la page d'accueil
    await this.page.goto(this.urls.home, { waitUntil: 'networkidle', timeout: 60000 });
    await this.page.waitForTimeout(2000);
    
    const currentUrl = this.page.url();
    onLog(`   URL actuelle: ${currentUrl}`);
    
    // Vérifier si déjà connecté
    if (currentUrl.includes('/home') && !this.isLoginPage(currentUrl)) {
      onLog('✅ Déjà connecté avec la session sauvegardée');
      await this.saveSession();
      return true;
    }

    // Connexion requise
    onLog('⚠️ Connexion requise...');
    return await this.performLogin(onLog, onOtpRequest);
  }

  async performLogin(onLog = console.log, onOtpRequest = null) {
    try {
      onLog('📝 Saisie des identifiants...');
      
      // Cliquer sur "Sign in" si présent
      const signInButton = this.page.getByRole('button', { name: 'Sign in' });
      if (await signInButton.isVisible({ timeout: 3000 })) {
        await signInButton.click();
      }

      // Entrer les credentials
      await this.page.getByRole('textbox', { name: 'username' }).fill(this.credentials.username);
      await this.page.getByRole('textbox', { name: 'password' }).fill(this.credentials.password);
      await this.page.getByRole('button', { name: 'Log in' }).click();
      
      // Attendre la navigation
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(3000);
      
      // Vérifier si OTP demandé
      if (await this.isOtpRequired()) {
        onLog('🔔 OTP requis!');
        
        // Sélectionner la méthode email si nécessaire
        const emailButton = this.page.getByRole('button', { name: /Email.*pa\*\*\*\*@/ });
        if (await emailButton.isVisible({ timeout: 3000 })) {
          await emailButton.click();
        }

        // Demander l'OTP
        if (onOtpRequest) {
          const otp = await onOtpRequest();
          if (!otp) {
            throw new Error('OTP non fourni');
          }
          
          // Entrer l'OTP
          await this.page.locator('#passcode').fill(otp);
          await this.page.getByRole('button', { name: 'Sign On' }).click();
          
          await this.page.waitForLoadState('networkidle');
        } else {
          throw new Error('OTP requis mais pas de handler fourni');
        }
      }
      
      // Vérifier qu'on est bien connecté
      const finalUrl = this.page.url();
      if (finalUrl.includes('/home')) {
        onLog('✅ Connexion réussie!');
        await this.saveSession();
        return true;
      }
      
      return false;
      
    } catch (error) {
      onLog(`❌ Erreur de connexion: ${error.message}`);
      return false;
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
           pageText.includes('Enter the code');
  }

  async saveSession() {
    await this.context.storageState({ path: this.sessionFile });
    console.log('💾 Session sauvegardée');
  }

  async extractPatientData(subscriberId, lastName, dateOfBirth, firstName, onLog = console.log) {
    try {
      onLog(`\n🔍 Recherche patient: ${firstName} ${lastName} (${subscriberId})`);
      
      // Navigation vers la recherche
      await this.page.waitForTimeout(2000);
      
      // Cliquer sur le champ de recherche
      await this.page.locator('div').filter({ hasText: /^Subscriber ID or Social Security Number$/ }).nth(2).click();
      await this.page.getByTestId('input-default-input').fill(subscriberId);
      await this.page.getByRole('button', { name: 'Submit' }).click();
      
      // Attendre le chargement
      onLog('⏳ Chargement...');
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
          { timeout: 10000 }
        );
      } catch (e) {
        onLog('⚠️ Timeout en attendant le contenu');
      }
      
      await this.page.waitForTimeout(2000);
      
      // Vérifier si désambiguïsation requise
      const pageText = await this.page.innerText('body').catch(() => '');
      
      if (pageText.includes('Duplicate identification') || pageText.includes('last name')) {
        onLog('⚠️ Désambiguïsation détectée');
        
        // Saisir le nom de famille
        await this.page.waitForSelector('#lastName', { timeout: 5000 });
        await this.page.locator('#lastName').fill(lastName);
        onLog(`   Nom saisi: ${lastName}`);
        
        // Soumettre
        await this.page.getByRole('link', { name: 'submit' }).click();
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(3000);
      }

      // Sélection du patient (méthode robuste)
      onLog('👤 Sélection du patient...');
      
      // Attendre que la page soit prête
      await Promise.race([
        this.page.getByText(/Select a patient/i).waitFor({ timeout: 10000 }).catch(() => {}),
        this.page.waitForSelector('table, [role="table"], .table', { state: 'attached', timeout: 10000 }).catch(() => {})
      ]).catch(() => {});
      
      await this.page.waitForTimeout(2000);
      
      try {
        // D'abord, essayer de scroller tous les conteneurs pour déclencher le rendu
        onLog('📜 Scroll pour déclencher le rendu virtualisé...');
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
        await patientLink.waitFor({ state: 'attached', timeout: 10000 });
        
        // Scroller si nécessaire
        await patientLink.scrollIntoViewIfNeeded().catch(() => {});
        
        // Essayer de cliquer
        try {
          await patientLink.click({ timeout: 5000 });
        } catch (clickError) {
          onLog('⚠️ Click standard échoué, tentative JS...');
          // Fallback: click via JavaScript
          const handle = await patientLink.elementHandle();
          if (handle) {
            await this.page.evaluate(el => el.click(), handle);
          } else {
            throw clickError;
          }
        }
        
        onLog(`✓ Patient ${firstName} ${lastName} sélectionné`);
        await this.page.waitForLoadState('domcontentloaded');
        
        // Gestion Multiple Providers si nécessaire
        await this.page.waitForTimeout(3000);
        const currentUrl = this.page.url();
        
        if (currentUrl.includes('MultipleProviders')) {
          onLog('⚠️ Sélection du provider...');
          
          // Sélectionner le premier provider disponible
          const providerLink = this.page.locator('table a').first();
          if (await providerLink.count() > 0) {
            await providerLink.click();
            onLog('✓ Provider sélectionné');
          }
          
          await this.page.waitForLoadState('networkidle');
          await this.page.waitForTimeout(3000);
        }
        
        // Extraction des données d'éligibilité
        onLog('\n📊 Extraction des données...');
        
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
          onLog('⚠️ Timeout données éligibilité');
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
        
        onLog('✓ Données d\'éligibilité extraites');
        
        // Récupération des claims
        onLog('\n📋 Récupération des claims...');
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
        onLog(`❌ Patient non trouvé: ${error.message}`);
        return {
          success: false,
          error: `Patient non trouvé ou erreur d'extraction: ${error.message}`
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
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}

module.exports = MetLifeService;