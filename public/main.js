// --- SECTION 0: UI Références & State ---
const $ = (sel) => document.querySelector(sel);

// Références générales
const studentBadge = $("#studentBadge"),
  logoutBtn = $("#logoutBtn");
const registerCard = $("#registerCard"),
  chapterSelection = $("#chapterSelection"),
  game = $("#game");
const form = $("#registerForm"),
  startBtn = $("#startBtn"),
  formMsg = $("#formMsg");

// Références du jeu
const gameModuleContainer = $("#gameModuleContainer");
const levelTitle = $("#levelTitle"),
  livesWrap = $("#lives"),
  mainBar = $("#mainBar"),
  subBarsContainer = $("#subBars"),
  generalText = $("#general");
const overlay = $("#overlay"),
  restartBtn = $("#restartBtn");
const correctionOverlay = $("#correctionOverlay"),
  correctionText = $("#correctionText"),
  closeCorrectionBtn = $("#closeCorrectionBtn");

// Références du Tableau de Bord Professeur
const profDashboard = $("#profDashboard");
const playersBody = $("#playersBody");
const classFilter = $("#classFilter");
const resetAllBtn = $("#resetAllBtn");
const studentSearch = $("#studentSearch");

// Variables d'état
let isProfessorMode = false,
  isImpersonating = false;
const saved = JSON.parse(localStorage.getItem("player") || "null");
let currentPlayerId = saved ? saved.id : null;
let levels = [],
  localScores = [],
  general = 0,
  currentLevel = 0,
  currentIndex = -1,
  locked = false;
let lives = 4;
const MAX_LIVES = 4;
let currentGameModuleInstance = null;
let allPlayersData = [];

// --- SECTION 1: Logique de connexion et de navigation ---
function showStudent(stu) {
  studentBadge.textContent = `${stu.firstName} ${stu.lastName} – ${stu.classroom}`;
  $("#welcomeText").textContent = `Bienvenue ${stu.firstName} !`;
  logoutBtn.style.display = "block";
}

function logout() {
  localStorage.removeItem("player");
  window.location.reload();
}
logoutBtn.addEventListener("click", logout);

async function loadQuestions(classKey) {
  try {
    const filePath = `/questions/questions-${classKey}.json`;
    const res = await fetch(filePath);
    if (!res.ok)
      throw new Error(`Le serveur a répondu avec le statut ${res.status}.`);
    levels = await res.json();
  } catch (err) {
    alert("Erreur critique: Impossible de charger les questions.");
    console.error("Détails de l'erreur de chargement:", err);
    levels = [];
  }
}

chapterSelection.addEventListener("click", async (e) => {
  const chapterBox = e.target.closest(".chapter-box");
  if (chapterBox && !chapterBox.classList.contains("disabled")) {
    const { chapter, templateId, gameClass } = chapterBox.dataset;
    const questionsKey = getClassKey(saved.classroom);
    await loadChapter(chapter, questionsKey, templateId, gameClass);
    if (levels.length > 0) initQuiz();
  }
});

async function loadChapter(chapterId, questionsKey, templateId, gameClass) {
  chapterSelection.style.display = "none";
  game.style.display = "block";
  gameModuleContainer.innerHTML = "Chargement du chapitre...";

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
    const doc = parser.parseFromString(moduleHTMLText, "text/html");

    const template = doc.querySelector(`#${templateId}`);
    const scriptElement = doc.querySelector("script");

    if (!template || !scriptElement) {
      throw new Error("Fichier module malformé (template ou script manquant).");
    }

    const templateContent = template.content.cloneNode(true);
    gameModuleContainer.innerHTML = "";
    gameModuleContainer.appendChild(templateContent);

    eval(scriptElement.textContent);

    const controller = {
      notifyCorrectAnswer: () => {
        incrementProgress(1);
        setTimeout(() => nextQuestion(false), 900);
      },
      notifyWrongAnswer: (questionData) => {
        wrongAnswerFlow(questionData);
      },
      getState: () => ({
        isLocked: locked,
      }),
    };

    if (typeof window[gameClass] === "function") {
      currentGameModuleInstance = new window[gameClass](
        gameModuleContainer,
        controller
      );
    } else {
      throw new Error(`La classe du jeu '${gameClass}' n'a pas été trouvée.`);
    }
  } catch (error) {
    console.error("Erreur de chargement du chapitre:", error);
    gameModuleContainer.innerHTML = `<p class="error">Impossible de charger le chapitre.</p>`;
  }
}

(async () => {
  if (saved && saved.id) {
    showStudent(saved);
    if (saved.id === "prof") {
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

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  formMsg.textContent = "";
  startBtn.disabled = true;
  const firstName = $("#firstName").value.trim();
  const lastName = $("#lastName").value.trim();
  const classroom = $("#classroom").value;

  if (
    firstName.toLowerCase() === "jean" &&
    lastName.toLowerCase() === "vuillet"
  ) {
    $("#profPasswordModal").style.display = "block";
    $("#profPassword").focus();
    startBtn.disabled = false;
    return;
  }

  if (!firstName || !lastName || !classroom) {
    formMsg.textContent = "❗ Prénom, nom et classe sont obligatoires.";
    startBtn.disabled = false;
    return;
  }

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, classroom }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur du serveur");
    localStorage.setItem("player", JSON.stringify(data));
    window.location.reload();
  } catch (err) {
    formMsg.textContent = `❌ ${err.message}`;
  } finally {
    startBtn.disabled = false;
  }
});

$("#validateProfPasswordBtn")?.addEventListener("click", () => {
  if ($("#profPassword").value === "Clemenceau1919") {
    localStorage.setItem(
      "player",
      JSON.stringify({
        id: "prof",
        firstName: "Jean",
        lastName: "Vuillet",
        classroom: "Professeur",
      })
    );
    window.location.reload();
  } else {
    $("#profPasswordMsg").textContent = "Mot de passe incorrect.";
  }
});

// --- SECTION 2: Logique principale du Quiz ---
function initQuiz() {
  if (levels.length > 0) setupLevel(0);
}

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
    bar.innerHTML = `<div class="subBar" id="subBar${i}"></div><div class="subLabel">${
      i + 1
    }</div>`;
    bar.addEventListener("click", () => handleBarClick(i));
    subBarsContainer.appendChild(bar);
  });
  updateBars();
  nextQuestion(false);
}

function updateBars() {
  if (!levels[currentLevel]) return;
  const lvl = levels[currentLevel];
  const total = lvl.questions.length;
  const req = lvl.requiredPerQuestion;
  mainBar.style.width = (general / total) * 100 + "%";
  generalText.textContent = `Compteur général : ${general}/${total}`;
  lvl.questions.forEach((_, i) => {
    const bar = $(`#subBar${i}`);
    if (bar)
      bar.style.width = (Math.min(localScores[i], req) / req) * 100 + "%";
  });
}

function findNextIndex(fromIdx) {
  const lvl = levels[currentLevel];
  const n = lvl.questions.length;
  for (let i = fromIdx + 1; i < n; i++)
    if (localScores[i] < lvl.requiredPerQuestion) return i;
  for (let i = 0; i <= fromIdx; i++)
    if (localScores[i] < lvl.requiredPerQuestion) return i;
  return null;
}

async function nextQuestion(keepAnimation) {
  if (currentGameModuleInstance && !keepAnimation) {
    currentGameModuleInstance.resetAnimation();
  }
  locked = false;
  const lvl = levels[currentLevel];

  if (general >= lvl.questions.length) {
    await saveProgress("level", lvl.id);

    if (currentLevel < levels.length - 1) {
      setupLevel(currentLevel + 1);
    } else {
      gameModuleContainer.innerHTML =
        "<h1>🎉 Félicitations, tu as tout terminé !</h1>";
    }
    return;
  }

  currentIndex = findNextIndex(currentIndex);
  renderQuestion();
  if (currentGameModuleInstance) {
    currentGameModuleInstance.startAnimation();
  }
}

function renderQuestion() {
  if (currentIndex === null) return;
  const questionData = levels[currentLevel].questions[currentIndex];

  if (
    currentGameModuleInstance &&
    typeof currentGameModuleInstance.loadQuestion === "function"
  ) {
    currentGameModuleInstance.loadQuestion(questionData);
  } else {
      console.error("Le module de jeu actuel n'a pas de méthode 'loadQuestion' !");
  }
}

function wrongAnswerFlow(q) {
  if (currentGameModuleInstance) currentGameModuleInstance.resetAnimation();
  decreaseLives();
  if (lives > 0) {
    if (q) {
      correctionText.textContent = q.a;
      correctionOverlay.style.display = "flex";
    } else {
      locked = true;
      setTimeout(() => nextQuestion(false), 1500);
    }
  }
}

closeCorrectionBtn.addEventListener("click", () => {
  correctionOverlay.style.display = "none";
  nextQuestion(true);
});

function incrementProgress(v) {
  const lvl = levels[currentLevel];
  const req = lvl.requiredPerQuestion;
  const oldScore = localScores[currentIndex];
  localScores[currentIndex] = Math.min(req, oldScore + v);
  if (oldScore < req && localScores[currentIndex] >= req) {
    general++;
    saveProgress("question", `${lvl.id}-${currentIndex}`);
  }
  updateBars();
}

function renderLives() {
  livesWrap.innerHTML = "";
  for (let i = 0; i < MAX_LIVES; i++) {
    const h = document.createElement("div");
    h.className = "heart" + (i < lives ? "" : " off");
    livesWrap.appendChild(h);
  }
}

function decreaseLives() {
  lives = Math.max(0, lives - 1);
  renderLives();
  if (lives === 0) {
    if (currentGameModuleInstance) currentGameModuleInstance.resetAnimation();
    overlay.style.display = "flex";
  }
}

restartBtn.addEventListener("click", () => {
  overlay.style.display = "none";
  setupLevel(currentLevel);
});

// --- SECTION 3: Logique du Tableau de Bord Professeur ---
async function fetchPlayers() {
  if (!profDashboard) return;
  profDashboard.style.display = "block";
  const table = $("#playersTable");
  const tbody = table.querySelector('tbody') || document.createElement('tbody');
  if (!table.contains(tbody)) table.appendChild(tbody);
  tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">Chargement...</td></tr>`;

  try {
    const response = await fetch("/api/players", { cache: "no-store" });
    if (!response.ok)
      throw new Error("Erreur réseau lors de la récupération des élèves.");
    allPlayersData = await response.json();
    applyFiltersAndRender();
  } catch (error) {
    const table = $("#playersTable");
    const tbody = table.querySelector('tbody') || document.createElement('tbody');
    tbody.innerHTML = `<tr><td colspan="5" style="color: var(--warn);">❌ Impossible de charger : ${error.message}</td></tr>`;
  }
}

// ==================================================================
// --- CORRIGÉ : Fonctions d'affichage du tableau de bord mises à jour ---
// ==================================================================
function getPlayerProgressState(player) {
  const classKey = getClassKey(player.classroom);
  const levelsData =
    (window.allQuestionsData && window.allQuestionsData[classKey]) || null;
  if (!levelsData) return null;
  const validatedLevels = player.validatedLevels || [];
  let currentLevelIndex = validatedLevels.length;
  if (currentLevelIndex >= levelsData.length) {
    return { isFinished: true };
  }
  return {
    isFinished: false,
    currentLevel: levelsData[currentLevelIndex],
    validatedQuestions: player.validatedQuestions || [],
  };
}

function generateLevelProgressHtml(level, validatedQuestions) {
  if (!level) return 'N/A';
  const totalQuestions = level.questions.length;
  let html = `<div class="questions-list" style="display: flex; gap: 4px; flex-wrap: wrap;">`;
  for (let i = 0; i < totalQuestions; i++) {
    const qId = `${level.id}-${i}`;
    const isValid = validatedQuestions.includes(qId);
    const indicatorClass = isValid ? "question-valid" : "question-invalid";
    html += `<div class="question-indicator ${indicatorClass}" title="Question ${i + 1}">${i + 1}</div>`;
  }
  html += `</div>`;
  return html;
}


function renderPlayers(playersToRender) {
  const table = $("#playersTable");
  table.querySelectorAll('tbody').forEach(tbody => tbody.remove());

  if (playersToRender.length === 0) {
    const tbody = document.createElement('tbody');
    tbody.innerHTML = `<tr><td colspan="5">Aucun élève trouvé.</td></tr>`;
    table.appendChild(tbody);
    return;
  }

  const chaptersToDisplay = {
    "ch1-zombie": "Chapitre 1 : Zombies",
    "ch2-starship": "Chapitre 2 : Starship"
  };

  playersToRender
    .sort((a, b) => a.lastName.localeCompare(b.lastName))
    .forEach((player) => {
      const playerTbody = document.createElement('tbody');
      playerTbody.style.borderTop = '1px solid #e2e8f0';

      const classKey = getClassKey(player.classroom);
      const allLevelsForClass = (window.allQuestionsData && window.allQuestionsData[classKey]) || [];
      const validatedLevels = player.validatedLevels || [];
      const validatedQuestions = player.validatedQuestions || [];
      
      let chapterRowsHtml = '';
      let isFirstRow = true;

      for (const chapterId in chaptersToDisplay) {
        const chapterLabel = chaptersToDisplay[chapterId];
        
        const levelsInThisChapter = allLevelsForClass.filter(level => level.chapterId === chapterId);
        
        let progressHtml = '';
        let levelTitleHtml = ''; // Variable pour stocker le titre du niveau

        if (levelsInThisChapter.length === 0) {
          progressHtml = '<em>(Non applicable)</em>';
          levelTitleHtml = '-';
        } else {
            const currentLevelForChapter = levelsInThisChapter.find(level => !validatedLevels.includes(level.id));

            if (currentLevelForChapter) {
                // On a un niveau en cours, on stocke son titre et sa progression
                levelTitleHtml = currentLevelForChapter.title;
                progressHtml = generateLevelProgressHtml(currentLevelForChapter, validatedQuestions);
            } else {
                // Tous les niveaux du chapitre sont terminés
                levelTitleHtml = 'Terminé';
                progressHtml = '<span class="finished-badge" style="background-color: #f59e0b; color: white; padding: 4px 10px; border-radius: 12px; font-size: 14px; display: inline-flex; align-items: center; gap: 4px;">🏆</span>';
            }
        }

        if (isFirstRow) {
          chapterRowsHtml += `
            <tr>
              <td rowspan="${Object.keys(chaptersToDisplay).length}" style="vertical-align: middle; padding-left: 10px;">
                <strong>${player.firstName} ${player.lastName}</strong>
              </td>
              <td rowspan="${Object.keys(chaptersToDisplay).length}" style="vertical-align: middle;">
                ${player.classroom}
              </td>
              <td>${chapterLabel}</td>
              <!-- On affiche le titre du niveau ici -->
              <td>${levelTitleHtml}</td>
              <td>${progressHtml}</td>
              <td rowspan="${Object.keys(chaptersToDisplay).length}" style="vertical-align: middle;">
                <button class="action-btn reset-btn" data-player-id="${player._id}" data-player-name="${player.firstName} ${player.lastName}">
                  Réinitialiser
                </button>
              </td>
            </tr>`;
          isFirstRow = false;
        } else {
          chapterRowsHtml += `
            <tr>
              <td>${chapterLabel}</td>
              <!-- On affiche le titre du niveau ici aussi -->
              <td>${levelTitleHtml}</td>
              <td>${progressHtml}</td>
            </tr>`;
        }
      }
      
      playerTbody.innerHTML = chapterRowsHtml;
      table.appendChild(playerTbody);
    });
}


let allQuestionsData = {};
async function loadAllQuestionsForProf() {
  const keys = ["5e", "6e", "2de"];
  try {
    const responses = await Promise.all(
      keys.map((key) => fetch(`/questions/questions-${key}.json`))
    );
    const jsonData = await Promise.all(responses.map((res) => res.json()));
    keys.forEach((key, index) => {
      allQuestionsData[key] = jsonData[index];
    });
    window.allQuestionsData = allQuestionsData;
  } catch (err) {
    console.error(
      "Impossible de pré-charger toutes les questions pour le prof.",
      err
    );
  }
}

function applyFiltersAndRender() {
  let filtered = [...allPlayersData];
  const selectedClass = classFilter ? classFilter.value : "all";
  const searchTerm = studentSearch
    ? studentSearch.value.trim().toLowerCase()
    : "";

  if (selectedClass !== "all") {
    filtered = filtered.filter((p) => p.classroom === selectedClass);
  }

  if (searchTerm) {
    filtered = filtered.filter((p) =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm)
    );
  }

  renderPlayers(filtered);
}

classFilter?.addEventListener("change", applyFiltersAndRender);
studentSearch?.addEventListener("input", applyFiltersAndRender);

resetAllBtn?.addEventListener("click", async () => {
  if (confirm("⚠️ ATTENTION ! ⚠️\nRéinitialiser TOUS les élèves ?")) {
    await fetch("/api/reset-all-players", { method: "POST" });
    fetchPlayers();
  }
});

playersBody?.addEventListener("click", async (e) => {
  const target = e.target;
  if (target.matches(".reset-btn")) {
    const { playerId, playerName } = target.dataset;
    if (confirm(`Réinitialiser la progression de ${playerName} ?`)) {
      await fetch("/api/reset-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      fetchPlayers();
    }
  }
});

// --- SECTION 4: Utilitaires et Fonctions Spécifiques ---
function getClassKey(classroom) {
  if (!classroom) return null;
  const cls = classroom.toUpperCase();
  if (cls.startsWith("6")) return "6e";
  if (cls.startsWith("5")) return "5e";
  if (cls.startsWith("2")) return "2de";
  return null;
}

let isRKeyDown = false,
  isTKeyDown = false;
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r") isRKeyDown = true;
  if (e.key.toLowerCase() === "t") isTKeyDown = true;
});
document.addEventListener("keyup", (e) => {
  if (e.key.toLowerCase() === "r") isRKeyDown = false;
  if (e.key.toLowerCase() === "t") isTKeyDown = false;
});

async function handleBarClick(questionIndex) {
  if (locked || !(isRKeyDown && isTKeyDown)) return;
  locked = true;
  const lvl = levels[currentLevel];
  const req = lvl.requiredPerQuestion;
  if (localScores[questionIndex] < req) {
    const oldScore = localScores[questionIndex];
    localScores[questionIndex]++;
    updateBars();
    if (oldScore < req && localScores[questionIndex] >= req) {
      general++;
      const questionId = `${lvl.id}-${questionIndex}`;
      await saveProgress("question", questionId);
    }
    const barElt = $(`#subBar${questionIndex}`).parentElement;
    barElt.classList.add("saved-success");
    setTimeout(() => barElt.classList.remove("saved-success"), 600);
    if (general >= lvl.questions.length) {
      nextQuestion(false);
    } else {
        currentIndex = questionIndex;
        renderQuestion();
        if (currentGameModuleInstance) currentGameModuleInstance.startAnimation();
    }
  }
  locked = false;
}

async function saveProgress(progressType, value) {
  if (!currentPlayerId || currentPlayerId === "prof") return false;
  try {
    const res = await fetch("/api/save-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: currentPlayerId, progressType, value }),
    });
    if (!res.ok) throw new Error("Échec de la sauvegarde côté serveur.");
    return true;
  } catch (err) {
    console.error("[FRONT-END] Erreur lors de la sauvegarde :", err);
    alert("Erreur: Impossible de sauvegarder la progression.");
    return false;
  }
}