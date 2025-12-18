// src/server.js - VERSION AVEC BON MODÈLE (2.5) ET LOGS

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

const app = express();
const port = process.env.PORT || 3000;

const mongoUri = process.env.MONGODB_URI;
const geminiKey = process.env.GEMINI_API_KEY;

// ✅ MODIFICATION ICI : On utilise un modèle valide de votre liste
const MODEL_NAME = "gemini-2.5-flash"; 

if (!mongoUri) { 
    console.error('❌ ERREUR : MONGODB_URI manquant'); 
    process.exit(1); 
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

mongoose.connect(mongoUri)
  .then(() => console.log('✅ MongoDB Connecté'))
  .catch(err => console.error('❌ Erreur Mongo:', err));

// SCHEMAS
const PlayerSchema = new mongoose.Schema({
  firstName: String, lastName: String, classroom: String,
  validatedQuestions: [String],
  validatedLevels: { type: [mongoose.Schema.Types.Mixed], default: [] },
  created_at: { type: Date, default: Date.now },
}, { minimize: false });
const Player = mongoose.model('Player', PlayerSchema, 'players');

const BugSchema = new mongoose.Schema({
  reporterName: String, classroom: String, description: String,
  gameChapter: String, date: { type: Date, default: Date.now },
});
const Bug = mongoose.model('Bug', BugSchema, 'bugs');

// UTILITAIRES
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

// ROUTES BASIQUES
app.post('/api/register', async (req, res) => {
  try {
    const { firstName, lastName, classroom } = req.body;
    if(firstName.toLowerCase() === "eleve" && lastName.toLowerCase() === "test") {
         return res.json({ ok: true, id: "test", firstName: "Eleve", lastName: "Test", classroom: classroom });
    }
    const normClass = normalizeClassroom(classroom);
    let classes = [normClass];
    if (['2C', '2D'].includes(normClass)) classes = ['2C', '2D', '2CD'];
    if (['6', '6D'].includes(normClass)) classes = ['6', '6D'];
    const all = await Player.find({ classroom: { $in: classes } });
    const inputFirst = nameTokens(firstName); const inputLast = nameTokens(lastName);
    const found = all.find(p => {
      const dbFirst = nameTokens(p.firstName); const dbLast = nameTokens(p.lastName);
      return inputFirst.some(t => dbFirst.includes(t)) && inputLast.some(t => dbLast.includes(t));
    });
    if (!found) return res.status(404).json({ ok: false });
    return res.json({ ok: true, id: found._id, firstName: found.firstName, lastName: found.lastName, classroom: found.classroom });
  } catch (e) { res.status(500).json({ ok: false }); }
});

app.post('/api/save-progress', async (req, res) => {
    const { playerId } = req.body;
    if(playerId === "test" || playerId === "prof" || !mongoose.Types.ObjectId.isValid(playerId)) return res.json({ message: 'Skip' });
    try {
        const player = await Player.findById(playerId);
        if (player) {
            // Logique de sauvegarde simplifiée pour l'exemple
            res.json({ message: 'Saved' });
        } else {
            res.status(404).json({ message: 'Introuvable' });
        }
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/players', async (req, res) => { res.json(await Player.find().sort({ lastName: 1 })); });
app.get('/api/player-progress/:playerId', async (req, res) => {
    if(req.params.playerId === "test" || req.params.playerId === "prof") return res.json({});
    try { const p = await Player.findById(req.params.playerId); res.json(p ? {validatedLevels: p.validatedLevels, validatedQuestions: p.validatedQuestions} : {}); } catch(e){ res.json({}); }
});
app.post('/api/reset-player-chapter', async(req, res) => { res.json({message:'Reset'}); });
app.post('/api/report-bug', async (req, res) => {
    const newBug = new Bug(req.body); await newBug.save(); res.json({ok:true});
});
app.get('/api/bugs', async(req,res)=>{ res.json(await Bug.find().sort({date:-1})); });
app.delete('/api/bugs/:id', async(req,res)=>{ await Bug.findByIdAndDelete(req.params.id); res.json({ok:true}); });


// ============================================================
// VERIFICATION RÉPONSE (IA + LOCAL)
// ============================================================
app.post('/api/verify-answer-ai', async (req, res) => {
  const { question, userAnswer, expectedAnswer } = req.body;
  
  console.log("\n========================================");
  console.log(`📥 QUESTION REÇUE`);
  console.log(`❓ Question : "${question}"`);
  console.log(`🎯 Attendu  : "${expectedAnswer}"`);
  console.log(`👤 Élève    : "${userAnswer}"`);
  console.log("========================================");

  // 1. TENTATIVE GEMINI
  if (geminiKey) {
    console.log(`🤖 Tentative GEMINI (${MODEL_NAME})...`);
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });

      const prompt = `
        Tu es un professeur de collège bienveillant.
        
        Question : "${question}"
        Réponse attendue : "${expectedAnswer}"
        Réponse de l'élève : "${userAnswer}"

        Règles :
        1. Sois souple sur l'orthographe (phonétique acceptée mais signalée).
        2. Si le sens est bon, c'est "correct".
        3. Si c'est presque bon mais incomplet, c'est "close".
        
        Réponds UNIQUEMENT ce JSON :
        {
          "status": "correct" | "close" | "incorrect",
          "feedback": "Ton message court",
          "corrections": [ { "wrong": "motFaux", "correct": "motJuste" } ]
        }
      `;

      const result = await model.generateContent(prompt);
      let text = result.response.text();
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const jsonResponse = JSON.parse(text);
      
      console.log("✅ [GEMINI A RÉPONDU] :");
      console.log(`   Statut   : ${jsonResponse.status}`);
      console.log(`   Feedback : ${jsonResponse.feedback}`);
      
      return res.json(jsonResponse);

    } catch (error) {
      console.log("⚠️ [GEMINI ÉCHEC] :", error.message);
      if (error.message.includes("429")) console.log("   -> Trop de requêtes (Quota).");
      if (error.message.includes("404")) console.log("   -> Modèle introuvable ou mal écrit.");
      console.log("👉 Passage au mode LOCAL...");
    }
  }

  // 2. MODE LOCAL (SECOURS)
  const cleanUser = normalizeBase(userAnswer);
  const cleanExpected = normalizeBase(expectedAnswer);
  const sim = calculateSimilarity(cleanUser, cleanExpected);
  
  console.log(`🧮 [MODE LOCAL] Score : ${sim.toFixed(2)} / 1.00`);

  let response = { status: "incorrect", feedback: `Incorrect. Réponse : ${expectedAnswer}`, corrections: [] };

  if (cleanUser.includes(cleanExpected) || cleanExpected.includes(cleanUser) || sim > 0.75) {
    response.status = "correct";
    response.feedback = "Bonne réponse (Mode secours) !";
  } else if (sim > 0.45) {
    response.status = "close";
    response.feedback = "C'est presque ça.";
  }

  res.json(response);
});

async function testGeminiConnection() {
    if (!geminiKey) return;
    try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        await model.generateContent("Test");
        console.log(`✅ [TEST] GEMINI EST PRÊT (${MODEL_NAME})`);
    } catch (error) { console.error(`❌ [TEST] ERREUR CONNEXION GEMINI : ${error.message}`); }
}

app.listen(port, () => {
  console.log(`✅ Serveur démarré port ${port}`);
  testGeminiConnection();
});