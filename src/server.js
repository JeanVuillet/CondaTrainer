// AJOUT IMPORTANT: Charge les variables d'environnement du fichier .env en local.
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

// --- Initialisation et Configuration ---
const app = express();
const port = process.env.PORT || 3000; 

app.use(express.json());

const mongoUri = process.env.MONGODB_URI;

// --- Connexion MongoDB ---
mongoose.connect(mongoUri)
    .then(() => console.log('Connexion à MongoDB Atlas établie !'))
    .catch(err => console.error('Erreur de connexion à MongoDB Atlas :', err));

// --- Schéma et Modèle ---
const PlayerSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    classroom: String,
    validatedQuestions: [String], // Pour stocker les IDs des questions réussies
    validatedLevels: [String],     // Pour stocker les IDs des niveaux réussis
    created_at: { type: Date, default: Date.now }
});

const Player = mongoose.model('Player', PlayerSchema, 'players'); 

// --- Correction des Chemins Statiques (Frontend) ---
app.use(express.static(path.join(__dirname, '..'))); 

// --- ROUTES API (DOIVENT ÊTRE DÉCLARÉES AVANT LA ROUTE GÉNÉRIQUE '/') ---

// 🔑 ROUTE CORRIGÉE : Inscription/Connexion du Joueur (API appelée par le formulaire)
app.post('/api/register', async (req, res) => {
    try {
        const { firstName, lastName, classroom } = req.body;
        
        // Chercher si le joueur existe déjà
        let player = await Player.findOne({ firstName, lastName, classroom });

        if (!player) {
            // Créer un nouveau joueur s'il n'existe pas
            player = new Player({ firstName, lastName, classroom });
            await player.save();
        }

        // Répondre avec les données du joueur (en JSON)
        res.status(200).json({ 
            ok: true,
            message: 'Connexion/Inscription réussie!', 
            id: player._id,
            firstName: player.firstName,
            lastName: player.lastName,
            classroom: player.classroom
        });

    } catch (err) {
        console.error('Erreur lors de l\'inscription/connexion:', err);
        res.status(500).json({ 
            ok: false,
            error: 'Erreur serveur lors de l\'authentification.', 
            details: err.message
        });
    }
});


// Route pour la sauvegarde de la progression (appelée par le quiz)
app.post('/api/save-progress', async (req, res) => {
    try {
        const { playerId, progressType, value } = req.body;
        
        const player = await Player.findById(playerId);

        if (!player) {
            return res.status(404).json({ message: 'Joueur non trouvé.' });
        }

        if (progressType === 'level' && !player.validatedLevels.includes(value)) {
            player.validatedLevels.push(value);
            // Si vous mettez à jour des questions, il faudrait une logique ici aussi
        }
        
        await player.save();
        
        res.status(200).json({ message: 'Progression sauvegardée !' });

    } catch (err) {
        console.error('Erreur lors de la sauvegarde de progression:', err);
        res.status(500).json({ 
            message: 'Erreur lors de la sauvegarde de progression.', 
            error: err.message
        });
    }
});


// Route pour récupérer tous les joueurs (utilisée par le Professeur)
app.get('/api/players', async (req, res) => {
    try {
        // Récupérer tous les joueurs, triés par date d'inscription
        const players = await Player.find().sort({ created_at: -1 }); 
        res.status(200).json(players);
    } catch (error) {
        console.error('Erreur lors de la récupération des joueurs:', error);
        res.status(500).json({ message: 'Erreur serveur lors de la récupération des joueurs.' });
    }
});


// --- ROUTE GÉNÉRIQUE (DOIT ÊTRE DÉCLARÉE EN DERNIER) ---
// Route principale pour servir index.html (pour toutes les autres requêtes GET non trouvées)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});


// --- Démarrage du serveur ---
app.listen(port, () => {
    console.log(`Serveur Express en cours d'exécution sur le port ${port}`);
});