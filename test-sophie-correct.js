const DNOAService = require('./dnoa-service');

async function test() {
  const service = new DNOAService();
  
  try {
    await service.initialize(false);
    
    console.log('🧪 Testing SOPHIE ROBINSON with CORRECT date of birth...');
    const data = await service.extractPatientData({
      firstName: 'SOPHIE',
      lastName: 'ROBINSON',
      subscriberId: '825978894',
      dateOfBirth: '2016-09-27'  // La BONNE date !
    });
    
    console.log('\n✅ SUCCESS! Sophie Robinson found!');
    console.log('Patient:', data.summary?.patientName);
    console.log('Plan:', data.summary?.planName);
    console.log('CDT Codes:', data.summary?.totalCDTCodes);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await service.close();
  }
}

test();