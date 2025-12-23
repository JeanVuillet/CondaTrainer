const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const fetch = require('node-fetch');
if (!global.fetch) {
  global.fetch = fetch;
  global.Headers = fetch.Headers;
  global.Request = fetch.Request;
  global.Response = fetch.Response;
}

const express = require('express');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// --- 1. INITIALISATION ---
const app = express();
const port = process.env.PORT || 3000;

const mongoUri = process.env.MONGODB_URI;
const geminiKey = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.0-flash"; 

if (!mongoUri) { console.error('❌ ERREUR : MONGODB_URI manquant'); process.exit(1); }

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

mongoose.connect(mongoUri)
  .then(() => console.log('✅ MongoDB Connecté'))
  .catch(err => console.error('❌ Erreur Mongo:', err));

// --- 2. CONFIG CLOUDINARY ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: '5e-entraineur', 
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'pdf'], 
    resource_type: 'auto' 
  },
});
const upload = multer({ storage: storage });

// --- 3. SCHEMAS BDD ---
const PlayerSchema = new mongoose.Schema({
  firstName: String, lastName: String, classroom: String,
  validatedQuestions: [String],
  validatedLevels: { type: [mongoose.Schema.Types.Mixed], default: [] },
  spellingMistakes: { type: [{ wrong: String, correct: String, date: { type: Date, default: Date.now } }], default: [] },
  activityLogs: { type: [{ action: String, detail: String, date: { type: Date, default: Date.now } }], default: [] },
  created_at: { type: Date, default: Date.now },
}, { minimize: false });
const Player = mongoose.model('Player', PlayerSchema, 'players');

const HomeworkSchema = new mongoose.Schema({
  title: String,
  classroom: String,
  levels: [{
      instruction: String,
      attachmentUrls: [String]
  }],
  date: { type: Date, default: Date.now }
});
const Homework = mongoose.model('Homework', HomeworkSchema, 'homeworks');

const BugSchema = new mongoose.Schema({
  reporterName: String, classroom: String, description: String, gameChapter: String, date: { type: Date, default: Date.now },
});
const Bug = mongoose.model('Bug', BugSchema, 'bugs');

// --- 4. UTILITAIRES ---
function normalizeBase(str) { return (str || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase(); }
function nameTokens(str) { return normalizeBase(str).split(/[\s-']+/).filter(t => t.length >= 2); }
function normalizeClassroom(c) { return normalizeBase(c).replace(/(?<=\d)(e|de|d)/, '').toUpperCase(); }

// --- 5. ROUTES ---

// Upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Pas de fichier" });
  res.json({ ok: true, imageUrl: req.file.path });
});

// Devoirs (CRUD)
app.post('/api/homework', async (req, res) => {
    try { const hw = new Homework(req.body); await hw.save(); res.json({ ok: true }); } catch(e) { res.status(500).json({ ok: false }); }
});

app.get('/api/homework/:class', async (req, res) => {
    try { const cls = req.params.class; const list = await Homework.find({ $or: [{ classroom: cls }, { classroom: "Toutes" }] }).sort({ date: -1 }); res.json(list); } catch(e) { res.status(500).json([]); }
});

app.get('/api/homework-all', async (req, res) => {
    try { const list = await Homework.find().sort({ date: -1 }); res.json(list); } catch(e) { res.status(500).json([]); }
});

// Mise à jour d'un devoir (ordre images)
app.put('/api/homework/:id', async (req, res) => {
    try {
        const { levels } = req.body;
        await Homework.findByIdAndUpdate(req.params.id, { levels: levels });
        res.json({ ok: true });
    } catch(e) {
        console.error("Erreur update:", e);
        res.status(500).json({ ok: false });
    }
});

app.delete('/api/homework/:id', async (req, res) => {
    try { await Homework.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch(e) { res.status(500).json({ ok: false }); }
});

// === ROUTE 1 : ANALYSE DEVOIR MAISON (Chapitre 5 - Images) ===
app.post('/api/analyze-homework', async (req, res) => {
    const { imageUrl, userText, homeworkInstruction, teacherDocUrls, classroom, playerId } = req.body;
    
    if (!geminiKey) return res.json({ feedback: "Erreur : Clé IA manquante." });

    try {
        console.log(`🤖 Analyse Devoir pour ${playerId || 'Anonyme'}...`);
        const genAI = new GoogleGenerativeAI(geminiKey);
        // Force JSON pour structurer la réponse (Note, Fautes, Commentaire)
        const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

        let levelInstruction = "Niveau standard.";
        if (classroom) {
            const c = classroom.toUpperCase();
            if (c.startsWith("6") || c.startsWith("5")) levelInstruction = "Niveau COLLÈGE (11-12 ans). Sois bienveillant.";
            else if (c.startsWith("2") || c.startsWith("1")) levelInstruction = "Niveau LYCÉE. Sois précis.";
        }

        const prompt = `
            RÔLE : Professeur correcteur. ${levelInstruction}
            
            TACHE : Corrige ce devoir maison.
            1. Analyse les documents fournis (images).
            2. Vérifie si la réponse de l'élève correspond à la consigne.
            3. Repère les fautes d'orthographe (Liste-les séparément).
            
            CONSIGNE : "${homeworkInstruction}"
            RÉPONSE ÉLÈVE : "${userText}"
            
            FORMAT JSON ATTENDU :
            {
              "content_feedback": "Ton commentaire pédagogique sur le fond (HTML autorisé pour gras/italique)",
              "spelling_corrections": [ { "wrong": "mot_faux", "correct": "mot_juste" } ]
            }
        `;

        let content = [prompt];
        
        // Ajout Docs Prof (Ignore le marqueur BREAK)
        if (teacherDocUrls && Array.isArray(teacherDocUrls)) {
            for (const url of teacherDocUrls) {
                if(!url || url === "BREAK") continue;
                const docResp = await fetch(url);
                const docMime = url.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
                const docBuffer = await docResp.arrayBuffer();
                const docBase64 = Buffer.from(docBuffer).toString('base64');
                content.push({ inlineData: { data: docBase64, mimeType: docMime } });
            }
        }
        
        // Ajout Copie Élève
        if (imageUrl) {
            const imageResp = await fetch(imageUrl);
            const mimeType = imageResp.headers.get("content-type") || "image/jpeg";
            const arrayBuffer = await imageResp.arrayBuffer();
            const base64Image = Buffer.from(arrayBuffer).toString('base64');
            content.push({ inlineData: { data: base64Image, mimeType: mimeType } });
        }

        const result = await model.generateContent(content);
        const jsonResponse = JSON.parse(result.response.text());

        // Sauvegarde fautes
        if (playerId && mongoose.Types.ObjectId.isValid(playerId) && jsonResponse.spelling_corrections.length > 0) {
            try {
                const player = await Player.findById(playerId);
                if (player) {
                    let changed = false;
                    jsonResponse.spelling_corrections.forEach(c => {
                        if (!player.spellingMistakes.some(m => m.wrong.toLowerCase() === c.wrong.toLowerCase())) {
                            player.spellingMistakes.push({ wrong: c.wrong, correct: c.correct });
                            changed = true;
                        }
                    });
                    if (changed) await player.save();
                }
            } catch (err) { console.error("Erreur save fautes", err); }
        }

        // Construction HTML pour l'élève
        let htmlOutput = `<h4>💡 Correction du Fond</h4><p>${jsonResponse.content_feedback}</p>`;
        htmlOutput += `<hr style="margin:15px 0; border:0; border-top:1px solid #eee;"><h4>📝 Orthographe</h4>`;
        
        if (jsonResponse.spelling_corrections.length === 0) {
            htmlOutput += `<p style="color:#16a34a;">Aucune faute détectée !</p>`;
        } else {
            htmlOutput += `<ul style="list-style:none; padding:0;">`;
            jsonResponse.spelling_corrections.forEach(c => {
                htmlOutput += `<li style="margin-bottom:5px; color:#b91c1c;"><s>${c.wrong}</s> 👉 <b>${c.correct}</b></li>`;
            });
            htmlOutput += `</ul>`;
        }

        res.json({ feedback: htmlOutput });

    } catch (error) { res.json({ feedback: `Erreur technique : ${error.message}` }); }
});

// === ROUTE 2 : VERIFICATION INTELLIGENTE (Chapitre 4 Rédaction & Chapitre 1 Zombie) ===
// (C'est ICI que j'ai remis votre logique retrouvée)
app.post('/api/verify-answer-ai', async (req, res) => {
  const { question, userAnswer, expectedAnswer, playerId, redactionMode, context } = req.body;
  let finalResponse = null;

  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

      let systemInstruction = "";

      // --- LOGIQUE SPÉCIFIQUE RÉDACTION (INTRO/ARGUMENT/EXEMPLE/CONCLUSION) ---
      if (redactionMode) {
        let criteria = "";
        
        if (redactionMode === "intro") {
            criteria = `
            CRITÈRES STRICTS POUR L'INTRODUCTION :
            1. Présence d'une définition des termes du sujet.
            2. Contexte spatial (Géo) ou Temporel (Histoire) clair (Bornes).
            3. Formulation d'une Problématique (Question centrale).
            4. Annonce du plan claire.
            Si un élément manque, signale-le dans 'missing_points'.`;
        } else if (redactionMode === "argument") {
            criteria = `
            CRITÈRES STRICTS POUR L'ARGUMENTATION :
            1. L'argument doit répondre directement à la partie du plan indiquée.
            2. Il doit être une idée générale, pas un exemple précis.
            3. Il doit être clair et justifié.`;
        } else if (redactionMode === "exemple") {
            criteria = `
            CRITÈRES STRICTS POUR L'EXEMPLE :
            1. L'exemple doit être un fait précis, daté, chiffré ou localisé.
            2. Il doit illustrer concrètement l'argument donné.`;
        } else if (redactionMode === "conclusion") {
            criteria = `
            CRITÈRES STRICTS POUR LA CONCLUSION :
            1. Réponse claire à la problématique.
            2. Bilan des grandes parties.
            3. Ouverture vers un autre sujet.`;
        }

        systemInstruction = `
            RÔLE : Professeur d'Histoire-Géo exigeant (Niveau Lycée/2de).
            TACHE : Corriger la rédaction de l'élève.
            ${criteria}
            ATTENDU DU PROF : "${expectedAnswer}"
            CONTEXTE : "${context || ''}"
            FORMAT JSON ATTENDU :
            {
                "status": "correct" ou "incorrect",
                "grade": "Note sur 20",
                "short_comment": "Appréciation globale courte",
                "advice": "Conseil méthodologique",
                "good_points": ["Liste des éléments réussis"],
                "missing_points": ["Liste des éléments manquants"],
                "corrections": [ { "wrong": "mot_faute", "correct": "mot_corrigé" } ]
            }
        `;
      } 
      // --- LOGIQUE ZOMBIE (QUIZ) ---
      else {
        systemInstruction = `
            RÔLE : Quiz Master.
            TACHE : Vérifier si la réponse correspond à l'attendu.
            QUESTION : "${question}"
            ATTENDU : "${expectedAnswer}"
            FORMAT JSON : { "status": "correct"|"incorrect", "feedback": "Explication", "corrections": [] }
        `;
      }

      const prompt = `REPONSE ELEVE : "${userAnswer}"\n\nANALYSE SELON LES CRITERES : ${systemInstruction}`;
      
      const result = await model.generateContent(prompt);
      finalResponse = JSON.parse(result.response.text());

    } catch (error) { console.error(`⚠️ [GEMINI] Échec: ${error.message}`); }
  }

  if (!finalResponse) { finalResponse = { status: "incorrect", feedback: "Erreur IA.", corrections: [] }; }
  
  // Sauvegarde des fautes (Commun à Zombie et Rédaction)
  if (finalResponse.corrections && finalResponse.corrections.length > 0 && playerId && mongoose.Types.ObjectId.isValid(playerId)) {
      try {
          const player = await Player.findById(playerId);
          if (player) {
              let changed = false;
              finalResponse.corrections.forEach(c => {
                  if (c.wrong && c.wrong.length < 30 && !player.spellingMistakes.some(m => m.wrong.toLowerCase() === c.wrong.toLowerCase())) {
                      player.spellingMistakes.push({ wrong: c.wrong, correct: c.correct });
                      changed = true;
                  }
              });
              if (changed) await player.save();
          }
      } catch (e) { console.error("Err save fautes", e); }
  }
  
  res.json(finalResponse);
});

// Register / Login / Utils
app.post('/api/register', async (req, res) => {
  try {
    const { firstName, lastName, classroom } = req.body;
    if (!firstName || !lastName || !classroom) return res.status(400).json({ ok: false });
    if(firstName.toLowerCase() === "eleve" && lastName.toLowerCase() === "test") {
       let testPlayer = await Player.findOne({ firstName: "Eleve", lastName: "Test" });
       if (!testPlayer) { testPlayer = new Player({ firstName: "Eleve", lastName: "Test", classroom: classroom }); await testPlayer.save(); }
       return res.json({ ok: true, id: testPlayer._id, firstName: "Eleve", lastName: "Test", classroom: classroom });
    }
    const inputFirst = nameTokens(firstName); const inputLast = nameTokens(lastName); const normClass = normalizeClassroom(classroom);
    let classes = [normClass]; if (['2C', '2D'].includes(normClass)) classes = ['2C', '2D', '2CD']; if (['6', '6D'].includes(normClass)) classes = ['6', '6D'];
    const all = await Player.find({ classroom: { $in: classes } });
    const found = all.find(p => { const dbFirst = nameTokens(p.firstName); const dbLast = nameTokens(p.lastName); return inputFirst.some(t => dbFirst.includes(t)) && inputLast.some(t => dbLast.includes(t)); });
    if (!found) return res.status(404).json({ ok: false, error: "Élève introuvable." });
    found.activityLogs.push({ action: "Connexion", detail: "Login" }); await found.save();
    return res.json({ ok: true, id: found._id, firstName: found.firstName, lastName: found.lastName, classroom: found.classroom });
  } catch (e) { res.status(500).json({ ok: false }); }
});

app.post('/api/log-activity', async (req, res) => { try { const p = await Player.findById(req.body.playerId); if(p) { p.activityLogs.push({ action: req.body.action, detail: req.body.detail }); await p.save(); } res.json({ok:true}); } catch(e) { res.status(500).json({ok:false}); } });
app.post('/api/save-progress', async (req, res) => { res.json({ message: 'Saved' }); });
app.get('/api/players', async (req, res) => { res.json(await Player.find().sort({ lastName: 1 })); });
app.get('/api/player-progress/:playerId', async (req, res) => { try { const p = await Player.findById(req.params.playerId); if(!p) return res.status(404).json({}); res.json({ validatedLevels: p.validatedLevels, validatedQuestions: p.validatedQuestions, spellingMistakes: p.spellingMistakes || [], activityLogs: p.activityLogs || [] }); } catch(e) { res.status(500).json({}); } });
app.post('/api/reset-player', async (req, res) => { await Player.findByIdAndUpdate(req.body.playerId, { validatedQuestions: [], validatedLevels: [], spellingMistakes: [], activityLogs: [] }); res.json({msg:'ok'}); });
app.post('/api/reset-all-players', async (req, res) => { await Player.updateMany({}, { validatedQuestions: [], validatedLevels: [], spellingMistakes: [], activityLogs: [] }); res.json({msg:'ok'}); });
app.post('/api/report-bug', async (req, res) => { const newBug = new Bug(req.body); await newBug.save(); res.json({ok:true}); });
app.get('/api/bugs', async(req,res)=>{ res.json(await Bug.find().sort({date:-1})); });
app.delete('/api/bugs/:id', async(req,res)=>{ await Bug.findByIdAndDelete(req.params.id); res.json({ok:true}); });
app.delete('/api/spelling-mistake/:playerId/:word', async (req, res) => { try { const p = await Player.findById(req.params.playerId); if(p) { p.spellingMistakes = p.spellingMistakes.filter(m => m.wrong !== req.params.word); await p.save(); } res.json({ok:true}); } catch(e) { res.status(500).json({ok:false}); } });

app.listen(port, () => { console.log(`✅ Serveur démarré port ${port}`); });