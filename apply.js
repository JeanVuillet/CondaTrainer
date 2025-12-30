const fs = require('fs');
const path = require('path');
const inputFile = path.join(__dirname, 'update.txt');

function applyUpdate() {
    if (!fs.existsSync(inputFile)) return;
    const content = fs.readFileSync(inputFile, 'utf8');
    if (!content || content.trim().length < 10) return;

    console.log("🐪 SYSTÈME CHAMEAU V5 : Chirurgie par sections...");

    // On sépare le texte par les marqueurs de fichiers
    const parts = content.split(/\/\/\s*FILE:\s*/);
    
    // On ignore le premier morceau s'il ne contient pas de nom de fichier (déchet au début)
    if (parts[0] && (parts[0].length < 3 || parts[0].includes('{') || parts[0].includes('('))) {
        parts.shift();
    }

    parts.forEach(part => {
        try {
            const lines = part.split('\n');
            const filePath = lines[0].trim().replace(/[\r]/g, '');
            const newContent = lines.slice(1).join('\n').trim();

            // SÉCURITÉ : Ne pas toucher à ce script et vérifier le nom
            if (!filePath || filePath.includes('apply.js') || /[\{\}\(\)=>|;]/.test(filePath) || filePath.length > 80) {
                console.log("⚠️ Bloc ignoré (nom de fichier invalide ou suspect)");
                return;
            }

            const fullPath = path.join(__dirname, filePath);
            
            // CAS 1 : Le fichier n'existe pas -> Création
            if (!fs.existsSync(fullPath)) {
                const dir = path.dirname(fullPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(fullPath, newContent);
                console.log(`🆕 CRÉÉ : ${filePath}`);
                return;
            }

            // CAS 2 : Le fichier existe -> Chirurgie ou Overwrite
            const original = fs.readFileSync(fullPath, 'utf8');
            let patchedContent = original;
            let hasAppliedAtLeastOnePatch = false;

            // Analyse du nouveau contenu pour trouver des sections [SECTION: NOM]
            const startMarkerPrefix = "[SECTION: ";
            let searchIndex = 0;

            while (true) {
                const startIdx = newContent.indexOf(startMarkerPrefix, searchIndex);
                if (startIdx === -1) break;

                const nameEndIdx = newContent.indexOf("]", startIdx);
                if (nameEndIdx === -1) break;

                const sectionName = newContent.substring(startIdx + startMarkerPrefix.length, nameEndIdx).trim();
                const endTag = "[/SECTION: " + sectionName + "]";
                const endTagIdx = newContent.indexOf(endTag, nameEndIdx);

                if (endTagIdx !== -1) {
                    // On a trouvé un bloc complet dans l'update.txt
                    const fullNewBlock = newContent.substring(startIdx, endTagIdx + endTag.length);
                    
                    // On cherche ce même bloc dans le fichier original
                    const originalStartIdx = patchedContent.indexOf("[SECTION: " + sectionName + "]");
                    const originalEndIdx = patchedContent.indexOf("[/SECTION: " + sectionName + "]");

                    if (originalStartIdx !== -1 && originalEndIdx !== -1) {
                        // CHIRURGIE : On remplace le vieux bloc par le nouveau
                        const before = patchedContent.substring(0, originalStartIdx);
                        const after = patchedContent.substring(originalEndIdx + endTag.length);
                        patchedContent = before + fullNewBlock + after;
                        hasAppliedAtLeastOnePatch = true;
                        console.log(`  💉 Patch : [${sectionName}] -> ${filePath}`);
                    } else {
                        console.log(`  ⚠️ Section [${sectionName}] introuvable dans l'original de ${filePath}`);
                    }
                }
                
                searchIndex = (endTagIdx !== -1) ? endTagIdx + endTag.length : startIdx + 1;
                if (searchIndex >= newContent.length) break;
            }

            // DÉCISION FINALE :
            // Si on a patché au moins un morceau, on sauve le résultat fusionné.
            // Sinon, on remplace tout le fichier (Overwrite classique).
            if (hasAppliedAtLeastOnePatch) {
                fs.writeFileSync(fullPath, patchedContent);
                console.log(`✅ CHIRURGIE TERMINÉE : ${filePath}`);
            } else {
                fs.writeFileSync(fullPath, newContent);
                console.log(`📄 REMPLACEMENT COMPLET : ${filePath}`);
            }

        } catch (e) {
            console.error(`❌ Erreur critique sur le fichier :`, e.message);
        }
    });

    // On vide update.txt après le traitement
    fs.writeFileSync(inputFile, '');
}

applyUpdate();