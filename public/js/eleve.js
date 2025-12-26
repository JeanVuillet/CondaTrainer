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
    
    // UI de base
    document.getElementById("chapterSelection").style.display = "block";
    if(document.getElementById("logoutBtn")) document.getElementById("logoutBtn").style.display = "block";

    // Chargement Questions
    if(state.currentPlayerData && state.currentPlayerData.classroom) {
        const classKey = state.getClassKey(state.currentPlayerData.classroom);
        try {
            const res = await fetch(`questions/questions-${classKey}.json`);
            if(res.ok) state.allQuestionsData[classKey] = await res.json();
        } catch(e) { console.log("Info: Pas de JSON questions"); }
        document.querySelectorAll(".chapter-action-btn").forEach(b => b.disabled = false);
    }
    
    // Boutons Nav
    document.getElementById("backToMenuBtn").onclick = () => window.location.reload();
    
    // Bouton Retour Prof
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

    // Gestion Bugs
    const btnPause = document.getElementById("pauseReportBtn");
    if(btnPause) btnPause.onclick = () => { state.isGlobalPaused = true; document.getElementById("bugModal").style.display="flex"; };
    document.getElementById("resumeGameBtn").onclick = () => { state.isGlobalPaused = false; document.getElementById("bugModal").style.display="none"; };
    document.getElementById("sendBugBtn").onclick = async () => {
        await reportBug({ reporterName: state.currentPlayerData.firstName, description: document.getElementById("bugDescription").value });
        alert("Envoyé !"); document.getElementById("bugModal").style.display="none"; state.isGlobalPaused = false;
    };

    // --- CHEAT CODE GROSSE BARRE (Réintégré) ---
    const mainBar = document.getElementById("mainProgress");
    if (mainBar) {
        mainBar.onclick = () => {
            // Vérification : R + T enfoncés
            if (state.isGameActive && state.isRKeyDown && state.isTKeyDown) {
                console.log("🕵️ CHEAT ACTIVÉ : Niveau validé !");
                
                // On met le score général au maximum
                state.general = state.levels[state.currentLevel].questions.length;
                
                // On met à jour l'affichage
                updateBars();
                
                // On lance la séquence de victoire/niveau suivant
                nextQuestion(false);
            }
        };
    }
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
            notifyCorrectAnswer: () => { incrementProgress(1); setTimeout(()=>nextQuestion(false), 1200); },
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
                
                if(state.levels.length > 0) setupLevel(0);
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
    if(!state.levels[idx]) { document.getElementById("gameModuleContainer").innerHTML = "<h1>Fini ! 🏆</h1>"; return; }
    state.currentLevel = idx;
    const lvl = state.levels[idx];
    document.getElementById("levelTitle").textContent = lvl.title;
    
    if(lvl.lesson) {
        document.getElementById("openLessonBtn").style.display = "block";
        document.getElementById("lessonText").innerHTML = lvl.lesson;
    } else { document.getElementById("openLessonBtn").style.display = "none"; }

    state.localScores = new Array(lvl.questions.length).fill(0);
    state.general = 0; state.currentIndex = -1; state.lives = 4;
    renderLives();
    
    const sub = document.getElementById("subBars"); sub.innerHTML = "";
    lvl.questions.forEach((_, i) => {
        const d = document.createElement("div"); d.className = "subProgress";
        d.innerHTML = `<div class="subBar" id="subBar${i}"></div>`;
        
        // --- CHEAT CODE PETITE BARRE ---
        d.onclick = () => {
            if (state.isGameActive && state.isRKeyDown && state.isTKeyDown) {
                console.log(`🕵️ CHEAT: Boost question ${i}`);
                state.currentIndex = i; 
                incrementProgress(1); // Ajoute 1/3
                // Si la question n'est pas encore chargée dans le jeu, on force le chargement
                if(state.currentGameModuleInstance.loadQuestion) {
                    state.currentGameModuleInstance.loadQuestion(lvl.questions[i]);
                }
            }
        };
        sub.appendChild(d);
    });
    
    updateBars();
    nextQuestion(false);
}

function nextQuestion(keep) {
    state.locked = false;
    const lvl = state.levels[state.currentLevel];
    if(state.general >= lvl.questions.length) {
        if(state.currentLevel < state.levels.length - 1) setTimeout(() => setupLevel(state.currentLevel + 1), 1500);
        else document.getElementById("gameModuleContainer").innerHTML = "<h1 style='text-align:center'>Bravo ! 👑</h1>";
        return;
    }
    
    let nextIdx = -1;
    const req = lvl.requiredPerQuestion || 3;
    for(let i=state.currentIndex+1; i<lvl.questions.length; i++) if(state.localScores[i] < req) { nextIdx = i; break; }
    if(nextIdx === -1) for(let i=0; i<=state.currentIndex; i++) if(state.localScores[i] < req) { nextIdx = i; break; }
    
    if(nextIdx !== -1) {
        state.currentIndex = nextIdx;
        if(state.currentGameModuleInstance && state.currentGameModuleInstance.loadQuestion) {
            state.currentGameModuleInstance.loadQuestion(lvl.questions[nextIdx]);
        }
    }
}

function incrementProgress(val) {
    const req = state.levels[state.currentLevel].requiredPerQuestion || 3;
    
    // Calcul nouveau score
    let newScore = state.localScores[state.currentIndex] + val;
    newScore = Math.max(0, Math.min(req, newScore)); // Borner entre 0 et req
    state.localScores[state.currentIndex] = newScore;
    
    // Si validé
    if (state.localScores[state.currentIndex] >= req) { 
        state.general++; 
        setTimeout(() => nextQuestion(false), 1000); 
    }
    
    updateBars();
    // Sauvegarde en arrière-plan
    if(state.currentPlayerId !== "prof") {
         fetch("/api/save-progress", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ playerId: state.currentPlayerId, progressType: "question", value: "ok" }) }).catch(()=>{});
    }
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
    if(state.lives <= 0) document.getElementById("overlay").style.display = "flex";
    else { 
        if(msg) { 
            document.getElementById("correctionText").textContent = msg; 
            document.getElementById("correctionOverlay").style.display = "flex"; 
        }
    }
}

document.getElementById("closeCorrectionBtn").onclick = () => { document.getElementById("correctionOverlay").style.display="none"; nextQuestion(true); };
document.getElementById("restartBtn").onclick = () => { document.getElementById("overlay").style.display="none"; setupLevel(state.currentLevel); };