if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// ====== SERVIR LES FICHIERS STATIQUES =======
// __dirname = /5eEntraineur/src
// On veut servir le dossier img qui est dans /5eEntraineur/
app.use('/img', express.static(path.join(__dirname, '..', 'img')));

const mongoUri = process.env.MONGODB_URI;

// ====== Connexion MongoDB =======
mongoose.connect(mongoUri)
    .then(() => console.log('✅ Connexion à MongoDB Atlas établie !'))
    .catch(err => console.error('❌ Erreur de connexion à MongoDB Atlas :', err));


// ====== Schema =======

const PlayerSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    classroom: String,
    validatedQuestions: [String],
    validatedLevels: [String],
    created_at: { type: Date, default: Date.now }
});

const Player = mongoose.model('Player', PlayerSchema, 'players');


// ====== NORMALISATION =======

function normalize(str) {
    return (str || '')
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "") // enlève accents
        .replace(/\s+/g, " ")           // espaces multiples -> un seul
        .trim()
        .toLowerCase();
}

function normalizeClassroom(c) {
    return normalize(c)
        .replace(/(?<=\d)(e|de|d)/, "") // 2de -> 2 ; 2d -> 2
        .toUpperCase();                 // 2a -> 2A
}


// ====== ROUTE LOGIN =======

app.post('/api/register', async (req, res) => {
    try {
        const { firstName, lastName, classroom } = req.body;

        if (!firstName || !lastName || !classroom) {
            return res.status(400).json({ ok: false, error: "Champs manquants." });
        }

        const normFirst = normalize(firstName);
        const normLast = normalize(lastName);
        const normClass = normalizeClassroom(classroom);

        // Fusion 2C et 2D
        const classesToCheck =
            normClass === '2C' || normClass === '2D'
                ? ['2CD']
                : [normClass];

        // On récupère tous les élèves de cette classe
        const all = await Player.find({
            classroom: { $in: classesToCheck }
        });

        // On compare les noms normalisés côté Node
        const found = all.find(p =>
            normalize(p.firstName) === normFirst &&
            normalize(p.lastName) === normLast
        );

        if (!found) {
            return res.status(404).json({ ok: false, error: "Élève introuvable." });
        }

        return res.status(200).json({
            ok: true,
            message: "Connexion réussie",
            id: found._id,
            firstName: found.firstName,
            lastName: found.lastName,
            classroom: found.classroom
        });

    } catch (err) {
        console.error("Erreur register:", err);
        res.status(500).json({ ok: false, error: "Erreur serveur." });
    }
});


// ====== SAVE PROGRESS =======

app.post('/api/save-progress', async (req, res) => {
    try {
        const { playerId, progressType, value } = req.body;

        const player = await Player.findById(playerId);
        if (!player) {
            return res.status(404).json({ message: "Joueur non trouvé." });
        }

        if (progressType === "level" && !player.validatedLevels.includes(value)) {
            player.validatedLevels.push(value);
        }

        if (progressType === "question" && !player.validatedQuestions.includes(value)) {
            player.validatedQuestions.push(value);
        }

        await player.save();
        return res.status(200).json({ message: "Progression sauvegardée !" });

    } catch (err) {
        console.error("Erreur save-progress:", err);
        res.status(500).json({ message: "Erreur serveur." });
    }
});


// ====== LISTE PROF =======

app.get('/api/players', async (req, res) => {
    try {
        const players = await Player.find().sort({ created_at: -1 });
        res.status(200).json(players);
    } catch (err) {
        console.error("Erreur players:", err);
        res.status(500).json({ message: "Erreur serveur." });
    }
});


// ====== SERVE INDEX =======

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});


// ====== START SERVER =======

app.listen(port, () => {
    console.log(`✅ Serveur Express lancé sur http://localhost:${port}`);
    console.log(`🖼️ Dossier images: ${path.join(__dirname, '..', 'img')}`);
});