import { state, api } from './app.js';
import { ZombieGame } from './games/ZombieGame.js';
import { HomeworkGame } from './games/HomeworkGame.js';

// Registre des jeux
const GameClasses = { 
    "ZombieGame": ZombieGame, 
    "HomeworkGame": HomeworkGame 
};

// Variables de progression (locales à l'interface élève)
let currentInstance = null;
let currentChapterLevels = [];
let levelIdx = 0;
let questionIdx = 0;
let localScores = []; 
let lives = 4;
let generalProgress = 0;

export async function initStudentInterface() {
    console.log("🚀 Interface Élève Init");
    document.getElementById("chapterSelection").style.display = "block";
    
    // 1. Chargement des questions
    const classKey = state.getClassKey(state.user.classroom);
    try {
        state.questionsData = await api.get(`questions/questions-${classKey}.json`);
    } catch(e) { console.warn("Fichier questions introuvable"); }

    // 2. RETOUR AU MENU PROF (Le bouton perdu)
    // Il s'affiche uniquement si on est l'élève de test
    if(state.user.firstName === "Eleve" && state.user.lastName === "Test") {
        const btnProf = document.getElementById("backToProfBtn");
        if(btnProf) {
            btnProf.style.display = "block";
            btnProf.onclick = () => {
                // On remet l'identité du prof dans le stockage
                localStorage.setItem("player", JSON.stringify({ 
                    id: "prof", 
                    firstName: "Jean", 
                    lastName: "Vuillet", 
                    classroom: "Professeur" 
                }));
                window.location.reload();
            };
        }
    }

    // 3. GESTION DU BOUTON BUG
    document.getElementById("pauseReportBtn").onclick = () => {
        document.getElementById("bugModal").style.display = "flex";
    };
    document.getElementById("resumeGameBtn").onclick = () => {
        document.getElementById("bugModal").style.display = "none";
    };
    document.getElementById("sendBugBtn").onclick = async () => {
        const desc = document.getElementById("bugDescription").value;
        if(!desc) return alert("Décris le bug !");
        await api.post('/api/report-bug', { 
            reporterName: state.user.firstName + " " + state.user.lastName, 
            classroom: state.user.classroom, 
            description: desc 
        });
        alert("Bug envoyé au professeur !");
        document.getElementById("bugModal").style.display = "none";
    };

    // 4. NAVIGATION & AUTRES
    document.getElementById("backToMenuBtn").onclick = () => window.location.reload();

    // 5. CHEAT CODE (R+T) SUR LA BARRE
    document.getElementById("mainProgress").onclick = () => {
        if(state.isRKeyDown && state.isTKeyDown && currentInstance) {
            const req = currentChapterLevels[levelIdx].requiredPerQuestion || 3;
            localScores = localScores.map(() => req);
            generalProgress = localScores.length;
            updateUI(); 
            nextQuestion();
        }
    };
}

// LANCEUR DE CHAPITRES
document.body.addEventListener('click', (e) => {
    if (e.target.matches('.chapter-action-btn')) {
        const box = e.target.closest('.chapter-box');
        const gameClassStr = box.dataset.gameClass;
        
        document.getElementById("chapterSelection").style.display = 'none';
        document.getElementById("game").style.display = 'block';
        document.getElementById("backToMenuBtn").style.display = 'inline-block';
        
        const container = document.getElementById("gameModuleContainer");
        container.innerHTML = "";
        const tmpl = document.getElementById(box.dataset.templateId);
        if(tmpl) container.appendChild(tmpl.content.cloneNode(true));

        if(gameClassStr === "HomeworkGame") {
            toggleUIVisibility(false);
            currentInstance = new HomeworkGame(container);
            currentInstance.init();
        } else {
            toggleUIVisibility(true);
            currentChapterLevels = (state.questionsData || []).filter(l => l.chapterId === box.dataset.chapter);
            startLevel(0, gameClassStr, container);
        }
    }
});

// LOGIQUE DE PROGRESSION (MOTEUR)
function startLevel(idx, gameClassStr, container) {
    levelIdx = idx;
    lives = 4;
    const lvl = currentChapterLevels[levelIdx];
    if(!lvl) return;

    document.getElementById("levelTitle").textContent = lvl.title;
    localScores = new Array(lvl.questions.length).fill(0);
    generalProgress = 0;
    questionIdx = 0;
    
    // Création des barres de progression bleues
    const sub = document.getElementById("subBars"); 
    sub.innerHTML = "";
    lvl.questions.forEach((_, i) => {
        sub.innerHTML += `<div class="subProgress"><div class="subBar" id="subBar${i}"></div></div>`;
    });

    // Instanciation du jeu
    const controller = {
        addPoint: () => changeScore(1),
        removePoint: (msg) => { 
            lives--; 
            changeScore(-1); 
            if(msg) showCorrection(msg); 
            if(lives <= 0) showGameOver(); 
            updateUI(); 
        },
        getScore: () => localScores[questionIdx]
    };

    currentInstance = new GameClasses[gameClassStr](container, controller);
    loadActiveQuestion();
}

function changeScore(val) {
    const req = currentChapterLevels[levelIdx].requiredPerQuestion || 3;
    const old = localScores[questionIdx];
    const next = Math.max(0, Math.min(req, old + val));
    
    if(old < req && next >= req) generalProgress++;
    else if(old >= req && next < req) generalProgress--;
    
    localScores[questionIdx] = next;
    updateUI();
    
    if(next >= req) setTimeout(nextQuestion, 1200);
    else setTimeout(loadActiveQuestion, 1000);
}

function nextQuestion() {
    const lvl = currentChapterLevels[levelIdx];
    if(generalProgress >= lvl.questions.length) {
        if(levelIdx < currentChapterLevels.length - 1) {
            alert("Niveau terminé ! Passage au suivant.");
            startLevel(levelIdx + 1, currentInstance.constructor.name, currentInstance.c);
        } else {
            document.getElementById("gameModuleContainer").innerHTML = "<h1 style='text-align:center; margin-top:50px;'>Félicitations ! Chapitre Terminé ! 👑</h1>";
        }
        return;
    }
    // Chercher la suivante non finie
    do { questionIdx = (questionIdx + 1) % lvl.questions.length; } 
    while(localScores[questionIdx] >= (lvl.requiredPerQuestion || 3));
    
    loadActiveQuestion();
}

function loadActiveQuestion() {
    const q = currentChapterLevels[levelIdx].questions[questionIdx];
    const qCopy = JSON.parse(JSON.stringify(q));
    // Règle : dernier palier = saisie texte (plus d'options)
    const req = currentChapterLevels[levelIdx].requiredPerQuestion || 3;
    if(localScores[questionIdx] >= req - 1) delete qCopy.options;
    currentInstance.loadQuestion(qCopy);
}

function updateUI() {
    const req = currentChapterLevels[levelIdx].requiredPerQuestion || 3;
    localScores.forEach((s, i) => { 
        const b = document.getElementById(`subBar${i}`); 
        if(b) b.style.width = (s/req*100) + "%"; 
    });
    document.getElementById("mainBar").style.width = (generalProgress / currentChapterLevels[levelIdx].questions.length * 100) + "%";
    document.getElementById("lives").innerHTML = "❤️❤️❤️❤️".substring(0, lives*2);
}

function toggleUIVisibility(show) {
    document.getElementById("mainProgress").style.display = show ? "block" : "none";
    document.getElementById("subBars").style.display = show ? "flex" : "none";
    document.getElementById("lives").style.display = show ? "flex" : "none";
}

function showCorrection(msg) { 
    document.getElementById("correctionText").textContent = msg; 
    document.getElementById("correctionOverlay").style.display = "flex"; 
}
document.getElementById("closeCorrectionBtn").onclick = () => document.getElementById("correctionOverlay").style.display = "none";
function showGameOver() { document.getElementById("overlay").style.display = "flex"; }
document.getElementById("restartBtn").onclick = () => window.location.reload();