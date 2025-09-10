const express = require('express');
const path = require('path');
const DNOAService = require('./dnoa-service');
const DentaQuestService = require('./dentaquest-service');
const MetLifeService = require('./metlife-service');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple API key protection
const API_KEY = process.env.API_KEY || 'demo2024';

// Active SSE connections
const sseClients = new Set();

// Middleware for API key check
function checkApiKey(req, res, next) {
  const key = req.query.key || req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// SSE endpoint for real-time logs
app.get('/api/stream', checkApiKey, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Send initial connection message
  res.write('event: connected\ndata: {"message": "Connected to log stream"}\n\n');
  
  // Add to clients set
  sseClients.add(res);
  
  // Remove on disconnect
  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Broadcast log to all SSE clients
function broadcastLog(message) {
  const data = JSON.stringify({ 
    message, 
    timestamp: new Date().toISOString() 
  });
  
  for (const client of sseClients) {
    client.write(`event: log\ndata: ${data}\n\n`);
  }
}

// Main extraction endpoint
app.post('/api/extract', checkApiKey, async (req, res) => {
  const { subscriberId, dateOfBirth, firstName, lastName, portal = 'DNOA' } = req.body;
  
  // Validation
  if (!subscriberId || !dateOfBirth || !firstName || !lastName) {
    return res.status(400).json({ 
      error: 'Missing required fields: subscriberId, dateOfBirth, firstName, lastName' 
    });
  }
  
  // Format date if needed (MM/DD/YYYY to YYYY-MM-DD)
  let formattedDob = dateOfBirth;
  if (dateOfBirth.includes('/')) {
    const [month, day, year] = dateOfBirth.split('/');
    formattedDob = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  const patient = {
    subscriberId: subscriberId.trim(),
    dateOfBirth: formattedDob,
    firstName: firstName.trim().toUpperCase(),
    lastName: lastName.trim().toUpperCase()
  };
  
  broadcastLog(`🚀 Starting ${portal} extraction for ${patient.firstName} ${patient.lastName}`);
  
  // Select service based on portal
  let service;
  if (portal === 'DentaQuest') {
    service = new DentaQuestService();
  } else if (portal === 'MetLife') {
    service = new MetLifeService();
  } else {
    service = new DNOAService();
  }
  
  try {
    // Initialize with headless mode
    const isHeadless = true; // Testons en headless pour tous
    
    if (portal === 'MetLife') {
      // MetLife needs OTP handler
      await service.initialize(isHeadless, broadcastLog, async () => {
        broadcastLog('🔔 OTP requis - Session non sauvegardée');
        // Pour l'instant on utilise la session existante
        return null;
      });
    } else {
      await service.initialize(isHeadless, broadcastLog);
    }
    
    // Extract data
    let data;
    if (portal === 'MetLife') {
      const result = await service.extractPatientData(
        patient.subscriberId,
        patient.lastName,
        patient.dateOfBirth,
        patient.firstName,
        broadcastLog
      );
      data = result.success ? result.data : null;
      if (!result.success) {
        throw new Error(result.error);
      }
    } else {
      data = await service.extractPatientData(patient, broadcastLog);
    }
    
    // Send complete event to SSE clients
    for (const client of sseClients) {
      client.write(`event: complete\ndata: {"message": "Extraction complete"}\n\n`);
    }
    
    res.json({
      success: true,
      data
    });
    
  } catch (error) {
    broadcastLog('❌ Error: ' + error.message);
    
    // Send error event to SSE clients
    for (const client of sseClients) {
      client.write(`event: error\ndata: {"error": "${error.message}"}\n\n`);
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
    
  } finally {
    await service.close();
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 API Key: ${API_KEY}`);
  console.log(`🔗 Access URL: http://localhost:${PORT}/?key=${API_KEY}`);
});