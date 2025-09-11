const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class CignaScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.bearerToken = null;
    this.sessionId = null;
  }

  async init() {
    console.log('🚀 Initialisation Cigna Scraper...');
    
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 500
    });
    
    this.page = await this.browser.newPage();
    
    // Intercepter les requêtes pour capturer le Bearer token
    await this.page.route('**/*', (route, request) => {
      const authHeader = request.headers()['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ') && !this.bearerToken) {
        this.bearerToken = authHeader.replace('Bearer ', '');
        console.log('🔑 Bearer token capturé !');
      }
      route.continue();
    });
  }

  async login(username, password) {
    console.log('🔐 Login automatique Cigna...');
    
    try {
      // Aller à la page de login
      await this.page.goto('https://cignaforhcp.cigna.com/app/login');
      await this.page.waitForLoadState('networkidle');
      
      // Remplir le formulaire de login
      await this.page.fill('input[name="username"]', username);
      await this.page.fill('input[name="password"]', password);
      
      // Cliquer sur login
      await this.page.click('button[type="submit"], input[type="submit"]');
      
      // Attendre la redirection et que le token soit capturé
      await this.page.waitForURL('**/app/**', { timeout: 30000 });
      await this.page.waitForTimeout(2000);
      
      if (!this.bearerToken) {
        // Si pas de token capturé automatiquement, aller sur claims pour déclencher une API call
        await this.page.goto('https://cignaforhcp.cigna.com/app/claim/search');
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(3000);
      }
      
      if (this.bearerToken) {
        console.log('✅ Login réussi + Bearer token obtenu');
        return true;
      } else {
        console.log('❌ Login réussi mais token non capturé');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Erreur login:', error.message);
      return false;
    }
  }

  async searchPatientClaims(memberId, dateOfBirth) {
    console.log(`🔍 Recherche claims pour patient ${memberId}...`);
    
    if (!this.bearerToken) {
      throw new Error('Pas de Bearer token disponible');
    }
    
    const response = await this.page.request.post(
      'https://p-chcp.digitaledge.cigna.com/claims/dental/v2/search',
      {
        headers: {
          'authorization': `Bearer ${this.bearerToken}`,
          'content-type': 'application/json',
          'accept': 'application/json, text/plain, */*',
          'origin': 'https://cignaforhcp.cigna.com',
          'referer': 'https://cignaforhcp.cigna.com/'
        },
        data: {
          "type": "patient",
          "memberId": memberId,
          "patientSearchType": "id_dob", 
          "memberDateOfBirth": dateOfBirth,
          "consumerCode": "1000"
        }
      }
    );
    
    const data = await response.json();
    console.log(`✅ ${data.results?.length || 0} claims trouvés`);
    
    return data.results || [];
  }

  async getClaimDetails(claimCompositeKey, claimReferenceNumber, compositeClaimId, tinNumbers) {
    console.log(`📋 Récupération détails claim ${claimReferenceNumber}...`);
    
    if (!this.bearerToken) {
      throw new Error('Pas de Bearer token disponible');
    }
    
    const response = await this.page.request.post(
      'https://p-chcp.digitaledge.cigna.com/apollo-graphql',
      {
        headers: {
          'authorization': `Bearer ${this.bearerToken}`,
          'content-type': 'application/json',
          'accept': 'application/json, text/plain, */*',
          'origin': 'https://cignaforhcp.cigna.com',
          'referer': 'https://cignaforhcp.cigna.com/'
        },
        data: {
          "operationName": "ClaimDetailNew",
          "variables": {
            "input": {
              "claimCompositeKey": claimCompositeKey,
              "claimReferenceNumber": claimReferenceNumber,
              "compositeClaimId": compositeClaimId,
              "tinNumbers": tinNumbers
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
                  memberIdentifier
                  hasBehavioral
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
                  claimProcessedDate
                  claimReceivedDate
                  networkPPOIndicator
                  patientResponsibility
                  additionalRemarks
                  remarkCodes {
                    remarkCode
                    desc
                    __typename
                  }
                  serviceLineInfoArray {
                    id
                    dateOfService
                    cdtCode
                    procedureCode
                    toothNumber
                    amountCharged
                    amountNotAllowed
                    deductible
                    coveredBalance
                    svcLineContractedAmount
                    svcLinePaidAmount
                    placeOfService
                    allowedAmount
                    memberCoInsurancePer
                    memberResponsibility
                    patientCoinsuranceResponsibility
                    copay
                    remarkCode
                    propRemarkDescription
                    __typename
                  }
                  serviceLineTotalsObject {
                    amountChargedTotal
                    allowedAmountTotal
                    amountNotCoveredTotal
                    deductibleTotal
                    coveredBalTotal
                    contractedAmountTotal
                    planCoinsurancePaidTotal
                    coPayTotal
                    memberCoInsuTotal
                    memberResponseTotal
                    __typename
                  }
                  explanationOfRemarkCodes {
                    remarkCode
                    remarkCodeDesc
                    additionalDesc
                    __typename
                  }
                  payeeInfo {
                    payeeName
                    payeeAddress
                    checkAmount
                    checkNumber
                    checkStatus
                    checkIssuedDate
                    checkClearedDate
                    paymentMethod
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
      }
    );
    
    const data = await response.json();
    console.log('✅ Détails claim récupérés');
    
    return data.data?.claimByCompositeKey?.detail;
  }

  async getReconsiderationHistory(claimReferenceNumber) {
    console.log(`📜 Récupération historique reconsideration ${claimReferenceNumber}...`);
    
    if (!this.bearerToken) {
      throw new Error('Pas de Bearer token disponible');
    }
    
    try {
      const response = await this.page.request.get(
        `https://p-chcp.digitaledge.cigna.com/reconsideration/dental/v1/history?asof=${Date.now()}&claimref=${claimReferenceNumber}`,
        {
          headers: {
            'authorization': `Bearer ${this.bearerToken}`,
            'accept': 'application/json, text/plain, */*',
            'origin': 'https://cignaforhcp.cigna.com',
            'referer': 'https://cignaforhcp.cigna.com/'
          }
        }
      );
      
      const data = await response.json();
      console.log('✅ Historique reconsideration récupéré');
      
      return data;
    } catch (error) {
      console.log('⚠️  Historique reconsideration non disponible');
      return [];
    }
  }

  async extractPatientData(memberId, dateOfBirth) {
    const startTime = Date.now();
    console.log(`\n🔄 EXTRACTION Patient ${memberId} (DOB: ${dateOfBirth})`);
    
    try {
      // 1. Search Claims
      const claims = await this.searchPatientClaims(memberId, dateOfBirth);
      
      if (claims.length === 0) {
        console.log('❌ Aucun claim trouvé pour ce patient');
        return null;
      }
      
      // 2. Get details pour chaque claim
      const claimsWithDetails = [];
      
      for (const claim of claims) {
        try {
          const details = await this.getClaimDetails(
            claim.claimCompositeKey,
            claim.claimReferenceNumber, 
            claim.compositeClaimId,
            claim.tinNumbers?.[0] || ""
          );
          
          // 3. Get reconsideration history
          const reconHistory = await this.getReconsiderationHistory(claim.claimReferenceNumber);
          
          claimsWithDetails.push({
            claim: claim,
            details: details,
            reconsiderationHistory: reconHistory
          });
          
          await this.page.waitForTimeout(1000); // Rate limiting
          
        } catch (error) {
          console.error(`❌ Erreur détails claim ${claim.claimReferenceNumber}:`, error.message);
          claimsWithDetails.push({
            claim: claim,
            details: null,
            error: error.message
          });
        }
      }
      
      // 4. Structure finale des données
      const extractionTime = Date.now() - startTime;
      
      const patientData = {
        patient: {
          memberId: memberId,
          dateOfBirth: dateOfBirth,
          name: claims[0]?.memberFirstName && claims[0]?.memberLastName 
            ? `${claims[0].memberFirstName} ${claims[0].memberLastName}` 
            : 'Unknown'
        },
        claims: claims,
        claimDetails: claimsWithDetails,
        summary: {
          totalClaims: claims.length,
          totalCharged: claims.reduce((sum, c) => sum + parseFloat((c.chargeAmount || '0').replace(/[$,]/g, '')), 0),
          extractionTime: extractionTime
        },
        extractionTime: extractionTime,
        timestamp: Date.now(),
        method: 'api'
      };
      
      console.log(`✅ Extraction terminée en ${extractionTime}ms`);
      console.log(`📊 ${claims.length} claims, $${patientData.summary.totalCharged.toFixed(2)} total`);
      
      return patientData;
      
    } catch (error) {
      console.error('❌ Erreur extraction patient:', error.message);
      throw error;
    }
  }

  async saveResults(patientData, filename) {
    const filepath = path.join(__dirname, 'data', filename);
    
    await fs.promises.writeFile(
      filepath,
      JSON.stringify(patientData, null, 2),
      'utf8'
    );
    
    console.log(`💾 Données sauvées: ${filepath}`);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔚 Navigateur fermé');
    }
  }
}

// Fonction principale pour test
async function main() {
  const scraper = new CignaScraper();
  
  try {
    await scraper.init();
    
    // LOGIN (remplace avec tes vraies credentials)
    const loginSuccess = await scraper.login('YOUR_USERNAME', 'YOUR_PASSWORD');
    
    if (!loginSuccess) {
      throw new Error('Échec du login');
    }
    
    // EXTRACTION PATIENT
    const patientData = await scraper.extractPatientData('U47997411', '2018-04-11');
    
    if (patientData) {
      const filename = `cigna-${patientData.patient.name.replace(/\s+/g, '-')}-${patientData.timestamp}.json`;
      await scraper.saveResults(patientData, filename);
    }
    
  } catch (error) {
    console.error('❌ Erreur principale:', error.message);
  } finally {
    await scraper.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { CignaScraper };