// ====== CONFIG .env ======
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

const mongoUri = process.env.MONGODB_URI;

// ====== Middlewares =======
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));


// ====== Connexion MongoDB =======
mongoose
  .connect(mongoUri)
  .then(() => console.log('✅ Connexion à MongoDB Atlas établie !'))
  .catch((err) => console.error('❌ Erreur de connexion à MongoDB Atlas :', err));

// ====== Schema =======
const PlayerSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  classroom: String,
  validatedQuestions: [String],
  validatedLevels: [String],
  created_at: { type: Date, default: Date.now },
});

const Player = mongoose.model('Player', PlayerSchema, 'players');

// ====== Fonctions de Normalisation =======
function normalizeBase(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[-'’._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function nameTokens(str) {
  return normalizeBase(str)
    .split(' ')
    .filter((tok) => tok.length >= 2);
}
function normalizeClassroom(c) {
  return normalizeBase(c)
    .replace(/(?<=\d)(e|de|d)/, '')
    .toUpperCase();
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
      return inputFirstTokens.some(tok => dbFirstTokens.includes(tok)) && inputLastTokens.some(tok => dbLastTokens.includes(tok));
    });

    if (!found) return res.status(404).json({ ok: false, error: 'Élève introuvable.' });
    
    return res.status(200).json({ ok: true, id: found._id, firstName: found.firstName, lastName: found.lastName, classroom: found.classroom });
  } catch (err) {
    console.error('Erreur register:', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

// Route de Sauvegarde de Progression (avec logs améliorés)
app.post('/api/save-progress', async (req, res) => {
  try {
    const { playerId, progressType, value } = req.body;
    console.log(`[SERVEUR] Demande reçue pour sauvegarder: ${progressType} = ${value} pour l'élève ID ${playerId}`);
    const player = await Player.findById(playerId);
    if (!player) {
      console.log(`[SERVEUR] ERREUR: Joueur avec ID ${playerId} non trouvé.`);
      return res.status(404).json({ message: 'Joueur non trouvé.' });
    }
    
    let updated = false;

    if (progressType === 'level' && !player.validatedLevels.includes(value)) {
      player.validatedLevels.push(value);
      updated = true;
    } else if (progressType === 'question' && !player.validatedQuestions.includes(value)) {
      player.validatedQuestions.push(value);
      updated = true;
    }

    if (updated) {
        await player.save();
        console.log(`[SERVEUR] ✅ Progression de ${player.firstName} ${player.lastName} MISE À JOUR.`);
        // CORRECTION : On affiche les deux tableaux pour un meilleur débogage
        console.log(`   --> Niveaux validés:   [${player.validatedLevels.join(', ')}]`);
        console.log(`   --> Questions validées: [${player.validatedQuestions.join(', ')}]`);
    } else {
        console.log(`[SERVEUR] 🤷 Progression déjà à jour pour ${player.firstName}. Aucune modification.`);
    }
    
    return res.status(200).json({ message: 'Progression traitée.' });
  } catch (err) {
    console.error('[SERVEUR] ❌ ERREUR CRITIQUE lors de la sauvegarde:', err);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Route pour la liste des joueurs (Prof)
app.get('/api/players', async (req, res) => {
  try {
    const players = await Player.find().sort({ lastName: 1, firstName: 1 }); // Tri par ordre alphabétique
    res.status(200).json(players);
  } catch (err) { 
      console.error('[SERVEUR] Erreur /api/players:', err);
      res.status(500).json({ message: 'Erreur serveur.' }); 
    }
});

// Routes de Réinitialisation
app.post('/api/reset-player', async (req, res) => {
  try {
    const { playerId } = req.body;
    const player = await Player.findByIdAndUpdate(playerId, { $set: { validatedQuestions: [], validatedLevels: [] } }, { new: true });
    if (!player) return res.status(404).json({ message: 'Joueur non trouvé.' });
    console.log(`[SERVEUR] Progression de ${player.firstName} ${player.lastName} réinitialisée.`);
    res.status(200).json({ message: `Progression de ${player.firstName} réinitialisée.` });
  } catch (err) { 
      console.error('[SERVEUR] Erreur /api/reset-player:', err);
      res.status(500).json({ message: 'Erreur serveur.' }); 
    }
});

app.post('/api/reset-all-players', async (req, res) => {
  try {
    await Player.updateMany({}, { $set: { validatedQuestions: [], validatedLevels: [] } });
    console.log('[SERVEUR] Progression de TOUS les élèves réinitialisée.');
    res.status(200).json({ message: 'Progression de tous les élèves réinitialisée.' });
  } catch (err) { 
      console.error('[SERVEUR] Erreur /api/reset-all-players:', err);
      res.status(500).json({ message: 'Erreur serveur.' }); 
    }
});

// ====== START SERVER =======
app.listen(port, () => {
  console.log(`✅ Serveur Express lancé sur http://localhost:${port}`);
});