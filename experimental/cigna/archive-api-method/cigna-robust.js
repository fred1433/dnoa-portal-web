const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const fs = require('fs');

class CignaRobustScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.token = null;
    this.tokenExpiry = 0;
  }

  async init() {
    console.log('🚀 Cigna Robust Scraper - Init...');
    
    this.browser = await chromium.launch({ 
      headless: false, // Pour auth manuelle initiale
      slowMo: 200 
    });
    
    // Essayer de charger session existante
    let storageState = null;
    try {
      storageState = JSON.parse(fs.readFileSync('./cigna-session.json', 'utf8'));
      console.log('📁 Session existante trouvée');
    } catch {
      console.log('📁 Pas de session sauvée');
    }
    
    this.context = await this.browser.newContext({
      storageState: storageState
    });
    
    // Token sniffer
    await this.context.route('**/*', (route, request) => {
      const auth = request.headers()['authorization'];
      if (auth && auth.startsWith('Bearer ') && !this.token) {
        const token = auth.replace('Bearer ', '');
        this.setToken(token);
      }
      route.continue();
    });
    
    this.page = await this.context.newPage();
  }

  setToken(token) {
    this.token = token;
    try {
      const decoded = jwt.decode(token);
      this.tokenExpiry = (decoded.exp || 0) * 1000;
      const timeLeft = Math.round((this.tokenExpiry - Date.now()) / 1000 / 60);
      console.log(`🔑 Token capturé (expire dans ${timeLeft} min)`);
    } catch {
      console.log('🔑 Token capturé (expiry non décodable)');
    }
  }

  get isTokenValid() {
    const marginMs = 120000; // 2 min de marge
    return this.token && Date.now() < (this.tokenExpiry - marginMs);
  }

  async ensureValidToken() {
    if (this.isTokenValid) return;
    
    console.log('🔄 Token expiré/manquant - refresh...');
    
    // Aller sur dashboard pour déclencher refresh
    await this.page.goto('https://cignaforhcp.cigna.com/app/dashboard');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(2000);
    
    if (!this.isTokenValid) {
      throw new Error('Impossible de récupérer un token valide');
    }
  }

  async authenticateOnce() {
    console.log('🔐 Authentification initiale...');
    
    await this.page.goto('https://cignaforhcp.cigna.com/app/login');
    
    console.log('👤 CONNECTE-TOI MANUELLEMENT (avec MFA si nécessaire)');
    console.log('📍 Appuie sur ENTRÉE quand tu es sur le dashboard...');
    
    // Attendre input utilisateur
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve());
    });
    
    // Vérifier qu'on est bien connecté
    const url = this.page.url();
    if (!url.includes('/app/')) {
      throw new Error('Authentification échouée');
    }
    
    // Sauver la session
    const storageState = await this.context.storageState();
    fs.writeFileSync('./cigna-session.json', JSON.stringify(storageState, null, 2));
    console.log('💾 Session sauvée dans cigna-session.json');
    
    // S'assurer d'avoir un token
    await this.ensureValidToken();
  }

  async apiCall(url, data = null, method = 'POST') {
    await this.ensureValidToken();
    
    const options = {
      headers: {
        'authorization': `Bearer ${this.token}`,
        'content-type': 'application/json',
        'accept': 'application/json, text/plain, */*',
        'origin': 'https://cignaforhcp.cigna.com',
        'referer': 'https://cignaforhcp.cigna.com/'
      }
    };
    
    if (method === 'POST' && data) {
      options.data = data;
    }
    
    const response = await this.context.request[method.toLowerCase()](url, options);
    
    if (!response.ok()) {
      if (response.status() === 401) {
        console.log('🔑 401 détecté - tentative refresh token...');
        this.token = null; // Force refresh
        await this.ensureValidToken();
        // Retry une fois
        const retryResponse = await this.context.request[method.toLowerCase()](url, {
          ...options,
          headers: {
            ...options.headers,
            'authorization': `Bearer ${this.token}`
          }
        });
        return retryResponse.json();
      }
      throw new Error(`API Error ${response.status()}: ${await response.text()}`);
    }
    
    return response.json();
  }

  async getDashboardPatients() {
    console.log('📋 Récupération patients dashboard...');
    
    const data = await this.apiCall(
      'https://p-chcp.digitaledge.cigna.com/apollo-graphql',
      {
        "operationName": "DashboardPatients", 
        "variables": {},
        "query": `query DashboardPatients {
          recentPatients {
            dob
            firstName
            lastName
            identifier
            patientId
            __typename
          }
          flaggedPatients {
            dob
            firstName
            lastName
            patientId
            __typename  
          }
        }`
      }
    );
    
    const allPatients = [
      ...(data.data?.recentPatients || []),
      ...(data.data?.flaggedPatients || [])
    ];
    
    console.log(`✅ ${allPatients.length} patients trouvés`);
    return allPatients;
  }

  async getPatientClaims(patientId, dob) {
    console.log(`   🔍 Claims pour ${patientId}...`);
    
    // Essayer différents formats de date comme suggéré par GPT-5
    const dateFormats = [
      dob, // 2017-11-14
      dob.split('-').slice(1).concat(dob.split('-')[0]).join('/'), // 11/14/2017
      dob.split('-').reverse().join('/') // 14/11/2017
    ];
    
    for (const dateFormat of dateFormats) {
      try {
        const claims = await this.apiCall(
          'https://p-chcp.digitaledge.cigna.com/claims/dental/v2/search?consumerCode=1000',
          {
            "type": "patient",
            "memberId": patientId,
            "patientSearchType": "id_dob", 
            "memberDateOfBirth": dateFormat
          }
        );
        
        if (claims.results && claims.results.length > 0) {
          console.log(`   ✅ ${claims.results.length} claims (format: ${dateFormat})`);
          return claims.results;
        }
        
      } catch (error) {
        if (!error.message.includes('500')) {
          throw error; // Si pas erreur 500, c'est grave
        }
        // Continue avec format suivant si erreur 500
      }
    }
    
    console.log(`   ⚠️ Aucun claim trouvé pour ${patientId}`);
    return [];
  }

  async getClaimDetails(claim) {
    const details = await this.apiCall(
      'https://p-chcp.digitaledge.cigna.com/apollo-graphql',
      {
        "operationName": "ClaimDetailNew",
        "variables": {
          "input": {
            "claimCompositeKey": claim.claimCompositeKey,
            "claimReferenceNumber": claim.claimReferenceNumber,
            "compositeClaimId": claim.compositeClaimId,
            "tinNumbers": claim.tinNumbers?.[0] || ""
          }
        },
        "query": `query ClaimDetailNew($input: ClaimDetailInput!) {
          claimByCompositeKey(input: $input) {
            detail {
              memberObject {
                memberId
                memberFirstName
                memberLastName
                memberDateOfBirth
                relationShipCode
                patientId
                __typename
              }
              claimInfoObject {
                claimReferenceNumber
                claimTotChargeAmount
                claimTotPaidAmount
                claimDateOfService
                serviceProvider
                claimStatusDesc
                serviceLineInfoArray {
                  cdtCode
                  procedureCode
                  amountCharged
                  svcLinePaidAmount
                  memberResponsibility
                  __typename
                }
                serviceLineTotalsObject {
                  amountChargedTotal
                  allowedAmountTotal
                  planCoinsurancePaidTotal
                  memberCoInsuTotal
                  __typename
                }
                __typename
              }
              __typename
            }
            __typename
          }
        }`
      }
    );
    
    return details.data?.claimByCompositeKey?.detail;
  }

  async extractAllPatients() {
    const startTime = Date.now();
    console.log('🎯 EXTRACTION TOTALE CIGNA - Approche robuste');
    
    try {
      // 1. Authentification si nécessaire
      try {
        await this.page.goto('https://cignaforhcp.cigna.com/app/dashboard');
        await this.page.waitForLoadState('networkidle');
        
        // Vérifier si connecté
        const isLoggedIn = await this.page.url().includes('/app/');
        if (!isLoggedIn) {
          await this.authenticateOnce();
        } else {
          console.log('✅ Déjà connecté');
          await this.ensureValidToken();
        }
      } catch {
        await this.authenticateOnce();
      }
      
      // 2. Récupérer tous les patients
      const patients = await this.getDashboardPatients();
      
      // 3. Extraire 3 premiers pour test
      const testPatients = patients.slice(0, 3);
      console.log(`\n🧪 Test avec ${testPatients.length} patients:`);
      testPatients.forEach(p => console.log(`   - ${p.firstName} ${p.lastName} (${p.patientId})`));
      
      const results = [];
      
      for (let i = 0; i < testPatients.length; i++) {
        const patient = testPatients[i];
        const patientName = `${patient.firstName} ${patient.lastName}`;
        
        console.log(`\n[${i+1}/${testPatients.length}] ${patientName}...`);
        
        try {
          const claims = await this.getPatientClaims(patient.patientId, patient.dob);
          
          const claimsWithDetails = [];
          
          for (const claim of claims) {
            console.log(`     📄 ${claim.claimReferenceNumber}...`);
            
            try {
              const details = await this.getClaimDetails(claim);
              claimsWithDetails.push({ claim, details });
              console.log(`     ✅ OK`);
            } catch (error) {
              console.log(`     ❌ ${error.message}`);
              claimsWithDetails.push({ claim, error: error.message });
            }
            
            await this.page.waitForTimeout(500); // Rate limiting
          }
          
          results.push({
            patient: {
              name: patientName,
              memberId: patient.patientId,
              dob: patient.dob,
              identifier: patient.identifier
            },
            claims: claims,
            claimsWithDetails: claimsWithDetails,
            summary: {
              totalClaims: claims.length,
              successfulDetails: claimsWithDetails.filter(c => c.details).length
            },
            status: 'success'
          });
          
          console.log(`   ✅ ${patientName}: ${claims.length} claims extraits`);
          
        } catch (error) {
          console.log(`   ❌ ${patientName}: ${error.message}`);
          results.push({
            patient: { name: patientName, memberId: patient.patientId },
            error: error.message,
            status: 'error'
          });
        }
        
        await this.page.waitForTimeout(1000); // Entre patients
      }
      
      // 4. Sauvegarder les résultats
      const totalTime = Date.now() - startTime;
      const finalResults = {
        patients: results,
        summary: {
          totalPatients: testPatients.length,
          successfulPatients: results.filter(r => r.status === 'success').length,
          totalClaims: results.reduce((sum, r) => sum + (r.summary?.totalClaims || 0), 0),
          extractionTime: totalTime
        },
        timestamp: Date.now(),
        method: 'cigna-robust-api'
      };
      
      const filename = `data/cigna-ROBUST-TEST-${Date.now()}.json`;
      fs.writeFileSync(filename, JSON.stringify(finalResults, null, 2));
      
      console.log('\n🎉 EXTRACTION ROBUSTE TERMINÉE !');
      console.log(`📊 ${finalResults.summary.successfulPatients}/${finalResults.summary.totalPatients} patients réussis`);
      console.log(`📄 ${finalResults.summary.totalClaims} claims total`);
      console.log(`⏱️ ${(totalTime/1000).toFixed(1)}s total`);
      console.log(`💾 Sauvé: ${filename}`);
      
      return finalResults;
      
    } catch (error) {
      console.error('❌ Erreur extraction globale:', error.message);
      throw error;
    }
  }

  async saveSession() {
    if (this.context) {
      const storageState = await this.context.storageState();
      fs.writeFileSync('./cigna-session.json', JSON.stringify(storageState, null, 2));
      console.log('💾 Session mise à jour');
    }
  }

  async close() {
    await this.saveSession();
    if (this.browser) {
      await this.browser.close();
      console.log('🔚 Navigateur fermé');
    }
  }
}

async function main() {
  const scraper = new CignaRobustScraper();
  
  try {
    await scraper.init();
    const results = await scraper.extractAllPatients();
    
    console.log('\n🏆 CIGNA ROBUST SCRAPER VALIDÉ !');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await scraper.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { CignaRobustScraper };