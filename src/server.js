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

// [CONFIGURATION] Modèle IA Multimodal Rapide
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

// [SCHEMA MODIFIÉ] Support Multi-Images par niveau
const HomeworkSchema = new mongoose.Schema({
  title: String,
  classroom: String,
  levels: [{
      instruction: String,
      attachmentUrls: [String] // Tableau d'URLs d'images
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

// Upload Fichier
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Pas de fichier" });
  res.json({ ok: true, imageUrl: req.file.path });
});

// Devoirs
app.post('/api/homework', async (req, res) => {
    try { const hw = new Homework(req.body); await hw.save(); res.json({ ok: true }); } catch(e) { res.status(500).json({ ok: false }); }
});

app.get('/api/homework/:class', async (req, res) => {
    try { const cls = req.params.class; const list = await Homework.find({ $or: [{ classroom: cls }, { classroom: "Toutes" }] }).sort({ date: -1 }); res.json(list); } catch(e) { res.status(500).json([]); }
});
app.get('/api/homework-all', async (req, res) => {
    try { const list = await Homework.find().sort({ date: -1 }); res.json(list); } catch(e) { res.status(500).json([]); }
});
app.delete('/api/homework/:id', async (req, res) => {
    try { await Homework.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch(e) { res.status(500).json({ ok: false }); }
});

// === ANALYSE DEVOIR (MULTI-IMAGES) ===
app.post('/api/analyze-homework', async (req, res) => {
    const { imageUrl, userText, homeworkInstruction, teacherDocUrls, classroom } = req.body; 
    // Note: teacherDocUrls est désormais attendu comme un tableau de chaînes
    
    if (!geminiKey) return res.json({ feedback: "Erreur : Clé IA manquante." });

    try {
        console.log(`🤖 Analyse Devoir (Images Multiples)...`);
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        // --- ADAPTATION NIVEAU ---
        let levelInstruction = "Niveau standard.";
        if (classroom) {
            const c = classroom.toUpperCase();
            if (c.startsWith("6") || c.startsWith("5")) levelInstruction = "Niveau COLLÈGE (11-12 ans). Sois simple et indulgent.";
            else if (c.startsWith("2") || c.startsWith("1")) levelInstruction = "Niveau LYCÉE. Sois exigeant.";
        }

        const prompt = `
            RÔLE : Professeur correcteur bienveillant mais précis.
            ${levelInstruction}
            
            1. CONSIGNE DU PROFESSEUR : "${homeworkInstruction}"
            
            2. DOCUMENTS FOURNIS : 
               J'ai joint plusieurs images (documents du sujet ou éléments de correction). Analyse-les toutes pour comprendre le contexte complet.
            
            3. RÉPONSE DE L'ÉLÈVE : "${userText}"
               (Il peut y avoir une photo de sa copie jointe également).
            
            TACHE : 
            - Valide si la réponse est correcte par rapport aux documents.
            - Si c'est faux, explique pourquoi en citant les documents.
            - Corrige l'orthographe si nécessaire.
            - Sois constructif.
        `;

        let content = [prompt];
        
        // A. Ajout des Documents Prof (Tableau)
        if (teacherDocUrls && Array.isArray(teacherDocUrls)) {
            for (const url of teacherDocUrls) {
                if(!url) continue;
                console.log("📥 Lecture Doc Prof:", url);
                const docResp = await fetch(url);
                const docMime = url.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
                const docBuffer = await docResp.arrayBuffer();
                const docBase64 = Buffer.from(docBuffer).toString('base64');
                content.push({ inlineData: { data: docBase64, mimeType: docMime } });
            }
        } 
        
        // B. Ajout de l'Image Élève
        if (imageUrl) {
            console.log("📥 Lecture Copie Élève:", imageUrl);
            const imageResp = await fetch(imageUrl);
            const mimeType = imageResp.headers.get("content-type") || "image/jpeg";
            const arrayBuffer = await imageResp.arrayBuffer();
            const base64Image = Buffer.from(arrayBuffer).toString('base64');
            content.push({ inlineData: { data: base64Image, mimeType: mimeType } });
        }

        const result = await model.generateContent(content);
        res.json({ feedback: result.response.text() });

    } catch (error) {
        console.error("❌ Erreur IA Devoir:", error);
        res.json({ feedback: `Erreur technique : ${error.message}` });
    }
});


// Register / Login
app.post('/api/register', async (req, res) => {
  try {
    const { firstName, lastName, classroom } = req.body;
    if (!firstName || !lastName || !classroom) return res.status(400).json({ ok: false });

    if(firstName.toLowerCase() === "eleve" && lastName.toLowerCase() === "test") {
       let testPlayer = await Player.findOne({ firstName: "Eleve", lastName: "Test" });
       if (!testPlayer) {
           testPlayer = new Player({ firstName: "Eleve", lastName: "Test", classroom: classroom });
           await testPlayer.save();
       }
       testPlayer.activityLogs.push({ action: "Connexion", detail: "Login Test" }); await testPlayer.save();
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

app.post('/api/log-activity', async (req, res) => {
    const { playerId, action, detail } = req.body;
    if(!mongoose.Types.ObjectId.isValid(playerId)) return res.json({ok:true});
    try { const p = await Player.findById(playerId); if(p) { p.activityLogs.push({ action, detail }); await p.save(); } res.json({ok:true}); } catch(e) { res.status(500).json({ok:false}); }
});

app.post('/api/save-progress', async (req, res) => {
    const { playerId, progressType, value, grade } = req.body;
    if(!mongoose.Types.ObjectId.isValid(playerId)) return res.json({ message: 'Skip' });
    try {
        const player = await Player.findById(playerId);
        if (!player) return res.status(404).json({ message: 'Introuvable' });
        let cleanLevels = [];
        if (Array.isArray(player.validatedLevels)) {
            for (let item of player.validatedLevels) {
                if (typeof item === 'string') cleanLevels.push({ levelId: item, grade: 'Validé', date: new Date() });
                else if (typeof item === 'object' && item && item.levelId) cleanLevels.push(item);
            }
        }
        player.validatedLevels = cleanLevels;
        let changed = false;
        if (progressType === 'level') {
            const existingIndex = player.validatedLevels.findIndex(l => l.levelId === value);
            if (existingIndex > -1) { player.validatedLevels[existingIndex].grade = grade || 'C'; player.validatedLevels[existingIndex].date = new Date(); }
            else { player.validatedLevels.push({ levelId: value, grade: grade || 'C', date: new Date() }); }
            player.activityLogs.push({ action: "Niveau Validé", detail: `${value} (${grade})` });
            changed = true;
        } else if (progressType === 'question') { if (!player.validatedQuestions.includes(value)) { player.validatedQuestions.push(value); changed = true; } }
        if (changed) { player.markModified('validatedLevels'); await player.save(); }
        res.json({ message: 'Saved' });
    } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/players', async (req, res) => { res.json(await Player.find().sort({ lastName: 1 })); });
app.get('/api/player-progress/:playerId', async (req, res) => {
    const pid = req.params.playerId;
    if(!mongoose.Types.ObjectId.isValid(pid)) return res.status(400).json({});
    try { const p = await Player.findById(pid); if(!p) return res.status(404).json({}); res.json({ validatedLevels: p.validatedLevels, validatedQuestions: p.validatedQuestions, spellingMistakes: p.spellingMistakes || [], activityLogs: p.activityLogs || [] }); } catch(e) { res.status(500).json({}); }
});

app.post('/api/reset-player-chapter', async (req, res) => {
  const { playerId, levelIds } = req.body; if(!mongoose.Types.ObjectId.isValid(playerId)) return res.json({ message: 'Skip' });
  const p = await Player.findById(playerId);
  if(p) { p.validatedLevels = p.validatedLevels.filter(l => !levelIds.includes((typeof l==='string')?l:l.levelId)); p.validatedQuestions = p.validatedQuestions.filter(q => !levelIds.some(id => q.startsWith(id))); p.markModified('validatedLevels'); await p.save(); }
  res.json({ message: 'Reset' });
});
app.post('/api/reset-player', async (req, res) => { if(!mongoose.Types.ObjectId.isValid(req.body.playerId)) return res.json({msg:'error'}); await Player.findByIdAndUpdate(req.body.playerId, { validatedQuestions: [], validatedLevels: [], spellingMistakes: [], activityLogs: [] }); res.json({msg:'ok'}); });
app.post('/api/reset-all-players', async (req, res) => { await Player.updateMany({}, { validatedQuestions: [], validatedLevels: [], spellingMistakes: [], activityLogs: [] }); res.json({msg:'ok'}); });
app.post('/api/report-bug', async (req, res) => { const newBug = new Bug(req.body); await newBug.save(); res.json({ok:true}); });
app.get('/api/bugs', async(req,res)=>{ res.json(await Bug.find().sort({date:-1})); });
app.delete('/api/bugs/:id', async(req,res)=>{ await Bug.findByIdAndDelete(req.params.id); res.json({ok:true}); });
app.delete('/api/spelling-mistake/:playerId/:word', async (req, res) => { const { playerId, word } = req.params; if(!mongoose.Types.ObjectId.isValid(playerId)) return res.json({ok:true}); try { const p = await Player.findById(playerId); if(p) { p.spellingMistakes = p.spellingMistakes.filter(m => m.wrong !== word); await p.save(); } res.json({ok:true}); } catch(e) { res.status(500).json({ok:false}); } });

// VERIFY (Pour les jeux Zombie/Rédaction)
app.post('/api/verify-answer-ai', async (req, res) => {
  const { question, userAnswer, expectedAnswer, playerId, redactionMode, context } = req.body;
  let finalResponse = null;

  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });

      let instructions = "";
      if (redactionMode) {
        instructions = `MODE NOTATION RÉDACTION. 1.Note/20. 2.Comm Court. 3.Acquis. 4.Manquants. 5.Conseil. 6.Corrections (orthographe seulement). JSON: {status, grade, short_comment, advice, good_points, missing_points, corrections}`;
      } else {
        instructions = `MODE QUIZ. Sens bon = "correct". Sinon "incorrect". JSON: { "status": "...", "feedback": "...", "corrections": [] }`;
      }
      const prompt = `Q: "${question}" Contexte: "${context || ''}" Attendu: "${expectedAnswer}" Elève: "${userAnswer}" CONSIGNES: ${instructions}`;
      const result = await model.generateContent(prompt);
      finalResponse = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());

    } catch (error) { console.error(`⚠️ [GEMINI] Échec: ${error.message}`); }
  }

  if (!finalResponse) { finalResponse = { status: "incorrect", feedback: "Erreur IA.", corrections: [] }; }
  
  if (finalResponse.corrections && finalResponse.corrections.length > 0 && playerId && mongoose.Types.ObjectId.isValid(playerId)) {
      try {
          const player = await Player.findById(playerId);
          if (player) {
              let changed = false;
              finalResponse.corrections.forEach(c => {
                  if (c.wrong && c.wrong.split(' ').length < 4 && !player.spellingMistakes.some(m => m.wrong.toLowerCase() === c.wrong.toLowerCase())) {
                      player.spellingMistakes.push({ wrong: c.wrong, correct: c.correct });
                      changed = true;
                  }
              });
              if (changed) await player.save();
          }
      } catch (e) { }
  }
  res.json(finalResponse);
});

app.listen(port, () => { console.log(`✅ Serveur démarré port ${port}`); });