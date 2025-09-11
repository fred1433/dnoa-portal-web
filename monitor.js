const cron = require('node-cron');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Import des services
const DNOAService = require('./dnoa-service');
const DentaQuestService = require('./dentaquest-service');
const MetLifeService = require('./metlife-service');

// Patients de test (données réelles de l'interface)
const TEST_PATIENTS = {
  DNOA: {
    subscriberId: '825978894',
    firstName: 'SOPHIE',
    lastName: 'ROBINSON',
    dateOfBirth: '09/27/2016'
  },
  DentaQuest: {
    subscriberId: '710875473',
    firstName: 'Cason',
    lastName: 'Wright',
    dateOfBirth: '03/29/2016'
  },
  MetLife: {
    subscriberId: '635140654',
    firstName: 'AVERLY',
    lastName: 'TEDFORD',
    dateOfBirth: '06/15/2015'
  }
};

// Créer la base de données si elle n'existe pas
const dbPath = path.join(__dirname, 'monitoring.db');
const db = new sqlite3.Database(dbPath);

// Créer la table de monitoring
db.run(`
  CREATE TABLE IF NOT EXISTS monitor_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portal TEXT NOT NULL,
    status TEXT NOT NULL,
    test_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    duration_ms INTEGER,
    error_message TEXT,
    details TEXT
  )
`);

// Fonction pour tester DNOA
async function testDNOA() {
  const startTime = Date.now();
  const service = new DNOAService();
  
  try {
    console.log('🔍 Testing DNOA...');
    await service.initialize(true, msg => console.log(`  DNOA: ${msg}`));
    
    const patient = TEST_PATIENTS.DNOA;
    // Convert date format from MM/DD/YYYY to YYYY-MM-DD for DNOA API
    const [month, day, year] = patient.dateOfBirth.split('/');
    const formattedPatient = {
      ...patient,
      dateOfBirth: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    };
    
    const data = await service.extractPatientData(
      formattedPatient,
      msg => console.log(`  DNOA: ${msg}`)
    );
    
    await service.close();
    
    const duration = Date.now() - startTime;
    
    // DNOA returns data directly, not wrapped in {success, data}
    if (data && data.benefits) {
      console.log('✅ DNOA: OK');
      return {
        portal: 'DNOA',
        status: 'up',
        duration_ms: duration,
        details: `Found ${data.benefits?.categories?.length || 0} benefit categories`
      };
    } else {
      console.log('❌ DNOA: Failed');
      return {
        portal: 'DNOA',
        status: 'down',
        duration_ms: duration,
        error_message: 'No data returned'
      };
    }
  } catch (error) {
    console.log('❌ DNOA: Error -', error.message);
    return {
      portal: 'DNOA',
      status: 'down',
      duration_ms: Date.now() - startTime,
      error_message: error.message
    };
  }
}

// Fonction pour tester DentaQuest
async function testDentaQuest() {
  const startTime = Date.now();
  const service = new DentaQuestService();
  
  try {
    console.log('🔍 Testing DentaQuest...');
    await service.initialize(true, msg => console.log(`  DQ: ${msg}`));
    
    const patient = TEST_PATIENTS.DentaQuest;
    const data = await service.extractPatientData(
      patient,
      msg => console.log(`  DQ: ${msg}`)
    );
    
    await service.close();
    
    const duration = Date.now() - startTime;
    
    // DentaQuest returns data directly, not wrapped in {success, data}
    if (data && data.claims) {
      console.log('✅ DentaQuest: OK');
      return {
        portal: 'DentaQuest',
        status: 'up',
        duration_ms: duration,
        details: `Found ${data.claims?.length || 0} claims`
      };
    } else {
      console.log('❌ DentaQuest: Failed');
      return {
        portal: 'DentaQuest',
        status: 'down',
        duration_ms: duration,
        error_message: 'No data returned'
      };
    }
  } catch (error) {
    console.log('❌ DentaQuest: Error -', error.message);
    return {
      portal: 'DentaQuest',
      status: 'down',
      duration_ms: Date.now() - startTime,
      error_message: error.message
    };
  }
}

// Fonction pour tester MetLife
async function testMetLife() {
  const startTime = Date.now();
  const service = new MetLifeService();
  
  try {
    console.log('🔍 Testing MetLife...');
    
    // Pour MetLife, on teste juste la connexion jusqu'à l'OTP
    // (pas de patient test car OTP requis)
    await service.initialize(true, msg => console.log(`  ML: ${msg}`));
    
    // Si on arrive ici sans erreur, c'est que le login fonctionne
    await service.close();
    
    const duration = Date.now() - startTime;
    console.log('⚠️ MetLife: Degraded (OTP required but login OK)');
    
    return {
      portal: 'MetLife',
      status: 'degraded',
      duration_ms: duration,
      details: 'Login successful but OTP required for full test'
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Si l'erreur mentionne OTP, c'est que le login fonctionne
    if (error.message.includes('OTP')) {
      console.log('⚠️ MetLife: Degraded (OTP required)');
      return {
        portal: 'MetLife',
        status: 'degraded',
        duration_ms: duration,
        details: 'OTP required - login flow working'
      };
    }
    
    console.log('❌ MetLife: Error -', error.message);
    return {
      portal: 'MetLife',
      status: 'down',
      duration_ms: duration,
      error_message: error.message
    };
  }
}

// Sauvegarder les résultats dans la base
function saveResult(result) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO monitor_results (portal, status, duration_ms, error_message, details)
       VALUES (?, ?, ?, ?, ?)`,
      [
        result.portal,
        result.status,
        result.duration_ms,
        result.error_message || null,
        result.details || null
      ],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// Fonction principale de test
async function runAllTests() {
  console.log('\n' + '='.repeat(50));
  console.log(`🏥 MONITORING RUN - ${new Date().toLocaleString()}`);
  console.log('='.repeat(50));
  
  const results = [];
  
  // Test DNOA
  const dnoaResult = await testDNOA();
  await saveResult(dnoaResult);
  results.push(dnoaResult);
  
  // Test DentaQuest
  const dqResult = await testDentaQuest();
  await saveResult(dqResult);
  results.push(dqResult);
  
  // Test MetLife
  const mlResult = await testMetLife();
  await saveResult(mlResult);
  results.push(mlResult);
  
  // Résumé
  console.log('\n📊 SUMMARY:');
  results.forEach(r => {
    const icon = r.status === 'up' ? '✅' : r.status === 'degraded' ? '⚠️' : '❌';
    console.log(`  ${icon} ${r.portal}: ${r.status.toUpperCase()} (${r.duration_ms}ms)`);
  });
  
  console.log('='.repeat(50) + '\n');
  
  return results;
}

// Récupérer le dernier statut pour l'API
function getLatestStatus() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT portal, status, test_time, duration_ms, error_message, details
       FROM monitor_results
       WHERE id IN (
         SELECT MAX(id) FROM monitor_results GROUP BY portal
       )
       ORDER BY portal`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Récupérer l'historique
function getHistory(hours = 24) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM monitor_results
       WHERE test_time > datetime('now', '-${hours} hours')
       ORDER BY test_time DESC`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Si lancé directement, faire un test immédiat
if (require.main === module) {
  console.log('🚀 Running immediate test...');
  runAllTests().then(() => {
    console.log('✅ Test complete');
    process.exit(0);
  }).catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}

// Exporter pour utilisation dans server.js
module.exports = {
  runAllTests,
  getLatestStatus,
  getHistory,
  TEST_PATIENTS
};