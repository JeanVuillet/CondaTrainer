const path = require('path');
// On charge les variables d'environnement depuis la racine
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// Gestion de fetch (compatible anciennes et nouvelles versions de Node)
const fetch = global.fetch || require('node-fetch');

const key = process.env.GEMINI_API_KEY;

console.log("------------------------------------------------");
console.log("🔍 DIAGNOSTIC GEMINI - RECHERCHE DES MODÈLES");
console.log("------------------------------------------------");

if (!key) {
    console.error("❌ ERREUR : Aucune clé GEMINI_API_KEY trouvée.");
    console.error("👉 Vérifie que ton fichier .env est bien à la racine du projet.");
    process.exit(1);
} else {
    console.log("✅ Clé API détectée.");
}

async function listModels() {
    try {
        console.log("📡 Interrogation des serveurs Google...");
        
        // Appel direct à l'API REST de Google
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();

        if (data.error) {
            console.error("\n❌ ERREUR RENVOYÉE PAR GOOGLE :");
            console.error(`   Code : ${data.error.code}`);
            console.error(`   Message : ${data.error.message}`);
            return;
        }

        if (!data.models) {
            console.log("⚠️ Aucun modèle trouvé (Réponse vide).");
            return;
        }

        // On filtre pour ne garder que les modèles de Chat (generateContent)
        const chatModels = data.models.filter(m => 
            m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
        );

        console.log(`\n✅ ${chatModels.length} MODÈLES DISPONIBLES :\n`);

        chatModels.forEach(m => {
            // Le nom arrive sous la forme "models/gemini-1.5-flash"
            // On retire "models/" pour avoir le nom à mettre dans le code
            const cleanName = m.name.replace('models/', '');
            
            console.log(`🔹 NOM À METTRE DANS SERVER.JS : "${cleanName}"`);
            console.log(`   Description : ${m.displayName}`);
            console.log("   -----------------------------------");
        });

        console.log("\n💡 CONSEIL : Utilise 'gemini-1.5-flash' s'il est dans la liste (c'est le plus rapide/gratuit).");

    } catch (error) {
        console.error("\n❌ CRASH DU SCRIPT :");
        console.error(error);
    }
}

listModels();