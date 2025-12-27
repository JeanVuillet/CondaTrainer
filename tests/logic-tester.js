const puppeteer = require('puppeteer');

async function runTests() {
  console.log("🤖 [ROBOT] Démarrage de la vérification rigoureuse...");
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  // 1. On traque précisément les erreurs 404
  page.on('response', response => {
    if (response.status() === 404) {
      console.log(`🚫 RESSOURCE MANQUANTE (404): ${response.url()}`);
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`🚫 BROWSER JS ERROR: ${msg.text()}`);
  });

  try {
    // 2. Navigation
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    
    // 3. Login
    console.log("⏳ Tentative de connexion...");
    await page.waitForSelector('#firstName');
    await page.type('#firstName', 'Eleve');
    await page.type('#lastName', 'Test');
    await page.select('#classroom', '5B');
    await page.click('#startBtn');
    
    // Attendre que l'écran de login disparaisse et que le badge apparaisse
    await page.waitForSelector('#studentBadge', { visible: true, timeout: 5000 });
    console.log("✅ Login : Réussi");

    // 4. Attendre que le menu des chapitres soit affiché (et pas juste dans le code)
    console.log("⏳ Attente de l'affichage du menu des chapitres...");
    await page.waitForSelector('#chapterSelection', { visible: true, timeout: 5000 });

    // 5. Clic sur le bouton Devoirs
    const btnSelector = '.chapter-box[data-chapter="ch5-devoir"] .chapter-action-btn';
    
    // On attend que le bouton existe ET soit cliquable (pas disabled)
    await page.waitForFunction(sel => {
      const btn = document.querySelector(sel);
      return btn && !btn.disabled && btn.getBoundingClientRect().width > 0;
    }, { timeout: 5000 }, btnSelector);

    console.log("⏳ Clic sur le module Devoirs...");
    // Petite astuce : on utilise page.evaluate pour cliquer "proprement" via JS
    await page.evaluate(sel => document.querySelector(sel).click(), btnSelector);

    // 6. Vérification finale
    await page.waitForSelector('#hw-list', { visible: true, timeout: 5000 });
    console.log("✅ Liste des devoirs chargée avec succès !");

    console.log("\n✨ BILAN : Tout est OK, le site est stable.");

  } catch (err) {
    console.error("\n🚨 ALERTE : Le robot a échoué !");
    console.error("Détail :", err.message);
    await page.screenshot({ path: 'tests/error_screenshot.png' });
    console.log("📸 Regarde 'tests/error_screenshot.png' pour voir ce qui bloquait le robot.");
  } finally {
    await browser.close();
  }
}

// On laisse 3 secondes au serveur pour bien monter la BDD avant de tester
setTimeout(runTests, 3000);