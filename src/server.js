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

// --- INITIALISATION DE L'APP (C'est ce qui manquait !) ---
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

// --- SCHEMAS ---
const PlayerSchema = new mongoose.Schema({
  firstName: String, lastName: String, classroom: String,
  validatedQuestions: [String],
  validatedLevels: { type: [mongoose.Schema.Types.Mixed], default: [] },
  spellingMistakes: { type: [{ wrong: String, correct: String, date: { type: Date, default: Date.now } }], default: [] },
  activityLogs: { type: [{ action: String, detail: String, date: { type: Date, default: Date.now } }], default: [] },
  created_at: { type: Date, default: Date.now },
}, { minimize: false });
const Player = mongoose.model('Player', PlayerSchema, 'players');

const BugSchema = new mongoose.Schema({
  reporterName: String, classroom: String, description: String,
  gameChapter: String, date: { type: Date, default: Date.now },
});
const Bug = mongoose.model('Bug', BugSchema, 'bugs');

// --- UTILITAIRES ---
function normalizeBase(str) { return (str || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase(); }
function nameTokens(str) { return normalizeBase(str).split(/[\s-']+/).filter(t => t.length >= 2); }
function normalizeClassroom(c) { return normalizeBase(c).replace(/(?<=\d)(e|de|d)/, '').toUpperCase(); }
function calculateSimilarity(s1, s2) { let longer = s1, shorter = s2; if (s1.length < s2.length) { longer = s2; shorter = s1; } const longerLength = longer.length; if (longerLength === 0) return 1.0; return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength); }
function editDistance(s1, s2) { s1 = s1.toLowerCase(); s2 = s2.toLowerCase(); let costs = new Array(); for (let i = 0; i <= s1.length; i++) { let lastValue = i; for (let j = 0; j <= s2.length; j++) { if (i == 0) costs[j] = j; else { if (j > 0) { let newValue = costs[j - 1]; if (s1.charAt(i - 1) != s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1; costs[j - 1] = lastValue; lastValue = newValue; } } } if (i > 0) costs[s2.length] = lastValue; } return costs[s2.length]; }

// --- ROUTES ---

app.post('/api/register', async (req, res) => {
  try {
    const { firstName, lastName, classroom } = req.body;
    if (!firstName || !lastName || !classroom) return res.status(400).json({ ok: false });
    if(firstName.toLowerCase() === "eleve" && lastName.toLowerCase() === "test") {
       return res.json({ ok: true, id: "test", firstName: "Eleve", lastName: "Test", classroom: classroom });
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
    if(pid === "test" || pid === "prof") return res.json({ validatedLevels: [], validatedQuestions: [], spellingMistakes: [], activityLogs: [] });
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

// ==========================================================
// CERVEAU CENTRAL : IA NOTATION STRICTE
// ==========================================================
app.post('/api/verify-answer-ai', async (req, res) => {
  const { question, userAnswer, expectedAnswer, playerId, redactionMode, context } = req.body;
  
  let finalResponse = null;

  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });

      let instructions = "";

      // CAS 1 : RÉDACTION (Mode Coach Notation)
      if (redactionMode) {
        instructions = `
          MODE NOTATION RÉDACTION (RIGUEUR ACADÉMIQUE).
          
          TACHES OBLIGATOIRES :
          1. "grade" : Donne une note sur 20 (ex: "12/20"). Sois sévère si la méthodologie n'est pas respectée.
          2. "short_comment" : Appréciation globale en 5-6 mots.
          3. "good_points" : Liste les éléments méthodologiques réussis.
          4. "missing_points" : Liste les éléments manquants (ex: pas de problématique, pas de définition).
          5. "advice" : Le conseil prioritaire pour améliorer le fond.

          6. "corrections" (ORTHOGRAPHE STRICTE) :
             - Tu dois agir comme un correcteur orthographique bête et méchant.
             - Releva TOUTES les fautes : orthographe, grammaire, accords, ponctuation.
             - INTERDICTION ABSOLUE de mettre des conseils de fond ou de reformulation ici.
             - Format attendu : { "wrong": "mot_mal_écrit", "correct": "mot_bien_écrit" }
             - Exemple : { "wrong": "longtemp", "correct": "longtemps" }

          CHECKLIST MÉTHODOLOGIQUE (Intro) : Définition des termes clés, Bornes, Problématique (Question), Plan.

          FORMAT JSON ATTENDU :
          {
            "status": "correct|close|incorrect",
            "grade": "XX/20",
            "short_comment": "...",
            "advice": "...",
            "good_points": "...",
            "missing_points": "...",
            "corrections": [{ "wrong": "...", "correct": "..." }]
          }
        `;
      } 
      // CAS 2 : ZOMBIE (Mode Rapide)
      else {
        instructions = `
          MODE QUIZ RAPIDE.
          Si sens bon = "correct". Sinon "incorrect".
          FORMAT JSON : { "status": "...", "feedback": "...", "corrections": [] }
        `;
      }

      const prompt = `
        Q: "${question}"
        Contexte: "${context || ''}"
        Attendue: "${expectedAnswer}"
        Élève: "${userAnswer}"
        
        CONSIGNES : ${instructions}
      `;

      const result = await model.generateContent(prompt);
      let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      finalResponse = JSON.parse(text);
      console.log("✅ [GEMINI]", finalResponse.status, finalResponse.grade);

    } catch (error) { console.error(`⚠️ [GEMINI] Échec: ${error.message}`); }
  }

  // FALLBACK LOCAL
  if (!finalResponse) {
      finalResponse = { status: "incorrect", feedback: "Erreur IA, réessaie.", corrections: [] };
  }

  // SAUVEGARDE FAUTES
  if (finalResponse.corrections && finalResponse.corrections.length > 0 && playerId && mongoose.Types.ObjectId.isValid(playerId)) {
      try {
          const player = await Player.findById(playerId);
          if (player) {
              let changed = false;
              finalResponse.corrections.forEach(c => {
                  // On évite d'enregistrer des phrases entières comme fautes
                  if (c.wrong.split(' ').length < 4 && !player.spellingMistakes.some(m => m.wrong === c.wrong)) {
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

async function testGeminiConnection() { if (!geminiKey) return; try { const genAI = new GoogleGenerativeAI(geminiKey); const model = genAI.getGenerativeModel({ model: MODEL_NAME }); await model.generateContent("Test"); console.log(`✅ [IA] GEMINI CONNECTÉ !`); } catch (error) { console.error(`❌ [IA] ERREUR GEMINI : ${error.message}`); } }

app.listen(port, () => { console.log(`✅ Serveur démarré port ${port}`); testGeminiConnection(); });