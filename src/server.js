// ====== CONFIG ET POLYFILL FETCH ======
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const nodeFetch = require('node-fetch');
if (!global.fetch) {
  global.fetch = nodeFetch;
  global.Headers = nodeFetch.Headers;
  global.Request = nodeFetch.Request;
  global.Response = nodeFetch.Response;
}

const express = require('express');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 3000;

const mongoUri = process.env.MONGODB_URI;
const geminiKey = process.env.GEMINI_API_KEY;

if (!mongoUri) { console.error('❌ MONGODB_URI manquant'); process.exit(1); }

console.log("------------------------------------------------");
if (geminiKey) console.log("🔑 Clé API détectée (Mode IA activé)");
else console.log("🔕 Pas de clé API (Mode Algo Local uniquement)");
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

// ====== UTILITAIRES LOCAL ======
function normalizeBase(str) { return (str || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase(); }
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

// ====== ROUTES ======
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
    
    // --- C'est ici qu'il y avait l'erreur, voici la ligne corrigée : ---
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
// IA HYBRIDE (Version Corrigée : Gemini 2.0 + Local "Imprécis")
// ============================================================
app.post('/api/verify-answer-ai', async (req, res) => {
  const { question, userAnswer, expectedAnswer } = req.body;
  console.log(`[IA] Analyse : "${userAnswer}" (Attendu: ${expectedAnswer})`);

  let useLocalAlgo = true; 

  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      // On utilise Gemini 2.0 Flash (qui fonctionne avec ta clé)
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `
        Tu es un professeur correcteur bienveillant pour des collégiens.
        
        Question : "${question}"
        Réponse attendue : "${expectedAnswer}"
        Réponse de l'élève : "${userAnswer}"
        
        Règles :
        - Si la réponse est bonne (même avec fautes ou synonymes) -> "correct".
        - Si la réponse est fausse ou n'a rien à voir -> "incorrect".
        - Si la réponse est incomplète, partielle ou un peu floue -> "imprecise".
        
        Donne un feedback court (15 mots max).
        Si "imprecise", donne un indice SANS donner la réponse.
        
        Réponds UNIQUEMENT au format JSON : { "status": "correct" | "incorrect" | "imprecise", "feedback": "string" }
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();
      
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonResponse = JSON.parse(text);
      
      console.log("[IA-GEMINI] Succès :", jsonResponse);
      return res.json(jsonResponse); 

    } catch (error) {
      console.error("[IA-GEMINI] Erreur (Passage au mode Local) :", error.message);
      useLocalAlgo = true; 
    }
  }

  // 2. ALGO LOCAL AMÉLIORÉ (Si l'IA plante ou n'est pas là)
  if (useLocalAlgo) {
    console.log("[IA-LOCALE] Algorithme de secours intelligent.");
    
    const cleanUser = normalizeBase(userAnswer);
    const cleanExpected = normalizeBase(expectedAnswer);
    
    let status = "incorrect";
    let feedback = "";

    // A. Copie parfaite ou presque
    if (cleanUser.includes(cleanExpected) || calculateSimilarity(cleanUser, cleanExpected) > 0.75) {
        status = "correct";
        feedback = "Excellent, c'est tout à fait ça.";
    } 
    else {
      // B. Analyse des mots clés pour détecter "IMPRÉCIS"
      // On ignore les petits mots (le, la, de...)
      const keyWords = cleanExpected.split(/[\s,;]+/).filter(w => w.length > 3);
      const foundWords = keyWords.filter(kw => cleanUser.includes(kw));
      
      if (keyWords.length > 0) {
         // Si on a trouvé tous les mots clés
         if (foundWords.length === keyWords.length) {
            status = "correct";
            feedback = "Bonne réponse !";
         }
         // Si on en a trouvé au moins un (mais pas tous) -> IMPRÉCIS
         else if (foundWords.length > 0) {
            status = "imprecise";
            feedback = `Tu as trouvé "${foundWords[0]}", mais ta réponse est incomplète.`;
         }
      }
    }

    if (status === "incorrect") {
        feedback = `Ce n'est pas ça. La réponse attendue était : ${expectedAnswer}`;
    }

    return res.json({ status: status, feedback: feedback });
  }
});

app.listen(port, () => console.log(`✅ Serveur démarré port ${port}`));