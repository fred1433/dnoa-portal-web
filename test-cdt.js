const DNOAService = require('./dnoa-service');

async function test() {
  const service = new DNOAService();
  
  try {
    await service.initialize(true); // headless mode
    
    const data = await service.extractPatientData({
      firstName: 'SOPHIE',
      lastName: 'ROBINSON', 
      subscriberId: '825978894',
      dateOfBirth: '2016-09-27'
    });
    
    console.log('\n=== PROCEDURE HISTORY STRUCTURE ===');
    if (data.procedureHistory) {
      const procedures = data.procedureHistory?.data || data.procedureHistory;
      if (Array.isArray(procedures) && procedures.length > 0) {
        console.log('First 3 procedures:');
        console.log(JSON.stringify(procedures.slice(0, 3), null, 2));
        
        // Check what fields are available
        console.log('\nAvailable fields in first procedure:');
        console.log(Object.keys(procedures[0]));
      } else {
        console.log('procedureHistory structure:', JSON.stringify(data.procedureHistory, null, 2).slice(0, 500));
      }
    }
    
    console.log('\n=== CDT CODES EXTRACTED ===');
    console.log('Total CDT codes in summary:', data.summary?.totalCDTCodes);
    console.log('CDT codes array length:', data.summary?.cdtCodes?.length);
    if (data.summary?.cdtCodes?.length > 0) {
      console.log('First 3 CDT codes:', JSON.stringify(data.summary.cdtCodes.slice(0, 3), null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await service.close();
  }
}

test();