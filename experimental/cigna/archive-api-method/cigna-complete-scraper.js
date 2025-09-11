const axios = require('axios');
const fs = require('fs');
const path = require('path');

class CignaCompleteScraper {
  constructor(bearerToken) {
    this.bearerToken = bearerToken;
    this.headers = {
      'authorization': `Bearer ${bearerToken}`,
      'content-type': 'application/json',
      'accept': 'application/json, text/plain, */*',
      'origin': 'https://cignaforhcp.cigna.com',
      'referer': 'https://cignaforhcp.cigna.com/',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
    };
    this.results = {
      patients: [],
      summary: {
        totalPatients: 0,
        totalClaims: 0,
        totalProcedures: 0,
        totalCharged: 0,
        totalPaid: 0,
        errors: []
      }
    };
  }

  async getAllPatients() {
    console.log('📋 ÉTAPE 1: Récupération de TOUS les patients...');
    
    try {
      const response = await axios.post(
        'https://p-chcp.digitaledge.cigna.com/apollo-graphql',
        {
          "operationName": "DashboardPatients",
          "variables": {},
          "query": `query DashboardPatients {
            recentPatients {
              ami
              asOfDate
              coverage {
                account
                clientName
                compositeKey
                coverageFrom
                coverageStatus
                coverageTo
                coverageType
                isEffectivelyTermed
                isInactive
                showLink
                __typename
              }
              dob
              firstName
              lastName
              identifier
              patientId
              __typename
            }
            flaggedPatients {
              ami
              asOfDate
              coverage {
                account
                clientName
                compositeKey
                coverageFrom
                coverageStatus
                coverageTo
                coverageType
                isEffectivelyTermed
                isInactive
                showLink
                __typename
              }
              dateFlagged
              dob
              firstName
              lastName
              patientId
              __typename
            }
          }`
        },
        { headers: this.headers }
      );

      const data = response.data?.data;
      
      if (data) {
        const allPatients = [
          ...(data.recentPatients || []),
          ...(data.flaggedPatients || [])
        ];
        
        console.log(`✅ ${allPatients.length} patients découverts`);
        console.log(`   📋 Recent: ${data.recentPatients?.length || 0}`);
        console.log(`   🚩 Flagged: ${data.flaggedPatients?.length || 0}`);
        
        return allPatients;
      } else {
        throw new Error('Pas de données patients dans la réponse');
      }
      
    } catch (error) {
      console.error('❌ Erreur récupération patients:', error.message);
      throw error;
    }
  }

  async getPatientClaims(memberId, dateOfBirth) {
    console.log(`🔍 Recherche claims pour ${memberId}...`);
    
    try {
      // Essayer différents formats de date
      const dateFormats = [
        dateOfBirth.replace(/-/g, '/'), // 2017-11-14 → 2017/11/14
        dateOfBirth, // 2017-11-14
        dateOfBirth.split('-').reverse().join('/'), // 2017-11-14 → 14/11/2017
        dateOfBirth.split('-').slice(1).concat(dateOfBirth.split('-')[0]).join('/') // 2017-11-14 → 11/14/2017
      ];
      
      for (const dateFormat of dateFormats) {
        try {
          const response = await axios.post(
            'https://p-chcp.digitaledge.cigna.com/claims/dental/v2/search?consumerCode=1000',
            {
              "type": "patient",
              "memberId": memberId,
              "patientSearchType": "id_dob",
              "memberDateOfBirth": dateFormat
            },
            { headers: this.headers }
          );
          
          if (response.data?.results && response.data.results.length > 0) {
            console.log(`   ✅ ${response.data.results.length} claims trouvés (format: ${dateFormat})`);
            return response.data.results;
          }
          
        } catch (error) {
          // Continuer avec le format suivant
          if (error.response?.status !== 500) {
            throw error; // Si ce n'est pas une erreur 500, arrêter
          }
        }
      }
      
      console.log(`   ⚠️ Aucun claim trouvé pour ${memberId}`);
      return [];
      
    } catch (error) {
      console.log(`   ❌ Erreur claims pour ${memberId}: ${error.message}`);
      return [];
    }
  }

  async getClaimDetails(claim) {
    try {
      const response = await axios.post(
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
                  networkPPOIndicator
                  patientResponsibility
                  serviceLineInfoArray {
                    cdtCode
                    procedureCode
                    amountCharged
                    svcLinePaidAmount
                    memberResponsibility
                    remarkCode
                    __typename
                  }
                  serviceLineTotalsObject {
                    amountChargedTotal
                    allowedAmountTotal
                    planCoinsurancePaidTotal
                    memberCoInsuTotal
                    __typename
                  }
                  explanationOfRemarkCodes {
                    remarkCode
                    remarkCodeDesc
                    __typename
                  }
                  payeeInfo {
                    payeeName
                    payeeAddress
                    checkAmount
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
        },
        { headers: this.headers }
      );

      return response.data?.data?.claimByCompositeKey?.detail;
      
    } catch (error) {
      console.log(`     ❌ Erreur détails claim ${claim.claimReferenceNumber}: ${error.message}`);
      return null;
    }
  }

  async extractPatientData(patient) {
    const patientName = `${patient.firstName} ${patient.lastName}`;
    console.log(`\n🔄 EXTRACTION ${patientName} (${patient.patientId})...`);
    
    const startTime = Date.now();
    
    try {
      // 1. Récupérer les claims du patient
      const claims = await this.getPatientClaims(patient.patientId, patient.dob);
      
      if (claims.length === 0) {
        console.log(`   ⚠️ Pas de claims pour ${patientName}`);
        return {
          patient: {
            name: patientName,
            memberId: patient.patientId,
            dateOfBirth: patient.dob,
            identifier: patient.identifier
          },
          claims: [],
          claimDetails: [],
          summary: {
            totalClaims: 0,
            totalProcedures: 0,
            totalCharged: 0,
            totalPaid: 0
          },
          extractionTime: Date.now() - startTime,
          timestamp: Date.now(),
          status: 'no-claims'
        };
      }
      
      // 2. Récupérer les détails de chaque claim
      const claimsWithDetails = [];
      
      for (const claim of claims) {
        console.log(`     📄 Détails claim ${claim.claimReferenceNumber}...`);
        
        const details = await this.getClaimDetails(claim);
        
        if (details) {
          claimsWithDetails.push({
            claim: claim,
            details: details
          });
          console.log(`     ✅ Claim ${claim.claimReferenceNumber} OK`);
        } else {
          claimsWithDetails.push({
            claim: claim,
            details: null,
            error: 'Failed to get details'
          });
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // 3. Calculer les totaux
      let totalProcedures = 0;
      let totalCharged = 0;
      let totalPaid = 0;
      
      claimsWithDetails.forEach(item => {
        if (item.details?.claimInfoObject) {
          const claimInfo = item.details.claimInfoObject;
          totalProcedures += claimInfo.serviceLineInfoArray?.length || 0;
          totalCharged += this.parseAmount(claimInfo.claimTotChargeAmount);
          totalPaid += this.parseAmount(claimInfo.claimTotPaidAmount);
        }
      });
      
      const extractionTime = Date.now() - startTime;
      
      const patientData = {
        patient: {
          name: patientName,
          firstName: patient.firstName,
          lastName: patient.lastName,
          memberId: patient.patientId,
          dateOfBirth: patient.dob,
          identifier: patient.identifier,
          coverage: patient.coverage
        },
        claims: claims,
        claimDetails: claimsWithDetails,
        summary: {
          totalClaims: claims.length,
          totalProcedures: totalProcedures,
          totalCharged: totalCharged,
          totalPaid: totalPaid,
          extractionTime: extractionTime
        },
        extractionTime: extractionTime,
        timestamp: Date.now(),
        method: 'cigna-complete-api',
        status: 'success'
      };
      
      console.log(`   ✅ ${patientName}: ${claims.length} claims, ${totalProcedures} procedures, $${totalCharged} → $${totalPaid} (${extractionTime}ms)`);
      
      return patientData;
      
    } catch (error) {
      console.error(`   ❌ Erreur ${patientName}: ${error.message}`);
      
      return {
        patient: {
          name: patientName,
          memberId: patient.patientId,
          dateOfBirth: patient.dob
        },
        error: error.message,
        timestamp: Date.now(),
        status: 'error'
      };
    }
  }

  async extractAllPatients() {
    const overallStartTime = Date.now();
    console.log('🚀 CIGNA COMPLETE EXTRACTION - TOUS LES PATIENTS');
    
    try {
      // 1. Récupérer tous les patients
      const allPatients = await this.getAllPatients();
      
      console.log(`\n🔄 Extraction de ${allPatients.length} patients...`);
      
      // 2. Extraire chaque patient
      for (let i = 0; i < allPatients.length; i++) {
        const patient = allPatients[i];
        console.log(`\n[${i+1}/${allPatients.length}] Processing...`);
        
        const patientData = await this.extractPatientData(patient);
        this.results.patients.push(patientData);
        
        // Mettre à jour les totaux
        if (patientData.status === 'success') {
          this.results.summary.totalClaims += patientData.summary.totalClaims;
          this.results.summary.totalProcedures += patientData.summary.totalProcedures;
          this.results.summary.totalCharged += patientData.summary.totalCharged;
          this.results.summary.totalPaid += patientData.summary.totalPaid;
        } else {
          this.results.summary.errors.push(patientData.error || 'Unknown error');
        }
        
        // Rate limiting entre patients
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // 3. Finaliser les résultats
      this.results.summary.totalPatients = allPatients.length;
      this.results.summary.successfulExtractions = this.results.patients.filter(p => p.status === 'success').length;
      this.results.summary.extractionTime = Date.now() - overallStartTime;
      this.results.timestamp = Date.now();
      
      console.log('\n🎉 EXTRACTION COMPLÈTE TERMINÉE !');
      console.log(`📊 RÉSULTATS GLOBAUX:`);
      console.log(`   👥 Patients: ${this.results.summary.totalPatients}`);
      console.log(`   ✅ Réussis: ${this.results.summary.successfulExtractions}`);
      console.log(`   📄 Claims: ${this.results.summary.totalClaims}`);
      console.log(`   🦷 Procedures: ${this.results.summary.totalProcedures}`);
      console.log(`   💰 Total Charged: $${this.results.summary.totalCharged.toFixed(2)}`);
      console.log(`   💵 Total Paid: $${this.results.summary.totalPaid.toFixed(2)}`);
      console.log(`   ⏱️ Temps total: ${(this.results.summary.extractionTime / 1000).toFixed(1)}s`);
      console.log(`   ❌ Erreurs: ${this.results.summary.errors.length}`);
      
      return this.results;
      
    } catch (error) {
      console.error('❌ Erreur extraction globale:', error.message);
      throw error;
    }
  }

  async saveResults(customFilename = null) {
    const dataDir = path.join(__dirname, 'data');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = customFilename || `cigna-ALL-PATIENTS-${timestamp}.json`;
    const filepath = path.join(dataDir, filename);
    
    await fs.promises.writeFile(
      filepath,
      JSON.stringify(this.results, null, 2),
      'utf8'
    );
    
    console.log(`💾 Tous les résultats sauvés: ${filepath}`);
    
    // Sauvegarder aussi un résumé CSV
    const csvFilename = filename.replace('.json', '-summary.csv');
    const csvPath = path.join(dataDir, csvFilename);
    
    const csvContent = [
      'Patient,MemberID,DOB,Claims,Procedures,Charged,Paid,Status',
      ...this.results.patients.map(p => 
        `"${p.patient.name}","${p.patient.memberId}","${p.patient.dateOfBirth}",${p.summary?.totalClaims || 0},${p.summary?.totalProcedures || 0},"$${(p.summary?.totalCharged || 0).toFixed(2)}","$${(p.summary?.totalPaid || 0).toFixed(2)}","${p.status}"`
      )
    ].join('\n');
    
    await fs.promises.writeFile(csvPath, csvContent, 'utf8');
    console.log(`📊 Résumé CSV sauvé: ${csvPath}`);
    
    return { jsonFile: filepath, csvFile: csvPath };
  }

  parseAmount(amountStr) {
    if (!amountStr) return 0;
    return parseFloat(amountStr.replace(/[$,]/g, '')) || 0;
  }
}

// Fonction principale
async function runCompleteExtraction() {
  console.log('🏆 CIGNA COMPLETE SCRAPER - EXTRACTION TOTALE');
  console.log('🎯 Va extraire TOUS les patients automatiquement');
  
  // Token actuel (à mettre à jour si expiré)
  const currentToken = "eyJqa3UiOiJodHRwczovL2NpZ25hZm9yaGNwLmNpZ25hLmNvbS9tZ2Evc3BzL29hdXRoL29hdXRoMjAvandrcy9jaGNwX3NwYV9kZWYiLCJraWQiOiJHeURtNHR0Wk1ZUEs0bGRRTUEtU0VlWnpDU0l2OVd4VE5ieHFzY1pQX0JVIiwiYWxnIjoiUlMyNTYifQ.eyJpYXQiOjE3NTcyODQwMjUsInN1YiI6ImNuPXBheW9yYWNjZXNzMSxvdT1wcm92aWRlcnBlb3BsZSxvPWNpZ25hLmNvbSIsImF1ZCI6ImNoY3Bfc3BhX2NsaWVudCIsImh0dHBzOi8vY2lnbmFmb3JoY3AuY2lnbmEuY29tIjp7InNlc3Npb25JZCI6ImJhMDZmMjQyLThjMzYtMTFmMC04OTY1LTAwNTA1NjhmN2U3ZiIsImNuIjoicGF5b3JhY2Nlc3MxIiwiZW5jcnlwdGVkQ24iOiJpcDZvdUM0V3pkQ1IxWFNsSk9Lb2RsUzdHQjlqblg5WkNEeEh4ek1qS3hSL25XbWpPNFBMUXhGUkU1T1FPeHFyK1hKZS9oTlNMSVVjTlRUbmFQZnZQdm5BMzdyNUJIWFRBbUR4dTZiSUlXVG5UT3JiYStFZi8yRFU2YTJBVHkzbi9RZkFyM1ZBSE1ORS9HM0FmYXNibEtWMkdXN1FOem1IUEVyS2ZzUlF0SDQ9IiwibG9iIjoiREVOIiwiY2hjcElkIjoiMjM0Nzc4OSIsImVudGl0bGVtZW50cyI6WyJDbGFpbXNTZWFyY2gtUmVjb25zaWRlcmF0aW9uIiwiUmVtaXR0YW5jZVJlcG9ydHMiLCJDbGFpbXNTZWFyY2giLCJQYXRpZW50U2VhcmNoIiwiQmFzaWNJbmZvcm1hdGlvbiJdLCJhdXRoTGV2ZWwiOiI0In0sImp0aSI6ImJhMDZmMjQyLThjMzYtMTFmMC04OTY1LTAwNTA1NjhmN2U3ZiIsImNpZ25hLmxvYiI6IkRFTiIsImNpZ25hLmVudGl0bGVtZW50cyI6IkNsYWltc1NlYXJjaC1SZWNvbnNpZGVyYXRpb24gUmVtaXR0YW5jZVJlcG9ydHMgQ2xhaW1zU2VhcmNoIFBhdGllbnRTZWFyY2ggQmFzaWNJbmZvcm1hdGlvbiIsImNpZ25hLmNoY3BJZCI6IjIzNDc3ODkiLCJjaWduYS5hdXRoTGV2ZWwiOiI0IiwiY2lnbmEuY24iOiJwYXlvcmFjY2VzczEiLCJjaWduYS5lbmNyeXB0ZWRDbiI6ImlwNm91QzRXemRDUjFYU2xKT0tvZGxTN0dCOWpuWDlaQ0R4SHh6TWpLeFIvbldtak80UExReEZSRTVPUU94cXIrWEplL2hOU0xJVWNOVFRuYVBmdlB2bkEzN3I1QkhYVEFtRHh1NmJJSVdUblRPcmJhK0VmLzJEVTZhMkFUeTNuL1FmQXIzVkFITU5FL0czQWZhc2JsS1YyR1c3UU56bUhQRXJLZnNSUXRIND0iLCJlbnQudmVyIjoxLCJlbnQuYXBwTmFtZSI6ImNoY3Atd2ViIiwiZW50LnRva2VuVHlwZSI6InVzZXItZXh0IiwiZW50LmVudiI6InByb2QiLCJlbnQuZG9tYWluIjoiY2lnbmEtcHJvdmlkZXIiLCJzY29wZSI6Im9wZW5pZCIsImNsaWVudCI6ImNoY3Bfc3BhX2NsaWVudCIsImlzcyI6Imh0dHBzOi8vY2lnbmFmb3JoY3AuY2lnbmEuY29tIiwiZXhwIjoxNzU3Mjg3NjI1fQ.uyMnBy0b-Xal6GhohzO5yFvmAU80SexuBHae_k-6dpyIj2hs9WP5wXsWJOvpepsSoaOIqgpZr8ba3IhBiMtFJF-tqJEkHpKmuVbyIwBbST1Ux5ndubAsmUVmNp77oYU7no48YCbfoM7mNza9tSwQD36nkIWXaikfBza4TeuFILehzn4ThhMPxp659I4nZrMOHdfMsfdvSK7JICe6NKQEzbTvBBRx46OzjstdWAA60c9_UGsB240JlTfMGjzOgSEzbCjnT6W7-yAM-mGEMFIuilFc0E38ySm9iOYk_N9lClaEkJoDG9PvES_X44SCkYxQeKno78mUp7pz7e6CVXsueg";
  
  const scraper = new CignaCompleteScraper(currentToken);
  
  try {
    // Extraction complète
    const results = await scraper.extractAllPatients();
    
    // Sauvegarder
    const files = await scraper.saveResults();
    
    console.log('\n🏆 CIGNA COMPLETE SCRAPER TERMINÉ !');
    console.log(`📄 JSON complet: ${files.jsonFile}`);
    console.log(`📊 Résumé CSV: ${files.csvFile}`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Erreur principale:', error.message);
    
    if (error.message.includes('401') || error.message.includes('unauthorized')) {
      console.log('\n🔑 TOKEN EXPIRÉ !');
      console.log('👉 Récupère un nouveau Bearer token depuis Chrome DevTools');
      console.log('👉 Remplace la variable currentToken dans le script');
    }
  }
}

// Test avec 3 premiers patients seulement
async function runTestExtraction() {
  console.log('🧪 TEST CIGNA - 3 premiers patients seulement');
  
  const currentToken = "eyJqa3UiOiJodHRwczovL2NpZ25hZm9yaGNwLmNpZ25hLmNvbS9tZ2Evc3BzL29hdXRoL29hdXRoMjAvandrcy9jaGNwX3NwYV9kZWYiLCJraWQiOiJHeURtNHR0Wk1ZUGs0bGRRTUEtU0VlWnpDU0l2OVd4VE5ieHFzY1pQX0JVIiwiYWxnIjoiUlMyNTYifQ.eyJpYXQiOjE3NTcyODU0NjQsInN1YiI6ImNuPXBheW9yYWNjZXNzMSxvdT1wcm92aWRlcnBlb3BsZSxvPWNpZ25hLmNvbSIsImF1ZCI6ImNoY3Bfc3BhX2NsaWVudCIsImh0dHBzOi8vY2lnbmFmb3JoY3AuY2lnbmEuY29tIjp7InNlc3Npb25JZCI6ImJhMDZmMjQyLThjMzYtMTFmMC04OTY1LTAwNTA1NjhmN2U3ZiIsImNuIjoicGF5b3JhY2Nlc3MxIiwiZW5jcnlwdGVkQ24iOiJpcDZvdUM0V3pkQ1IxWFNsSk9Kb2RsUzdHQjlqblg5WkNEeEh4ek1qS3hSL25XbWpPNFBMUXhGUkU1T1FPeHFyK1hKZS9oTlNMSVVjTlRUbmFQZnZQdm5BMzdyNUJIWFRBbUR4dTZiSUlXVG5UT3JiYStFZi8yRFU2YTJBVHkzbi9RZkFyM1ZBSE1ORS9HM0FmYXNibEtWMkdXN1FOem1IUEVyS2ZzUlF0SDQ9IiwibG9iIjoiREVOIiwiY2hjcElkIjoiMjM0Nzc4OSIsImVudGl0bGVtZW50cyI6WyJDbGFpbXNTZWFyY2gtUmVjb25zaWRlcmF0aW9uIiwiUmVtaXR0YW5jZVJlcG9ydHMiLCJDbGFpbXNTZWFyY2giLCJQYXRpZW50U2VhcmNoIiwiQmFzaWNJbmZvcm1hdGlvbiJdLCJhdXRoTGV2ZWwiOiI0In0sImp0aSI6ImJhMDZmMjQyLThjMzYtMTFmMC04OTY1LTAwNTA1NjhmN2U3ZiIsImNpZ25hLmxvYiI6IkRFTiIsImNpZ25hLmVudGl0bGVtZW50cyI6IkNsYWltc1NlYXJjaC1SZWNvbnNpZGVyYXRpb24gUmVtaXR0YW5jZVJlcG9ydHMgQ2xhaW1zU2VhcmNoIFBhdGllbnRTZWFyY2ggQmFzaWNJbmZvcm1hdGlvbiIsImNpZ25hLmNoY3BJZCI6IjIzNDc3ODkiLCJjaWduYS5hdXRoTGV2ZWwiOiI0IiwiY2lnbmEuY24iOiJwYXlvcmFjY2VzczEiLCJjaWduYS5lbmNyeXB0ZWRDbiI6ImlwNm91QzRXemRDUjFYU2xKT0tvZGxTN0dCOWpuWDlaQ0R4SHh6TWpLeFIvbldtak80UExReEZSRTVPUU94cXIrWEplL2hOU0xJVWNOVFRuYVBmdlB2bkEzN3I1QkhYVEFtRHh1NmJJSVdUblRPcmJhK0VmLzJEVTZhMkFUeTNuL1FmQXIzVkFITU5FL0czQWZhc2JsS1YyR1c3UU56bUhQRXJLZnNSUXRIND0iLCJlbnQudmVyIjoxLCJlbnQuYXBwTmFtZSI6ImNoY3Atd2ViIiwiZW50LnRva2VuVHlwZSI6InVzZXItZXh0IiwiZW50LmVudiI6InByb2QiLCJlbnQuZG9tYWluIjoiY2lnbmEtcHJvdmlkZXIiLCJzY29wZSI6Im9wZW5pZCIsImNsaWVudCI6ImNoY3Bfc3BhX2NsaWVudCIsImlzcyI6Imh0dHBzOi8vY2lnbmFmb3JoY3AuY2lnbmEuY29tIiwiZXhwIjoxNzU3Mjg5MDYzfQ.MAuYTzYu7FhrS-6UXVkTdwJgdnvLTObh7LlQS4YeSykJ53ppUNudpxzCW8A0WBSHG5awamaAwosEIpv17A4ySC2nurZj1No2EnTKDA0lJeTBCzZ8QrM6azFVMO6HDUiybu8XR5LGnzcq3SlowkWvUCAnAXxBsHpP39S3GJHBfQc3ww34rIDSqLtiK51q9MsiPRVyp25WZSV2_tsns-J4mA9zteKv-D8ymwPW3jLo-KSygfk656OIzFrm1paDlCXqKiphJFWaw8Jd506Ht5QMh7S6era91uS_JDB9EeREZxnuLeUatzQdlYY3nv_XbQ_BkIg68ASE-7RfuHHvvMGyOQ";

  const scraper = new CignaCompleteScraper(currentToken);
  
  try {
    const allPatients = await scraper.getAllPatients();
    
    // Test avec 3 premiers patients seulement
    const testPatients = allPatients.slice(0, 3);
    
    console.log(`\n🧪 Test avec ${testPatients.length} patients:`);
    testPatients.forEach(p => console.log(`   - ${p.firstName} ${p.lastName} (${p.patientId})`));
    
    for (const patient of testPatients) {
      const patientData = await scraper.extractPatientData(patient);
      scraper.results.patients.push(patientData);
      
      if (patientData.status === 'success') {
        scraper.results.summary.totalClaims += patientData.summary.totalClaims;
        scraper.results.summary.totalProcedures += patientData.summary.totalProcedures;
        scraper.results.summary.totalCharged += patientData.summary.totalCharged;
        scraper.results.summary.totalPaid += patientData.summary.totalPaid;
      }
    }
    
    scraper.results.summary.totalPatients = testPatients.length;
    scraper.results.summary.successfulExtractions = scraper.results.patients.filter(p => p.status === 'success').length;
    
    await scraper.saveResults('cigna-TEST-3patients.json');
    
    console.log('\n🎉 TEST TERMINÉ !');
    
  } catch (error) {
    console.error('❌ Erreur test:', error.message);
  }
}

if (require.main === module) {
  // Choix: test avec 3 patients ou extraction complète
  const args = process.argv.slice(2);
  if (args.includes('--full')) {
    runCompleteExtraction();
  } else {
    runTestExtraction();
  }
}

module.exports = { CignaCompleteScraper, runCompleteExtraction, runTestExtraction };