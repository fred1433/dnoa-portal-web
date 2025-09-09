const DentaQuestService = require('./dentaquest-service');

async function test() {
  console.log('🧪 DEUXIÈME EXÉCUTION DentaQuest - Ne devrait PAS se reconnecter\n');
  
  const service = new DentaQuestService();
  
  try {
    await service.initialize(false); // headless = false pour voir
    
    const data = await service.extractPatientData({
      firstName: 'Cason',
      lastName: 'Wright',
      subscriberId: '710875473',
      dateOfBirth: '03/29/2016'
    });
    
    console.log('\n✅ Extraction terminée');
    console.log('Patient:', data.summary?.patientName);
    console.log('Claims:', data.summary?.totalClaims);
    
    console.log('\n🎯 Si vous n\'avez PAS vu de login, la session persiste vraiment !');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await service.close();
  }
}

test();