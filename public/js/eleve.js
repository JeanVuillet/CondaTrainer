import { state } from './state.js';
import { reportBug } from './api.js';

import { ZombieGame } from './games/ZombieGame.js';
import { RedactionGame } from './games/RedactionGame.js';
import { HomeworkGame } from './games/HomeworkGame.js';
import { StarshipGame } from './games/StarshipGame.js';
import { JumperGame } from './games/JumperGame.js';

const GameClasses = {
    "ZombieGame": ZombieGame,
    "RedactionGame": RedactionGame,
    "HomeworkGame": HomeworkGame,
    "StarshipGame": StarshipGame,
    "JumperGame": JumperGame
};

export async function initStudentInterface() {
    console.log("🚀 Init Élève");
    
    // UI
    document.getElementById("chapterSelection").style.display = "block";
    const logoutBtn = document.getElementById("logoutBtn");
    if(logoutBtn) logoutBtn.style.display = "block";

    // CHARGER QUESTIONS
    if(state.currentPlayerData && state.currentPlayerData.classroom) {
        const classKey = state.getClassKey(state.currentPlayerData.classroom);
        try {
            const res = await fetch(`questions/questions-${classKey}.json`);
            if(res.ok) state.allQuestionsData[classKey] = await res.json();
        } catch(e) { console.log("Info: Pas de JSON questions"); }
        document.querySelectorAll(".chapter-action-btn").forEach(b => b.disabled = false);
    }
    
    // NAVIGATION
    document.getElementById("backToMenuBtn").onclick = () => window.location.reload();

    // RETOUR PROF
    if(state.currentPlayerData.firstName === "Eleve" && state.currentPlayerData.lastName === "Test") {
        const btnProf = document.getElementById("backToProfBtn");
        if(btnProf) {
            btnProf.style.display = "block";
            btnProf.onclick = () => {
                localStorage.setItem("player", JSON.stringify({ id: "prof", firstName: "Jean", lastName: "Vuillet", classroom: "Professeur" }));
                window.location.reload();
            };
        }
    }
    
    // MES FAUTES
    const btnMistakes = document.getElementById("myMistakesBtn");
    if(btnMistakes && state.currentPlayerData.id !== "prof") {
        btnMistakes.style.display = "block";
        btnMistakes.onclick = loadMistakes;
        document.getElementById("closeMistakesBtn").onclick = () => document.getElementById("mistakesModal").style.display = "none";
    }

    // BUGS
    document.getElementById("pauseReportBtn").onclick = () => { state.isGlobalPaused = true; document.getElementById("bugModal").style.display="flex"; };
    document.getElementById("resumeGameBtn").onclick = () => { state.isGlobalPaused = false; document.getElementById("bugModal").style.display="none"; };
    document.getElementById("sendBugBtn").onclick = async () => {
        await reportBug({ reporterName: state.currentPlayerData.firstName, description: document.getElementById("bugDescription").value });
        alert("Envoyé !"); document.getElementById("bugModal").style.display="none"; state.isGlobalPaused = false;
    };
    
    // CHEAT BARRE
    const mainBar = document.getElementById("mainProgress");
    if (mainBar) {
        mainBar.onclick = () => {
            if (state.isGameActive && state.isRKeyDown && state.isTKeyDown) {
                state.general = state.levels[state.currentLevel].questions.length;
                updateBars();
                nextQuestion(false);
            }
        };
    }
}

async function loadMistakes() {
    const list = document.getElementById("mistakesList");
    const modal = document.getElementById("mistakesModal");
    list.innerHTML = "Chargement...";
    modal.style.display = "flex";
    try {
        const res = await fetch(`/api/player-progress/${state.currentPlayerId}`);
        const data = await res.json();
        const mistakes = data.spellingMistakes || [];
        if(mistakes.length === 0) list.innerHTML = "<p>Aucune faute !</p>";
        else {
            list.innerHTML = `<ul class='spelling-list'>` + mistakes.map(m => `<li class='spelling-item'><span class='wrong-word'>${m.wrong}</span> 👉 <span class='right-word'>${m.correct}</span></li>`).join('') + `</ul>`;
        }
    } catch(e) { list.innerHTML = "Erreur."; }
}

// LANCEUR
document.body.addEventListener('click', async (e) => {
    if (e.target.matches('.chapter-action-btn')) {
        const parent = e.target.closest('.chapter-box');
        const tmplId = parent.dataset.templateId;
        const gameClassStr = parent.dataset.gameClass;
        const chapterId = parent.dataset.chapter;

        document.getElementById("chapterSelection").style.display = 'none';
        document.getElementById("game").style.display = 'block';
        document.getElementById("backToMenuBtn").style.display = 'inline-block';
        if(document.getElementById("myMistakesBtn")) document.getElementById("myMistakesBtn").style.display = 'none';

        const container = document.getElementById("gameModuleContainer");
        container.innerHTML = "";
        const tmpl = document.getElementById(tmplId);
        if(tmpl) container.appendChild(tmpl.content.cloneNode(true));

        state.isGameActive = true;
        state.locked = false;
        
        const controller = {
            notifyCorrectAnswer: () => { incrementProgress(1); },
            notifyWrongAnswer: (msg) => { wrongAnswerFlow(msg); },
            getState: () => ({ isLocked: state.locked })
        };

        const GameClass = GameClasses[gameClassStr];
        if(GameClass) {
            state.currentGameModuleInstance = new GameClass(container, controller);
            
            if (gameClassStr === "HomeworkGame") {
                document.getElementById("levelTitle").textContent = "Devoirs Maison";
                toggleUI(false);
                if(state.currentGameModuleInstance.loadHomeworks) state.currentGameModuleInstance.loadHomeworks();
            } else {
                toggleUI(true);
                const classKey = state.getClassKey(state.currentPlayerData.classroom);
                const allLevels = state.allQuestionsData[classKey] || [];
                state.levels = allLevels.filter(l => l.chapterId === chapterId);
                
                const validatedIds = (state.currentPlayerData.validatedLevels || []).map(v => (typeof v === 'string' ? v : v.levelId));
                let startLvl = state.levels.findIndex(l => !validatedIds.includes(l.id));
                if (startLvl === -1) startLvl = 0; 

                if(state.levels.length > 0) setupLevel(startLvl);
                else container.innerHTML = "<h3 style='text-align:center; margin-top:50px'>Pas de niveaux.</h3>";
            }
        }
    }
});

function toggleUI(show) {
    const disp = show ? "block" : "none";
    const flex = show ? "flex" : "none";
    document.getElementById("mainProgress").style.display = disp;
    document.getElementById("subBars").style.display = flex;
    document.getElementById("lives").style.display = flex;
}

// MOTEUR
function setupLevel(idx) {
    if(!state.levels[idx]) { document.getElementById("gameModuleContainer").innerHTML = "<h1>Terminé ! 🏆</h1>"; return; }
    state.currentLevel = idx;
    const lvl = state.levels[idx];
    document.getElementById("levelTitle").textContent = lvl.title;
    
    // Leçon
    const btnL = document.getElementById("openLessonBtn");
    const txtL = document.getElementById("lessonText");
    if(lvl.lesson) { btnL.style.display = "block"; txtL.innerHTML = lvl.lesson; } 
    else { btnL.style.display = "none"; }

    state.localScores = new Array(lvl.questions.length).fill(0);
    state.general = 0; state.currentIndex = -1; state.lives = 4;
    renderLives();
    
    const sub = document.getElementById("subBars"); sub.innerHTML = "";
    lvl.questions.forEach((_, i) => {
        const d = document.createElement("div"); d.className = "subProgress";
        d.innerHTML = `<div class="subBar" id="subBar${i}"></div>`;
        d.onclick = () => {
            if (state.isGameActive && state.isRKeyDown && state.isTKeyDown) {
                state.currentIndex = i; 
                incrementProgress(1); // +1/3
                loadActiveQuestion();
            }
        };
        sub.appendChild(d);
    });
    
    updateBars();
    nextQuestion(false);
}

// --- NOUVELLE LOGIQUE SÉQUENTIELLE ---
function nextQuestion(keep) {
    state.locked = false;
    const lvl = state.levels[state.currentLevel];
    
    // Vérification Fin de Niveau
    if(state.general >= lvl.questions.length) {
        saveProgress("level", lvl.id, "A");
        if(state.currentLevel < state.levels.length - 1) setTimeout(() => setupLevel(state.currentLevel + 1), 1500);
        else document.getElementById("gameModuleContainer").innerHTML = "<h1 style='text-align:center'>Bravo ! 👑</h1>";
        return;
    }
    
    const req = lvl.requiredPerQuestion || 3;
    let found = false;

    // On parcourt les questions suivantes (Boucle circulaire)
    // On commence à currentIndex + 1
    for (let i = 1; i <= lvl.questions.length; i++) {
        // Modulo pour revenir au début si on dépasse la fin
        let checkIdx = (state.currentIndex + i) % lvl.questions.length;
        
        // Si cette question n'est pas finie, on la prend
        if (state.localScores[checkIdx] < req) {
            state.currentIndex = checkIdx;
            found = true;
            break;
        }
    }
    
    if(found) {
        loadActiveQuestion();
    }
}

function loadActiveQuestion() {
    if(!state.currentGameModuleInstance || !state.currentGameModuleInstance.loadQuestion) return;
    
    const lvl = state.levels[state.currentLevel];
    const q = lvl.questions[state.currentIndex];
    const score = state.localScores[state.currentIndex];
    const req = lvl.requiredPerQuestion || 3;
    
    const qToSend = JSON.parse(JSON.stringify(q));
    
    // Si dernier palier (ex: 2/3), on force le texte
    if (score >= req - 1) {
        delete qToSend.options; 
    }
    
    state.currentGameModuleInstance.loadQuestion(qToSend);
}

function incrementProgress(val) {
    const req = state.levels[state.currentLevel].requiredPerQuestion || 3;
    state.localScores[state.currentIndex] = Math.max(0, Math.min(req, state.localScores[state.currentIndex] + val));
    
    if (state.localScores[state.currentIndex] >= req) { 
        state.general++; 
    }
    updateBars();

    // DANS TOUS LES CAS : On passe à la suivante
    setTimeout(() => nextQuestion(false), 1200); 
}

function updateBars() {
    const req = state.levels[state.currentLevel].requiredPerQuestion || 3;
    state.localScores.forEach((score, i) => {
        const bar = document.getElementById(`subBar${i}`);
        if(bar) { 
            const pct = (score / req) * 100;
            bar.style.width = pct + "%"; 
            if(score >= req) bar.parentElement.classList.add("completed"); 
        }
    });
    document.getElementById("mainBar").style.width = (state.general / state.levels[state.currentLevel].questions.length * 100) + "%";
}

function renderLives() { document.getElementById("lives").innerHTML = "❤️❤️❤️❤️".substring(0, state.lives*2); }

function wrongAnswerFlow(msg) {
    state.lives--; renderLives();
    incrementProgress(-1); // Recul
    if(state.lives <= 0) document.getElementById("overlay").style.display = "flex";
    else { 
        if(msg) { 
            document.getElementById("correctionText").textContent = msg; 
            document.getElementById("correctionOverlay").style.display = "flex"; 
        }
    }
}

async function saveProgress(type, val, grade) {
    if(state.currentPlayerId && state.currentPlayerId !== "prof") {
        try {
            await fetch("/api/save-progress", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ playerId: state.currentPlayerId, progressType: type, value: val, grade: grade }) });
            if(type === "level") {
                if(!state.currentPlayerData.validatedLevels) state.currentPlayerData.validatedLevels = [];
                state.currentPlayerData.validatedLevels.push(val);
                localStorage.setItem("player", JSON.stringify(state.currentPlayerData));
            }
        } catch(e) {}
    }
}

document.getElementById("closeCorrectionBtn").onclick = () => { document.getElementById("correctionOverlay").style.display="none"; };
document.getElementById("restartBtn").onclick = () => { document.getElementById("overlay").style.display="none"; setupLevel(state.currentLevel); };