const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function testMetLifeHeadless(headless) {
  console.log(`\n🧪 Test MetLife en mode ${headless ? 'HEADLESS' : 'HEADFUL'}`);
  
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--window-size=1920,1080',
    '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];

  const browser = await chromium.launch({ headless, args });
  
  try {
    const contextOptions = {
      viewport: { width: 1920, height: 1080 },
      storageState: path.join(__dirname, '.metlife-session/auth.json')
    };
    
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    
    // Essayer d'accéder à la home
    await page.goto('https://dentalprovider.metlife.com/home', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await page.waitForTimeout(3000);
    
    const url = page.url();
    const title = await page.title();
    const bodyText = await page.innerText('body').catch(() => '');
    
    console.log(`  URL: ${url}`);
    console.log(`  Titre: ${title}`);
    console.log(`  Connecté: ${url.includes('/home') && !url.includes('login')}`);
    console.log(`  Texte trouvé: ${bodyText.includes('Find Metlife patients') ? 'OUI' : 'NON'}`);
    
    // Tester la recherche
    if (url.includes('/home')) {
      console.log('  🔍 Test recherche patient...');
      const searchBox = page.locator('div').filter({ hasText: /^Subscriber ID or Social Security Number$/ }).nth(2);
      const isVisible = await searchBox.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`  Champ recherche visible: ${isVisible}`);
    }
    
    return url.includes('/home');
    
  } finally {
    await browser.close();
  }
}

// Tester les deux modes
(async () => {
  const headlessResult = await testMetLifeHeadless(true);
  const headfulResult = await testMetLifeHeadless(false);
  
  console.log('\n📊 RÉSULTATS:');
  console.log(`  Headless: ${headlessResult ? '✅' : '❌'}`);
  console.log(`  Headful: ${headfulResult ? '✅' : '❌'}`);
})();