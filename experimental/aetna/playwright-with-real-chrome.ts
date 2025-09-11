import { chromium } from 'playwright';
import * as path from 'path';
import * as os from 'os';

async function useRealChromeProfile() {
  console.log('🚀 Using your REAL Chrome profile with Playwright\n');
  
  // IMPORTANT: Fermez Chrome avant de lancer ce script !
  console.log('⚠️  IMPORTANT: Please close Chrome completely before continuing!');
  console.log('Press Enter when Chrome is closed...');
  await new Promise(resolve => process.stdin.once('data', resolve));
  
  // Trouver le vrai profil Chrome sur macOS
  const chromeUserDataDir = path.join(
    os.homedir(),
    'Library/Application Support/Google/Chrome'
  );
  
  console.log(`📁 Using Chrome profile from: ${chromeUserDataDir}`);
  
  // Lancer Playwright avec votre vrai profil Chrome
  const browser = await chromium.launchPersistentContext(chromeUserDataDir, {
    headless: false,
    channel: 'chrome', // Utilise le vrai Chrome, pas Chromium
    
    // Options anti-détection CRITIQUES
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--disable-web-security',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
      '--disable-features=ImprovedCookieControls',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--window-size=1280,720',
      '--start-maximized'
    ],
    
    // Ignorer les flags de détection par défaut
    ignoreDefaultArgs: [
      '--enable-automation',
      '--enable-blink-features=AutomationControlled'
    ],
    
    viewport: null, // Utilise la taille de fenêtre réelle
    slowMo: 100, // Ralentit les actions pour être plus humain
  });
  
  // Injection anti-détection supplémentaire
  await browser.addInitScript(() => {
    // Masquer webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // Masquer les plugins d'automatisation
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // Ajouter chrome runtime
    (window as any).chrome = {
      runtime: {},
      loadTimes: function() {},
      csi: function() {},
      app: {}
    };
    
    // Masquer les permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission } as PermissionStatus) :
        originalQuery(parameters)
    );
  });
  
  // Ouvrir une page
  const page = browser.pages()[0] || await browser.newPage();
  
  // Naviguer vers Aetna
  await page.goto('https://www.aetna.com/provweb/');
  
  console.log('✅ Chrome ouvert avec votre profil et vos cookies!');
  console.log('📌 Vous êtes probablement déjà connecté grâce à vos cookies');
  
  // Vérifier si on est connecté
  const needsLogin = await page.locator('input[name="USER"]').count() > 0;
  if (!needsLogin) {
    console.log('✅ Déjà connecté! Les cookies ont fonctionné!');
  }
  
  return { browser, page };
}

// Option 2: Copier les cookies de Chrome vers Playwright
async function copyCookiesFromChrome() {
  console.log('🍪 Alternative: Copier vos cookies Chrome vers Playwright\n');
  
  // Cette méthode nécessite d'extraire les cookies depuis Chrome
  // Peut être fait avec chrome-cookies-secure ou tough-cookie-filestore
  
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
    ],
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  // ICI: Charger les cookies extraits de Chrome
  // await context.addCookies(cookies);
  
  const page = await context.newPage();
  return { browser: context, page };
}

// Option 3: Utiliser Chrome avec debugging port
async function connectToExistingChrome() {
  console.log('🔗 Option 3: Se connecter à Chrome existant\n');
  console.log('1. D\'abord, lancez Chrome avec:');
  console.log('   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
  console.log('2. Puis lancez ce script\n');
  
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  
  return { browser: context, page };
}

// Main
async function main() {
  console.log('🎯 PLAYWRIGHT AVEC VOTRE VRAIE SESSION CHROME');
  console.log('==============================================\n');
  console.log('Choisissez une option:');
  console.log('1. Utiliser votre profil Chrome (fermer Chrome d\'abord)');
  console.log('2. Se connecter à Chrome déjà ouvert (avec --remote-debugging-port)');
  console.log('3. Copier les cookies (plus complexe)\n');
  
  // Par défaut, utiliser l'option 1
  const { browser, page } = await useRealChromeProfile();
  
  // Continuer avec votre script Aetna...
  console.log('\n🎭 Playwright est maintenant connecté avec votre session!');
  console.log('Les captchas devraient être minimisés car:');
  console.log('- Vous utilisez votre vrai profil Chrome');
  console.log('- Vos cookies et historique sont présents');
  console.log('- Les flags anti-détection sont activés');
}

main().catch(console.error);