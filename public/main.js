window.isGlobalPaused = false; 
const $ = (sel) => document.querySelector(sel);

// ==========================================================
// 1. SÉLECTEURS UI
// ==========================================================
const studentBadge = $("#studentBadge"), logoutBtn = $("#logoutBtn");
const backToProfBtn = $("#backToProfBtn");
const registerCard = $("#registerCard"), chapterSelection = $("#chapterSelection"), game = $("#game");
const form = $("#registerForm"), startBtn = $("#startBtn"), formMsg = $("#formMsg");
const gameModuleContainer = $("#gameModuleContainer");
const levelTitle = $("#levelTitle"), livesWrap = $("#lives"), mainBar = $("#mainBar"), subBarsContainer = $("#subBars"), generalText = $("#general");
const overlay = $("#overlay"), restartBtn = $("#restartBtn");
const correctionOverlay = $("#correctionOverlay"), correctionText = $("#correctionText"), closeCorrectionBtn = $("#closeCorrectionBtn");
const backToMenuBtn = $("#backToMenuBtn");

// Dashboard & Modals
const profDashboard = $("#profDashboard"), playersBody = $("#playersBody"), classFilter = $("#classFilter"), resetAllBtn = $("#resetAllBtn"), studentSearch = $("#studentSearch");
const testClassBtn = $("#testClassBtn");
const addHomeworkBtn = $("#addHomeworkBtn"); 
const createHomeworkModal = $("#createHomeworkModal");
const saveHomeworkBtn = $("#saveHomeworkBtn");

// Éditeur Visuel
const visualEditorModal = $("#visualEditorModal");
const visualEditorContainer = $("#visualEditorContainer"); 
const saveVisualOrderBtn = $("#saveVisualOrderBtn");
const closeVisualEditorBtn = $("#closeVisualEditorBtn");
const btnPrevLevel = $("#btnPrevLevel");
const btnNextLevel = $("#btnNextLevel");
const lblCurrentLevel = $("#lblCurrentLevel");
const visualNavControls = $("#visualNavControls");

const openLessonBtn = $("#openLessonBtn"); const lessonModal = $("#lessonModal"); const closeLessonBtn = $("#closeLessonBtn"); const lessonText = $("#lessonText"); const iAmReadyBtn = $("#iAmReadyBtn");
const myMistakesBtn = $("#myMistakesBtn"); const mistakesModal = $("#mistakesModal"); const closeMistakesBtn = $("#closeMistakesBtn"); const mistakesList = $("#mistakesList");
const activityModal = $("#activityModal"); const closeActivityBtn = $("#closeActivityBtn"); const activityBody = $("#activityBody"); const activityStudentName = $("#activityStudentName");
const pauseReportBtn = $("#pauseReportBtn"); const bugModal = $("#bugModal"); const sendBugBtn = $("#sendBugBtn"); const resumeGameBtn = $("#resumeGameBtn");

const tabStudents = $("#tabStudents");
const tabHomeworks = $("#tabHomeworks");
const contentStudents = $("#contentStudents");
const contentHomeworks = $("#contentHomeworks");

// ==========================================================
// 2. VARIABLES GLOBALES
// ==========================================================
window.allQuestionsData = {}; 
let isProfessorMode = false;
const saved = JSON.parse(localStorage.getItem("player") || "null");
let currentPlayerId = saved ? saved.id : null;
let currentPlayerData = saved || null;
let levels = [], localScores = [], general = 0, currentLevel = 0, currentIndex = -1, locked = false;
let lives = 4; const MAX_LIVES = 4;
let isGameActive = false; 
let currentGameModuleInstance = null;
let levelTimer = null, levelTimeTotal = 180000, levelTimeRemaining = 180000;
let pendingLaunch = null; 

// Variables Création / Édition Devoirs
let tempHwLevels = []; 
let currentQuestionFiles = []; 
let editingHomeworkId = null; 
let currentHomeworkData = null; 
let editingLevelIndex = 0; 
let tempRow1 = [];
let tempRow2 = [];

// ==========================================================
// 3. CHEAT CODES & INIT
// ==========================================================
let isRKeyDown = false; let isTKeyDown = false;
document.addEventListener("keydown", (e) => { if (!e || !e.key) return; if (e.key.toLowerCase() === "r") isRKeyDown = true; if (e.key.toLowerCase() === "t") isTKeyDown = true; });
document.addEventListener("keyup", (e) => { if (!e || !e.key) return; if (e.key.toLowerCase() === "r") isRKeyDown = false; if (e.key.toLowerCase() === "t") isTKeyDown = false; });
$("#mainProgress")?.addEventListener("click", () => { 
    if (!isGameActive) return; if (!isRKeyDown || !isTKeyDown) return; 
    updateTimeBar(); const lvl = levels[currentLevel]; 
    if(lvl) { general = lvl.questions.length; nextQuestion(false); } 
});

if(backToProfBtn) {
    backToProfBtn.addEventListener("click", () => { 
        localStorage.setItem("player", JSON.stringify({ id: "prof", firstName: "Jean", lastName: "Vuillet", classroom: "Professeur" })); 
        window.location.reload(); 
    });
}

// Listeners Modales
if(iAmReadyBtn) iAmReadyBtn.addEventListener("click", () => { if(lessonModal) lessonModal.style.display = "none"; });
if(closeLessonBtn) closeLessonBtn.addEventListener("click", () => { if(lessonModal) lessonModal.style.display = "none"; });
if(openLessonBtn) openLessonBtn.addEventListener("click", () => { if (iAmReadyBtn) iAmReadyBtn.style.display = "none"; if (lessonModal) lessonModal.style.display = "flex"; });
if(closeMistakesBtn) closeMistakesBtn.addEventListener("click", () => mistakesModal.style.display = "none");
if(closeActivityBtn) closeActivityBtn.addEventListener("click", () => activityModal.style.display = "none");

if(myMistakesBtn) {
    myMistakesBtn.addEventListener("click", async () => {
        if(!currentPlayerId) return;
        mistakesList.innerHTML = "Chargement..."; mistakesModal.style.display = "flex";
        try {
            const res = await fetch(`/api/player-progress/${currentPlayerId}`); const data = await res.json(); const mistakes = data.spellingMistakes || [];
            if(mistakes.length === 0) { mistakesList.innerHTML = "<p style='text-align:center;'>Bravo ! Aucune faute. 🎉</p>"; } 
            else {
                let html = "<ul style='list-style:none; padding:0;'>";
                mistakes.forEach(m => { html += `<li style="background:#fff1f2; margin-bottom:8px; padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; border:1px solid #fecaca;"><div><span style="text-decoration:line-through; color:#ef4444; margin-right:10px;">${m.wrong}</span>👉 <strong style="color:#16a34a;">${m.correct}</strong></div><button class="delete-mistake-btn" data-word="${m.wrong}" style="background:transparent; border:none; color:#666; font-size:18px; cursor:pointer;">✅</button></li>`; });
                html += "</ul>"; mistakesList.innerHTML = html;
                document.querySelectorAll(".delete-mistake-btn").forEach(btn => {
                    btn.onclick = async (e) => { const word = e.target.dataset.word; e.target.closest("li").remove(); await fetch(`/api/spelling-mistake/${currentPlayerId}/${word}`, { method: 'DELETE' }); };
                });
            }
        } catch(e) { mistakesList.innerHTML = "Erreur chargement."; }
    });
}

// Listeners Onglets
if (tabStudents) { tabStudents.addEventListener("click", () => { tabStudents.classList.add("active"); tabHomeworks.classList.remove("active"); contentStudents.classList.add("active"); contentHomeworks.classList.remove("active"); }); }
if (tabHomeworks) { tabHomeworks.addEventListener("click", () => { tabHomeworks.classList.add("active"); tabStudents.classList.remove("active"); contentHomeworks.classList.add("active"); contentStudents.classList.remove("active"); loadProfHomeworks(); }); }

if(pauseReportBtn) pauseReportBtn.addEventListener('click', () => { if(isGameActive) { window.isGlobalPaused = true; } if(bugModal) bugModal.style.display = 'flex'; });
if(resumeGameBtn) resumeGameBtn.addEventListener('click', () => { window.isGlobalPaused = false; if(bugModal) bugModal.style.display = 'none'; });
if(sendBugBtn) {
  sendBugBtn.addEventListener('click', async () => {
    const desc = $("#bugDescription").value.trim(); if(!desc) return alert("Veuillez décrire le problème.");
    sendBugBtn.textContent = "Envoi..."; sendBugBtn.disabled = true;
    try { await fetch('/api/report-bug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reporterName: currentPlayerData ? `${currentPlayerData.firstName} ${currentPlayerData.lastName}` : "Anonyme", classroom: currentPlayerData ? currentPlayerData.classroom : "?", description: desc, gameChapter: isGameActive ? (levelTitle ? levelTitle.textContent : "Jeu") : "Menu Principal" }) }); alert("Bug signalé avec succès ! Merci."); $("#bugDescription").value = ""; } catch(e) { alert("Erreur envoi."); } sendBugBtn.textContent = "🐞 Envoyer Rapport"; sendBugBtn.disabled = false;
  });
}

if(closeCorrectionBtn) closeCorrectionBtn.addEventListener("click", () => { correctionOverlay.style.display="none"; nextQuestion(true); });
if(restartBtn) restartBtn.addEventListener("click", () => { overlay.style.display="none"; setupLevel(currentLevel); });

// RETOUR MENU
if(backToMenuBtn) {
    backToMenuBtn.addEventListener("click", async () => {
        isGameActive = false; stopLevelTimer();
        if(game) game.style.display = "none";
        if(overlay) overlay.style.display = "none";
        if(correctionOverlay) correctionOverlay.style.display = "none";
        if(lessonModal) lessonModal.style.display = "none";
        if(currentGameModuleInstance && typeof currentGameModuleInstance.resetAnimation === 'function') try { currentGameModuleInstance.resetAnimation(); } catch(e){}
        currentGameModuleInstance = null;
        gameModuleContainer.innerHTML = ""; 
        if(chapterSelection) chapterSelection.style.display = "block";
        if(pauseReportBtn) pauseReportBtn.style.display = "none";
        if(myMistakesBtn && currentPlayerId && currentPlayerId !== "prof") myMistakesBtn.style.display = "inline-block";
        if(currentPlayerId && currentPlayerId !== "prof") { try { const res = await fetch(`/api/player-progress/${currentPlayerId}`); if(res.ok) updateChapterSelectionUI({ ...saved, ...(await res.json()) }); } catch(e){} }
    });
}

// ==========================================================
// 4. BOUCLE DE JEU (MÉCANIQUE ZOMBIE/REDACTION)
// ==========================================================
function setupLevel(idx) {
  isGameActive = true; currentLevel = idx;
  if (!levels[currentLevel]) { if(gameModuleContainer) gameModuleContainer.innerHTML = "<h1>🎉 Chapitre Terminé !</h1><button onclick='window.location.reload()'>Retour au menu</button>"; return; }
  
  const lvl = levels[currentLevel];
  if(levelTitle) levelTitle.textContent = lvl.title.replace(/Chapitre\s+\d+\s*[-—–]\s*/i, "");
  
  // Affichage de la leçon
  if (lvl.lesson) { if(openLessonBtn) openLessonBtn.style.display = "block"; if(lessonText) lessonText.innerHTML = lvl.lesson; } 
  else { if(openLessonBtn) openLessonBtn.style.display = "none"; if(lessonText) lessonText.innerHTML = "<p>Pas de fiche.</p>"; }
  if(lessonModal) lessonModal.style.display = "none";
  
  // Reset Stats
  localScores = new Array(lvl.questions.length).fill(0);
  general = 0; currentIndex = -1; lives = MAX_LIVES;
  renderLives();
  
  // Barres de progression
  if(subBarsContainer) {
      subBarsContainer.innerHTML = "";
      lvl.questions.forEach((_, i) => {
        const d = document.createElement("div"); d.className = "subProgress"; 
        d.innerHTML = `<div class="subBar" id="subBar${i}"></div><div class="subLabel">${i+1}</div>`; 
        d.onclick = () => handleBarClick(i); 
        subBarsContainer.appendChild(d);
      });
  }
  updateBars(); startLevelTimer(); nextQuestion(false);
}

function updateBars() { if (!levels[currentLevel]) return; const lvl = levels[currentLevel]; if(generalText) generalText.textContent = `Compteur : ${general}/${lvl.questions.length}`; lvl.questions.forEach((_, i) => { const b = $(`#subBar${i}`); if(b) b.style.width = (Math.min(localScores[i], lvl.requiredPerQuestion)/lvl.requiredPerQuestion)*100 + "%"; }); }
function findNextIndex(from) { const lvl = levels[currentLevel]; for(let i=from+1; i<lvl.questions.length; i++) if(localScores[i]<lvl.requiredPerQuestion) return i; for(let i=0; i<=from; i++) if(localScores[i]<lvl.requiredPerQuestion) return i; return null; }

async function nextQuestion(keep) {
  if(currentGameModuleInstance && !keep) try{currentGameModuleInstance.resetAnimation()}catch(e){}
  locked = false; const lvl = levels[currentLevel];
  
  // Fin du niveau ?
  if(general >= lvl.questions.length) {
    stopLevelTimer(); const grade = calculateGrade(); showLevelGrade(grade); await saveProgress("level", lvl.id, grade);
    if(currentLevel < levels.length - 1) { setTimeout(() => { if(isGameActive) { $("#levelGrade").style.opacity="0"; setupLevel(currentLevel+1); } }, 2600); } 
    else { setTimeout(() => { if(isGameActive) gameModuleContainer.innerHTML="<h1>🎉 Chapitre Terminé !</h1><button onclick='window.location.reload()'>Retour au menu</button>"; }, 2600); }
    return;
  }
  
  currentIndex = findNextIndex(currentIndex);
  if(currentIndex !== null && currentGameModuleInstance) { 
      currentGameModuleInstance.loadQuestion(lvl.questions[currentIndex]); 
      if(currentGameModuleInstance.startAnimation) currentGameModuleInstance.startAnimation(); 
  }
}

function incrementProgress(v) { 
    if (!isGameActive) return; 
    const lvl = levels[currentLevel]; const req = lvl.requiredPerQuestion; 
    if (typeof localScores[currentIndex] === 'undefined') localScores[currentIndex] = 0; 
    const oldScore = localScores[currentIndex]; 
    localScores[currentIndex] = Math.min(req, oldScore + v); 
    if (oldScore < req && localScores[currentIndex] >= req) { general++; saveProgress("question", `${lvl.id}-${currentIndex}`); } 
    updateBars(); 
}

function wrongAnswerFlow(q) {
  if(!isGameActive) return; 
  if(currentGameModuleInstance) try{currentGameModuleInstance.resetAnimation()}catch(e){}
  lives = Math.max(0, lives-1); renderLives();
  if(lives === 0) { if(overlay) overlay.style.display = "flex"; } else {
    let answerText = ""; if (q) { if (typeof q === "string") { answerText = q; } else if (typeof q === "object") { if (q.a) answerText = q.a; else if (q.expectedAnswer) answerText = q.expectedAnswer; } }
    if(correctionText) correctionText.textContent = answerText || "Aie !"; 
    if(correctionOverlay) correctionOverlay.style.display = "flex";
  }
}

function handleBarClick(i) {
  if(locked || !isGameActive) return;
  if (!isRKeyDown || !isTKeyDown) return;
  locked = true; const lvl = levels[currentLevel];
  if (localScores[i] < lvl.requiredPerQuestion) {
    const old = localScores[i]; localScores[i]++; updateBars();
    if (old < lvl.requiredPerQuestion && localScores[i] >= lvl.requiredPerQuestion) { general++; saveProgress("question", `${lvl.id}-${i}`); }
    const bar = $(`#subBar${i}`).parentElement; bar.classList.add("saved-success"); setTimeout(()=>bar.classList.remove("saved-success"), 600);
    if (general >= lvl.questions.length) nextQuestion(false); else { currentIndex = i; if(currentGameModuleInstance) { currentGameModuleInstance.loadQuestion(lvl.questions[currentIndex]); try{currentGameModuleInstance.startAnimation()}catch(e){} } }
  }
  locked = false;
}

function updateTimeBar() { const ratio = Math.max(0, levelTimeRemaining / levelTimeTotal); if(mainBar) mainBar.style.width = ratio * 100 + "%"; }
function startLevelTimer() { stopLevelTimer(); levelTimeRemaining = levelTimeTotal; updateTimeBar(); levelTimer = setInterval(() => { if(window.isGlobalPaused) return; levelTimeRemaining = Math.max(0, levelTimeRemaining - 100); updateTimeBar(); }, 100); }
function stopLevelTimer() { if (levelTimer) { clearInterval(levelTimer); levelTimer = null; } }
function calculateGrade() { const ratio = levelTimeRemaining / levelTimeTotal; if (ratio > 0.75) return "A+"; if (ratio > 0.5) return "A"; if (ratio > 0.25) return "B"; return "C"; }
function showLevelGrade(grade) { let el = document.getElementById("levelGrade"); if (!el) { el = document.createElement("div"); el.id = "levelGrade"; el.className = "grade-badge"; gameModuleContainer.appendChild(el); } el.textContent = grade; el.className = `grade-badge grade-${grade.toLowerCase().replace('+','-plus')}`; el.style.opacity = "1"; }
function renderLives() { if(livesWrap) livesWrap.innerHTML = Array(MAX_LIVES).fill(0).map((_,i) => `<div class="heart ${i<lives?'':'off'}"></div>`).join(''); }

async function saveProgress(type, val, grade) { if(!currentPlayerId || currentPlayerId==="prof") return; try { await fetch("/api/save-progress", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ playerId: currentPlayerId, progressType: type, value: val, grade: grade }) }); } catch(e) { console.error(e); } }

// ==========================================================
// 5. GESTION PROF & MODALES
// ==========================================================
if(form) form.addEventListener("submit", async (e) => {
  e.preventDefault(); startBtn.disabled = true;
  const body = { firstName: $("#firstName").value, lastName: $("#lastName").value, classroom: $("#classroom").value };
  if(body.firstName.toLowerCase()==="jean" && body.lastName.toLowerCase()==="vuillet") { $("#profPasswordModal").style.display="block"; startBtn.disabled=false; return; }
  try {
    const res = await fetch("/api/register", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const d = await res.json(); if(!res.ok) throw new Error(d.error);
    localStorage.setItem("player", JSON.stringify(d)); window.location.reload();
  } catch(err) { formMsg.textContent = "❌ " + err.message; startBtn.disabled=false; }
});
$("#validateProfPasswordBtn")?.addEventListener("click", () => { if($("#profPassword").value === "Clemenceau1919") { localStorage.setItem("player", JSON.stringify({ id: "prof", firstName: "Jean", lastName: "Vuillet", classroom: "Professeur" })); window.location.reload(); } });

function initHomeworkModal() {
    tempRow1 = []; tempRow2 = [];
    const modalContent = createHomeworkModal.querySelector('.modal-content');
    modalContent.innerHTML = `
        <h3>📚 Créer un Devoir</h3>
        <label><b>Titre du Devoir :</b></label><input id="hwTitle" placeholder="Ex: DM Géographie" style="width:100%; margin-bottom:10px; padding:10px; border:1px solid #ccc;">
        <label><b>Classe concernée :</b></label><select id="hwClass" style="width:100%; margin-bottom:15px; padding:10px; border:1px solid #ccc;"><option value="Toutes">Toutes les classes</option><option value="6D">6eD</option><option value="5B">5eB</option><option value="5C">5eC</option><option value="2A">2de A</option></select>
        <hr style="margin: 15px 0; border:0; border-top:1px solid #eee;">
        <h4>Questions Prêtes (${tempHwLevels.length}) :</h4><div id="hwQuestionsList" style="margin-bottom:15px; max-height:100px; overflow-y:auto; border:1px solid #eee; padding:5px;"><em style="color:#666;">Aucune question ajoutée.</em></div>
        <div style="background:#f8fafc; padding:15px; border:2px dashed #3b82f6; border-radius:8px; margin-bottom:15px;">
            <h4 style="margin-top:0; color:#2563eb;">➕ Nouvelle Question</h4>
            <textarea id="newQInst" rows="2" placeholder="Consigne de la question..." style="width:100%; margin-bottom:10px; padding:8px; border:1px solid #ccc;"></textarea>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                <label style="font-weight:bold;">📸 Documents & Images :</label>
                <label class="action-btn" style="background:#3b82f6; color:white; cursor:pointer; font-size:0.9em;">📂 Ajouter des fichiers<input type="file" id="newQFiles" accept=".pdf, image/*" multiple style="display:none;"></label>
            </div>
            <div style="background:#e2e8f0; padding:10px; border-radius:8px; display:flex; flex-direction:column; gap:10px;">
                <div style="background:white; border-radius:4px; padding:5px;"><div style="font-size:0.8em; color:#64748b; margin-bottom:5px; font-weight:bold;">LIGNE 1 (Haut - 75%)</div><div id="visualRow1" class="drop-zone" style="min-height:120px; display:flex; gap:10px; overflow-x:auto; padding:5px; border:1px dashed #cbd5e1; align-items:center;"><span id="ph1" style="color:#94a3b8; font-size:0.8em; width:100%; text-align:center;">Glissez vos images ici</span></div></div>
                <div style="background:white; border-radius:4px; padding:5px;"><div style="font-size:0.8em; color:#64748b; margin-bottom:5px; font-weight:bold;">LIGNE 2 (Bas - 25%)</div><div id="visualRow2" class="drop-zone" style="min-height:120px; display:flex; gap:10px; overflow-x:auto; padding:5px; border:1px dashed #cbd5e1; align-items:center;"><span id="ph2" style="color:#94a3b8; font-size:0.8em; width:100%; text-align:center;">... ou ici</span></div></div>
            </div>
            <button id="btnAddQ" style="width:100%; padding:12px; background:#eff6ff; color:#2563eb; border:1px solid #2563eb; cursor:pointer; font-weight:bold; margin-top:15px; border-radius:5px;">Valider et Ajouter cette question</button>
        </div>
        <div style="display:flex; gap:10px; justify-content:center;"><button id="btnPublishHW" style="background:#16a34a; color:white; padding:12px 25px; border:none; border-radius:5px; font-weight:bold;">✅ TOUT PUBLIER</button><button id="btnCancelHW" style="background:#666; color:white; padding:12px 25px; border:none; border-radius:5px;">Annuler</button></div>
    `;
    const btnAddQ = document.getElementById("btnAddQ"); const btnPublish = document.getElementById("btnPublishHW"); const btnCancel = document.getElementById("btnCancelHW"); const listContainer = document.getElementById("hwQuestionsList"); const fileInput = document.getElementById("newQFiles");
    btnCancel.onclick = () => { createHomeworkModal.style.display = 'none'; };
    fileInput.onchange = () => { const newFiles = Array.from(fileInput.files); tempRow1 = [...tempRow1, ...newFiles]; renderVisualRowsInModal(true); fileInput.value = ""; };
    btnAddQ.onclick = async () => {
        const inst = document.getElementById("newQInst").value;
        const totalImages = tempRow1.length + tempRow2.length;
        if (!inst && totalImages === 0) return alert("Mets une consigne ou au moins une image !");
        btnAddQ.textContent = "Upload des images en cours..."; btnAddQ.disabled = true;
        const finalOrderFiles = [...tempRow1, "BREAK", ...tempRow2];
        let urls = [];
        for (const file of finalOrderFiles) {
            if (file === "BREAK") { urls.push("BREAK"); continue; }
            const formData = new FormData(); formData.append('file', file);
            try { const res = await fetch('/api/upload', { method: 'POST', body: formData }); const d = await res.json(); if (d.ok) urls.push(d.imageUrl); } catch(e) { console.error("Err upload", e); }
        }
        tempHwLevels.push({ instruction: inst, attachmentUrls: urls });
        document.getElementById("newQInst").value = ""; tempRow1 = []; tempRow2 = []; renderVisualRowsInModal(true); 
        btnAddQ.textContent = "Valider et Ajouter cette question"; btnAddQ.disabled = false;
        let html = ""; tempHwLevels.forEach((l, i) => { html += `<div style="background:white; padding:5px; border-bottom:1px solid #eee; font-size:0.9em;"><strong>Q${i+1}:</strong> ${l.instruction.substring(0,30)}... (${l.attachmentUrls.length} items)</div>`; }); listContainer.innerHTML = html;
    };
    btnPublish.onclick = async () => {
        const title = document.getElementById("hwTitle").value; const cls = document.getElementById("hwClass").value;
        if (!title || tempHwLevels.length === 0) return alert("Il faut un titre et au moins une question !");
        btnPublish.textContent = "Publication...";
        try { await fetch('/api/homework', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, classroom: cls, levels: tempHwLevels }) }); alert("Devoir publié !"); createHomeworkModal.style.display = 'none'; loadProfHomeworks(); } catch(e) { alert("Erreur."); }
    };
}
if (addHomeworkBtn) { addHomeworkBtn.addEventListener("click", () => { tempHwLevels = []; if(createHomeworkModal) { initHomeworkModal(); createHomeworkModal.style.display = "flex"; } }); }

// RENDU MODALE
function renderVisualRowsInModal(isFileMode) {
    const r1 = document.getElementById("visualRow1"); const r2 = document.getElementById("visualRow2");
    if(!r1 || !r2) return;
    renderZoneInModal(r1, tempRow1, 1, isFileMode); renderZoneInModal(r2, tempRow2, 2, isFileMode);
}
function renderZoneInModal(container, items, rowNum, isFileMode) {
    container.innerHTML = "";
    if(items.length === 0) container.innerHTML = `<span style="color:#cbd5e1; font-size:0.8em; width:100%; text-align:center; pointer-events:none;">${rowNum===1 ? "Glissez vos images ici" : "... ou ici"}</span>`;
    container.ondragover = (e) => { e.preventDefault(); container.style.background = "#eff6ff"; };
    container.ondragleave = (e) => { container.style.background = "white"; };
    container.ondrop = (e) => handleDropInModal(e, rowNum, null, isFileMode);
    items.forEach((item, index) => {
        if(item === "BREAK") return;
        const url = isFileMode ? URL.createObjectURL(item) : item;
        const type = isFileMode ? item.type : (item.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
        const wrapper = document.createElement("div");
        wrapper.draggable = true; wrapper.style.width = "80px"; wrapper.style.height = "80px"; wrapper.style.minWidth = "80px"; wrapper.style.position = "relative"; wrapper.style.cursor = "grab"; wrapper.style.border = "2px solid #ddd"; wrapper.style.borderRadius = "4px"; wrapper.style.backgroundColor = "white"; wrapper.style.overflow = "hidden";
        let el; if (type && type.includes("pdf")) { el = document.createElement("div"); el.textContent = "PDF"; el.style.width="100%"; el.style.height="100%"; el.style.display="flex"; el.style.alignItems="center"; el.style.justifyContent="center"; el.style.background="#f1f5f9"; el.style.color="#64748b"; el.style.fontWeight="bold"; wrapper.appendChild(el); } 
        else { el = document.createElement("img"); el.src = url; el.style.width="100%"; el.style.height="100%"; el.style.objectFit = "cover"; el.draggable = false; wrapper.appendChild(el); }
        const delBtn = document.createElement("div"); delBtn.innerHTML = "×"; delBtn.style.position="absolute"; delBtn.style.top="0"; delBtn.style.right="0"; delBtn.style.background="red"; delBtn.style.color="white"; delBtn.style.width="20px"; delBtn.style.height="20px"; delBtn.style.textAlign="center"; delBtn.style.cursor="pointer";
        delBtn.onclick = (e) => { e.stopPropagation(); if(rowNum === 1) tempRow1.splice(index, 1); else tempRow2.splice(index, 1); renderVisualRowsInModal(isFileMode); };
        wrapper.appendChild(delBtn); container.appendChild(wrapper);
        wrapper.addEventListener("dragstart", (e) => { e.dataTransfer.setData("sourceRow", rowNum); e.dataTransfer.setData("sourceIndex", index); wrapper.style.opacity = "0.5"; });
        wrapper.addEventListener("dragend", () => { wrapper.style.opacity = "1"; });
        wrapper.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); wrapper.style.borderColor = "#2563eb"; });
        wrapper.addEventListener("dragleave", () => { wrapper.style.borderColor = "#ddd"; });
        wrapper.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); handleDropInModal(e, rowNum, index, isFileMode); });
    });
}
function handleDropInModal(e, targetRowNum, targetIndex, isFileMode) {
    const sourceRowNum = parseInt(e.dataTransfer.getData("sourceRow")); const sourceIndex = parseInt(e.dataTransfer.getData("sourceIndex"));
    if(isNaN(sourceRowNum)) return;
    let movedItem;
    if(sourceRowNum === 1) { movedItem = tempRow1.splice(sourceIndex, 1)[0]; } else { movedItem = tempRow2.splice(sourceIndex, 1)[0]; }
    let targetArray = (targetRowNum === 1) ? tempRow1 : tempRow2;
    if(targetIndex === null) { targetArray.push(movedItem); } else { targetArray.splice(targetIndex, 0, movedItem); }
    document.getElementById("visualRow1").style.background = "white"; document.getElementById("visualRow2").style.background = "white";
    renderVisualRowsInModal(isFileMode);
}

// 5. GESTION PROF (CHARGEMENT & EDITION)
async function loadProfHomeworks() {
    const tbody = document.getElementById("profHomeworksBody"); if(!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5'>Chargement...</td></tr>";
    try {
        const res = await fetch('/api/homework-all'); const list = await res.json();
        tbody.innerHTML = "";
        if(list.length === 0) { tbody.innerHTML = "<tr><td colspan='5'>Aucun devoir créé.</td></tr>"; } 
        else {
            list.forEach(hw => {
                const tr = document.createElement("tr"); const date = new Date(hw.date).toLocaleDateString(); const qCount = hw.levels ? hw.levels.length : 1;
                tr.innerHTML = `<td>${date}</td><td><strong>${hw.title}</strong></td><td>${hw.classroom}</td><td>${qCount} Question(s)</td><td><button class="btn-view" data-id="${hw._id}">👁️ Voir/Modifier</button><button class="btn-delete" data-id="${hw._id}">🗑️</button></td>`;
                tbody.appendChild(tr);
            });
            document.querySelectorAll(".btn-delete").forEach(btn => { btn.onclick = async (e) => { if(confirm("Supprimer ?")) { await fetch(`/api/homework/${e.target.dataset.id}`, { method: 'DELETE' }); loadProfHomeworks(); } } });
            document.querySelectorAll(".btn-view").forEach(btn => { btn.onclick = async (e) => { openEditHomework(e.target.dataset.id); } });
        }
    } catch(e) { console.error(e); }
}

async function openEditHomework(id) {
    editingHomeworkId = id;
    try {
        const res = await fetch('/api/homework-all'); const all = await res.json();
        const hw = all.find(h => h._id === id); if(!hw) return alert("Erreur chargement devoir.");
        currentHomeworkData = hw;
        if(hw.levels.length > 0) {
            editingLevelIndex = 0; 
            const urls = hw.levels[0].attachmentUrls;
            const breakIndex = urls.indexOf("BREAK");
            if (breakIndex !== -1) { tempRow1 = urls.slice(0, breakIndex); tempRow2 = urls.slice(breakIndex + 1); } else { tempRow1 = urls; tempRow2 = []; }
            openVisualEditor(null, false, true); 
        } else { alert("Aucune image dans ce devoir."); }
    } catch(e) { console.error(e); alert("Erreur."); }
}

// 6. EDITEUR VISUEL (MODE EDITION)
function openVisualEditor(items, isFileMode, enableNavigation = false) {
    if(!visualEditorModal) return;
    visualEditorModal.style.display = 'flex';
    if(enableNavigation && currentHomeworkData) { visualNavControls.style.display = "flex"; updateNavControls(); } else { visualNavControls.style.display = "none"; }
    renderVisualRows(isFileMode);
    btnPrevLevel.onclick = () => { if(editingLevelIndex > 0) { saveCurrentViewToMemory(); editingLevelIndex--; loadLevelImagesForEditor(); } };
    btnNextLevel.onclick = () => { if(editingLevelIndex < currentHomeworkData.levels.length - 1) { saveCurrentViewToMemory(); editingLevelIndex++; loadLevelImagesForEditor(); } };
    function updateNavControls() {
        const total = currentHomeworkData.levels.length; lblCurrentLevel.textContent = `Question ${editingLevelIndex + 1} / ${total}`;
        btnPrevLevel.disabled = (editingLevelIndex === 0); btnPrevLevel.style.opacity = (editingLevelIndex === 0) ? "0.3" : "1";
        btnNextLevel.disabled = (editingLevelIndex === total - 1); btnNextLevel.style.opacity = (editingLevelIndex === total - 1) ? "0.3" : "1";
    }
    function saveCurrentViewToMemory() { if(currentHomeworkData) { const merged = [...tempRow1, "BREAK", ...tempRow2]; currentHomeworkData.levels[editingLevelIndex].attachmentUrls = merged; } }
    function loadLevelImagesForEditor() {
        const urls = currentHomeworkData.levels[editingLevelIndex].attachmentUrls; const breakIndex = urls.indexOf("BREAK");
        if (breakIndex !== -1) { tempRow1 = urls.slice(0, breakIndex); tempRow2 = urls.slice(breakIndex + 1); } else { tempRow1 = urls; tempRow2 = []; }
        renderVisualRows(false); updateNavControls();
    }
    saveVisualOrderBtn.onclick = async () => {
        visualEditorModal.style.display = "none"; const finalOrder = [...tempRow1, "BREAK", ...tempRow2];
        if(editingHomeworkId && currentHomeworkData) {
            currentHomeworkData.levels[editingLevelIndex].attachmentUrls = finalOrder; saveVisualOrderBtn.textContent = "Sauvegarde...";
            try { await fetch(`/api/homework/${editingHomeworkId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ levels: currentHomeworkData.levels }) }); alert("✅ Tout a été sauvegardé !"); } catch(e) { alert("Erreur sauvegarde."); }
            saveVisualOrderBtn.textContent = "💾 Tout Valider";
        }
    };
    closeVisualEditorBtn.onclick = () => { visualEditorModal.style.display = "none"; };
}
function renderVisualRows(isFileMode) {
    const r1 = document.getElementById("visualRow1"); const r2 = document.getElementById("visualRow2");
    renderZone(r1, tempRow1, 1, isFileMode); renderZone(r2, tempRow2, 2, isFileMode);
}
function renderZone(container, items, rowNum, isFileMode) {
    if(!container) return; container.innerHTML = "";
    container.ondragover = (e) => { e.preventDefault(); container.style.background = "rgba(255,255,255,0.2)"; };
    container.ondragleave = (e) => { container.style.background = "transparent"; };
    container.ondrop = (e) => handleDrop(e, rowNum, null, isFileMode);
    items.forEach((item, index) => {
        if(item === "BREAK") return;
        const url = isFileMode ? URL.createObjectURL(item) : item; const type = isFileMode ? item.type : (item.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
        const wrapper = document.createElement("div"); wrapper.className = "doc-item"; wrapper.draggable = true; wrapper.style.width = "200px"; wrapper.style.height = "250px"; wrapper.style.position = "relative"; wrapper.style.cursor = "grab"; wrapper.style.border = "3px solid white"; wrapper.style.backgroundColor = "white";
        const badge = document.createElement("div"); const globalIndex = rowNum === 1 ? index + 1 : tempRow1.length + index + 1; badge.textContent = globalIndex; badge.style.position="absolute"; badge.style.top="5px"; badge.style.left="5px"; badge.style.background="#2563eb"; badge.style.color="white"; badge.style.fontWeight="bold"; badge.style.width="30px"; badge.style.height="30px"; badge.style.borderRadius="50%"; badge.style.zIndex="10"; badge.style.display="flex"; badge.style.justifyContent="center"; badge.style.alignItems="center"; wrapper.appendChild(badge);
        let el; if (type && type.includes("pdf")) { el = document.createElement("iframe"); el.src = url; el.style.width="100%"; el.style.height="100%"; el.style.pointerEvents = "none"; el.style.border="none"; wrapper.appendChild(el); } else { el = document.createElement("img"); el.src = url; el.style.width="100%"; el.style.height="100%"; el.style.objectFit = "contain"; el.draggable = false; wrapper.appendChild(el); }
        container.appendChild(wrapper);
        wrapper.addEventListener("dragstart", (e) => { e.dataTransfer.setData("sourceRow", rowNum); e.dataTransfer.setData("sourceIndex", index); wrapper.style.opacity = "0.4"; });
        wrapper.addEventListener("dragend", () => { wrapper.style.opacity = "1"; });
        wrapper.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); wrapper.style.borderColor = "#fbbf24"; });
        wrapper.addEventListener("dragleave", () => { wrapper.style.borderColor = "white"; });
        wrapper.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e, rowNum, index, isFileMode); });
    });
}
function handleDrop(e, targetRowNum, targetIndex, isFileMode) {
    const sourceRowNum = parseInt(e.dataTransfer.getData("sourceRow")); const sourceIndex = parseInt(e.dataTransfer.getData("sourceIndex"));
    let movedItem; if(sourceRowNum === 1) { movedItem = tempRow1.splice(sourceIndex, 1)[0]; } else { movedItem = tempRow2.splice(sourceIndex, 1)[0]; }
    let targetArray = (targetRowNum === 1) ? tempRow1 : tempRow2;
    if(targetIndex === null) { targetArray.push(movedItem); } else { targetArray.splice(targetIndex, 0, movedItem); }
    const r1 = document.getElementById("visualRow1"); const r2 = document.getElementById("visualRow2");
    if(r1) r1.style.background = "transparent"; if(r2) r2.style.background = "transparent";
    renderVisualRows(isFileMode);
}

// 7. AUTRES
async function fetchPlayers() {
  if (!profDashboard) return; profDashboard.style.display = "block";
  const table = $("#playersTable"); table.querySelectorAll("tbody").forEach((tbody) => tbody.remove());
  try { const response = await fetch("/api/players", { cache: "no-store" }); if (!response.ok) throw new Error("Erreur réseau."); allPlayersData = await response.json(); applyFiltersAndRender(); } catch (error) { console.error(error); }
}
function applyFiltersAndRender() {
  let filtered = [...allPlayersData];
  const selectedClass = classFilter ? classFilter.value : "all"; const searchTerm = studentSearch ? studentSearch.value.trim().toLowerCase() : "";
  if (selectedClass !== "all") filtered = filtered.filter((p) => p.classroom === selectedClass);
  if (searchTerm) filtered = filtered.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm));
  renderPlayers(filtered);
}
if(classFilter) classFilter.addEventListener("change", applyFiltersAndRender);
if(studentSearch) studentSearch.addEventListener("input", applyFiltersAndRender);
if(testClassBtn) testClassBtn.addEventListener("click", async () => { const selectedClass = classFilter ? classFilter.value : "all"; if (selectedClass === "all") { alert("Veuillez sélectionner une classe spécifique."); return; } try { const res = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: "Eleve", lastName: "Test", classroom: selectedClass }), }); const data = await res.json(); if (!res.ok) throw new Error(data.error); localStorage.setItem("player", JSON.stringify(data)); window.location.reload(); } catch (err) { console.error(err); alert("Impossible de trouver le compte 'Eleve Test'."); } });
if(resetAllBtn) resetAllBtn.addEventListener("click", async () => { if (confirm("⚠️ Réinitialiser TOUS les élèves ?")) { await fetch("/api/reset-all-players", { method: "POST" }); fetchPlayers(); } });
if(playersBody) playersBody.addEventListener("click", async (e) => { const target = e.target; if (target.matches(".reset-btn")) { const { playerId } = target.dataset; if (confirm(`Réinitialiser ?`)) { await fetch("/api/reset-player", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId }) }); fetchPlayers(); } } });
function renderPlayers(playersToRender) {
  const table = $("#playersTable"); table.querySelectorAll("tbody").forEach((tbody) => tbody.remove());
  if (playersToRender.length === 0) { const tbody = document.createElement("tbody"); tbody.innerHTML = `<tr><td colspan="6">Aucun élève trouvé.</td></tr>`; table.appendChild(tbody); return; }
  const chaptersToDisplay = { "ch1-zombie": "Zombie", "ch4-redaction": "Rédaction" };
  playersToRender.sort((a, b) => a.lastName.localeCompare(b.lastName)).forEach((player) => {
      const playerTbody = document.createElement("tbody"); playerTbody.style.borderTop = "1px solid #e2e8f0";
      const classKey = getClassKey(player.classroom); const allLevelsForClass = (window.allQuestionsData && window.allQuestionsData[classKey]) || [];
      const gradesMap = {}; const validatedLevelIds = [];
      (player.validatedLevels || []).forEach(l => { if(typeof l === 'string') { gradesMap[l] = "Validé"; validatedLevelIds.push(l); } else { gradesMap[l.levelId] = l.grade; validatedLevelIds.push(l.levelId); } });
      const validatedQuestions = player.validatedQuestions || [];
      let chapterRowsHtml = ""; let isFirstRow = true;
      for (const chapterId in chaptersToDisplay) {
        const chapterLabel = chaptersToDisplay[chapterId]; const levelsInThisChapter = allLevelsForClass.filter(l => l.chapterId === chapterId);
        let progressHtml = "-"; let levelTitleHtml = "-";
        if (levelsInThisChapter.length > 0) { const currentLvl = levelsInThisChapter.find(l => !validatedLevelIds.includes(l.id)); levelTitleHtml = currentLvl ? currentLvl.title : "<strong>Terminé</strong>"; progressHtml = generateFullChapterProgress(levelsInThisChapter, validatedLevelIds, gradesMap, validatedQuestions); }
        const actionButtons = `<div style="display:flex; flex-direction:column; gap:4px;"><button class="action-btn activity-btn" data-id="${player._id}" style="background:#3b82f6; color:white;">🕒 Activité</button><button class="action-btn reset-btn" data-player-id="${player._id}" data-player-name="${player.firstName} ${player.lastName}">Réinitialiser</button></div>`;
        if (isFirstRow) { chapterRowsHtml += `<tr><td rowspan="${Object.keys(chaptersToDisplay).length}" style="vertical-align: middle; padding-left: 10px;"><strong>${player.firstName} ${player.lastName}</strong></td><td rowspan="${Object.keys(chaptersToDisplay).length}" style="vertical-align: middle;">${player.classroom}</td><td>${chapterLabel}</td><td>${levelTitleHtml}</td><td>${progressHtml}</td><td rowspan="${Object.keys(chaptersToDisplay).length}" style="vertical-align: middle;">${actionButtons}</td></tr>`; isFirstRow = false; } else { chapterRowsHtml += `<tr><td>${chapterLabel}</td><td>${levelTitleHtml}</td><td>${progressHtml}</td></tr>`; }
      }
      playerTbody.innerHTML = chapterRowsHtml; table.appendChild(playerTbody);
    });
    document.querySelectorAll(".activity-btn").forEach(btn => { btn.onclick = async (e) => { const pid = e.target.dataset.id; const pName = e.target.closest("tbody").querySelector("strong").textContent; openActivityModal(pid, pName); } });
}
function addProfBugButton() { const title = $("#profDashboard h2"); if(!title) return; const bar = title.parentNode.querySelector("div"); if(bar && !$("#viewBugsBtn")) { const btn = document.createElement("button"); btn.id = "viewBugsBtn"; btn.className = "action-btn"; btn.style.background = "#7c3aed"; btn.textContent = "🐛 Bugs"; btn.onclick = loadBugs; bar.appendChild(btn); } }
const closeBugListBtn = $("#closeBugListBtn"); const profBugListModal = $("#profBugListModal"); if(closeBugListBtn) closeBugListBtn.onclick = () => profBugListModal.style.display = "none";
async function loadBugs() { const tbody = $("#bugsBody"); tbody.innerHTML = "Chargement..."; try { const res = await fetch("/api/bugs"); const bugs = await res.json(); tbody.innerHTML = ""; if(bugs.length === 0) { tbody.innerHTML = "<tr><td colspan='5'>Aucun bug.</td></tr>"; } else { bugs.forEach(b => { const tr = document.createElement("tr"); tr.innerHTML = `<td>${new Date(b.date).toLocaleDateString()}</td><td>${b.reporterName}<br><small>${b.classroom}</small></td><td>${b.gameChapter}</td><td>${b.description}</td><td><button class="action-btn reset-btn delete-bug" data-id="${b._id}">X</button></td>`; tbody.appendChild(tr); }); document.querySelectorAll(".delete-bug").forEach(btn => { btn.onclick = async (e) => { if(confirm("Supprimer ce rapport ?")) { await fetch(`/api/bugs/${e.target.dataset.id}`, { method: 'DELETE' }); loadBugs(); } }; }); } if(profBugListModal) profBugListModal.style.display = "flex"; } catch(e) { console.error(e); tbody.innerHTML = "Erreur."; } }

// [CORRECTION CLÉS DE CLASSES]
function getClassKey(classroom) { 
    if(!classroom) return "default"; 
    const c = classroom.toUpperCase(); 
    if (c.includes("6")) return "6e"; // Était "6eme", maintenant "6e"
    if (c.includes("5")) return "5e"; // Était "5eme", maintenant "5e"
    if (c.includes("2")) return "2de"; 
    return "default"; 
}

function generateFullChapterProgress(levels, validatedIds, grades, valQuestions) { if(!levels || levels.length === 0) return "-"; const total = levels.length; let count = 0; levels.forEach(l => { if(validatedIds.includes(l.id)) count++; }); return `${count} / ${total}`; }
function showStudent(player) {
    if (registerCard) registerCard.style.display = "none";
    if (studentBadge) { studentBadge.textContent = `${player.firstName} ${player.lastName}`; studentBadge.style.display = "block"; }
    if (logoutBtn) { logoutBtn.style.display = "block"; logoutBtn.onclick = () => { localStorage.removeItem("player"); window.location.reload(); }; }
    if (player.id === "prof") {
        if (profDashboard) profDashboard.style.display = "block";
        if (chapterSelection) chapterSelection.style.display = "none";
        if (backToProfBtn) backToProfBtn.style.display = "none";
    } else {
        if (profDashboard) profDashboard.style.display = "none";
        if (chapterSelection) chapterSelection.style.display = "block";
        if (myMistakesBtn) myMistakesBtn.style.display = "inline-block";
        if (backToProfBtn) { if (player.firstName === "Eleve" && player.lastName === "Test") { backToProfBtn.style.display = "inline-block"; } else { backToProfBtn.style.display = "none"; } }
    }
}

// [CORRECTION CHARGEMENT JSON]
async function loadAllQuestionsForProf() {
  window.allQuestionsData = {};
  const classes = ["6e", "5e", "2de"]; // Noms fichiers exacts
  for (const c of classes) {
      try {
          const res = await fetch(`questions/questions-${c}.json`);
          if(res.ok) window.allQuestionsData[c] = await res.json();
          else window.allQuestionsData[c] = [];
      } catch(e) { window.allQuestionsData[c] = []; }
  }
}

async function updateChapterSelectionUI(player) {
    const classKey = getClassKey(player.classroom);
    if(!window.allQuestionsData[classKey]) await loadAllQuestionsForProf();
}

// ==========================================================
// 8. LANCEUR DE JEUX (CORRIGÉ POUR CHARGER LES NIVEAUX)
// ==========================================================
document.querySelectorAll('.chapter-action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const parent = btn.closest('.chapter-box');
        const chapterId = parent.dataset.chapter;
        const gameClassStr = parent.dataset.gameClass;
        const templateId = parent.dataset.templateId;
        
        chapterSelection.style.display = 'none';
        game.style.display = 'block';
        if(pauseReportBtn) pauseReportBtn.style.display = 'inline-block';
        if(myMistakesBtn) myMistakesBtn.style.display = 'none'; 
        isGameActive = true;
        
        gameModuleContainer.innerHTML = '';
        const tmpl = document.getElementById(templateId);
        if(tmpl) { gameModuleContainer.appendChild(tmpl.content.cloneNode(true)); }
        
        const controller = {
            notifyCorrectAnswer: () => { 
                incrementProgress(1); 
                setTimeout(() => nextQuestion(false), 1000); 
            },
            notifyWrongAnswer: (msg) => { wrongAnswerFlow(msg); },
            getState: () => ({ isLocked: locked })
        };
        
        if(window[gameClassStr]) {
            currentGameModuleInstance = new window[gameClassStr](gameModuleContainer, controller);
            
            // CAS 1 : DEVOIRS MAISON
            if (gameClassStr === "HomeworkGame") {
                levelTitle.textContent = "Chapitre 5 : Devoirs Maison";
                if(currentGameModuleInstance.loadHomeworks) currentGameModuleInstance.loadHomeworks();
            } 
            // CAS 2 & 3 : JEUX CLASSIQUES
            else {
                 // On attend que les données soient chargées
                 const classKey = getClassKey(currentPlayerData.classroom);
                 if(!window.allQuestionsData[classKey]) await loadAllQuestionsForProf();
                 
                 const allLevels = window.allQuestionsData[classKey] || [];
                 levels = allLevels.filter(l => l.chapterId === chapterId);
                 
                 if(levels.length > 0) {
                     setupLevel(0); // Lancement
                 } else {
                     gameModuleContainer.innerHTML = `<h3>Pas de niveaux disponibles pour la classe ${classKey}.</h3><button onclick='window.location.reload()'>Retour</button>`;
                 }
            }
        } else { console.error("Classe introuvable : " + gameClassStr); }
    });
});

// 9. AUTO-LOGIN
(async () => {
  if (saved && saved.id) {
    if (saved.id === "prof") {
      showStudent(saved); isProfessorMode = true; if(registerCard) registerCard.style.display = "none"; await loadAllQuestionsForProf(); fetchPlayers(); 
    } else {
      if(registerCard) registerCard.style.display = "none";
      try {
        await loadAllQuestionsForProf();
        const res = await fetch(`/api/player-progress/${saved.id}`);
        if (res.status === 404) { localStorage.removeItem("player"); window.location.reload(); return; }
        if(res.ok) { const serverData = await res.json(); currentPlayerData = { ...saved, ...serverData }; } else { currentPlayerData = saved; }
        showStudent(saved); await updateChapterSelectionUI(currentPlayerData); 
        if(chapterSelection) chapterSelection.style.display = "block";
      } catch (e) { console.error(e); alert("Erreur connexion."); }
    }
  } else { if(registerCard) registerCard.style.display = "block"; }
})();