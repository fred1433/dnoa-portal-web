const https = require('https');

async function checkLocation() {
  return new Promise((resolve) => {
    https.get('https://ipapi.co/json/', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          const isUS = info.country_code === 'US';
          
          console.log('📍 Location Check:');
          console.log(`   Country: ${info.country_name} (${info.country_code})`);
          console.log(`   City: ${info.city}, ${info.region}`);
          console.log(`   IP: ${info.ip}`);
          
          if (!isUS) {
            console.log('\n⚠️  WARNING: You are not in the US!');
            console.log('   Dental portals may block or throttle non-US connections.');
            console.log('   👉 Please connect to a US VPN for reliable access.\n');
          } else {
            console.log('   ✅ US connection detected - portals should work normally\n');
          }
          
          resolve({ isUS, location: info });
        } catch (e) {
          console.log('⚠️  Could not detect location');
          resolve({ isUS: null, location: null });
        }
      });
    }).on('error', () => {
      console.log('⚠️  Could not check location (offline?)');
      resolve({ isUS: null, location: null });
    });
  });
}

module.exports = checkLocation;