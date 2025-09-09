const DNOAService = require('./dnoa-service');

async function test() {
  const service = new DNOAService();
  
  try {
    console.log('🧪 TEST 1: First connection (should login)');
    await service.initialize(false); // headless = false to see
    
    const data1 = await service.extractPatientData({
      firstName: 'SOPHIE',
      lastName: 'ROBINSON',
      subscriberId: '825978894',
      dateOfBirth: '2016-09-27'
    });
    
    console.log('✅ First extraction done');
    console.log('Waiting 5 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🧪 TEST 2: Second connection (should NOT re-login)');
    const data2 = await service.extractPatientData({
      firstName: 'SOPHIE',
      lastName: 'ROBINSON',
      subscriberId: '825978894',
      dateOfBirth: '2016-09-27'
    });
    
    console.log('✅ Second extraction done');
    console.log('\nIf you saw "Already logged in" for the second test, it worked!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await service.close();
  }
}

test();