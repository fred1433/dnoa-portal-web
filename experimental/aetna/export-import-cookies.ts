import { chromium } from 'playwright';
import * as fs from 'fs';

// ÉTAPE 1: Dans Chrome DevTools Console sur Aetna (où vous êtes connecté), exécutez:
// copy(document.cookie)
// Puis collez le résultat dans cookies.txt

async function useWithCookies() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  
  // Lire les cookies depuis le fichier
  if (fs.existsSync('cookies.txt')) {
    const cookieString = fs.readFileSync('cookies.txt', 'utf-8');
    const cookies = cookieString.split('; ').map(c => {
      const [name, value] = c.split('=');
      return {
        name,
        value,
        domain: '.aetna.com',
        path: '/'
      };
    });
    
    await context.addCookies(cookies);
    console.log('✅ Cookies importés');
  }
  
  const page = await context.newPage();
  await page.goto('https://www.aetna.com/provweb/');
  
  // Vérifiez si vous êtes connecté
  console.log('Vérifiez votre statut de connexion...');
  
  // Maintenant vous pouvez enregistrer avec codegen depuis cet état
}

useWithCookies().catch(console.error);