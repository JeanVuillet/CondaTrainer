// src/server.js - VERSION CORRIGÉE

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
const MODEL_NAME = "gemini-2.5-flash"; 

if (!mongoUri) { console.error('❌ ERREUR : MONGODB_URI manquant'); process.exit(1); }

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

mongoose.connect(mongoUri)
  .then(() => console.log('✅ MongoDB Connecté'))
  .catch(err => console.error('❌ Erreur Mongo:', err));

const PlayerSchema = new mongoose.Schema({
  firstName: String, lastName: String, classroom: String,
  validatedQuestions: [String],
  validatedLevels: { type: [mongoose.Schema.Types.Mixed], default: [] },
  spellingMistakes: { type: [{ wrong: String, correct: String, date: { type: Date, default: Date.now } }], default: [] },
  created_at: { type: Date, default: Date.now },
}, { minimize: false });
const Player = mongoose.model('Player', PlayerSchema, 'players');

const BugSchema = new mongoose.Schema({
  reporterName: String, classroom: String, description: String,
  gameChapter: String, date: { type: Date, default: Date.now },
});
const Bug = mongoose.model('Bug', BugSchema, 'bugs');

function normalizeBase(str) { return (str || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase(); }
function nameTokens(str) { return normalizeBase(str).split(/[\s-']+/).filter(t => t.length >= 2); }
function normalizeClassroom(c) { return normalizeBase(c).replace(/(?<=\d)(e|de|d)/, '').toUpperCase(); }
function calculateSimilarity(s1, s2) { let longer = s1, shorter = s2; if (s1.length < s2.length) { longer = s2; shorter = s1; } const longerLength = longer.length; if (longerLength === 0) return 1.0; return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength); }
function editDistance(s1, s2) { s1 = s1.toLowerCase(); s2 = s2.toLowerCase(); let costs = new Array(); for (let i = 0; i <= s1.length; i++) { let lastValue = i; for (let j = 0; j <= s2.length; j++) { if (i == 0) costs[j] = j; else { if (j > 0) { let newValue = costs[j - 1]; if (s1.charAt(i - 1) != s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1; costs[j - 1] = lastValue; lastValue = newValue; } } } if (i > 0) costs[s2.length] = lastValue; } return costs[s2.length]; }

app.post('/api/register', async (req, res) => {
  try {
    const { firstName, lastName, classroom } = req.body;
    if (!firstName || !lastName || !classroom) return res.status(400).json({ ok: false });
    
    // [MODIF] PLUS DE COMPTE FANTÔME POUR ELEVE TEST !
    // Il se connecte comme tout le monde en BDD.
    
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
            changed = true;
        } else if (progressType === 'question') {
            if (!player.validatedQuestions.includes(value)) { player.validatedQuestions.push(value); changed = true; }
        }
        if (changed) { player.markModified('validatedLevels'); await player.save(); }
        res.json({ message: 'Saved' });
    } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/players', async (req, res) => { res.json(await Player.find().sort({ lastName: 1 })); });

app.get('/api/player-progress/:playerId', async (req, res) => {
    const pid = req.params.playerId;
    if(pid === "test" || pid === "prof") return res.json({ validatedLevels: [], validatedQuestions: [], spellingMistakes: [] });
    if(!mongoose.Types.ObjectId.isValid(pid)) return res.status(400).json({});
    try {
        const p = await Player.findById(pid);
        if(!p) return res.status(404).json({});
        res.json({ validatedLevels: p.validatedLevels, validatedQuestions: p.validatedQuestions, spellingMistakes: p.spellingMistakes || [] });
    } catch(e) { res.status(500).json({}); }
});

app.post('/api/reset-player-chapter', async (req, res) => {
  const { playerId, levelIds } = req.body;
  if(!mongoose.Types.ObjectId.isValid(playerId)) return res.json({ message: 'Skip' });
  const p = await Player.findById(playerId);
  if(p) {
    p.validatedLevels = p.validatedLevels.filter(l => !levelIds.includes((typeof l==='string')?l:l.levelId));
    p.validatedQuestions = p.validatedQuestions.filter(q => !levelIds.some(id => q.startsWith(id)));
    p.markModified('validatedLevels'); await p.save();
  }
  res.json({ message: 'Reset' });
});
app.post('/api/reset-player', async (req, res) => { 
    if(!mongoose.Types.ObjectId.isValid(req.body.playerId)) return res.json({msg:'error'});
    await Player.findByIdAndUpdate(req.body.playerId, { validatedQuestions: [], validatedLevels: [], spellingMistakes: [] }); 
    res.json({msg:'ok'}); 
});
app.post('/api/reset-all-players', async (req, res) => { await Player.updateMany({}, { validatedQuestions: [], validatedLevels: [], spellingMistakes: [] }); res.json({msg:'ok'}); });

app.post('/api/report-bug', async (req, res) => { const newBug = new Bug(req.body); await newBug.save(); res.json({ok:true}); });
app.get('/api/bugs', async(req,res)=>{ res.json(await Bug.find().sort({date:-1})); });
app.delete('/api/bugs/:id', async(req,res)=>{ await Bug.findByIdAndDelete(req.params.id); res.json({ok:true}); });

app.delete('/api/spelling-mistake/:playerId/:word', async (req, res) => {
    const { playerId, word } = req.params;
    if(!mongoose.Types.ObjectId.isValid(playerId)) return res.json({ok:true});
    try {
        const p = await Player.findById(playerId);
        if(p) { p.spellingMistakes = p.spellingMistakes.filter(m => m.wrong !== word); await p.save(); }
        res.json({ok:true});
    } catch(e) { res.status(500).json({ok:false}); }
});

app.post('/api/verify-answer-ai', async (req, res) => {
  const { question, userAnswer, expectedAnswer, playerId } = req.body;
  console.log(`\n[IA] Q: "${question}" | Élève: "${userAnswer}"`);

  let finalResponse = null;

  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });
      const prompt = `
        Tu es un professeur bienveillant.
        Q: "${question}" / Attendue: "${expectedAnswer}" / Élève: "${userAnswer}"
        
        RÈGLES STRICTES DE VALIDATION :
        1. Si le sens est bon, c'est "correct" (même avec fautes).
        2. Si incomplet/vague, c'est "close".
        3. Si "correct" avec fautes, remplis "corrections".

        Réponds en JSON uniquement :
        {
          "status": "correct" | "close" | "incorrect",
          "feedback": "Phrase courte",
          "corrections": [ { "wrong": "motFaux", "correct": "motJuste" } ]
        }
      `;
      const result = await model.generateContent(prompt);
      let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      finalResponse = JSON.parse(text);
      console.log("✅ [GEMINI]", finalResponse);
    } catch (error) { console.error(`⚠️ [GEMINI] Échec: ${error.message}`); }
  }

  if (!finalResponse) {
      const cleanUser = normalizeBase(userAnswer); const cleanExpected = normalizeBase(expectedAnswer);
      const sim = calculateSimilarity(cleanUser, cleanExpected);
      finalResponse = { status: "incorrect", feedback: `Non, attendu : ${expectedAnswer}`, corrections: [] };
      if (cleanUser.includes(cleanExpected) || sim > 0.75) { finalResponse.status = "correct"; finalResponse.feedback = "Bonne réponse !"; } 
      else if (sim > 0.45) { finalResponse.status = "close"; finalResponse.feedback = "Presque ça."; }
  }

  // SAUVEGARDE (Maintenance que Eleve Test a un vrai ID, ça va passer ici)
  if (finalResponse.corrections && finalResponse.corrections.length > 0 && playerId && mongoose.Types.ObjectId.isValid(playerId)) {
      try {
          const player = await Player.findById(playerId);
          if (player) {
              let changed = false;
              finalResponse.corrections.forEach(c => {
                  if (!player.spellingMistakes.some(m => m.wrong === c.wrong)) {
                      player.spellingMistakes.push({ wrong: c.wrong, correct: c.correct });
                      changed = true;
                  }
              });
              if (changed) await player.save();
              console.log("📝 Fautes enregistrées en BDD.");
          }
      } catch (e) { console.error("Erreur sauvegarde fautes:", e); }
  }

  res.json(finalResponse);
});

async function testGeminiConnection() { if (!geminiKey) return; try { const genAI = new GoogleGenerativeAI(geminiKey); const model = genAI.getGenerativeModel({ model: MODEL_NAME }); await model.generateContent("Test"); console.log(`✅ [IA] GEMINI CONNECTÉ !`); } catch (error) { console.error(`❌ [IA] ERREUR GEMINI : ${error.message}`); } }

app.listen(port, () => { console.log(`✅ Serveur démarré port ${port}`); testGeminiConnection(); });