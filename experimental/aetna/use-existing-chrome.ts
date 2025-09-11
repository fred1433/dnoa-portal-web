import { chromium } from 'playwright';

async function useExistingChrome() {
  console.log('🔧 Connexion à Chrome existant...');
  
  // Lance Chrome avec debugging port
  console.log('⚠️  Fermez Chrome, puis relancez-le avec :');
  console.log('/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
  console.log('');
  console.log('Puis appuyez sur Enter quand Chrome est relancé...');
  
  await new Promise(resolve => process.stdin.once('data', resolve));
  
  // Se connecte au Chrome existant
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  
  // Va sur Aetna
  await page.goto('https://www.aetna.com/provweb/');
  
  console.log('✅ Connecté ! Vous devriez être déjà logged in');
  console.log('Continuez manuellement dans le navigateur...');
}

useExistingChrome().catch(console.error);