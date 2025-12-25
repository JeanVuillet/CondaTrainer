// ELEVE.JS
const $el = (sel) => document.querySelector(sel);

window.initStudentInterface = async function() {
    if(window.currentPlayerData && window.currentPlayerData.classroom) {
        const classKey = window.getClassKey(window.currentPlayerData.classroom);
        try {
            const res = await fetch(`questions/questions-${classKey}.json`);
            if(res.ok) window.allQuestionsData[classKey] = await res.json();
        } catch(e) {}
        document.querySelectorAll(".chapter-action-btn").forEach(b => b.disabled = false);
    }
    const bM = document.getElementById("backToMenuBtn"); if(bM) bM.onclick = () => window.location.reload();
};

// --- LANCEUR ---
document.addEventListener('click', (e) => {
    if (e.target.matches('.chapter-action-btn')) {
        const parent = e.target.closest('.chapter-box');
        const gameClass = parent.dataset.gameClass;
        const tmplId = parent.dataset.templateId;
        const chapId = parent.dataset.chapter;

        document.getElementById("chapterSelection").style.display = "none";
        document.getElementById("game").style.display = "block";
        if(document.getElementById("backToMenuBtn")) document.getElementById("backToMenuBtn").style.display = "block";

        const cont = document.getElementById("gameModuleContainer");
        cont.innerHTML = "";
        cont.appendChild(document.getElementById(tmplId).content.cloneNode(true));

        window.isGameActive = true;
        
        const ctrl = {
            notifyCorrectAnswer: () => { window.incrementProgress(1); setTimeout(()=>window.nextQuestion(false), 1500); },
            notifyWrongAnswer: () => { window.wrongAnswerFlow(); }
        };

        if(window[gameClass]) {
            window.currentGameModuleInstance = new window[gameClass](cont, ctrl);
            if (gameClass === "HomeworkGame") {
                document.getElementById("levelTitle").textContent = "Devoirs";
                document.getElementById("mainProgress").style.display = "none";
                if(window.currentGameModuleInstance.loadHomeworks) window.currentGameModuleInstance.loadHomeworks();
            } else {
                document.getElementById("mainProgress").style.display = "block";
                const k = window.getClassKey(window.currentPlayerData.classroom);
                const all = window.allQuestionsData[k] || [];
                window.levels = all.filter(l => l.chapterId === chapId);
                if(window.levels.length > 0) window.setupLevel(0);
                else cont.innerHTML = "<h3 style='text-align:center'>Pas de niveaux.</h3>";
            }
        }
    }
});

// --- MOTEUR ---
window.setupLevel = function(idx) {
    if(!window.levels[idx]) { document.getElementById("gameModuleContainer").innerHTML = "<h1>Fini !</h1>"; return; }
    window.currentLevel = idx;
    const lvl = window.levels[idx];
    document.getElementById("levelTitle").textContent = lvl.title;
    window.localScores = new Array(lvl.questions.length).fill(0);
    window.general = 0; window.currentIndex = -1; window.lives = 4;
    window.renderLives();
    
    const sub = document.getElementById("subBars"); sub.innerHTML = "";
    lvl.questions.forEach((_, i) => {
        const d = document.createElement("div"); d.className = "subProgress";
        d.innerHTML = `<div class="subBar" id="subBar${i}"></div>`;
        sub.appendChild(d);
    });
    window.nextQuestion(false);
};

window.nextQuestion = function() {
    if(window.general >= window.levels[window.currentLevel].questions.length) {
        if(window.currentLevel < window.levels.length-1) setTimeout(()=>window.setupLevel(window.currentLevel+1), 1500);
        else document.getElementById("gameModuleContainer").innerHTML = "<h1>Bravo !</h1>";
        return;
    }
    let n = -1;
    for(let i=0; i<window.levels[window.currentLevel].questions.length; i++) if(window.localScores[i]<1) { n=i; break; }
    if(n !== -1) {
        window.currentIndex = n;
        window.currentGameModuleInstance.loadQuestion(window.levels[window.currentLevel].questions[n]);
    }
};

window.incrementProgress = function(v) {
    window.localScores[window.currentIndex] += v;
    if(window.localScores[window.currentIndex] >= 1) window.general++;
    window.updateBars();
};

window.updateBars = function() {
    const lvl = window.levels[window.currentLevel];
    window.localScores.forEach((s, i) => {
        const b = document.getElementById(`subBar${i}`);
        if(b) { b.style.width = (s*100)+"%"; if(s>=1) b.parentElement.classList.add("completed"); }
    });
    document.getElementById("mainBar").style.width = (window.general/lvl.questions.length*100)+"%";
};

window.renderLives = function() { document.getElementById("lives").innerHTML = "❤️❤️❤️❤️".substring(0, window.lives*2); };
window.wrongAnswerFlow = function() { window.lives--; window.renderLives(); if(window.lives<=0) document.getElementById("overlay").style.display="flex"; else document.getElementById("correctionOverlay").style.display="flex"; };

document.getElementById("closeCorrectionBtn").onclick = () => { document.getElementById("correctionOverlay").style.display="none"; window.nextQuestion(); };
document.getElementById("restartBtn").onclick = () => { document.getElementById("overlay").style.display="none"; window.setupLevel(window.currentLevel); };

// --- JEU ZOMBIE (Réparé) ---
class ZombieGame {
    constructor(c, ctrl) {
        this.c = c; this.ctrl = ctrl;
        this.hero = c.querySelector("#hero"); this.zombie = c.querySelector("#zombie");
        this.projectile = c.querySelector("#projectile"); this.qEl = c.querySelector("#question");
        this.input = c.querySelector("#answer"); this.btn = c.querySelector("#submit");
        this.feedback = c.querySelector("#feedback");
        this.zPos = 20; this.timer = null;
        this.btn.onclick = () => this.check();
        this.input.onkeydown = (e) => { if(e.key==="Enter") this.check(); };
    }
    loadQuestion(q) {
        this.currentQ = q; this.qEl.textContent = q.q; this.input.value = ""; 
        this.input.disabled = false; this.btn.disabled = false; this.feedback.textContent = "";
        this.stop(); 
        this.zPos = 20; this.zombie.style.right = "20px"; this.zombie.style.display="block";
        this.start();
    }
    start() {
        if(this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            if(window.isGlobalPaused) return;
            this.zPos += 1; this.zombie.style.right = this.zPos + "px";
            if(this.zPos > (this.c.querySelector("#arena").offsetWidth - 80)) {
                this.stop(); this.ctrl.notifyWrongAnswer();
            }
        }, 50);
    }
    stop() { if(this.timer) clearInterval(this.timer); }
    async check() {
        const val = this.input.value; if(!val) return;
        this.input.disabled = true; this.btn.disabled = true; this.stop(); this.feedback.textContent = "Analyse...";
        const res = await fetch("/api/verify-answer-ai", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ question: this.currentQ.q, userAnswer: val, expectedAnswer: this.currentQ.a, playerId: window.currentPlayerId }) });
        const d = await res.json();
        if(d.status === "correct") { this.feedback.textContent = "Bravo!"; this.zombie.style.display="none"; this.ctrl.notifyCorrectAnswer(); }
        else { this.feedback.textContent = "Non..."; this.ctrl.notifyWrongAnswer(); }
    }
}
window.ZombieGame = ZombieGame;

class HomeworkGame {
    constructor(c, ctrl) {
        this.c = c; this.ctrl = ctrl;
        this.list = c.querySelector("#hw-list");
        this.view = c.querySelector("#hw-workspace");
        c.querySelector("#btn-close-work").onclick = () => { this.view.style.display="none"; this.list.style.display="block"; };
        c.querySelector("#hw-submit").onclick = () => this.submit();
    }
    async loadHomeworks() {
        this.list.innerHTML = "Chargement...";
        const res = await fetch(`/api/homework/${window.currentPlayerData.classroom}`);
        const data = await res.json();
        this.list.innerHTML = data.map((h, i) => `<div onclick="window.currentGameModuleInstance.open(${i})" style="padding:10px; cursor:pointer; border-bottom:1px solid #eee;">${h.title}</div>`).join('');
        this.data = data;
    }
    open(i) {
        this.curHw = this.data[i]; this.lvl = 0;
        this.list.style.display="none"; this.view.style.display="flex";
        this.loadLevel();
    }
    loadLevel() {
        const l = this.curHw.levels[this.lvl];
        this.c.querySelector("#panel-desc").textContent = l.instruction;
        const z1 = this.c.querySelector("#zone-top"); z1.innerHTML = "";
        l.attachmentUrls.forEach(u => { if(u!=="BREAK") { const img = document.createElement("img"); img.src=u; img.style.height="100%"; z1.appendChild(img); } });
    }
    async submit() {
        // Logique envoi similaire à avant
        this.c.querySelector("#hw-result").textContent = "Envoyé (simulation)";
    }
}
window.HomeworkGame = HomeworkGame;

class RedactionGame { constructor() {} }
window.RedactionGame = RedactionGame;