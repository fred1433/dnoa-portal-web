const DNOAService = require('./dnoa-service');

async function test() {
  console.log('🧪 PREMIÈRE EXÉCUTION - Devrait se connecter et sauver la session\n');
  
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
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await service.close();
    console.log('\n🔚 Browser fermé - La session devrait être sauvegardée');
    console.log('Lancez test-session-2.js pour vérifier si la session persiste');
  }
}

test();