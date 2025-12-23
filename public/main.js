window.isGlobalPaused = false; 
const $ = (sel) => document.querySelector(sel);

// --- 1. SÉLECTEURS UI ---
const studentBadge = $("#studentBadge"), logoutBtn = $("#logoutBtn");
const backToProfBtn = $("#backToProfBtn");
const registerCard = $("#registerCard"), chapterSelection = $("#chapterSelection"), game = $("#game");
const form = $("#registerForm"), startBtn = $("#startBtn"), formMsg = $("#formMsg");
const gameModuleContainer = $("#gameModuleContainer");
const levelTitle = $("#levelTitle"), livesWrap = $("#lives"), mainBar = $("#mainBar"), subBarsContainer = $("#subBars"), generalText = $("#general");
const overlay = $("#overlay"), restartBtn = $("#restartBtn");
const correctionOverlay = $("#correctionOverlay"), correctionText = $("#correctionText"), closeCorrectionBtn = $("#closeCorrectionBtn");
const backToMenuBtn = $("#backToMenuBtn");

// Dashboard Prof & Modals
const profDashboard = $("#profDashboard"), playersBody = $("#playersBody"), classFilter = $("#classFilter"), resetAllBtn = $("#resetAllBtn"), studentSearch = $("#studentSearch");
const testClassBtn = $("#testClassBtn");
const addHomeworkBtn = $("#addHomeworkBtn"); 
const createHomeworkModal = $("#createHomeworkModal");
const saveHomeworkBtn = $("#saveHomeworkBtn");

const openLessonBtn = $("#openLessonBtn"); const lessonModal = $("#lessonModal"); const closeLessonBtn = $("#closeLessonBtn"); const lessonText = $("#lessonText"); const iAmReadyBtn = $("#iAmReadyBtn");
const myMistakesBtn = $("#myMistakesBtn"); const mistakesModal = $("#mistakesModal"); const closeMistakesBtn = $("#closeMistakesBtn"); const mistakesList = $("#mistakesList");
const activityModal = $("#activityModal"); const closeActivityBtn = $("#closeActivityBtn"); const activityBody = $("#activityBody"); const activityStudentName = $("#activityStudentName");
const pauseReportBtn = $("#pauseReportBtn"); const bugModal = $("#bugModal"); const sendBugBtn = $("#sendBugBtn"); const resumeGameBtn = $("#resumeGameBtn");

// Onglets Prof
const tabStudents = $("#tabStudents");
const tabHomeworks = $("#tabHomeworks");
const contentStudents = $("#contentStudents");
const contentHomeworks = $("#contentHomeworks");

// --- 2. VARIABLES GLOBALES ---
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
let tempHwLevels = []; // Liste des questions du devoir en cours
let currentQuestionFiles = []; // Fichiers temporaires Drag & Drop

// --- 3. CHEAT CODES ---
let isRKeyDown = false; let isTKeyDown = false;
document.addEventListener("keydown", (e) => { if (!e || !e.key) return; if (e.key.toLowerCase() === "r") isRKeyDown = true; if (e.key.toLowerCase() === "t") isTKeyDown = true; });
document.addEventListener("keyup", (e) => { if (!e || !e.key) return; if (e.key.toLowerCase() === "r") isRKeyDown = false; if (e.key.toLowerCase() === "t") isTKeyDown = false; });
$("#mainProgress")?.addEventListener("click", () => { 
    if (!isGameActive) return; if (!isRKeyDown || !isTKeyDown) return; 
    updateTimeBar(); const lvl = levels[currentLevel]; 
    if(lvl) { general = lvl.questions.length; nextQuestion(false); } 
});

// --- 4. NAVIGATION & INIT ---

if(backToProfBtn) {
    backToProfBtn.addEventListener("click", () => { 
        localStorage.setItem("player", JSON.stringify({ id: "prof", firstName: "Jean", lastName: "Vuillet", classroom: "Professeur" })); 
        window.location.reload(); 
    });
}

// Modales Élèves
if(iAmReadyBtn) iAmReadyBtn.addEventListener("click", () => { if(lessonModal) lessonModal.style.display = "none"; if (pendingLaunch) { pendingLaunch(); pendingLaunch = null; } });
if(closeLessonBtn) closeLessonBtn.addEventListener("click", () => { if(lessonModal) lessonModal.style.display = "none"; pendingLaunch = null; });
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

// Onglets Prof
if (tabStudents) {
    tabStudents.addEventListener("click", () => {
        tabStudents.classList.add("active"); tabHomeworks.classList.remove("active");
        contentStudents.classList.add("active"); contentHomeworks.classList.remove("active");
    });
}
if (tabHomeworks) {
    tabHomeworks.addEventListener("click", () => {
        tabHomeworks.classList.add("active"); tabStudents.classList.remove("active");
        contentHomeworks.classList.add("active"); contentStudents.classList.remove("active");
        loadProfHomeworks();
    });
}

// Pause & Bug
if(pauseReportBtn) {
  pauseReportBtn.addEventListener('click', () => { if(isGameActive) { window.isGlobalPaused = true; } if(bugModal) bugModal.style.display = 'flex'; });
}
if(resumeGameBtn) {
  resumeGameBtn.addEventListener('click', () => { window.isGlobalPaused = false; if(bugModal) bugModal.style.display = 'none'; });
}
if(sendBugBtn) {
  sendBugBtn.addEventListener('click', async () => {
    const desc = $("#bugDescription").value.trim(); if(!desc) return alert("Veuillez décrire le problème.");
    sendBugBtn.textContent = "Envoi..."; sendBugBtn.disabled = true;
    try { await fetch('/api/report-bug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reporterName: currentPlayerData ? `${currentPlayerData.firstName} ${currentPlayerData.lastName}` : "Anonyme", classroom: currentPlayerData ? currentPlayerData.classroom : "?", description: desc, gameChapter: isGameActive ? (levelTitle ? levelTitle.textContent : "Jeu") : "Menu Principal" }) }); alert("Bug signalé avec succès ! Merci."); $("#bugDescription").value = ""; } catch(e) { alert("Erreur envoi."); } sendBugBtn.textContent = "🐞 Envoyer Rapport"; sendBugBtn.disabled = false;
  });
}

// Jeu : Correction / Fin
if(closeCorrectionBtn) closeCorrectionBtn.addEventListener("click", () => { correctionOverlay.style.display="none"; if(currentGameModuleInstance && currentGameModuleInstance.nextQuestion) currentGameModuleInstance.nextQuestion(); });
if(restartBtn) restartBtn.addEventListener("click", () => { overlay.style.display="none"; if(currentGameModuleInstance) currentGameModuleInstance.loadQuestion ? currentGameModuleInstance.loadQuestion(currentGameModuleInstance.currentQ) : null; });

// --- RETOUR MENU PRINCIPAL (VERSION ROBUSTE) ---
if(backToMenuBtn) {
    backToMenuBtn.addEventListener("click", async () => {
        console.log("🔙 Retour au menu demandé...");

        isGameActive = false;
        // Reset visuel
        if(game) game.style.display = "none";
        if(overlay) overlay.style.display = "none";
        if(correctionOverlay) correctionOverlay.style.display = "none";
        if(lessonModal) lessonModal.style.display = "none";

        // Nettoyage jeu
        if(currentGameModuleInstance && typeof currentGameModuleInstance.resetAnimation === 'function') {
            try { currentGameModuleInstance.resetAnimation(); } catch(e){}
        }
        currentGameModuleInstance = null;
        gameModuleContainer.innerHTML = ""; // Vider le conteneur du jeu

        // Réafficher menu
        if(chapterSelection) chapterSelection.style.display = "block";
        
        // Boutons header
        if(pauseReportBtn) pauseReportBtn.style.display = "none";
        if(myMistakesBtn && currentPlayerId && currentPlayerId !== "prof") {
            myMistakesBtn.style.display = "inline-block";
        }

        // Update progression
        if(currentPlayerId && currentPlayerId !== "prof") { 
            try { 
                const res = await fetch(`/api/player-progress/${currentPlayerId}`); 
                if(res.ok) {
                    const data = await res.json();
                    updateChapterSelectionUI({ ...saved, ...data }); 
                }
            } catch(e){} 
        }
    });
}

// Login Form
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

// ==========================================================
// 🌟 GESTION DEVOIRS PROF (MULTI-QUESTIONS + DRAG & DROP)
// ==========================================================
function initHomeworkModal() {
    const modalContent = createHomeworkModal.querySelector('.modal-content');
    modalContent.innerHTML = `
        <h3>📚 Créer un Devoir</h3>
        <label><b>Titre du Devoir :</b></label>
        <input id="hwTitle" placeholder="Ex: DM Géographie" style="width:100%; margin-bottom:10px; padding:10px; border:1px solid #ccc;">
        <label><b>Classe concernée :</b></label>
        <select id="hwClass" style="width:100%; margin-bottom:15px; padding:10px; border:1px solid #ccc;">
            <option value="Toutes">Toutes les classes</option><option value="6D">6eD</option><option value="5B">5eB</option><option value="5C">5eC</option><option value="2A">2de A</option>
        </select>
        <hr style="margin: 15px 0; border:0; border-top:1px solid #eee;">
        <h4>Liste des Questions (${tempHwLevels.length}) :</h4>
        <div id="hwQuestionsList" style="margin-bottom:15px;"><em style="color:#666;">Aucune question ajoutée.</em></div>
        <div style="background:#f8fafc; padding:10px; border:1px dashed #ccc; border-radius:8px; margin-bottom:15px;">
            <h5>➕ Ajouter une Question</h5>
            <textarea id="newQInst" rows="2" placeholder="Consigne de la question..." style="width:100%; margin-bottom:5px; padding:5px;"></textarea>
            <label style="font-size:0.9em;">Images (Sélection multiple) :</label>
            <input type="file" id="newQFiles" accept=".pdf, image/*" multiple style="width:100%; margin-bottom:5px;">
            
            <!-- ZONE DRAG & DROP -->
            <div id="preview-container" class="drag-area"></div>

            <button id="btnAddQ" style="width:100%; padding:8px; background:#eff6ff; color:#2563eb; border:1px solid #2563eb; cursor:pointer; font-weight:bold; margin-top:10px;">Ajouter cette question</button>
        </div>
        <div style="display:flex; gap:10px; justify-content:center;">
            <button id="btnPublishHW" style="background:#16a34a; color:white; padding:12px 25px; border:none; border-radius:5px; font-weight:bold;">✅ TOUT PUBLIER</button>
            <button id="btnCancelHW" style="background:#666; color:white; padding:12px 25px; border:none; border-radius:5px;">Annuler</button>
        </div>
    `;

    const btnAddQ = document.getElementById("btnAddQ");
    const btnPublish = document.getElementById("btnPublishHW");
    const btnCancel = document.getElementById("btnCancelHW");
    const listContainer = document.getElementById("hwQuestionsList");
    const fileInput = document.getElementById("newQFiles");
    const previewContainer = document.getElementById("preview-container");

    btnCancel.onclick = () => { createHomeworkModal.style.display = 'none'; };

    // Gestion Fichiers + Drag & Drop
    fileInput.onchange = () => { currentQuestionFiles = Array.from(fileInput.files); renderThumbnails(previewContainer); };

    function renderThumbnails(container) {
        container.innerHTML = "";
        if (currentQuestionFiles.length === 0) { container.innerHTML = "<div class='drag-placeholder'>Aucune image</div>"; return; }
        
        currentQuestionFiles.forEach((file, index) => {
            const div = document.createElement("div"); div.className = "drag-item"; div.draggable = true; div.dataset.index = index;
            const img = document.createElement("img"); img.src = URL.createObjectURL(file); img.style.width="100%"; img.style.height="100%"; img.style.objectFit="cover";
            div.appendChild(img); container.appendChild(div);

            div.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", index); });
            div.addEventListener("dragover", (e) => { e.preventDefault(); }); 
            div.addEventListener("drop", (e) => {
                e.preventDefault();
                const oldIndex = parseInt(e.dataTransfer.getData("text/plain")); const newIndex = index;
                const item = currentQuestionFiles.splice(oldIndex, 1)[0]; currentQuestionFiles.splice(newIndex, 0, item);
                renderThumbnails(container);
            });
        });
    }

    btnAddQ.onclick = async () => {
        const inst = document.getElementById("newQInst").value;
        if (!inst) return alert("Mets une consigne !");
        
        btnAddQ.textContent = "Upload des images en cours..."; btnAddQ.disabled = true;

        let urls = [];
        for (const file of currentQuestionFiles) {
            const formData = new FormData(); formData.append('file', file);
            try { const res = await fetch('/api/upload', { method: 'POST', body: formData }); const d = await res.json(); if (d.ok) urls.push(d.imageUrl); } catch(e) { console.error("Err upload", e); }
        }

        tempHwLevels.push({ instruction: inst, attachmentUrls: urls });
        document.getElementById("newQInst").value = ""; fileInput.value = ""; currentQuestionFiles = []; renderThumbnails(previewContainer); 
        btnAddQ.textContent = "Ajouter cette question"; btnAddQ.disabled = false;
        
        let html = "";
        tempHwLevels.forEach((l, i) => { html += `<div style="background:white; padding:8px; border:1px solid #ddd; margin-bottom:5px; border-radius:4px; font-size:0.9em;"><strong>Q${i+1}:</strong> ${l.instruction} <br><small>${l.attachmentUrls.length} image(s)</small></div>`; });
        listContainer.innerHTML = html;
    };

    btnPublish.onclick = async () => {
        const title = document.getElementById("hwTitle").value;
        const cls = document.getElementById("hwClass").value;
        if (!title || tempHwLevels.length === 0) return alert("Il faut un titre et au moins une question !");
        btnPublish.textContent = "Publication...";
        try {
            await fetch('/api/homework', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, classroom: cls, levels: tempHwLevels }) });
            alert("Devoir publié !"); createHomeworkModal.style.display = 'none'; loadProfHomeworks();
        } catch(e) { alert("Erreur."); }
    };
}

if (addHomeworkBtn) {
    addHomeworkBtn.addEventListener("click", () => {
        tempHwLevels = []; currentQuestionFiles = [];
        if(createHomeworkModal) { initHomeworkModal(); createHomeworkModal.style.display = "flex"; }
    });
}

// --- 6. FONCTIONS DE GESTION PROF ---
async function loadProfHomeworks() {
    const tbody = document.getElementById("profHomeworksBody"); if(!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5'>Chargement...</td></tr>";
    try {
        const res = await fetch('/api/homework-all'); const list = await res.json();
        tbody.innerHTML = "";
        if(list.length === 0) { tbody.innerHTML = "<tr><td colspan='5'>Aucun devoir créé.</td></tr>"; } 
        else {
            list.forEach(hw => {
                const tr = document.createElement("tr");
                const date = new Date(hw.date).toLocaleDateString();
                const qCount = hw.levels ? hw.levels.length : 1;
                tr.innerHTML = `<td>${date}</td><td><strong>${hw.title}</strong></td><td>${hw.classroom}</td><td>${qCount} Question(s)</td><td><button class="btn-delete" data-id="${hw._id}">🗑️</button></td>`;
                tbody.appendChild(tr);
            });
            document.querySelectorAll(".btn-delete").forEach(btn => {
                btn.onclick = async (e) => { if(confirm("Supprimer ?")) { await fetch(`/api/homework/${e.target.dataset.id}`, { method: 'DELETE' }); loadProfHomeworks(); } }
            });
        }
    } catch(e) { console.error(e); }
}

async function fetchPlayers() {
  if (!profDashboard) return; profDashboard.style.display = "block";
  const table = $("#playersTable"); table.querySelectorAll("tbody").forEach((tbody) => tbody.remove());
  try {
    const response = await fetch("/api/players", { cache: "no-store" }); if (!response.ok) throw new Error("Erreur réseau.");
    allPlayersData = await response.json(); applyFiltersAndRender();
  } catch (error) { console.error(error); }
}

function applyFiltersAndRender() {
  let filtered = [...allPlayersData];
  const selectedClass = classFilter ? classFilter.value : "all";
  const searchTerm = studentSearch ? studentSearch.value.trim().toLowerCase() : "";
  if (selectedClass !== "all") filtered = filtered.filter((p) => p.classroom === selectedClass);
  if (searchTerm) filtered = filtered.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm));
  renderPlayers(filtered);
}
if(classFilter) classFilter.addEventListener("change", applyFiltersAndRender);
if(studentSearch) studentSearch.addEventListener("input", applyFiltersAndRender);

if(testClassBtn) testClassBtn.addEventListener("click", async () => {
  const selectedClass = classFilter ? classFilter.value : "all";
  if (selectedClass === "all") { alert("Veuillez sélectionner une classe spécifique dans le menu déroulant avant de cliquer sur Tester."); return; }
  try { const res = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: "Eleve", lastName: "Test", classroom: selectedClass }), }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Erreur lors de la connexion test."); localStorage.setItem("player", JSON.stringify(data)); window.location.reload(); } catch (err) { console.error(err); alert("Impossible de trouver le compte 'Eleve Test'. Assurez-vous d'avoir relancé init-db.js."); }
});

if(resetAllBtn) resetAllBtn.addEventListener("click", async () => { if (confirm("⚠️ Réinitialiser TOUS les élèves ?")) { await fetch("/api/reset-all-players", { method: "POST" }); fetchPlayers(); } });

if(playersBody) playersBody.addEventListener("click", async (e) => {
  const target = e.target;
  if (target.matches(".reset-btn")) {
    const { playerId, playerName } = target.dataset;
    if (confirm(`Réinitialiser ${playerName} ?`)) { await fetch("/api/reset-player", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId }) }); fetchPlayers(); }
  }
});

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

function addProfBugButton() {
  const title = $("#profDashboard h2"); if(!title) return; const bar = title.parentNode.querySelector("div");
  if(bar && !$("#viewBugsBtn")) { const btn = document.createElement("button"); btn.id = "viewBugsBtn"; btn.className = "action-btn"; btn.style.background = "#7c3aed"; btn.textContent = "🐛 Bugs"; btn.onclick = loadBugs; bar.appendChild(btn); }
}
const closeBugListBtn = $("#closeBugListBtn"); const profBugListModal = $("#profBugListModal"); if(closeBugListBtn) closeBugListBtn.onclick = () => profBugListModal.style.display = "none";

async function loadBugs() {
  const tbody = $("#bugsBody"); tbody.innerHTML = "Chargement...";
  try {
    const res = await fetch("/api/bugs"); const bugs = await res.json(); tbody.innerHTML = "";
    if(bugs.length === 0) { tbody.innerHTML = "<tr><td colspan='5'>Aucun bug.</td></tr>"; }
    else {
      bugs.forEach(b => { const tr = document.createElement("tr"); tr.innerHTML = `<td>${new Date(b.date).toLocaleDateString()}</td><td>${b.reporterName}<br><small>${b.classroom}</small></td><td>${b.gameChapter}</td><td>${b.description}</td><td><button class="action-btn reset-btn delete-bug" data-id="${b._id}">X</button></td>`; tbody.appendChild(tr); });
      document.querySelectorAll(".delete-bug").forEach(btn => { btn.onclick = async (e) => { if(confirm("Supprimer ce rapport ?")) { await fetch(`/api/bugs/${e.target.dataset.id}`, { method: 'DELETE' }); loadBugs(); } }; });
    }
    if(profBugListModal) profBugListModal.style.display = "flex";
  } catch(e) { console.error(e); tbody.innerHTML = "Erreur."; }
}

// --- UTILITAIRES ---
function getClassKey(classroom) {
    if(!classroom) return "default";
    const c = classroom.toUpperCase();
    if (c.includes("6")) return "6eme"; if (c.includes("5")) return "5eme"; if (c.includes("2")) return "2nde";
    return "default";
}
function generateFullChapterProgress(levels, validatedIds, grades, valQuestions) {
    if(!levels || levels.length === 0) return "-";
    const total = levels.length; let count = 0; levels.forEach(l => { if(validatedIds.includes(l.id)) count++; });
    return `${count} / ${total}`;
}
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
    }
}
async function loadAllQuestionsForProf() { window.allQuestionsData = window.allQuestionsData || {}; return true; }
async function updateChapterSelectionUI(player) { /* Logique visuelle de progression */ }

// ==========================================================
// 🚀 8. GESTION DES JEUX (LAUNCHER) - CONNEXION BOUTONS
// ==========================================================
document.querySelectorAll('.chapter-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const parent = btn.closest('.chapter-box');
        const chapterId = parent.dataset.chapter;
        const gameClassStr = parent.dataset.gameClass;
        const templateId = parent.dataset.templateId;
        
        // 1. Masquer menu, afficher jeu
        chapterSelection.style.display = 'none';
        game.style.display = 'block';
        if(pauseReportBtn) pauseReportBtn.style.display = 'inline-block';
        if(myMistakesBtn) myMistakesBtn.style.display = 'none'; // Pas de fautes pendant le jeu
        isGameActive = true;
        
        // 2. Nettoyer conteneur
        gameModuleContainer.innerHTML = '';
        
        // 3. Charger le template
        const tmpl = document.getElementById(templateId);
        if(tmpl) {
            gameModuleContainer.appendChild(tmpl.content.cloneNode(true));
        }
        
        // 4. Controller mock (pour faire fonctionner les jeux)
        const controller = {
            notifyCorrectAnswer: () => { alert("Bravo !"); },
            notifyWrongAnswer: () => { alert("Dommage..."); },
            getState: () => ({ isLocked: false })
        };
        
        // 5. Instancier la classe du jeu
        if(window[gameClassStr]) {
            currentGameModuleInstance = new window[gameClassStr](gameModuleContainer, controller);
            
            // CAS SPÉCIFIQUE : DEVOIRS MAISON
            if (gameClassStr === "HomeworkGame") {
                levelTitle.textContent = "Devoirs Maison & Correction IA";
                // On appelle la méthode de chargement des devoirs
                if(currentGameModuleInstance.loadHomeworks) {
                    currentGameModuleInstance.loadHomeworks();
                }
            } else if (currentGameModuleInstance.loadQuestion) {
                 // Pour les autres jeux
                 currentGameModuleInstance.loadQuestion({ q: "Exemple de question ?", a: "Réponse", options:["Réponse", "Faux"] });
                 if(currentGameModuleInstance.startAnimation) currentGameModuleInstance.startAnimation();
            }
        } else {
            console.error("Classe de jeu introuvable : " + gameClassStr);
        }
    });
});

// --- 9. AUTO-LOGIN ---
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