const axios = require('axios');
const fs = require('fs');
const path = require('path');

class CignaExtractor {
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
  }

  async extractPatientByClaimId(claimReferenceNumber, claimCompositeKey, compositeClaimId, tinNumbers) {
    const startTime = Date.now();
    console.log(`\n🔄 EXTRACTION Cigna Claim ${claimReferenceNumber}...`);
    
    try {
      // GraphQL pour récupérer TOUTES les données
      console.log('📋 Récupération données complètes via GraphQL...');
      
      const response = await axios.post(
        'https://p-chcp.digitaledge.cigna.com/apollo-graphql',
        {
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
                correspondenceHistory {
                  claimId
                  corresType
                  documentLink
                  generatedOn
                  subject
                  docId
                  __typename
                }
                remittanceSummaryData {
                  remittanceData {
                    documentType
                    remittanceTrackingNumber
                    paymentDate
                    depositAmount
                    depositAmountStr
                    __typename
                  }
                  paymentInfo {
                    payeeName
                    payeeAddress
                    checkAmount
                    checkNumber
                    checkStatus
                    checkIssuedDate
                    paymentMethod
                    __typename
                  }
                  __typename
                }
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
                  renderingProviderId
                  claimStatusDesc
                  claimProcessedDate
                  claimReceivedDate
                  networkPPOIndicator
                  patientResponsibility
                  additionalRemarks
                  footNoteMessages
                  groupNumber
                  serviceLineInfoArray {
                    id
                    dateOfService
                    cdtCode
                    procedureCode
                    toothNumber
                    amountCharged
                    svcLineContractedAmount
                    svcLinePaidAmount
                    placeOfService
                    allowedAmount
                    serviceLineApcCode
                    amountNotCovered
                    deductible
                    coveredBalance
                    planCoInsurancePer
                    memberCoInsurancePer
                    memberCoInsu
                    memberResponsibility
                    patientCoinsuranceResponsibility
                    copay
                    remarkCode
                    propRemarkDescription
                    hraPayment
                    hsaPayment
                    fsaPayment
                    haPayment
                    amountNotAllowed
                    __typename
                  }
                  serviceLineTotalsObject {
                    amountChargedTotal
                    allowedAmountTotal
                    amountNotCoveredTotal
                    deductibleTotal
                    coveredBalTotal
                    contractedAmountTotal
                    coordinationBenefitTotal
                    planCoinsurancePaidTotal
                    coPayTotal
                    memberCoInsuTotal
                    memberResponseTotal
                    paidFromHATotal
                    paidFromHSATotal
                    paidFromHRATotal
                    paidFromFSATotal
                    __typename
                  }
                  explanationOfRemarkCodes {
                    remarkCode
                    remarkCodeDesc
                    additionalDesc
                    __typename
                  }
                  payeeInfo {
                    eftExists
                    chkExists
                    payeeName
                    payeeAddress
                    checkAmount
                    checkNumber
                    checkStatus
                    checkIssuedDate
                    checkClearedDate
                    paymentMethod
                    sourceDataKey
                    remittanceNumber
                    __typename
                  }
                  __typename
                }
                claimCompositeKey
                isFlagged
                __typename
              }
              __typename
            }
          }`
        },
        { headers: this.headers }
      );
      
      const claimDetail = response.data?.data?.claimByCompositeKey?.detail;
      
      if (!claimDetail) {
        throw new Error('Pas de données claim retournées');
      }
      
      const member = claimDetail.memberObject;
      const claimInfo = claimDetail.claimInfoObject;
      
      // Récupérer aussi l'historique reconsideration
      let reconsiderationHistory = [];
      try {
        const reconResponse = await axios.get(
          `https://p-chcp.digitaledge.cigna.com/reconsideration/dental/v1/history?asof=${Date.now()}&claimref=${claimReferenceNumber}`,
          { headers: this.headers }
        );
        reconsiderationHistory = reconResponse.data || [];
      } catch (error) {
        console.log('⚠️  Reconsideration history non accessible');
      }
      
      // Structure finale
      const extractionTime = Date.now() - startTime;
      
      const patientData = {
        patient: {
          memberId: member.memberId,
          name: `${member.memberFirstName} ${member.memberLastName}`,
          firstName: member.memberFirstName,
          lastName: member.memberLastName,
          dateOfBirth: member.memberDateOfBirth,
          relationShipCode: member.relationShipCode,
          memberIdentifier: member.memberIdentifier,
          hasBehavioral: member.hasBehavioral,
          patientId: member.patientId
        },
        claims: [{
          claimReferenceNumber: claimReferenceNumber,
          claimCompositeKey: claimCompositeKey,
          compositeClaimId: compositeClaimId,
          tinNumbers: [tinNumbers],
          chargeAmount: claimInfo.claimTotChargeAmount,
          paidAmount: claimInfo.claimTotPaidAmount,
          dateOfService: claimInfo.claimDateOfService,
          status: claimInfo.claimStatusDesc,
          provider: claimInfo.serviceProvider
        }],
        claimDetails: claimDetail,
        correspondenceHistory: claimDetail.correspondenceHistory || [],
        reconsiderationHistory: reconsiderationHistory,
        procedures: claimInfo.serviceLineInfoArray || [],
        totals: claimInfo.serviceLineTotalsObject || {},
        remarkCodes: claimInfo.explanationOfRemarkCodes || [],
        paymentInfo: claimInfo.payeeInfo || [],
        remittanceData: claimDetail.remittanceSummaryData || {},
        summary: {
          totalClaims: 1,
          totalProcedures: claimInfo.serviceLineInfoArray?.length || 0,
          totalCharged: this.parseAmount(claimInfo.claimTotChargeAmount),
          totalPaid: this.parseAmount(claimInfo.claimTotPaidAmount),
          patientResponsibility: this.parseAmount(claimInfo.patientResponsibility),
          provider: claimInfo.serviceProvider,
          networkStatus: claimInfo.networkPPOIndicator
        },
        extractionTime: extractionTime,
        timestamp: Date.now(),
        method: 'cigna-api-graphql'
      };
      
      console.log(`✅ Extraction terminée en ${extractionTime}ms`);
      console.log(`👤 Patient: ${patientData.patient.name}`);
      console.log(`🦷 ${patientData.summary.totalProcedures} procedures`);
      console.log(`💰 $${patientData.summary.totalCharged} → $${patientData.summary.totalPaid}`);
      
      return patientData;
      
    } catch (error) {
      console.error('❌ Erreur extraction:', error.message);
      
      if (error.response?.status === 401) {
        console.log('🔑 Token Bearer expiré - récupère un nouveau depuis Chrome DevTools');
      } else if (error.response?.data) {
        console.log('📋 Détails erreur:', JSON.stringify(error.response.data, null, 2));
      }
      
      throw error;
    }
  }

  parseAmount(amountStr) {
    if (!amountStr) return 0;
    return parseFloat(amountStr.replace(/[$,]/g, '')) || 0;
  }

  async saveResults(patientData, filename = null) {
    const dataDir = path.join(__dirname, 'data');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    if (!filename) {
      filename = `cigna-${patientData.patient.name.replace(/\s+/g, '-')}-${patientData.timestamp}.json`;
    }
    
    const filepath = path.join(dataDir, filename);
    
    await fs.promises.writeFile(
      filepath,
      JSON.stringify(patientData, null, 2),
      'utf8'
    );
    
    console.log(`💾 Données sauvées: ${filepath}`);
    return filepath;
  }
}

// Fonction pour extraction rapide avec données connues
async function extractNoahWilson(bearerToken) {
  console.log('🚀 EXTRACTION CIGNA - Noah Wilson (données connues)');
  
  const extractor = new CignaExtractor(bearerToken);
  
  try {
    const patientData = await extractor.extractPatientByClaimId(
      "E252036006700",
      "lw3oZbs4dwlZLB%2FGG%2FPLGVZLO%2FGO%2FPLPKZLO%2FGO%2FPLPKZZ7oZZ03deZ2Z5BOQQOBGGZOGKVGLOOPGGQBSG",
      "DNTCE25203600670001001", 
      "821594771"
    );
    
    const filename = await extractor.saveResults(patientData);
    
    console.log('\n🎉 EXTRACTION CIGNA TERMINÉE !');
    return { success: true, data: patientData, filename };
    
  } catch (error) {
    console.error('❌ Erreur extraction:', error.message);
    return { success: false, error: error.message };
  }
}

// Test avec token actuel
if (require.main === module) {
  const currentToken = "eyJqa3UiOiJodHRwczovL2NpZ25hZm9yaGNwLmNpZ25hLmNvbS9tZ2Evc3BzL29hdXRoL29hdXRoMjAvandrcy9jaGNwX3NwYV9kZWYiLCJraWQiOiJHeURtNHR0Wk1ZUGs0bGRRTUEtU0VlWnpDU0l2OVd4VE5ieHFzY1pQX0JVIiwiYWxnIjoiUlMyNTYifQ.eyJpYXQiOjE3NTcyNzk4NDUsInN1YiI6ImNuPXBheW9yYWNjZXNzMSxvdT1wcm92aWRlcnBlb3BsZSxvPWNpZ25hLmNvbSIsImF1ZCI6ImNoY3Bfc3BhX2NsaWVudCIsImh0dHBzOi8vY2lnbmFmb3JoY3AuY2lnbmEuY29tIjp7InNlc3Npb25JZCI6ImRiMjk5NzA0LThjMjctMTFmMC04ZjdjLTAwNTA1NjhmMDg3MiIsImNuIjoicGF5b3JhY2Nlc3MxIiwiZW5jcnlwdGVkQ24iOiJpcDZvdUM0V3pkQ1IxWFNsSk9Lb2RsUzdHQjlqblg5WkNEeEh4ek1qS3hSL25XbWpPNFBMUXhGUkU1T1FPeHFyK1hKZS9oTlNMSVVjTlRUbmFQZnZQdm5BMzdyNUJIWFRBbUR4dTZiSUlXVG5UT3JiYStFZi8yRFU2YTJBVHkzbi9RZkFyM1ZBSE1ORS9HM0FmYXNibEtWMkdXN1FOem1IUEVyS2ZzUlF0SDQ9IiwibG9iIjoiREVOIiwiY2hjcElkIjoiMjM0Nzc4OSIsImVudGl0bGVtZW50cyI6WyJDbGFpbXNTZWFyY2gtUmVjb25zaWRlcmF0aW9uIiwiUmVtaXR0YW5jZVJlcG9ydHMiLCJDbGFpbXNTZWFyY2giLCJQYXRpZW50U2VhcmNoIiwiQmFzaWNJbmZvcm1hdGlvbiJdLCJhdXRoTGV2ZWwiOiI0In0sImp0aSI6ImRiMjk5NzA0LThjMjctMTFmMC04ZjdjLTAwNTA1NjhmMDg3MiIsImNpZ25hLmxvYiI6IkRFTiIsImNpZ25hLmVudGl0bGVtZW50cyI6IkNsYWltc1NlYXJjaC1SZWNvbnNpZGVyYXRpb24gUmVtaXR0YW5jZVJlcG9ydHMgQ2xhaW1zU2VhcmNoIFBhdGllbnRTZWFyY2ggQmFzaWNJbmZvcm1hdGlvbiIsImNpZ25hLmNoY3BJZCI6IjIzNDc3ODkiLCJjaWduYS5hdXRoTGV2ZWwiOiI0IiwiY2lnbmEuY24iOiJwYXlvcmFjY2VzczEiLCJjaWduYS5lbmNyeXB0ZWRDbiI6ImlwNm91QzRXemRDUjFYU2xKT0tvZGxTN0dCOWpuWDlaQ0R4SHh6TWpLeFIvbldtak80UExReEZSRTVPUU94cXIrWEplL2hOU0xJVWNOVFRuYVBmdlB2bkEzN3I1QkhYVEFtRHh1NmJJSVdUblRPcmJhK0VmLzJEVTZhMkFUeTNuL1FmQXIzVkFITU5FL0czQWZhc2JsS1YyR1c3UU56bUhQRXJLZnNSUXRIND0iLCJlbnQudmVyIjoxLCJlbnQuYXBwTmFtZSI6ImNoY3Atd2ViIiwiZW50LnRva2VuVHlwZSI6InVzZXItZXh0IiwiZW50LmVudiI6InByb2QiLCJlbnQuZG9tYWluIjoiY2lnbmEtcHJvdmlkZXIiLCJzY29wZSI6Im9wZW5pZCIsImNsaWVudCI6ImNoY3Bfc3BhX2NsaWVudCIsImlzcyI6Imh0dHBzOi8vY2lnbmFmb3JoY3AuY2lnbmEuY29tIiwiZXhwIjoxNzU3MjgzNDQ1fQ.EG5Ku7ojpdsCSJvrDRKPkIxrIVIlQotWpYUr6iUThY_U-4K9yA5xrPWjaxsWM1MUhuxIsPjXZXxS_qCN4KoLgRbhzc0sSvM2XqFM7mC99M0s3senKt1AyQnYZ9_F1Rz1UFAZcZJsMU-0DH3AR92hu4r8fmV9Ax-ZiYEkxJbDX3jKUU34Xhi7RAwaf61jNWl7WaZXZLwgrwpSRjEbybLdsjW0gCXSNvwMh-hVpgi-czSLfFS065k1veWcdRle29I6IOVbzuqv7dzIoGFHLsqsuC7ITTcfq4K_eEYysVtCaqLQMV9JtbyGIy879C-5L4WsKMgiHdpVUQy5_fjVLHHu7w";
  
  extractNoahWilson(currentToken);
}

module.exports = { CignaExtractor, extractNoahWilson };