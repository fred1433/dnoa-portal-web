const https = require('https');
const http = require('http');

async function checkLocation() {
  return new Promise((resolve) => {
    // Try multiple APIs in case one fails
    const apis = [
      'https://ipapi.co/json/',
      'http://ip-api.com/json/',  // This one needs HTTP not HTTPS
      'https://ipinfo.io/json'
    ];
    
    let attempted = 0;
    
    function tryApi(url) {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const info = JSON.parse(data);
            
            // Check if API returned an error
            if (info.error || info.reason === 'RateLimited') {
              throw new Error('API error, trying next');
            }
            
            // Different APIs use different field names
            const country = info.country_code || info.countryCode || info.country;
            const isUS = country === 'US';
            
            console.log('📍 Location Check:');
            console.log(`   Country: ${info.country_name || info.country || country}`);
            console.log(`   City: ${info.city}`);
            console.log(`   IP: ${info.ip || info.query || 'unknown'}`);
            
            if (!isUS) {
              console.log('\n⚠️  WARNING: You are not in the US!');
              console.log('   Dental portals may block or throttle non-US connections.');
              console.log('   👉 Please connect to a US VPN for reliable access.\n');
            } else {
              console.log('   ✅ US connection detected - portals should work normally\n');
            }
            
            resolve({ isUS, location: info });
          } catch (e) {
            attempted++;
            if (attempted < apis.length) {
              tryApi(apis[attempted]);
            } else {
              console.log('⚠️  Could not detect location');
              resolve({ isUS: null, location: null });
            }
          }
        });
      }).on('error', () => {
        attempted++;
        if (attempted < apis.length) {
          tryApi(apis[attempted]);
        } else {
          console.log('⚠️  Could not check location (offline?)');
          resolve({ isUS: null, location: null });
        }
      });
    }
    
    tryApi(apis[0]);
  });
}

module.exports = checkLocation;