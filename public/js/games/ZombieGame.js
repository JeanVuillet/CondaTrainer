import { state } from '../state.js';
import { verifyWithAI } from '../api.js';

export class ZombieGame {
    constructor(container, controller) {
        this.c = container;
        this.ctrl = controller;

        // Récupération des éléments
        this.zombie = container.querySelector("#z-zombie");
        this.qEl = container.querySelector("#z-question");
        
        // Zones d'interaction
        this.aiZone = container.querySelector("#ai-input-zone"); // Zone Texte
        this.qcmZone = container.querySelector("#options-grid"); // Zone Boutons (QCM)
        
        this.input = container.querySelector("#z-answer");
        this.btnSubmit = container.querySelector("#z-submit");
        this.optBtns = container.querySelectorAll(".option-btn");
        
        this.feedback = container.querySelector("#feedback-bubble");
        this.arena = container.querySelector("#zombie-arena");

        this.zPos = 20; 
        this.interval = null;
        this.isPaused = false;

        // Listeners IA
        if(this.btnSubmit) this.btnSubmit.onclick = () => this.checkAI();
        if(this.input) this.input.onkeydown = (e) => { if(e.key==="Enter") this.checkAI(); };

        // Listeners QCM
        if(this.optBtns) {
            this.optBtns.forEach((btn, idx) => {
                btn.onclick = () => this.checkQCM(idx);
            });
        }
        
        console.log("🧟 Zombie Game chargé");
    }

    loadQuestion(q) {
        console.log("Nouvelle question:", q);
        this.currentQ = q;
        this.qEl.textContent = q.q;
        
        // Reset Feedback
        if(this.feedback) this.feedback.style.display = "none";

        // Reset Zombie
        this.stop(); 
        this.zPos = 20; 
        if(this.zombie) {
            this.zombie.style.right = "20px"; 
            this.zombie.style.display = "block";
        }
        this.isPaused = false;

        // --- DÉCISION DU MODE : QCM ou IA ? ---
        // Si le JSON contient "options" (Array), c'est un QCM
        if (q.options && Array.isArray(q.options) && q.options.length > 0) {
            console.log("Mode QCM activé");
            this.toggleMode('QCM');
            
            // Remplissage des boutons
            this.optBtns.forEach((btn, i) => {
                if(q.options[i]) {
                    btn.textContent = q.options[i];
                    btn.style.display = "block";
                    btn.className = "option-btn"; // Reset couleur (enlevant opt-correct/opt-wrong)
                    btn.disabled = false;
                } else {
                    btn.style.display = "none";
                }
            });
        } else {
            console.log("Mode IA activé");
            this.toggleMode('IA');
            if(this.input) {
                this.input.value = "";
                this.input.disabled = false;
                this.input.focus();
            }
            if(this.btnSubmit) this.btnSubmit.disabled = false;
        }

        this.start();
    }

    toggleMode(mode) {
        if (mode === 'QCM') {
            if(this.aiZone) this.aiZone.style.display = "none";
            if(this.qcmZone) this.qcmZone.style.display = "grid";
        } else {
            if(this.aiZone) this.aiZone.style.display = "flex";
            if(this.qcmZone) this.qcmZone.style.display = "none";
        }
    }

    start() {
        if(this.interval) clearInterval(this.interval);
        console.log("🧟 Le zombie avance...");
        this.interval = setInterval(() => {
            if(state.isGlobalPaused || this.ctrl.getState().isLocked || this.isPaused) return;
            
            this.zPos += 1; // Vitesse
            if(this.zombie) this.zombie.style.right = this.zPos + "px";
            
            // Collision
            if(this.arena && this.zPos > (this.arena.offsetWidth - 80)) {
                this.handleCollision();
            }
        }, 50);
    }

    stop() { if(this.interval) clearInterval(this.interval); }

    handleCollision() {
        this.stop();
        this.ctrl.notifyWrongAnswer("Le zombie t'a mordu !");
        
        // Reset position pour retenter
        this.zPos = 20;
        if(this.zombie) this.zombie.style.right = "20px";
        
        setTimeout(() => this.start(), 1000);
    }

    // --- LOGIQUE QCM ---
    checkQCM(idx) {
        if (this.isPaused) return;
        
        const selected = this.currentQ.options[idx];
        const correct = this.currentQ.a; 
        
        // Vérif souple (si 'a' est l'index ou le texte)
        let isCorrect = false;
        if (typeof correct === 'number') isCorrect = (idx === correct);
        else isCorrect = (selected === correct);

        if (isCorrect) {
            this.optBtns[idx].classList.add("opt-correct");
            this.handleSuccess();
        } else {
            this.optBtns[idx].classList.add("opt-wrong");
            // Pénalité visuelle rapide
            setTimeout(() => { this.optBtns[idx].classList.remove("opt-wrong"); }, 500);
            this.handleFail();
        }
    }

    // --- LOGIQUE IA ---
    async checkAI() {
        const val = this.input.value.trim(); 
        if(!val) return;
        
        this.isPaused = true; 
        this.input.disabled = true; 
        this.btnSubmit.disabled = true;
        this.showFeedback("🧠 Analyse...", "hint");
        
        try {
            const res = await verifyWithAI({
                question: this.currentQ.q, 
                userAnswer: val, 
                expectedAnswer: this.currentQ.a, 
                playerId: state.currentPlayerId
            });
            
            if(res.status === "correct") { 
                this.showFeedback("<strong>Bravo !</strong>", "success");
                this.handleSuccess();
            } else { 
                this.showFeedback(`<strong>Non...</strong> ${res.feedback || ""}`, "error");
                this.handleFail();
                setTimeout(() => {
                    this.isPaused = false;
                    this.input.disabled = false;
                    this.btnSubmit.disabled = false;
                    this.input.focus();
                    if(this.feedback) this.feedback.style.display = "none";
                }, 3000);
            }
        } catch(e) { 
            this.showFeedback("Erreur.", "error");
            this.isPaused = false;
        }
    }

    handleSuccess() {
        if(this.zombie) this.zombie.style.display="none"; 
        this.ctrl.notifyCorrectAnswer(); 
    }
    
    handleFail() {
        this.ctrl.notifyWrongAnswer();
        // Le zombie continue d'avancer, sauf si IA qui fait une pause
        if (this.aiZone.style.display !== "none") return; 
        // En QCM, on ne met pas en pause, le zombie avance toujours
    }

    showFeedback(html, type) {
        if(!this.feedback) return;
        this.feedback.innerHTML = html;
        this.feedback.className = ""; 
        this.feedback.classList.add(`fb-${type}`);
        this.feedback.style.display = "block";
    }
}