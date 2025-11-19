// ====== CONFIG .env ======
const path = require('path');
// On force dotenv à aller chercher le .env à la RACINE du projet
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

// ====== URI MONGO =======
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('❌ ERREUR CRITIQUE : MONGODB_URI est undefined.');
  process.exit(1);
}

// ====== Middlewares =======
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ====== Connexion MongoDB =======
mongoose
  .connect(mongoUri)
  .then(() => console.log('✅ Connexion à MongoDB Atlas établie !'))
  .catch((err) => console.error('❌ Erreur de connexion à MongoDB Atlas :', err));

// ====== Schema (HYBRIDE POUR EVITER LES CRASHS) =======
const PlayerSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  classroom: String,
  validatedQuestions: [String],
  // "Mixed" permet de stocker des Strings (vieux format) ET des Objets (nouveau format)
  // On nettoiera les données via le code, pas via le schéma.
  validatedLevels: { type: [mongoose.Schema.Types.Mixed], default: [] },
  created_at: { type: Date, default: Date.now },
}, { minimize: false }); // Important : empêche Mongoose de supprimer les objets vides

const Player = mongoose.model('Player', PlayerSchema, 'players');

// ====== Fonctions de Normalisation =======
function normalizeBase(str) {
  return (str || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[-'’._]/g, ' ').trim().toLowerCase();
}

function nameTokens(str) {
  return normalizeBase(str).split(' ').filter((tok) => tok.length >= 2);
}

function normalizeClassroom(c) {
  return normalizeBase(c).replace(/(?<=\d)(e|de|d)/, '').toUpperCase();
}

// ====== ROUTES API =======

// Route de Login/Register
app.post('/api/register', async (req, res) => {
  try {
    const { firstName, lastName, classroom } = req.body;
    if (!firstName || !lastName || !classroom) return res.status(400).json({ ok: false, error: 'Champs manquants.' });

    const inputFirstTokens = nameTokens(firstName);
    const inputLastTokens = nameTokens(lastName);
    const normClass = normalizeClassroom(classroom);

    let classesToCheck = [normClass];
    if (normClass === '2C' || normClass === '2D') classesToCheck = ['2C', '2D', '2CD'];
    if (normClass === '6' || normClass === '6D') classesToCheck = ['6', '6D'];

    const all = await Player.find({ classroom: { $in: classesToCheck } });
    const found = all.find((p) => {
      const dbFirstTokens = nameTokens(p.firstName);
      const dbLastTokens = nameTokens(p.lastName);
      return (
        inputFirstTokens.some((tok) => dbFirstTokens.includes(tok)) &&
        inputLastTokens.some((tok) => dbLastTokens.includes(tok))
      );
    });

    if (!found) {
      console.log(`[LOGIN] Échec pour ${firstName} ${lastName} (${classroom})`);
      return res.status(404).json({ ok: false, error: 'Élève introuvable.' });
    }

    console.log(`[LOGIN] Succès pour ${found.firstName} ${found.lastName}`);
    return res.status(200).json({
      ok: true,
      id: found._id,
      firstName: found.firstName,
      lastName: found.lastName,
      classroom: found.classroom,
    });
  } catch (err) {
    console.error('Erreur register:', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

// --- ROUTE DE SAUVEGARDE (DEBUGGÉE) ---
app.post('/api/save-progress', async (req, res) => {
  try {
    const { playerId, progressType, value, grade } = req.body;
    
    console.log(`\n[SERVEUR] 📩 REÇU: ${progressType} = ${value} (Note: ${grade || 'N/A'}) pour ID ${playerId}`);

    const player = await Player.findById(playerId);
    if (!player) {
      console.error(`[SERVEUR] ❌ Joueur introuvable !`);
      return res.status(404).json({ message: 'Joueur non trouvé.' });
    }

    // --- ETAPE 1 : NETTOYAGE DES DONNÉES ---
    // On force la conversion de tout ce qui traine en "String" vers un "Objet"
    let cleanLevels = [];
    let wasDirty = false;

    if (player.validatedLevels && Array.isArray(player.validatedLevels)) {
      player.validatedLevels.forEach(item => {
        if (typeof item === 'string') {
          // C'est une vieille donnée, on convertit
          cleanLevels.push({ levelId: item, grade: 'Validé', date: new Date() });
          wasDirty = true;
        } else if (typeof item === 'object' && item !== null && item.levelId) {
          // C'est déjà propre, on garde
          cleanLevels.push(item);
        }
      });
    }
    
    // On remplace par la liste propre
    player.validatedLevels = cleanLevels;
    if (wasDirty) console.log(`[SERVEUR] 🧹 Données nettoyées (Conversion String -> Objet effectuée).`);

    // --- ETAPE 2 : MISE A JOUR LOGIQUE ---
    let hasChanged = false;

    if (progressType === 'level') {
      const levelId = value;
      const newGrade = grade || 'C';

      // Recherche dans la liste PROPRE
      const existingIndex = player.validatedLevels.findIndex(l => l.levelId === levelId);

      if (existingIndex > -1) {
        // Le niveau existe : on met à jour la note
        console.log(`[SERVEUR] 🔄 Mise à jour niveau existant : ${player.validatedLevels[existingIndex].grade} -> ${newGrade}`);
        player.validatedLevels[existingIndex].grade = newGrade;
        player.validatedLevels[existingIndex].date = new Date();
        hasChanged = true;
      } else {
        // Le niveau n'existe pas : on l'ajoute
        console.log(`[SERVEUR] ➕ Nouveau niveau ajouté : ${levelId} (${newGrade})`);
        player.validatedLevels.push({ levelId: levelId, grade: newGrade, date: new Date() });
        hasChanged = true;
      }

    } else if (progressType === 'question') {
      if (!player.validatedQuestions.includes(value)) {
        player.validatedQuestions.push(value);
        hasChanged = true;
        // console.log(`[SERVEUR] Question ajoutée : ${value}`); // Un peu verbeux, décommente si besoin
      }
    }

    // --- ETAPE 3 : SAUVEGARDE EN BDD ---
    if (hasChanged || wasDirty) {
      // TRÈS IMPORTANT : Dire à Mongoose que ce champ "Mixed" a changé
      player.markModified('validatedLevels'); 
      
      await player.save();
      console.log(`[SERVEUR] ✅ SAUVEGARDE BDD RÉUSSIE pour ${player.firstName}.`);
      
      // Petit log de contrôle
      const summary = player.validatedLevels.map(l => `${l.levelId}:${l.grade}`).join(', ');
      console.log(`[SERVEUR] 📊 État actuel : [${summary}]`);
    } else {
      console.log(`[SERVEUR] 🤷 Aucune modification nécessaire (déjà à jour).`);
    }

    return res.status(200).json({ message: 'Progression traitée.' });

  } catch (err) {
    console.error('[SERVEUR] ❌ CRASH SAUVEGARDE:', err);
    res.status(500).json({ message: 'Erreur serveur.', error: err.message });
  }
});

// Route pour la liste des joueurs (Prof)
app.get('/api/players', async (req, res) => {
  try {
    const players = await Player.find().sort({ lastName: 1, firstName: 1 });
    res.status(200).json(players);
  } catch (err) {
    console.error('[SERVEUR] Erreur /api/players:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Route de réinitialisation d'un joueur
app.post('/api/reset-player', async (req, res) => {
  try {
    const { playerId } = req.body;
    await Player.findByIdAndUpdate(playerId, { $set: { validatedQuestions: [], validatedLevels: [] } });
    console.log(`[SERVEUR] Reset joueur ${playerId}`);
    res.status(200).json({ message: `Reset OK` });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Route de réinitialisation de tous les joueurs
app.post('/api/reset-all-players', async (req, res) => {
  try {
    await Player.updateMany({}, { $set: { validatedQuestions: [], validatedLevels: [] } });
    console.log('[SERVEUR] Reset GLOBAL effectué.');
    res.status(200).json({ message: 'Reset All OK' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Route pour récupérer la progression
app.get('/api/player-progress/:playerId', async (req, res) => {
  try {
    const player = await Player.findById(req.params.playerId);
    if (!player) return res.status(404).json({ message: 'Joueur non trouvé.' });
    
    // On renvoie tel quel, le front se débrouillera
    res.status(200).json({
      validatedLevels: player.validatedLevels,
      validatedQuestions: player.validatedQuestions,
    });
  } catch (err) {
    console.error('[SERVEUR] Erreur /api/player-progress:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Reset Chapitre
app.post('/api/reset-player-chapter', async (req, res) => {
  try {
    const { playerId, levelIds } = req.body;
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ message: 'Joueur non trouvé.' });

    // Filtre compatible String/Objet
    player.validatedLevels = player.validatedLevels.filter(l => {
      const id = (typeof l === 'string') ? l : l.levelId;
      return !levelIds.includes(id);
    });

    player.validatedQuestions = player.validatedQuestions.filter(q => 
      !levelIds.some(lvlId => q.startsWith(lvlId + '-'))
    );

    player.markModified('validatedLevels');
    await player.save();
    console.log(`[SERVEUR] Chapitre réinitialisé pour ${player.firstName}`);

    res.status(200).json({ message: 'Chapitre réinitialisé.' });
  } catch (err) {
    console.error('[SERVEUR] Erreur reset chapter:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ====== START SERVER =======
app.listen(port, () => {
  console.log(`✅ Serveur Express lancé sur http://localhost:${port}`);
});