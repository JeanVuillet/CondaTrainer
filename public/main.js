// --- SECTION 0: UI Références & State ---
const $ = (sel) => document.querySelector(sel);

// Références générales
const studentBadge = $("#studentBadge"), logoutBtn = $("#logoutBtn");
const registerCard = $("#registerCard"), chapterSelection = $("#chapterSelection"), game = $("#game");
const form = $("#registerForm"), startBtn = $("#startBtn"), formMsg = $("#formMsg");

// Références du jeu
const gameModuleContainer = $("#gameModuleContainer");
const levelTitle = $("#levelTitle"), livesWrap = $("#lives"), mainBar = $("#mainBar"), subBarsContainer = $("#subBars"), generalText = $("#general");
const overlay = $("#overlay"), restartBtn = $("#restartBtn");
const correctionOverlay = $("#correctionOverlay"), correctionText = $("#correctionText"), closeCorrectionBtn = $("#closeCorrectionBtn");

// Références du Tableau de Bord Professeur
const profDashboard = $('#profDashboard');
const playersBody = $('#playersBody');
const classFilter = $('#classFilter');
const resetAllBtn = $('#resetAllBtn');

// Variables d'état
let isProfessorMode = false, isImpersonating = false;
const saved = JSON.parse(localStorage.getItem("player") || "null");
let currentPlayerId = saved ? saved.id : null;
let levels = [], localScores = [], general = 0, currentLevel = 0, currentIndex = -1, locked = false;
let lives = 4;
const MAX_LIVES = 4;
let currentGameModuleInstance = null;
let allPlayersData = []; // Pour stocker les données de tous les élèves


// --- SECTION 1: Logique de connexion et de navigation ---
function showStudent(stu) {
  studentBadge.textContent = `${stu.firstName} ${stu.lastName} – ${stu.classroom}`;
  $("#welcomeText").textContent = `Bienvenue ${stu.firstName} !`;
  logoutBtn.style.display = 'block';
}

function logout() {
  localStorage.removeItem("player");
  window.location.reload();
}
logoutBtn.addEventListener('click', logout);

async function loadQuestions(classKey) {
  try {
    const filePath = `/questions/questions-${classKey}.json`;
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`Le serveur a répondu avec le statut ${res.status}.`);
    levels = await res.json();
  } catch (err) {
    alert("Erreur critique: Impossible de charger les questions.");
    console.error("Détails de l'erreur de chargement:", err);
    levels = [];
  }
}

chapterSelection.addEventListener('click', async (e) => {
  const chapterBox = e.target.closest('.chapter-box');
  if (chapterBox && !chapterBox.classList.contains('disabled')) {
    const chapterId = chapterBox.dataset.chapter;
    const questionsKey = getClassKey(saved.classroom);
    await loadChapter(chapterId, questionsKey);
    if (levels.length > 0) initQuiz();
  }
});

async function loadChapter(chapterId, questionsKey) {
  chapterSelection.style.display = "none";
  game.style.display = "block";
  gameModuleContainer.innerHTML = 'Chargement du chapitre...';
  await loadQuestions(questionsKey);
  if (levels.length === 0) {
    gameModuleContainer.innerHTML = `<p class="error">Impossible de charger les questions pour ce chapitre.</p>`;
    return;
  }
  try {
    const response = await fetch(`chapitres/${chapterId}.html`);
    if (!response.ok) throw new Error(`Module ${chapterId}.html introuvable.`);
    const moduleHTMLText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(moduleHTMLText, 'text/html');
    const template = doc.querySelector('#template-zombie-game');
    const scriptElement = doc.querySelector('script');
    if (!template || !scriptElement) throw new Error('Fichier module malformé.');
    const templateContent = template.content.cloneNode(true);
    gameModuleContainer.innerHTML = '';
    gameModuleContainer.appendChild(templateContent);
    const newScript = document.createElement('script');
    newScript.textContent = scriptElement.textContent;
    document.body.appendChild(newScript);
    const controller = {
      notifyCorrectAnswer: () => { incrementProgress(1); setTimeout(() => nextQuestion(false), 900); },
      notifyWrongAnswer: (questionData) => { wrongAnswerFlow(questionData); },
      getState: () => ({ isLocked: locked, isFinalQuestion: levels[currentLevel] && localScores[currentIndex] >= levels[currentLevel].requiredPerQuestion - 1 })
    };
    if (typeof ZombieGame !== 'undefined') {
      currentGameModuleInstance = new ZombieGame(gameModuleContainer, controller);
    } else {
      throw new Error("La classe du jeu (ex: ZombieGame) n'a pas été trouvée.");
    }
  } catch (error) {
    console.error("Erreur de chargement du chapitre:", error);
    gameModuleContainer.innerHTML = `<p class="error">Impossible de charger le chapitre.</p>`;
  }
}

// Logique de démarrage de l'application
(async () => {
  if (saved && saved.id) {
    showStudent(saved);
    if (saved.id === 'prof') {
      isProfessorMode = true;
      registerCard.style.display = "none";
      await loadAllQuestionsForProf();
      fetchPlayers();
    } else {
      registerCard.style.display = "none";
      chapterSelection.style.display = "block";
    }
  } else {
    registerCard.style.display = "block";
  }
})();

// Logique du formulaire de connexion
form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    formMsg.textContent = "";
    startBtn.disabled = true;
    const firstName = $("#firstName").value.trim();
    const lastName = $("#lastName").value.trim();
    const classroom = $("#classroom").value;
    if (firstName.toLowerCase() === 'jean' && lastName.toLowerCase() === 'vuillet') {
        const profModal = $("#profPasswordModal");
        if (profModal) {
            profModal.style.display = 'block';
            $("#profPassword").focus();
        }
        startBtn.disabled = false;
        return;
    }
    if (!firstName || !lastName || !classroom) {
        formMsg.textContent = "❗ Prénom, nom et classe sont obligatoires.";
        startBtn.disabled = false;
        return;
    }
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, classroom })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur du serveur");
        localStorage.setItem("player", JSON.stringify(data));
        window.location.reload();
    } catch(err) {
        formMsg.textContent = `❌ ${err.message}`;
    } finally {
        startBtn.disabled = false;
    }
});

const validateProfPasswordBtn = $('#validateProfPasswordBtn');
validateProfPasswordBtn?.addEventListener('click', () => {
    const password = $("#profPassword").value;
    if (password === 'Clemenceau1919') {
        const profData = { id: 'prof', firstName: 'Jean', lastName: 'Vuillet', classroom: 'Professeur' };
        localStorage.setItem("player", JSON.stringify(profData));
        window.location.reload();
    } else {
        const profPasswordMsg = $('#profPasswordMsg');
        if (profPasswordMsg) profPasswordMsg.textContent = 'Mot de passe incorrect.';
    }
});


// --- SECTION 2: Logique principale du Quiz ---
function initQuiz() { if (levels.length > 0) setupLevel(0); }

function setupLevel(idx) {
  currentLevel = idx;
  const lvl = levels[currentLevel];
  levelTitle.textContent = lvl.title;
  localScores = new Array(lvl.questions.length).fill(0);
  general = 0;
  currentIndex = -1;
  lives = MAX_LIVES;
  renderLives();
  subBarsContainer.innerHTML = "";
  lvl.questions.forEach((_, i) => {
    const bar = document.createElement("div");
    bar.className = "subProgress";
    bar.innerHTML = `<div class="subBar" id="subBar${i}"></div><div class="subLabel">${i + 1}</div>`;
    bar.addEventListener('click', () => handleBarClick(i));
    subBarsContainer.appendChild(bar);
  });
  updateBars();
  nextQuestion(false);
}

function updateBars() { if (!levels[currentLevel]) return; const lvl = levels[currentLevel]; const total = lvl.questions.length; const req = lvl.requiredPerQuestion; mainBar.style.width = (general / total) * 100 + "%"; generalText.textContent = `Compteur général : ${general}/${total}`; lvl.questions.forEach((_, i) => { const bar = $(`#subBar${i}`); if (bar) bar.style.width = (Math.min(localScores[i], req) / req) * 100 + "%"; }); }
function findNextIndex(fromIdx) { const lvl = levels[currentLevel]; const n = lvl.questions.length; for (let i = fromIdx + 1; i < n; i++) if (localScores[i] < lvl.requiredPerQuestion) return i; for (let i = 0; i <= fromIdx; i++) if (localScores[i] < lvl.requiredPerQuestion) return i; return null; }

async function nextQuestion(keepAnimation) { 
    if (currentGameModuleInstance && !keepAnimation) { 
        currentGameModuleInstance.resetAnimation(); 
    } 
    locked = false; 
    const lvl = levels[currentLevel]; 

    // [DEBUG] Vérifions la condition de fin de niveau
    console.log(`[DEBUG] nextQuestion: Check condition. General: ${general}, Total Questions: ${lvl.questions.length}`);

    if (general >= lvl.questions.length) { 
        console.log(`[DEBUG] NIVEAU TERMINÉ! Tentative de sauvegarde.`); // [DEBUG]
        await saveProgress('level', levels[currentLevel].id);
        
        if (currentLevel < levels.length - 1) { 
            console.log(`[DEBUG] Passage au niveau suivant.`); // [DEBUG]
            setupLevel(currentLevel + 1); 
        } else { 
            console.log(`[DEBUG] Tous les niveaux sont terminés.`); // [DEBUG]
            gameModuleContainer.innerHTML = "<h1>🎉 Félicitations, tu as tout terminé !</h1>"; 
        } 
        return; 
    } 

    currentIndex = findNextIndex(currentIndex); 
    renderQuestion(); 
    if (currentGameModuleInstance) { 
        currentGameModuleInstance.startAnimation(); 
    } 
}

function renderQuestion() { if (currentIndex === null) return; const q = levels[currentLevel].questions[currentIndex]; const questionElt = gameModuleContainer.querySelector("#question"); const choicesZone = gameModuleContainer.querySelector("#choices"); const freeInputZone = gameModuleContainer.querySelector("#freeInputZone"); if (!questionElt || !choicesZone || !freeInputZone) return; questionElt.textContent = q.q; choicesZone.innerHTML = ""; freeInputZone.style.display = "none";[...q.options].sort(() => Math.random() - 0.5).forEach(opt => { const c = document.createElement("div"); c.className = "choice"; c.textContent = opt; c.addEventListener("click", () => onChoiceClick(c, opt, q)); choicesZone.appendChild(c); }); }
function onChoiceClick(elt, opt, q) { if (locked) return; locked = true; const ok = (opt || "").toLowerCase().trim() === (q.a || "").toLowerCase().trim(); if (ok) { elt.classList.add("correct"); if (currentGameModuleInstance) { currentGameModuleInstance.playSuccessAnimation(); } } else { elt.classList.add("wrong"); wrongAnswerFlow(q); } }
function wrongAnswerFlow(q) { if (currentGameModuleInstance) currentGameModuleInstance.resetAnimation(); decreaseLives(); if (lives > 0) { if (q) { correctionText.textContent = q.a; correctionOverlay.style.display = "flex"; } else { setTimeout(() => nextQuestion(false), 1500); } } }
closeCorrectionBtn.addEventListener("click", () => { correctionOverlay.style.display = "none"; nextQuestion(true); });
function incrementProgress(v) { const lvl = levels[currentLevel]; const req = lvl.requiredPerQuestion; const oldScore = localScores[currentIndex]; localScores[currentIndex] = Math.min(req, oldScore + v); if (oldScore < req && localScores[currentIndex] >= req) { general++; saveProgress('question', `${lvl.id}-${currentIndex}`); } updateBars(); }
function renderLives() { livesWrap.innerHTML = ""; for (let i = 0; i < MAX_LIVES; i++) { const h = document.createElement("div"); h.className = "heart" + (i < lives ? "" : " off"); livesWrap.appendChild(h); } }
function decreaseLives() { lives = Math.max(0, lives - 1); renderLives(); if (lives === 0) { if (currentGameModuleInstance) currentGameModuleInstance.resetAnimation(); overlay.style.display = "flex"; } }
restartBtn.addEventListener("click", () => { overlay.style.display = "none"; setupLevel(currentLevel); });


// --- SECTION 3: Logique du Tableau de Bord Professeur ---

async function fetchPlayers() {
    if (!profDashboard) return;
    profDashboard.style.display = 'block';
    playersBody.innerHTML = `<tr><td colspan="4" style="text-align: center;">Chargement...</td></tr>`;

    try {
        const response = await fetch('/api/players');
        if (!response.ok) throw new Error('Erreur réseau lors de la récupération des élèves.');
        allPlayersData = await response.json();
        // [DEBUG] Affichons les données brutes reçues pour le tableau de bord
        console.log("[DEBUG] Données de tous les élèves reçues du serveur:", allPlayersData);
        renderPlayers(allPlayersData);
    } catch (error) {
        playersBody.innerHTML = `<tr><td colspan="4" style="color: var(--warn);">❌ Impossible de charger : ${error.message}</td></tr>`;
    }
}

function generateQuestionIndicators(player) {
    console.log(
      `[DEBUG] Génération de la progression pour ${player.firstName}.` ,
      { validatedLevels: player.validatedLevels, validatedQuestions: player.validatedQuestions }
    );

    const classKey = getClassKey(player.classroom);
    const levelsData = (window.allQuestionsData && window.allQuestionsData[classKey]) || null;

    if (!levelsData) {
        return `N/A`;
    }

    const validatedQuestions = player.validatedQuestions || [];
    const validatedLevels = player.validatedLevels || [];

    // 1) On essaie de déduire automatiquement le niveau atteint à partir des questions
    let autoLevelIndex = 0;
    let allLevelsFinished = true;

    for (let i = 0; i < levelsData.length; i++) {
        const lvl = levelsData[i];
        const totalQuestions = lvl.questions.length;

        let validatedInThisLevel = 0;
        for (let qIndex = 0; qIndex < totalQuestions; qIndex++) {
            const qId = `${lvl.id}-${qIndex}`;
            if (validatedQuestions.includes(qId)) {
                validatedInThisLevel++;
            }
        }

        if (validatedInThisLevel < totalQuestions) {
            // Premier niveau pas encore entièrement terminé → c'est le niveau en cours
            autoLevelIndex = i;
            allLevelsFinished = false;
            break;
        }
    }

    // Si toutes les questions de tous les niveaux sont validées
    if (allLevelsFinished && levelsData.length > 0) {
        return `<span class="finished-badge">🏆 Terminé</span>`;
    }

    // 2) Niveau courant = max(ce que dit validatedLevels, ce que l’on déduit des questions)
    let indexFromLevels = validatedLevels.length;
    if (indexFromLevels >= levelsData.length) {
        indexFromLevels = levelsData.length - 1;
    }

    const currentLevelIndex = Math.max(autoLevelIndex, indexFromLevels);
    const currentLevel = levelsData[currentLevelIndex];
    const totalQuestions = currentLevel.questions.length;

    let html = `<div class="level-title">Niveau en cours : <strong>${currentLevel.title}</strong></div><div class="questions-list">`;

    let validatedInCurrent = 0;
    for (let i = 0; i < totalQuestions; i++) {
        const qId = `${currentLevel.id}-${i}`;
        const isValid = validatedQuestions.includes(qId);
        if (isValid) validatedInCurrent++;

        html += `<div class="question-indicator ${isValid ? 'question-valid' : 'question-invalid'}" title="Question ${i + 1}">${i + 1}</div>`;
    }

    html += `</div><div class="level-progress">${validatedInCurrent} / ${totalQuestions}</div>`;

    return html;
}


function renderPlayers(playersToRender) {
    playersBody.innerHTML = '';
    if (playersToRender.length === 0) {
        playersBody.innerHTML = `<tr><td colspan="4">Aucun élève trouvé.</td></tr>`;
        return;
    }

    playersToRender.sort((a, b) => a.lastName.localeCompare(b.lastName)).forEach(player => {
        const progressionHtml = generateQuestionIndicators(player);

        const row = `
            <tr>
                <td><strong>${player.firstName} ${player.lastName}</strong></td>
                <td>${player.classroom}</td>
                <td>${progressionHtml}</td>
                <td>
                    <button class="action-btn reset-btn" data-player-id="${player._id}" data-player-name="${player.firstName} ${player.lastName}">Réinitialiser</button>
                </td>
            </tr>`;
        playersBody.insertAdjacentHTML('beforeend', row);
    });
}

// Nouvelle fonction pour charger toutes les questions pour la vue prof
let allQuestionsData = {};
async function loadAllQuestionsForProf() {
    const keys = ['5e', '6e', '2de'];
    try {
        const responses = await Promise.all(keys.map(key => fetch(`/questions/questions-${key}.json`)));
        const jsonData = await Promise.all(responses.map(res => res.json()));
        keys.forEach((key, index) => {
            allQuestionsData[key] = jsonData[index];
        });
        window.allQuestionsData = allQuestionsData;
    } catch(err) {
        console.error("Impossible de pré-charger toutes les questions pour le prof.", err);
    }
}


// --- Événements du tableau de bord ---

classFilter?.addEventListener('change', () => {
    const selectedClass = classFilter.value;
    const playersToShow = (selectedClass === 'all') ? allPlayersData : allPlayersData.filter(p => p.classroom === selectedClass);
    renderPlayers(playersToShow);
});

resetAllBtn?.addEventListener('click', async () => {
    if (confirm("⚠️ ATTENTION ! ⚠️\nRéinitialiser TOUS les élèves ? Cette action est irréversible.")) {
        await fetch('/api/reset-all-players', { method: 'POST' });
        fetchPlayers(); 
    }
});

playersBody?.addEventListener('click', async (e) => {
    const target = e.target;
    if (target.matches('.reset-btn')) {
        const playerId = target.dataset.playerId;
        const playerName = target.dataset.playerName;
        if (confirm(`Voulez-vous vraiment réinitialiser la progression de ${playerName} ?`)) {
            await fetch('/api/reset-player', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId }) 
            });
            fetchPlayers();
        }
    }
});

// --- SECTION 4: Utilitaires et Fonctions Spécifiques ---
function getClassKey(classroom) { if (!classroom) return null; const cls = classroom.toUpperCase(); if (cls.startsWith('6')) return '6e'; if (cls.startsWith('5')) return '5e'; if (cls.startsWith('2')) return '2de'; return null; }

// Logique du Cheat-code R+T
let isRKeyDown = false;
let isTKeyDown = false;
document.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'r') isRKeyDown = true; if (e.key.toLowerCase() === 't') isTKeyDown = true; });
document.addEventListener('keyup', e => { if (e.key.toLowerCase() === 'r') isRKeyDown = false; if (e.key.toLowerCase() === 't') isTKeyDown = false; });

async function handleBarClick(questionIndex) {
  if (locked || !(isRKeyDown && isTKeyDown)) return;
  locked = true;
  const lvl = levels[currentLevel];
  const req = lvl.requiredPerQuestion;
  if (localScores[questionIndex] < req) {
    const questionId = `${lvl.id}-${questionIndex}`;
    const success = await saveProgress('question', questionId);
    if (success) {
      localScores[questionIndex] = req;
      if (general < lvl.questions.length) general++;
      updateBars();
      const barElt = $(`#subBar${questionIndex}`).parentElement;
      barElt.classList.add('saved-success');
      setTimeout(() => barElt.classList.remove('saved-success'), 600);
      if (general >= lvl.questions.length) nextQuestion(false);
    }
  }
  locked = false;
}

async function saveProgress(progressType, value) {
    if (!currentPlayerId || currentPlayerId === 'prof') return false;
    // [DEBUG] Suivons ce qui est envoyé au serveur
    console.log(`[DEBUG] Envoi de la sauvegarde au serveur -> Type: ${progressType}, Valeur: ${value}`);
    try {
        const res = await fetch('/api/save-progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: currentPlayerId, progressType, value })
        });
        if (!res.ok) {
          // [DEBUG]
          console.error(`[DEBUG] ÉCHEC de la sauvegarde côté serveur. Statut: ${res.status}`);
          throw new Error('Échec de la sauvegarde côté serveur.');
        }
        // [DEBUG]
        console.log(`[DEBUG] SUCCÈS de la sauvegarde pour ${progressType}: ${value}`);
        return true;
    } catch (err) {
        console.error("[DEBUG] Erreur CATCH lors de la sauvegarde :", err);
        alert("Erreur: Impossible de sauvegarder la progression.");
        return false;
    }
}