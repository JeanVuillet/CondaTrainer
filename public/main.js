// --- SECTION 0: UI Références & State ---
const $ = (sel) => document.querySelector(sel);

// ... (le reste des références est correct)
const studentBadge = $("#studentBadge"),
  logoutBtn = $("#logoutBtn");
const registerCard = $("#registerCard"),
  chapterSelection = $("#chapterSelection"),
  game = $("#game");
const form = $("#registerForm"),
  startBtn = $("#startBtn"),
  formMsg = $("#formMsg");
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
const profDashboard = $("#profDashboard");
const playersBody = $("#playersBody");
const classFilter = $("#classFilter");
const resetAllBtn = $("#resetAllBtn");
const studentSearch = $("#studentSearch");

// ... (le reste des variables d'état est correct)
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

// ==================================================================
// --- CORRECTION CRUCIALE APPLIQUÉE ICI ---
// ==================================================================
chapterSelection.addEventListener("click", async (e) => {
  const chapterBox = e.target.closest(".chapter-box");
  if (chapterBox && !chapterBox.classList.contains("disabled")) {
    // On ignore le `data-questions-key` de l'HTML car il est incorrect.
    const { chapter, templateId, gameClass } = chapterBox.dataset;
    
    // On utilise la VRAIE classe de l'élève pour déterminer quelles questions charger.
    const questionsKey = getClassKey(saved.classroom);

    await loadChapter(chapter, questionsKey, templateId, gameClass);
    if (levels.length > 0) initQuiz();
  }
});

async function loadChapter(chapterId, questionsKey, templateId, gameClass) {
  chapterSelection.style.display = "none";
  game.style.display = "block";
  gameModuleContainer.innerHTML = "Chargement du chapitre...";

  // Cette fonction va maintenant recevoir la bonne clé ('6e' pour Gael, '5e' pour un 5B, etc.)
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
  playersBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">Chargement...</td></tr>`;

  try {
    const response = await fetch("/api/players", { cache: "no-store" });
    if (!response.ok)
      throw new Error("Erreur réseau lors de la récupération des élèves.");
    allPlayersData = await response.json();
    applyFiltersAndRender();
  } catch (error) {
    playersBody.innerHTML = `<tr><td colspan="6" style="color: var(--warn);">❌ Impossible de charger : ${error.message}</td></tr>`;
  }
}

function getPlayerProgressState(player) {
  const classKey = getClassKey(player.classroom);
  const levelsData =
    (window.allQuestionsData && window.allQuestionsData[classKey]) || null;

  if (!levelsData) return null;

  const validatedLevels = player.validatedLevels || [];
  let currentLevelIndex = validatedLevels.length;

  if (currentLevelIndex >= levelsData.length) {
    return { isFinished: true, currentLevel: levelsData[levelsData.length - 1] };
  }

  return {
    isFinished: false,
    currentLevel: levelsData[currentLevelIndex],
    validatedQuestions: player.validatedQuestions || [],
  };
}

function generateQuestionIndicators(player) {
  const state = getPlayerProgressState(player);
  if (!state) return "N/A";

  if (state.isFinished) {
    return `<span class="finished-badge">🏆 Terminé</span>`;
  }

  const { currentLevel, validatedQuestions } = state;
  const totalQuestions = currentLevel.questions.length;
  let html = `<div class="level-title">Niveau en cours : <strong>${currentLevel.title}</strong></div><div class="questions-list">`;

  let validatedInCurrent = 0;
  for (let i = 0; i < totalQuestions; i++) {
    const qId = `${currentLevel.id}-${i}`;
    const isValid = validatedQuestions.includes(qId);
    if (isValid) validatedInCurrent++;
    html += `<div class="question-indicator ${
      isValid ? "question-valid" : "question-invalid"
    }" title="Question ${i + 1}">${i + 1}</div>`;
  }

  html += `</div><div class="level-progress">${validatedInCurrent} / ${totalQuestions}</div>`;
  return html;
}

function renderPlayers(playersToRender) {
  playersBody.innerHTML = "";
  if (playersToRender.length === 0) {
    playersBody.innerHTML = `<tr><td colspan="6">Aucun élève trouvé.</td></tr>`;
    return;
  }

  playersToRender
    .sort((a, b) => a.lastName.localeCompare(b.lastName))
    .forEach((player) => {
      const state = getPlayerProgressState(player);
      let niveauCol = "N/A", chapitreCol = "-";

      if (state) {
        if (state.isFinished) {
          niveauCol = "Terminé";
          chapitreCol = "Terminé";
        } else if (state.currentLevel) {
          niveauCol = state.currentLevel.title;
          chapitreCol = state.currentLevel.chapterLabel || "Chapitre X";
        }
      }

      const row = `
        <tr>
          <td><strong>${player.firstName} ${player.lastName}</strong></td>
          <td>${player.classroom}</td>
          <td>${niveauCol}</td>
          <td>${chapitreCol}</td>
          <td>${generateQuestionIndicators(player)}</td>
          <td>
            <button class="action-btn reset-btn" data-player-id="${player._id}" data-player-name="${player.firstName} ${player.lastName}">
              Réinitialiser
            </button>
          </td>
        </tr>`;
      playersBody.insertAdjacentHTML("beforeend", row);
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
  const questionId = `${lvl.id}-${questionIndex}`;
  const success = await saveProgress("question", questionId);
  if (success) {
    localScores[questionIndex] = lvl.requiredPerQuestion;
    if (general < lvl.questions.length) general++;
    updateBars();
    const barElt = $(`#subBar${questionIndex}`).parentElement;
    barElt.classList.add("saved-success");
    setTimeout(() => barElt.classList.remove("saved-success"), 600);
    if (general >= lvl.questions.length) nextQuestion(false);
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