// src/server.js - VERSION CORRIGÉE ANTI-CRASH

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// Polyfill pour fetch (Node < 18)
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

const app = express();
const port = process.env.PORT || 3000;

const mongoUri = process.env.MONGODB_URI;
const geminiKey = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.0-flash"; 

if (!mongoUri) { 
    console.error('❌ ERREUR : MONGODB_URI manquant dans .env'); 
    process.exit(1); 
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

mongoose.connect(mongoUri)
  .then(() => console.log('✅ MongoDB Connecté'))
  .catch(err => console.error('❌ Erreur Mongo:', err));

// ====== SCHEMA JOUEUR ======
const PlayerSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  classroom: String,
  validatedQuestions: [String],
  validatedLevels: { type: [mongoose.Schema.Types.Mixed], default: [] },
  created_at: { type: Date, default: Date.now },
}, { minimize: false });

const Player = mongoose.model('Player', PlayerSchema, 'players');

// ====== SCHEMA BUG ======
const BugSchema = new mongoose.Schema({
  reporterName: String,
  classroom: String,
  description: String,
  gameChapter: String,
  date: { type: Date, default: Date.now },
});
const Bug = mongoose.model('Bug', BugSchema, 'bugs');

// ====== UTILITAIRES ======
function normalizeBase(str) {
  return (str || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
}
function nameTokens(str) { return normalizeBase(str).split(/[\s-']+/).filter(t => t.length >= 2); }
function normalizeClassroom(c) { return normalizeBase(c).replace(/(?<=\d)(e|de|d)/, '').toUpperCase(); }

function calculateSimilarity(s1, s2) { 
  let longer = s1; let shorter = s2;
  if (s1.length < s2.length) { longer = s2; shorter = s1; }
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}
function editDistance(s1, s2) {
  s1 = s1.toLowerCase(); s2 = s2.toLowerCase();
  let costs = new Array();
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i == 0) costs[j] = j;
      else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) != s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

// ====== ROUTES API ======

app.post('/api/register', async (req, res) => {
  try {
    const { firstName, lastName, classroom } = req.body;
    if (!firstName || !lastName || !classroom) return res.status(400).json({ ok: false });
    
    // CAS SPECIAL : Mode Test / Prof (Pour éviter de chercher en BDD)
    if(firstName.toLowerCase() === "eleve" && lastName.toLowerCase() === "test") {
         return res.json({ ok: true, id: "test", firstName: "Eleve", lastName: "Test", classroom: classroom });
    }

    const inputFirst = nameTokens(firstName); const inputLast = nameTokens(lastName); const normClass = normalizeClassroom(classroom);
    let classes = [normClass];
    if (['2C', '2D'].includes(normClass)) classes = ['2C', '2D', '2CD'];
    if (['6', '6D'].includes(normClass)) classes = ['6', '6D'];
    
    const all = await Player.find({ classroom: { $in: classes } });
    const found = all.find(p => {
      const dbFirst = nameTokens(p.firstName); const dbLast = nameTokens(p.lastName);
      return inputFirst.some(t => dbFirst.includes(t)) && inputLast.some(t => dbLast.includes(t));
    });
    
    if (!found) return res.status(404).json({ ok: false, error: "Élève introuvable." });
    return res.json({ ok: true, id: found._id, firstName: found.firstName, lastName: found.lastName, classroom: found.classroom });
  } catch (e) { res.status(500).json({ ok: false }); }
});

app.post('/api/save-progress', async (req, res) => {
  const { playerId, progressType, value, grade } = req.body;
  
  // PROTECTION ANTI-CRASH : On ignore les IDs spéciaux
  if(playerId === "test" || playerId === "prof") return res.json({ message: 'Mode test, non sauvegardé' });
  if(!mongoose.Types.ObjectId.isValid(playerId)) return res.status(400).json({ message: 'ID Invalide' });

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
      const newGrade = grade || 'C';
      if (existingIndex > -1) {
        player.validatedLevels[existingIndex].grade = newGrade;
        player.validatedLevels[existingIndex].date = new Date();
        changed = true;
      } else {
        player.validatedLevels.push({ levelId: value, grade: newGrade, date: new Date() });
        changed = true;
      }
    } else if (progressType === 'question') {
      if (!player.validatedQuestions.includes(value)) { player.validatedQuestions.push(value); changed = true; }
    }
    if (changed || player.isModified('validatedLevels')) { player.markModified('validatedLevels'); await player.save(); }
    res.json({ message: 'Saved' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/players', async (req, res) => { res.json(await Player.find().sort({ lastName: 1 })); });

app.get('/api/player-progress/:playerId', async (req, res) => {
  const pid = req.params.playerId;

  // PROTECTION ANTI-CRASH : Si c'est "test" ou "prof", on renvoie vide sans planter
  if(pid === "test" || pid === "prof") {
      return res.json({ validatedLevels: [], validatedQuestions: [] });
  }
  if(!mongoose.Types.ObjectId.isValid(pid)) {
      return res.status(400).json({});
  }

  try {
      const p = await Player.findById(pid);
      if(!p) return res.status(404).json({});
      res.json({ validatedLevels: p.validatedLevels, validatedQuestions: p.validatedQuestions });
  } catch(e) { res.status(500).json({}); }
});

app.post('/api/reset-player-chapter', async (req, res) => {
  const { playerId, levelIds } = req.body;
  if(playerId === "test" || playerId === "prof" || !mongoose.Types.ObjectId.isValid(playerId)) return res.json({ message: 'Skip' });

  const p = await Player.findById(playerId);
  if(p) {
    p.validatedLevels = p.validatedLevels.filter(l => { const id = (typeof l === 'string') ? l : l.levelId; return !levelIds.includes(id); });
    p.validatedQuestions = p.validatedQuestions.filter(q => !levelIds.some(id => q.startsWith(id)));
    p.markModified('validatedLevels');
    await p.save();
  }
  res.json({ message: 'Reset' });
});

app.post('/api/reset-player', async (req, res) => { 
    if(!mongoose.Types.ObjectId.isValid(req.body.playerId)) return res.json({msg:'error'});
    await Player.findByIdAndUpdate(req.body.playerId, { validatedQuestions: [], validatedLevels: [] }); 
    res.json({msg:'ok'}); 
});

app.post('/api/reset-all-players', async (req, res) => { await Player.updateMany({}, { validatedQuestions: [], validatedLevels: [] }); res.json({msg:'ok'}); });

// ====== ROUTES BUGS ======
app.post('/api/report-bug', async (req, res) => {
  try {
    const { reporterName, classroom, description, gameChapter } = req.body;
    const newBug = new Bug({ reporterName, classroom, description, gameChapter });
    await newBug.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false }); }
});

app.get('/api/bugs', async (req, res) => {
  try { res.json(await Bug.find().sort({ date: -1 })); } catch (e) { res.status(500).json([]); }
});

app.delete('/api/bugs/:id', async (req, res) => {
  try { await Bug.findByIdAndDelete(req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).json({ ok: false }); }
});

// ====== IA HYBRIDE ======
app.post('/api/verify-answer-ai', async (req, res) => {
  const { question, userAnswer, expectedAnswer } = req.body;
  console.log(`\n[IA] Q: "${question}" | Élève: "${userAnswer}"`);

  // 1. GEMINI
  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });

      const prompt = `
        Tu es un professeur bienveillant.
        Q: "${question}"
        Attendue: "${expectedAnswer}"
        Élève: "${userAnswer}"
        
        Réponds en JSON uniquement :
        {
          "status": "correct" | "close" | "incorrect",
          "feedback": "Phrase courte",
          "corrections": [ { "wrong": "...", "correct": "..." } ]
        }
      `;

      const result = await model.generateContent(prompt);
      let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      return res.json(JSON.parse(text));

    } catch (error) {
      console.error(`[IA] Erreur Gemini (Quota ou autre) : ${error.message}`);
      // Pas de crash, on passe à la suite (Local)
    }
  }

  // 2. FALLBACK LOCAL
  const cleanUser = normalizeBase(userAnswer);
  const cleanExpected = normalizeBase(expectedAnswer);
  const sim = calculateSimilarity(cleanUser, cleanExpected);
  
  let response = { status: "incorrect", feedback: `Non, attendu : ${expectedAnswer}`, corrections: [] };

  if (cleanUser.includes(cleanExpected) || sim > 0.8) {
    response.status = "correct"; response.feedback = "Bonne réponse !";
  } else if (sim > 0.4) {
    response.status = "close"; response.feedback = "Presque ça.";
  }

  res.json(response);
});

async function testGeminiConnection() {
    if (!geminiKey) return;
    try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        await model.generateContent("Test");
        console.log(`✅ [IA] GEMINI CONNECTÉ !`);
    } catch (error) { console.error(`❌ [IA] ERREUR GEMINI : ${error.message}`); }
}

app.listen(port, () => {
  console.log(`✅ Serveur démarré port ${port}`);
  testGeminiConnection();
});