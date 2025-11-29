// --- SECTION 0: UI & State ---
const $ = (sel) => document.querySelector(sel);
const studentBadge = $("#studentBadge"), logoutBtn = $("#logoutBtn");
// Bouton retour prof
const backToProfBtn = $("#backToProfBtn");

const registerCard = $("#registerCard"), chapterSelection = $("#chapterSelection"), game = $("#game");
const form = $("#registerForm"), startBtn = $("#startBtn"), formMsg = $("#formMsg");
const gameModuleContainer = $("#gameModuleContainer");
const levelTitle = $("#levelTitle"), livesWrap = $("#lives"), mainBar = $("#mainBar"), subBarsContainer = $("#subBars"), generalText = $("#general");
const overlay = $("#overlay"), restartBtn = $("#restartBtn");
const correctionOverlay = $("#correctionOverlay"), correctionText = $("#correctionText"), closeCorrectionBtn = $("#closeCorrectionBtn");
const profDashboard = $("#profDashboard"), playersBody = $("#playersBody"), classFilter = $("#classFilter"), resetAllBtn = $("#resetAllBtn"), studentSearch = $("#studentSearch"), backToMenuBtn = $("#backToMenuBtn");

// Bouton Test Prof (dans le dashboard)
const testClassBtn = $("#testClassBtn");

// --- UI FICHE COURS ---
const openLessonBtn = $("#openLessonBtn");
const lessonModal = $("#lessonModal");
const closeLessonBtn = $("#closeLessonBtn");
const lessonText = $("#lessonText");
const iAmReadyBtn = $("#iAmReadyBtn");

// Init Globale
window.allQuestionsData = {}; 

let isProfessorMode = false;
const saved = JSON.parse(localStorage.getItem("player") || "null");
let currentPlayerId = saved ? saved.id : null;
let currentPlayerData = saved || null;

let levels = [], localScores = [], general = 0, currentLevel = 0, currentIndex = -1, locked = false;
let lives = 4; const MAX_LIVES = 4;
let isGameActive = false; 
let currentGameModuleInstance = null;
let allPlayersData = [];
let levelTimer = null, levelTimeTotal = 180000, levelTimeRemaining = 180000;
let pendingLaunch = null; 

// --- GESTION DES TOUCHES POUR CHEAT CODE (R + T) ---
let isRKeyDown = false; 
let isTKeyDown = false;

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "r") isRKeyDown = true;
  if (e.key.toLowerCase() === "t") isTKeyDown = true;
});

document.addEventListener("keyup", (e) => {
  if (e.key.toLowerCase() === "r") isRKeyDown = false;
  if (e.key.toLowerCase() === "t") isTKeyDown = false;
});

// --- LOGIQUE RETOUR PROF (Si on est Eleve Test) ---
backToProfBtn?.addEventListener("click", () => {
  localStorage.setItem(
    "player",
    JSON.stringify({ id: "prof", firstName: "Jean", lastName: "Vuillet", classroom: "Professeur" })
  );
  window.location.reload();
});

// --- LOGIQUE MODAL COURS ---
iAmReadyBtn?.addEventListener("click", () => {
  if(lessonModal) lessonModal.style.display = "none";
  if (pendingLaunch) {
    pendingLaunch(); 
    pendingLaunch = null; 
  }
});

closeLessonBtn?.addEventListener("click", () => {
  if(lessonModal) lessonModal.style.display = "none";
  pendingLaunch = null; 
});

openLessonBtn?.addEventListener("click", () => {
  if (iAmReadyBtn) iAmReadyBtn.style.display = "none"; 
  if (lessonModal) lessonModal.style.display = "flex";
});

// --- CHEAT CODE (Barre Verte + R + T) ---
$("#mainProgress")?.addEventListener("click", () => {
  if (!isGameActive) return;
  if (!isRKeyDown || !isTKeyDown) return; // SÉCURITÉ

  console.log("🕵️ CHEAT CODE ACTIVÉ : Niveau validé !");
  updateTimeBar(); 
  const lvl = levels[currentLevel];
  if(lvl) {
    general = lvl.questions.length;
    nextQuestion(false);
  }
});

// --- SECTION 1: FONCTIONS UTILITAIRES ---

function updateTimeBar() {
  const ratio = Math.max(0, levelTimeRemaining / levelTimeTotal);
  if(mainBar) mainBar.style.width = ratio * 100 + "%";
}

function startLevelTimer() {
  stopLevelTimer();
  levelTimeRemaining = levelTimeTotal;
  updateTimeBar();
  levelTimer = setInterval(() => {
    levelTimeRemaining = Math.max(0, levelTimeRemaining - 100);
    updateTimeBar();
  }, 100);
}

function stopLevelTimer() {
  if (levelTimer) {
    clearInterval(levelTimer);
    levelTimer = null;
  }
}

function calculateGrade() {
  const ratio = levelTimeRemaining / levelTimeTotal;
  if (ratio > 0.75) return "A+";
  if (ratio > 0.5) return "A";
  if (ratio > 0.25) return "B";
  return "C";
}

function showLevelGrade(grade) {
  let cssClass = "grade-c";
  if (grade === "A+") cssClass = "grade-a-plus";
  else if (grade === "A") cssClass = "grade-a";
  else if (grade === "B") cssClass = "grade-b";

  let el = document.getElementById("levelGrade");
  if (!el) {
    el = document.createElement("div");
    el.id = "levelGrade";
    el.className = "grade-badge";
    gameModuleContainer.appendChild(el);
  }
  el.textContent = grade;
  el.className = `grade-badge ${cssClass}`;
  el.style.opacity = "1";
  el.style.transform = "translate(-50%, -50%) scale(1)";
}

function renderLives() {
  livesWrap.innerHTML = Array(MAX_LIVES).fill(0).map((_,i) => `<div class="heart ${i<lives?'':'off'}"></div>`).join('');
}

// --- SECTION 2: CONNEXION & MENU ---

function showStudent(stu) {
  studentBadge.textContent = `${stu.firstName} ${stu.lastName} – ${stu.classroom}`;
  logoutBtn.style.display = "block";
  
  if (stu.firstName === "Eleve" && stu.lastName === "Test") {
    if(backToProfBtn) backToProfBtn.style.display = "block";
  }
}
logoutBtn.addEventListener("click", () => { localStorage.removeItem("player"); window.location.reload(); });

function getClassKey(classroom) {
  if (!classroom) return null;
  const c = classroom.toUpperCase();
  if (c.startsWith("6")) return "6e";
  if (c.startsWith("5")) return "5e";
  if (c.startsWith("2")) return "2de";
  return "prof";
}

async function loadQuestions(classKey) {
  try {
    const res = await fetch(`/questions/questions-${classKey}.json`);
    if (!res.ok) throw new Error("404");
    levels = await res.json();
  } catch (err) { levels = []; console.error(err); }
}

async function loadAllQuestionsForProf() {
  const keys = ["5e", "6e", "2de"];
  if (!window.allQuestionsData) window.allQuestionsData = {};
  try {
    const resArr = await Promise.all(keys.map(k => fetch(`/questions/questions-${k}.json`)));
    const jsonArr = await Promise.all(resArr.map(r => r.json()));
    keys.forEach((k, i) => { window.allQuestionsData[k] = jsonArr[i]; });
  } catch (e) { console.error("Erreur chargement global questions", e); }
}

async function updateChapterSelectionUI(player) {
  const classKey = getClassKey(player.classroom);
  if(!classKey) return;

  if (!window.allQuestionsData[classKey]) {
    await loadAllQuestionsForProf();
  }
  
  const allLevelsForClass = window.allQuestionsData[classKey] || [];
  const validatedLevelsRaw = player.validatedLevels || [];
  const gradesMap = {};
  const validatedIds = [];

  validatedLevelsRaw.forEach(item => {
    if (typeof item === 'string') {
      gradesMap[item] = "Validé"; validatedIds.push(item);
    } else if (item && item.levelId) {
      gradesMap[item.levelId] = item.grade || "Validé"; validatedIds.push(item.levelId);
    }
  });

  document.querySelectorAll(".chapter-box").forEach((box) => {
    const chapterId = box.dataset.chapter;
    const chapterLevels = allLevelsForClass.filter(l => l.chapterId === chapterId);

    const oldProg = box.querySelector(".chapter-progress");
    if(oldProg) oldProg.style.display = "none";
    const oldStatus = box.querySelector(".chapter-status-text");
    if(oldStatus) oldStatus.style.display = "none";

    const container = box.querySelector(".chapter-levels");
    if (chapterLevels.length === 0) {
      if(container) container.innerHTML = "<small>Aucun niveau dispo</small>";
      return;
    }

    if (container) {
      container.style.display = "block";
      container.innerHTML = chapterLevels.map((lvl, idx) => {
        const grade = gradesMap[lvl.id];
        let badgeClass = "grade-none";
        let badgeText = "Non validé";
        
        if (grade) {
          badgeText = grade;
          if (grade.includes("A")) badgeClass = "grade-a";
          else if (grade.includes("B")) badgeClass = "grade-b";
          else if (grade.includes("C")) badgeClass = "grade-c";
          else badgeClass = "grade-a";
        }

        return `
          <div class="chapter-level-row">
            <span class="chapter-level-label">Niveau ${idx + 1}</span>
            <span class="chapter-level-grade ${badgeClass}">${badgeText}</span>
          </div>`;
      }).join('');
    }

    const isFinished = chapterLevels.every(l => validatedIds.includes(l.id));
    const btn = box.querySelector(".chapter-action-btn");
    
    const triggerGameStart = async () => {
      const startGame = async () => {
        chapterSelection.style.display = "none";
        game.style.display = "block";
        await loadChapter(chapterId, classKey, box.dataset.templateId, box.dataset.gameClass);
        
        // --- SCROLLING AUTO ---
        setTimeout(() => {
           game.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      };

      let fullLessonHTML = "";
      let hasLesson = false;
      chapterLevels.forEach((lvl, index) => {
        if (lvl.lesson) {
          hasLesson = true;
          const cleanTitle = lvl.title.replace(/Chapitre\s+\d+\s*[-—–]\s*Niveau\s+\d+\s*[-—–]\s*/i, "");
          fullLessonHTML += `<div class="lesson-level-title">NIVEAU ${index + 1} : ${cleanTitle}</div>${lvl.lesson}<hr class="lesson-separator" />`;
        }
      });
      if (fullLessonHTML.endsWith('<hr class="lesson-separator" />')) fullLessonHTML = fullLessonHTML.slice(0, -31);
      
      if (!hasLesson) fullLessonHTML = "<h3>🚀 Prêt pour la mission ?</h3><p>Concentre-toi bien et bonne chance !</p>";

      lessonText.innerHTML = fullLessonHTML;
      if(iAmReadyBtn) iAmReadyBtn.style.display = "block";
      if(lessonModal) lessonModal.style.display = "flex";
      pendingLaunch = startGame;
    };

    if (btn) {
      if (isFinished) {
        btn.textContent = "REJOUER";
        btn.onclick = async (e) => {
          e.stopPropagation();
          await fetch("/api/reset-player-chapter", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ playerId: player.id || player._id, levelIds: chapterLevels.map(l=>l.id) })
          });
          await triggerGameStart();
        };
      } else {
        btn.textContent = "JOUER";
        btn.onclick = async (e) => {
          e.stopPropagation();
          await triggerGameStart();
        };
      }
    }
  });
}

// --- SECTION 3: INIT & JEU ---

(async () => {
  if (saved && saved.id) {
    if (saved.id === "prof") {
      showStudent(saved);
      isProfessorMode = true;
      registerCard.style.display = "none";
      await loadAllQuestionsForProf();
      fetchPlayers();
    } else {
      registerCard.style.display = "none";
      try {
        await loadAllQuestionsForProf();
        const res = await fetch(`/api/player-progress/${saved.id}`);
        
        if (res.status === 404) {
          localStorage.removeItem("player");
          window.location.reload();
          return;
        }

        if(res.ok) {
          const serverData = await res.json();
          currentPlayerData = { ...saved, ...serverData };
        } else {
          currentPlayerData = saved;
        }
        
        showStudent(saved);
        await updateChapterSelectionUI(currentPlayerData);
        chapterSelection.style.display = "block";
      } catch (e) {
        console.error(e);
        alert("Erreur connexion. Rechargez la page.");
      }
    }
  } else {
    registerCard.style.display = "block";
  }
})();

async function loadChapter(chapId, classKey, templateId, gameClass) {
  gameModuleContainer.innerHTML = "Chargement...";
  await loadQuestions(classKey);
  levels = levels.filter(l => l.chapterId === chapId);
  
  if(!levels.length) { gameModuleContainer.innerHTML = "Erreur: Pas de niveaux."; return; }

  try {
    const res = await fetch(`chapitres/${chapId}.html`);
    if(!res.ok) throw new Error("Module introuvable");
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tpl = doc.querySelector(`#${templateId}`);
    const script = doc.querySelector("script");
    
    gameModuleContainer.innerHTML = "";
    gameModuleContainer.appendChild(tpl.content.cloneNode(true));
    eval(script.textContent);

    const ctrl = {
      notifyCorrectAnswer: () => { if(isGameActive) { incrementProgress(1); setTimeout(() => nextQuestion(false), 900); } },
      notifyWrongAnswer: (d) => { if(isGameActive) wrongAnswerFlow(d); },
      getState: () => ({ isLocked: locked })
    };

    currentGameModuleInstance = new window[gameClass](gameModuleContainer, ctrl);
    initQuiz();
  } catch(e) {
    console.error(e);
    gameModuleContainer.innerHTML = "Erreur chargement module.";
  }
}

async function initQuiz() {
  if (!levels.length) return;
  setupLevel(0); 
}

function setupLevel(idx) {
  isGameActive = true;
  currentLevel = idx;
  
  if (!levels[currentLevel]) {
    gameModuleContainer.innerHTML = "<h1>🎉 Chapitre Terminé !</h1><button onclick='window.location.reload()'>Retour au menu</button>";
    return;
  }
  
  const lvl = levels[currentLevel];
  const summary = document.getElementById("levelGradesSummary");
  if(summary) summary.remove();
  levelTitle.textContent = lvl.title.replace(/Chapitre\s+\d+\s*[-—–]\s*/i, "");
  
  const welcome = document.getElementById("welcomeText");
  if(welcome) { welcome.textContent = `Bienvenue ${currentPlayerData.firstName} !`; welcome.style.display = "block"; }

  if (lvl.lesson) {
    if(openLessonBtn) openLessonBtn.style.display = "block";
    if(lessonText) lessonText.innerHTML = lvl.lesson; 
  } else {
    if(openLessonBtn) openLessonBtn.style.display = "none";
    if(lessonText) lessonText.innerHTML = "<p>Pas de fiche.</p>";
  }
  if(lessonModal) lessonModal.style.display = "none";

  localScores = new Array(lvl.questions.length).fill(0);
  general = 0; currentIndex = -1; lives = MAX_LIVES;
  renderLives();
  
  subBarsContainer.innerHTML = "";
  lvl.questions.forEach((_, i) => {
    const d = document.createElement("div");
    d.className = "subProgress";
    d.innerHTML = `<div class="subBar" id="subBar${i}"></div><div class="subLabel">${i+1}</div>`;
    d.onclick = () => handleBarClick(i);
    subBarsContainer.appendChild(d);
  });
  
  updateBars();
  startLevelTimer();
  nextQuestion(false);
}

function updateBars() {
  if (!levels[currentLevel]) return;
  const lvl = levels[currentLevel];
  generalText.textContent = `Compteur : ${general}/${lvl.questions.length}`;
  lvl.questions.forEach((_, i) => {
    const b = $(`#subBar${i}`);
    if(b) b.style.width = (Math.min(localScores[i], lvl.requiredPerQuestion)/lvl.requiredPerQuestion)*100 + "%";
  });
}

function findNextIndex(from) {
  const lvl = levels[currentLevel];
  for(let i=from+1; i<lvl.questions.length; i++) if(localScores[i]<lvl.requiredPerQuestion) return i;
  for(let i=0; i<=from; i++) if(localScores[i]<lvl.requiredPerQuestion) return i;
  return null;
}

async function nextQuestion(keep) {
  if(currentGameModuleInstance && !keep) currentGameModuleInstance.resetAnimation();
  locked = false;
  const lvl = levels[currentLevel];

  if(general >= lvl.questions.length) {
    stopLevelTimer();
    const grade = calculateGrade();
    showLevelGrade(grade);
    
    await saveProgress("level", lvl.id, grade);
    
    if(currentLevel < levels.length - 1) {
      setTimeout(() => { 
        if(isGameActive) { 
          $("#levelGrade").style.opacity="0"; 
          setupLevel(currentLevel+1); 
        }
      }, 2600);
    } else {
      setTimeout(() => { if(isGameActive) gameModuleContainer.innerHTML="<h1>🎉 Chapitre Terminé !</h1><button onclick='window.location.reload()'>Retour au menu</button>"; }, 2600);
    }
    return;
  }
  
  currentIndex = findNextIndex(currentIndex);
  if(currentIndex !== null && currentGameModuleInstance) {
    currentGameModuleInstance.loadQuestion(lvl.questions[currentIndex]);
    currentGameModuleInstance.startAnimation();
  }
}

function incrementProgress(v) {
  if (!isGameActive) return;
  const lvl = levels[currentLevel];
  const req = lvl.requiredPerQuestion;
  
  if (typeof localScores[currentIndex] === 'undefined') localScores[currentIndex] = 0;
  const oldScore = localScores[currentIndex];
  localScores[currentIndex] = Math.min(req, oldScore + v);
  
  if (oldScore < req && localScores[currentIndex] >= req) {
    general++;
    saveProgress("question", `${lvl.id}-${currentIndex}`);
  }
  updateBars();
}

function wrongAnswerFlow(q) {
  if(!isGameActive) return;
  if(currentGameModuleInstance) currentGameModuleInstance.resetAnimation();
  lives = Math.max(0, lives-1); renderLives();
  if(lives === 0) overlay.style.display = "flex";
  else if(q) { correctionText.textContent = q.a; correctionOverlay.style.display = "flex"; }
  else { locked=true; setTimeout(() => nextQuestion(false), 1500); }
}

closeCorrectionBtn.addEventListener("click", () => { correctionOverlay.style.display="none"; nextQuestion(true); });
restartBtn.addEventListener("click", () => { overlay.style.display="none"; setupLevel(currentLevel); });

backToMenuBtn?.addEventListener("click", async () => {
  isGameActive = false;
  stopLevelTimer();
  overlay.style.display = "none";
  correctionOverlay.style.display = "none";
  if(lessonModal) lessonModal.style.display = "none";
  const lg = $("#levelGrade"); if(lg) lg.style.opacity="0";
  
  if(currentGameModuleInstance?.resetAnimation) try{currentGameModuleInstance.resetAnimation()}catch(e){}
  
  game.style.display = "none";
  chapterSelection.style.display = "block";
  
  if(currentPlayerId && currentPlayerId !== "prof") {
    try {
      const res = await fetch(`/api/player-progress/${currentPlayerId}`);
      if(res.ok) updateChapterSelectionUI({ ...saved, ...(await res.json()) });
    } catch(e){}
  }
});

async function saveProgress(type, val, grade) {
  if(!currentPlayerId || currentPlayerId==="prof") return;
  try {
    await fetch("/api/save-progress", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ playerId: currentPlayerId, progressType: type, value: val, grade: grade })
    });
  } catch(e) { console.error(e); }
}

async function handleBarClick(i) {
  if(locked || !isGameActive) return;
  
  // SÉCURITÉ CHEAT CODE (R + T)
  if (!isRKeyDown || !isTKeyDown) return;

  locked = true;
  const lvl = levels[currentLevel];
  if (localScores[i] < lvl.requiredPerQuestion) {
    const old = localScores[i];
    localScores[i]++;
    updateBars();
    if (old < lvl.requiredPerQuestion && localScores[i] >= lvl.requiredPerQuestion) {
      general++;
      saveProgress("question", `${lvl.id}-${i}`);
    }
    const bar = $(`#subBar${i}`).parentElement;
    bar.classList.add("saved-success");
    setTimeout(()=>bar.classList.remove("saved-success"), 600);
    
    if (general >= lvl.questions.length) nextQuestion(false);
    else {
      currentIndex = i;
      if(currentGameModuleInstance) {
        currentGameModuleInstance.loadQuestion(lvl.questions[currentIndex]);
        currentGameModuleInstance.startAnimation();
      }
    }
  }
  locked = false;
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  startBtn.disabled = true;
  const body = { firstName: $("#firstName").value, lastName: $("#lastName").value, classroom: $("#classroom").value };
  
  if(body.firstName.toLowerCase()==="jean" && body.lastName.toLowerCase()==="vuillet") {
    $("#profPasswordModal").style.display="block"; startBtn.disabled=false; return;
  }
  
  try {
    const res = await fetch("/api/register", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const d = await res.json();
    if(!res.ok) throw new Error(d.error);
    localStorage.setItem("player", JSON.stringify(d));
    window.location.reload();
  } catch(err) { formMsg.textContent = "❌ " + err.message; startBtn.disabled=false; }
});

$("#validateProfPasswordBtn")?.addEventListener("click", () => {
  if($("#profPassword").value === "Clemenceau1919") {
    localStorage.setItem("player", JSON.stringify({ id: "prof", firstName: "Jean", lastName: "Vuillet", classroom: "Professeur" }));
    window.location.reload();
  }
});

// TABLEAU PROF
async function fetchPlayers() {
  if (!profDashboard) return;
  profDashboard.style.display = "block";
  const table = $("#playersTable");
  table.querySelectorAll("tbody").forEach((tbody) => tbody.remove());
  try {
    const response = await fetch("/api/players", { cache: "no-store" });
    if (!response.ok) throw new Error("Erreur réseau.");
    allPlayersData = await response.json();
    applyFiltersAndRender();
  } catch (error) { console.error(error); }
}

function generateFullChapterProgress(allLevels, validatedLevelIds, gradesMap, validatedQuestions) {
  if (!allLevels || allLevels.length === 0) return "N/A";
  let html = '<div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">';

  allLevels.forEach((lvl, idx) => {
    const isDone = validatedLevelIds.includes(lvl.id);
    if (isDone) {
      const grade = gradesMap[lvl.id] || "?";
      let cssClass = "grade-C";
      if(grade.includes("A")) cssClass="grade-A"; else if(grade.includes("B")) cssClass="grade-B";
      html += `<span class="table-grade-badge ${cssClass}" title="Niveau ${idx+1}">${idx+1}:${grade}</span>`;
    }
  });

  const currentLvlObj = allLevels.find(lvl => !validatedLevelIds.includes(lvl.id));
  if (currentLvlObj) {
    html += `<div class="questions-list" style="display: inline-flex; gap: 2px; margin-left:4px;">`;
    for (let i = 0; i < currentLvlObj.questions.length; i++) {
      const qId = `${currentLvlObj.id}-${i}`;
      const isValid = validatedQuestions.includes(qId);
      const indicatorClass = isValid ? "question-valid" : "question-invalid";
      html += `<div class="question-indicator ${indicatorClass}" title="Question ${i+1}">${i+1}</div>`;
    }
    html += `</div>`;
  } else {
    if (allLevels.every(l => validatedLevelIds.includes(l.id))) {
       html += `<span style="margin-left:4px; font-size:14px;">🏆</span>`;
    }
  }
  html += '</div>';
  return html;
}

function renderPlayers(playersToRender) {
  const table = $("#playersTable");
  table.querySelectorAll("tbody").forEach((tbody) => tbody.remove());
  if (playersToRender.length === 0) {
    const tbody = document.createElement("tbody");
    tbody.innerHTML = `<tr><td colspan="6">Aucun élève trouvé.</td></tr>`;
    table.appendChild(tbody);
    return;
  }
  const chaptersToDisplay = { 
    "ch1-zombie": "Chapitre 1", 
    "ch2-starship": "Chapitre 2",
    "ch3-jumper": "Chapitre 3" 
  };

  playersToRender.sort((a, b) => a.lastName.localeCompare(b.lastName)).forEach((player) => {
      const playerTbody = document.createElement("tbody");
      playerTbody.style.borderTop = "1px solid #e2e8f0";
      const classKey = getClassKey(player.classroom);
      const allLevelsForClass = (window.allQuestionsData && window.allQuestionsData[classKey]) || [];
      
      const gradesMap = {};
      const validatedLevelIds = [];
      (player.validatedLevels || []).forEach(l => {
        if(typeof l === 'string') { gradesMap[l] = "Validé"; validatedLevelIds.push(l); }
        else { gradesMap[l.levelId] = l.grade; validatedLevelIds.push(l.levelId); }
      });
      const validatedQuestions = player.validatedQuestions || [];

      let chapterRowsHtml = ""; let isFirstRow = true;

      for (const chapterId in chaptersToDisplay) {
        const chapterLabel = chaptersToDisplay[chapterId];
        const levelsInThisChapter = allLevelsForClass.filter(l => l.chapterId === chapterId);
        let progressHtml = ""; let levelTitleHtml = "";
        if (levelsInThisChapter.length === 0) { progressHtml = "-"; levelTitleHtml = "-"; } 
        else {
          const currentLvl = levelsInThisChapter.find(l => !validatedLevelIds.includes(l.id));
          levelTitleHtml = currentLvl ? currentLvl.title : "<strong>Terminé</strong>";
          progressHtml = generateFullChapterProgress(levelsInThisChapter, validatedLevelIds, gradesMap, validatedQuestions);
        }

        if (isFirstRow) {
          chapterRowsHtml += `<tr>
            <td rowspan="${Object.keys(chaptersToDisplay).length}" style="vertical-align: middle; padding-left: 10px;">
              <strong>${player.firstName} ${player.lastName}</strong>
            </td>
            <td rowspan="${Object.keys(chaptersToDisplay).length}" style="vertical-align: middle;">${player.classroom}</td>
            <td>${chapterLabel}</td>
            <td>${levelTitleHtml}</td>
            <td>${progressHtml}</td>
            <td rowspan="${Object.keys(chaptersToDisplay).length}" style="vertical-align: middle;">
              <button class="action-btn reset-btn" data-player-id="${player._id}" data-player-name="${player.firstName} ${player.lastName}">Réinitialiser</button>
            </td>
          </tr>`;
          isFirstRow = false;
        } else {
          chapterRowsHtml += `<tr><td>${chapterLabel}</td><td>${levelTitleHtml}</td><td>${progressHtml}</td></tr>`;
        }
      }
      playerTbody.innerHTML = chapterRowsHtml;
      table.appendChild(playerTbody);
    });
}

function applyFiltersAndRender() {
  let filtered = [...allPlayersData];
  const selectedClass = classFilter ? classFilter.value : "all";
  const searchTerm = studentSearch ? studentSearch.value.trim().toLowerCase() : "";
  if (selectedClass !== "all") filtered = filtered.filter((p) => p.classroom === selectedClass);
  if (searchTerm) filtered = filtered.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm));
  renderPlayers(filtered);
}

classFilter?.addEventListener("change", applyFiltersAndRender);
studentSearch?.addEventListener("input", applyFiltersAndRender);

// --- LOGIQUE BOUTON TEST CLASSE ---
testClassBtn?.addEventListener("click", async () => {
  const selectedClass = classFilter ? classFilter.value : "all";
  
  if (selectedClass === "all") {
    alert("Veuillez sélectionner une classe spécifique dans le menu déroulant avant de cliquer sur Tester.");
    return;
  }

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Eleve", lastName: "Test", classroom: selectedClass }),
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors de la connexion test.");
    
    localStorage.setItem("player", JSON.stringify(data));
    window.location.reload();
    
  } catch (err) {
    console.error(err);
    alert("Impossible de trouver le compte 'Eleve Test'. Assurez-vous d'avoir relancé init-db.js.");
  }
});

resetAllBtn?.addEventListener("click", async () => {
  if (confirm("⚠️ Réinitialiser TOUS les élèves ?")) {
    await fetch("/api/reset-all-players", { method: "POST" });
    fetchPlayers();
  }
});

playersBody?.addEventListener("click", async (e) => {
  const target = e.target;
  if (target.matches(".reset-btn")) {
    const { playerId, playerName } = target.dataset;
    if (confirm(`Réinitialiser ${playerName} ?`)) {
      await fetch("/api/reset-player", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId }) });
      fetchPlayers();
    }
  }
});