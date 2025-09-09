const DNOAService = require('./dnoa-service');

async function test() {
  console.log('🧪 DEUXIÈME EXÉCUTION - Ne devrait PAS se reconnecter\n');
  
  const service = new DNOAService();
  
  try {
    await service.initialize(false); // headless = false pour voir
    
    const data = await service.extractPatientData({
      firstName: 'SOPHIE',
      lastName: 'ROBINSON',
      subscriberId: '825978894',
      dateOfBirth: '2016-09-27'
    });
    
    console.log('\n✅ Extraction terminée');
    console.log('Patient:', data.summary?.patientName);
    console.log('CDT Codes:', data.summary?.totalCDTCodes);
    
    console.log('\n🎯 Si vous n\'avez PAS vu de login, la session persiste vraiment !');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await service.close();
  }
}

test();