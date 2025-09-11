const { chromium } = require('playwright');
const fs = require('fs');

async function useChromeSession() {
  console.log('🔗 CONNEXION À TON CHROME EXISTANT');
  console.log('📋 Va utiliser ta session Cigna déjà ouverte');
  
  try {
    // Connecter à ton Chrome (port 9222)
    console.log('🔍 Tentative connexion Chrome debugging...');
    
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    
    if (contexts.length === 0) {
      console.log('❌ Aucun contexte Chrome trouvé');
      console.log('💡 Lance Chrome avec: chrome --remote-debugging-port=9222');
      return;
    }
    
    const context = contexts[0];
    const pages = context.pages();
    
    // Chercher page Cigna
    let cignaPage = null;
    for (const page of pages) {
      const url = page.url();
      if (url.includes('cignaforhcp.cigna.com')) {
        cignaPage = page;
        break;
      }
    }
    
    if (!cignaPage) {
      console.log('❌ Aucune page Cigna ouverte dans Chrome');
      console.log('👉 Ouvre https://cignaforhcp.cigna.com/app/dashboard');
      return;
    }
    
    console.log('✅ Page Cigna trouvée:', cignaPage.url());
    
    // Test Dashboard Patients
    console.log('\n📋 Test Dashboard Patients...');
    
    const response = await cignaPage.request.post(
      'https://p-chcp.digitaledge.cigna.com/apollo-graphql',
      {
        data: {
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
      }
    );
    
    const data = await response.json();
    const allPatients = [
      ...(data.data?.recentPatients || []),
      ...(data.data?.flaggedPatients || [])
    ];
    
    console.log(`✅ ${allPatients.length} patients trouvés !`);
    
    // Test avec Ellie Williams
    const ellie = allPatients.find(p => p.firstName === 'ELLIE' && p.lastName === 'WILLIAMS');
    
    if (ellie) {
      console.log(`\n🔍 Test extraction ELLIE WILLIAMS (${ellie.patientId})...`);
      
      // Test Claims Search pour Ellie
      const searchResponse = await cignaPage.request.post(
        'https://p-chcp.digitaledge.cigna.com/claims/dental/v2/search?consumerCode=1000',
        {
          data: {
            "type": "patient",
            "memberId": ellie.patientId,
            "patientSearchType": "id_dob",
            "memberDateOfBirth": "11/14/2017" // Format US
          }
        }
      );
      
      const searchData = await searchResponse.json();
      
      if (searchData.results?.length > 0) {
        console.log(`✅ ${searchData.results.length} claims trouvés pour Ellie !`);
        
        // Test détails du premier claim
        const firstClaim = searchData.results[0];
        console.log(`📄 Test détails claim ${firstClaim.claimReferenceNumber}...`);
        
        const detailResponse = await cignaPage.request.post(
          'https://p-chcp.digitaledge.cigna.com/apollo-graphql',
          {
            data: {
              "operationName": "ClaimDetailNew",
              "variables": {
                "input": {
                  "claimCompositeKey": firstClaim.claimCompositeKey,
                  "claimReferenceNumber": firstClaim.claimReferenceNumber,
                  "compositeClaimId": firstClaim.compositeClaimId,
                  "tinNumbers": firstClaim.tinNumbers?.[0] || ""
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
                      __typename
                    }
                    claimInfoObject {
                      claimReferenceNumber
                      claimTotChargeAmount
                      claimTotPaidAmount
                      serviceProvider
                      serviceLineInfoArray {
                        cdtCode
                        amountCharged
                        svcLinePaidAmount
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
        
        const detailData = await detailResponse.json();
        const claimDetail = detailData.data?.claimByCompositeKey?.detail;
        
        if (claimDetail) {
          const member = claimDetail.memberObject;
          const claimInfo = claimDetail.claimInfoObject;
          
          console.log('\n🎉 ELLIE WILLIAMS EXTRACTION RÉUSSIE !');
          console.log(`👤 ${member.memberFirstName} ${member.memberLastName} (${member.memberId})`);
          console.log(`📄 Claim: ${claimInfo.claimReferenceNumber}`);
          console.log(`💰 ${claimInfo.claimTotChargeAmount} → ${claimInfo.claimTotPaidAmount}`);
          console.log(`🏥 Provider: ${claimInfo.serviceProvider}`);
          console.log(`🦷 Procedures: ${claimInfo.serviceLineInfoArray?.length || 0}`);
          
          // Sauvegarder
          const result = {
            patient: member,
            claim: firstClaim,
            details: claimDetail,
            timestamp: Date.now(),
            method: 'chrome-session-reuse',
            success: true
          };
          
          fs.writeFileSync(`data/cigna-ELLIE-SUCCESS-${Date.now()}.json`, JSON.stringify(result, null, 2));
          
          console.log('\n🏆 CIGNA WORKFLOW 100% VALIDÉ !');
          console.log('✨ Extraction Ellie Williams réussie avec session Chrome existante');
          
        } else {
          console.log('❌ Pas de détails claim récupérés');
        }
        
      } else {
        console.log('⚠️ Aucun claim trouvé pour Ellie Williams');
        console.log('📋 Réponse:', JSON.stringify(searchData, null, 2));
      }
      
    } else {
      console.log('❌ Ellie Williams non trouvée dans la liste patients');
      console.log('👥 Patients disponibles:');
      allPatients.slice(0, 5).forEach(p => console.log(`   - ${p.firstName} ${p.lastName}`));
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Chrome debugging non activé');
      console.log('👉 Ferme ton Chrome et relance avec:');
      console.log('   chrome --remote-debugging-port=9222');
      console.log('👉 Puis rouvre https://cignaforhcp.cigna.com/app/dashboard');
    }
  }
}

if (require.main === module) {
  useChromeSession();
}