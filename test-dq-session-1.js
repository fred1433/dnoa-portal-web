const DentaQuestService = require('./dentaquest-service');

async function test() {
  console.log('🧪 PREMIÈRE EXÉCUTION DentaQuest - Devrait se connecter et sauver la session\n');
  
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
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await service.close();
    console.log('\n🔚 Browser fermé - La session devrait être sauvegardée');
    console.log('Lancez test-dq-session-2.js pour vérifier si la session persiste');
  }
}

test();