const DNOAService = require('./dnoa-service');

async function test() {
  const service = new DNOAService();
  
  try {
    await service.initialize(false); // headless = false pour voir
    
    // Test avec Celestie Flores (patient)
    console.log('🧪 Testing with CELESTIE FLORES (patient DOB)...');
    const data = await service.extractPatientData({
      firstName: 'CELESTIE',
      lastName: 'FLORES',
      subscriberId: 'upt820704358',
      dateOfBirth: '2010-10-11'  // Format YYYY-MM-DD
    });
    
    console.log('\n=== DNOA DATA EXTRACTED ===');
    console.log('Patient:', data.summary?.patientName);
    console.log('Status:', data.summary?.status);
    console.log('CDT Codes:', data.summary?.totalCDTCodes);
    
  } catch (error) {
    console.error('❌ Failed with patient DOB:', error.message);
    
    // Essayer avec le subscriber
    console.log('\n🧪 Trying with FERNANDO REYES (subscriber DOB)...');
    try {
      const data2 = await service.extractPatientData({
        firstName: 'FERNANDO',
        lastName: 'REYES',
        subscriberId: 'upt820704358',
        dateOfBirth: '1994-08-18'
      });
      
      console.log('\n=== DNOA DATA EXTRACTED ===');
      console.log('Patient:', data2.summary?.patientName);
      console.log('Status:', data2.summary?.status);
      console.log('CDT Codes:', data2.summary?.totalCDTCodes);
      
    } catch (error2) {
      console.error('❌ Failed with subscriber DOB too:', error2.message);
    }
  } finally {
    await service.close();
  }
}

test();