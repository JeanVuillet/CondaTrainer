// ====== CONFIG GENERALE ======
const path = require('path');
const fs = require('fs');
const multer = require('multer'); // Gestion des fichiers
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// Polyfill Fetch
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

// Config Multer
const upload = multer({ dest: 'uploads/' });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

if (!mongoUri) { console.error('❌ MONGODB_URI manquant'); process.exit(1); }

console.log("------------------------------------------------");
if (geminiKey) console.log("🔑 Clé API détectée (IA Active)");
else console.log("🔕 Pas de clé API (Mode Secours)");
console.log("------------------------------------------------");

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

mongoose.connect(mongoUri)
  .then(() => console.log('✅ MongoDB Connecté'))
  .catch(err => console.error('❌ Erreur Mongo:', err));

// ====== SCHEMA ======
const PlayerSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  classroom: String,
  validatedQuestions: [String],
  validatedLevels: { type: [mongoose.Schema.Types.Mixed], default: [] },
  created_at: { type: Date, default: Date.now },
}, { minimize: false });

const Player = mongoose.model('Player', PlayerSchema, 'players');

// ====== UTILITAIRES ======
function normalizeBase(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g," ").replace(/\s{2,}/g," ").trim().toLowerCase();
}
function nameTokens(str) { return normalizeBase(str).split(" ").filter(t => t.length >= 2); }
function normalizeClassroom(c) { return normalizeBase(c).replace(/(?<=\d)(e|de|d)/, '').toUpperCase(); }

// Algo Local
function getSimilarity(s1, s2) {
  let longer = s1.toLowerCase(); let shorter = s2.toLowerCase();
  if (s1.length < s2.length) { longer = s2.toLowerCase(); shorter = s1.toLowerCase(); }
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}
function editDistance(s1, s2) {
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

function detectSpellingCorrections(userAnswer, expectedAnswer) {
  const rawUserTokens = (userAnswer || '').split(/\s+/).filter(t => t.length > 0);
  const rawExpectedTokens = (expectedAnswer || '').split(/\s+/).filter(t => t.length > 0);
  const normUserTokens = rawUserTokens.map(t => normalizeBase(t));
  const normExpectedTokens = rawExpectedTokens.map(t => normalizeBase(t));
  const corrections = [];
  const alreadyAdded = new Set();

  normUserTokens.forEach((uTokNorm, idxU) => {
    if (uTokNorm.length <= 2) return;
    let bestIdx = -1;
    let bestScore = 0;
    normExpectedTokens.forEach((eTokNorm, idxE) => {
      const score = getSimilarity(uTokNorm, eTokNorm);
      if (score > bestScore) { bestScore = score; bestIdx = idxE; }
    });
    if (bestIdx !== -1 && bestScore > 0.7 && uTokNorm !== normExpectedTokens[bestIdx]) {
      const wrong = rawUserTokens[idxU];
      const correct = rawExpectedTokens[bestIdx];
      const key = wrong + '→' + correct;
      if (!alreadyAdded.has(key)) {
        alreadyAdded.add(key);
        corrections.push({ wrong, correct });
      }
    }
  });
  return corrections;
}

// ====== ROUTES STANDARD ======

app.post('/api/register', async (req, res) => {
  try {
    const { firstName, lastName, classroom } = req.body;
    if (!firstName || !lastName || !classroom) return res.status(400).json({ ok: false });
    const inputFirst = nameTokens(firstName); const inputLast = nameTokens(lastName); const normClass = normalizeClassroom(classroom);
    let classes = [normClass];
    if (['2C', '2D'].includes(normClass)) classes = ['2C', '2D', '2CD'];
    if (['6', '6D'].includes(normClass)) classes = ['6', '6D'];
    const all = await Player.find({ classroom: { $in: classes } });
    const found = all.find(p => {
      const dbFirst = nameTokens(p.firstName); const dbLast = nameTokens(p.lastName);
      return inputFirst.some(t => dbFirst.includes(t)) && inputLast.some(t => dbLast.includes(t));
    });
    if (!found) return res.status(404).json({ ok: false });
    return res.json({ ok: true, id: found._id, firstName: found.firstName, lastName: found.lastName, classroom: found.classroom });
  } catch (e) { res.status(500).json({ ok: false }); }
});

app.post('/api/save-progress', async (req, res) => {
  const { playerId, progressType, value, grade } = req.body;
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
  const p = await Player.findById(req.params.playerId);
  if(!p) return res.status(404).json({});
  res.json({ validatedLevels: p.validatedLevels, validatedQuestions: p.validatedQuestions });
});
app.post('/api/reset-player-chapter', async (req, res) => {
  const { playerId, levelIds } = req.body;
  const p = await Player.findById(playerId);
  if(p) {
    p.validatedLevels = p.validatedLevels.filter(l => { const id = (typeof l === 'string') ? l : l.levelId; return !levelIds.includes(id); });
    p.validatedQuestions = p.validatedQuestions.filter(q => !levelIds.some(id => q.startsWith(id)));
    p.markModified('validatedLevels');
    await p.save();
  }
  res.json({ message: 'Reset' });
});
app.post('/api/reset-player', async (req, res) => { await Player.findByIdAndUpdate(req.body.playerId, { validatedQuestions: [], validatedLevels: [] }); res.json({msg:'ok'}); });
app.post('/api/reset-all-players', async (req, res) => { await Player.updateMany({}, { validatedQuestions: [], validatedLevels: [] }); res.json({msg:'ok'}); });

// ============================================================
// ROUTE 1 : VÉRIFICATION TEXTE
// ============================================================
app.post('/api/verify-answer-ai', async (req, res) => {
  const { question, userAnswer, expectedAnswer } = req.body;
  console.log(`[TEXTE] Q: ${question} | Rep: ${userAnswer}`);

  // --- PARTIE 1 : ESSAI IA (Gemini Pro - Texte seul) ---
  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-pro" }); // Modèle Texte Stable

      const prompt = `
        Agis comme un professeur.
        Question : "${question}"
        Réponse attendue : "${expectedAnswer}"
        Réponse de l'élève : "${userAnswer}"
        
        Consignes :
        - Si le sens est bon (même avec fautes) -> status="correct".
        - Si faux -> status="incorrect".
        - Si incomplet -> status="imprecise".
        
        Si "correct", liste les fautes d'orthographe dans le tableau "corrections" : { "wrong": "mot_eleve", "correct": "mot_juste" }.

        Format JSON : { "status": "...", "feedback": "...", "corrections": [] }
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonResponse = JSON.parse(text);
      
      console.log("[IA-GEMINI] Texte Succès :", jsonResponse.status);
      return res.json(jsonResponse);

    } catch (error) {
      console.error("[IA-GEMINI] Erreur Texte (Passage Local) :", error.message);
    }
  }

  // --- PARTIE 2 : ALGO LOCAL (Secours) ---
  const cleanUser = normalizeBase(userAnswer);
  const cleanExpected = normalizeBase(expectedAnswer);
  const expectedWords = cleanExpected.split(" ").filter(w => w.length > 2);
  const userWordsRaw = (userAnswer||'').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g," ").split(" ");
  
  let foundCount = 0;
  let corrections = detectSpellingCorrections(userAnswer, expectedAnswer);

  expectedWords.forEach(target => {
     if (cleanUser.includes(target) || userWordsRaw.some(u => getSimilarity(normalizeBase(u), target) > 0.75)) {
       foundCount++;
     }
  });

  let status = "incorrect";
  let feedback = "Ce n'est pas ça.";

  if (foundCount === expectedWords.length) { status = "correct"; feedback = "Parfait !"; }
  else if (foundCount >= 1) { status = "imprecise"; feedback = "Incomplet."; }
  
  if (cleanUser === cleanExpected) { status = "correct"; feedback = "Excellent !"; corrections = []; }

  console.log(`[IA-LOCALE] Résultat : ${status}`);
  res.json({ status, feedback, corrections: status === "correct" ? corrections : [] });
});


// ============================================================
// ROUTE 2 : VÉRIFICATION AUDIO
// ============================================================
app.post('/api/verify-audio', upload.single('audio'), async (req, res) => {
  const { question, expectedAnswer } = req.body;
  const audioFile = req.file;

  console.log(`[AUDIO] Fichier reçu (${audioFile.size} bytes).`);

  if (!geminiKey) {
    if (fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
    return res.json({ status: "imprecise", feedback: "IA Audio non disponible (Clé manquante)." });
  }

  try {
    const audioData = fs.readFileSync(audioFile.path);
    const base64Audio = audioData.toString('base64');
    const mimeType = audioFile.mimetype;

    const genAI = new GoogleGenerativeAI(geminiKey);
    // POUR L'AUDIO, ON DOIT UTILISER GEMINI 1.5 (Pro ou Flash)
    // Si Flash plante, on tente Pro.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const prompt = `
      Écoute cet élève. Transcris sa réponse.
      Question : "${question}"
      Réponse attendue : "${expectedAnswer}"

      Règles :
      1. Transcris ce qu'il dit dans le champ "transcript".
      2. Compare le SENS avec la réponse attendue.
      
      Sortie JSON :
      {
        "transcript": "texte transcrit",
        "status": "correct" | "incorrect" | "imprecise",
        "feedback": "commentaire court",
        "corrections": [] 
      }
    `;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Audio, mimeType: mimeType } }
    ]);

    const response = await result.response;
    let text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonResponse = JSON.parse(text);

    console.log("[IA-AUDIO] Succès :", jsonResponse.status);
    fs.unlinkSync(audioFile.path);
    res.json(jsonResponse);

  } catch (err) {
    console.error("[IA-AUDIO] Erreur :", err.message);
    if (fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
    // En cas d'erreur audio, on dit à l'élève de réessayer
    res.json({ status: "imprecise", feedback: "Je n'ai pas bien entendu, réessaie ou écris ta réponse." });
  }
});

app.listen(port, () => console.log(`✅ Serveur démarré port ${port}`));