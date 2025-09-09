const DentaQuestService = require('./dentaquest-service');

async function test() {
  const service = new DentaQuestService();
  
  try {
    await service.initialize(false); // headless = false pour voir ce qui se passe
    
    const data = await service.extractPatientData({
      firstName: 'Cason',
      lastName: 'Wright',
      subscriberId: '710875473',
      dateOfBirth: '03/29/2016'
    });
    
    console.log('\n=== DENTAQUEST DATA EXTRACTED ===');
    console.log('Patient:', data.summary.patientName);
    console.log('Member ID:', data.summary.memberId);
    console.log('Total Claims:', data.summary.totalClaims);
    console.log('Total CDT Codes:', data.summary.totalCDTCodes);
    
    if (data.summary.cdtCodes?.length > 0) {
      console.log('\n=== FIRST 5 CDT CODES ===');
      console.log(JSON.stringify(data.summary.cdtCodes.slice(0, 5), null, 2));
    }
    
    console.log('\n=== FINANCIAL SUMMARY ===');
    console.log('Total Billed: $', data.summary.totalBilled?.toFixed(2) || 'N/A');
    console.log('Total Paid: $', data.summary.totalPaid?.toFixed(2) || 'N/A');
    console.log('Patient Responsibility: $', data.summary.patientResponsibility?.toFixed(2) || 'N/A');
    console.log('Is Eligible:', data.summary.isEligible ? '✅ Yes' : '❌ No');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await service.close();
  }
}

test();