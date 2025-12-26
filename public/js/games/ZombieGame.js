import { state } from '../state.js';
import { verifyWithAI } from '../api.js';

export class ZombieGame {
    constructor(container, controller) {
        this.c = container;
        this.ctrl = controller;

        this.arena = container.querySelector("#zombie-arena");
        this.zombie = container.querySelector("#z-zombie");
        this.projectile = container.querySelector("#z-projectile");
        this.qEl = container.querySelector("#z-question");
        this.feedback = container.querySelector("#feedback-bubble");
        
        this.aiZone = container.querySelector("#ai-input-zone");
        this.input = container.querySelector("#z-answer");
        this.btnSubmit = container.querySelector("#z-submit");

        this.qcmZone = container.querySelector("#options-grid");
        this.optBtns = container.querySelectorAll(".option-btn");

        this.zPos = 20; 
        this.interval = null; 
        this.projInterval = null; 
        this.isPaused = false;

        if(this.btnSubmit) this.btnSubmit.onclick = () => this.checkAI();
        if(this.input) this.input.onkeydown = (e) => { if(e.key==="Enter") this.checkAI(); };
        if(this.optBtns) this.optBtns.forEach((btn, idx) => btn.onclick = () => this.checkQCM(idx));
        
        console.log("🧟 Zombie Game Ready");
    }

    loadQuestion(q) {
        this.currentQ = q;
        this.qEl.textContent = q.q;
        if(this.feedback) this.feedback.style.display = "none";
        
        this.stop(); 
        this.zPos = 20; 
        if(this.zombie) { 
            this.zombie.style.right = "20px"; 
            this.zombie.style.display = "block"; 
        }
        if(this.projectile) this.projectile.style.display = "none";
        this.isPaused = false;

        // MODE QCM ou IA ?
        if (q.options && Array.isArray(q.options) && q.options.length > 0) {
            this.setMode('QCM');
            this.optBtns.forEach((btn, i) => {
                if(q.options[i]) {
                    btn.textContent = q.options[i];
                    btn.style.display = "block";
                    btn.className = "option-btn"; 
                } else btn.style.display = "none";
            });
        } else {
            this.setMode('IA');
            if(this.input) { this.input.value = ""; this.input.disabled = false; this.input.focus(); }
            if(this.btnSubmit) this.btnSubmit.disabled = false;
        }
        this.start();
    }

    setMode(mode) {
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
        this.interval = setInterval(() => {
            if(state.isGlobalPaused || this.ctrl.getState().isLocked || this.isPaused) return;
            
            this.zPos += 1.5; 
            if(this.zombie) this.zombie.style.right = this.zPos + "px";
            
            if(this.arena && this.zPos > (this.arena.offsetWidth - 100)) this.handleZombieBite();
        }, 50);
    }

    stop() { if(this.interval) clearInterval(this.interval); }

    handleZombieBite() {
        this.stop();
        this.ctrl.notifyWrongAnswer("Le zombie t'a mordu !");
        this.zPos = 20;
        if(this.zombie) this.zombie.style.right = "20px";
        setTimeout(() => this.start(), 1000);
    }

    shootProjectile() {
        if(!this.projectile) { this.handleZombieHit(); return; }
        let projX = 60; 
        this.projectile.style.left = projX + "px";
        this.projectile.style.bottom = "25px";
        this.projectile.style.display = "block";

        if(this.projInterval) clearInterval(this.projInterval);
        this.projInterval = setInterval(() => {
            projX += 15; 
            this.projectile.style.left = projX + "px";
            const zombieLeftX = this.arena.offsetWidth - this.zPos - 60;
            if (projX >= zombieLeftX) {
                clearInterval(this.projInterval);
                this.projectile.style.display = "none";
                this.handleZombieHit();
            }
            if (projX > this.arena.offsetWidth) clearInterval(this.projInterval);
        }, 20);
    }

    handleZombieHit() {
        if(this.zombie) this.zombie.style.display = "none"; 
        this.stop(); 
        this.ctrl.notifyCorrectAnswer(); 
    }

    checkQCM(idx) {
        if (this.isPaused) return;
        const selected = this.currentQ.options[idx];
        const correct = this.currentQ.a;
        let isCorrect = (typeof correct === 'number') ? (idx === correct) : (selected === correct);

        if (isCorrect) {
            this.optBtns[idx].classList.add("opt-correct");
            this.isPaused = true; 
            this.shootProjectile();
        } else {
            this.optBtns[idx].classList.add("opt-wrong");
            setTimeout(() => this.optBtns[idx].classList.remove("opt-wrong"), 500);
            this.ctrl.notifyWrongAnswer(); 
        }
    }

    async checkAI() {
        const val = this.input.value.trim(); if(!val) return;
        this.isPaused = true; this.input.disabled = true; this.btnSubmit.disabled = true;
        this.showFeedback("🧠 Analyse...", "hint");

        try {
            const res = await verifyWithAI({
                question: this.currentQ.q, userAnswer: val, expectedAnswer: this.currentQ.a, playerId: state.currentPlayerId
            });

            let spellingHtml = "";
            if(res.corrections && res.corrections.length > 0) {
                spellingHtml = "<br><strong>Oups, fautes d'orthographe :</strong><ul class='spelling-list'>";
                res.corrections.forEach(c => spellingHtml += `<li class='spelling-item'><span class='wrong-word'>${c.wrong}</span> → <span class='right-word'>${c.correct}</span></li>`);
                spellingHtml += "</ul>";
            }

            if(res.status === "correct") {
                if (!spellingHtml) {
                    // PARFAIT : Tir direct
                    this.showFeedback("<strong>Excellent !</strong>", "success");
                    this.shootProjectile();
                } else {
                    // JUSTE MAIS FAUTES : Bouton manuel
                    const manualBtn = `<button id="btn-validate-spelling" style="margin-top:10px; background:#16a34a; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px;">J'ai bien lu, continuer</button>`;
                    
                    this.showFeedback("<strong>C'est juste !</strong> (Mais attention aux fautes)<br>" + spellingHtml + manualBtn, "success");
                    
                    // Attacher l'événement au bouton dynamique
                    // On attend un micro-tick pour que le DOM soit à jour
                    setTimeout(() => {
                        const btnVal = this.c.querySelector("#btn-validate-spelling");
                        if(btnVal) {
                            btnVal.onclick = () => {
                                this.shootProjectile();
                                this.feedback.style.display = "none";
                            };
                        }
                    }, 50);
                }
            } else {
                // FAUX
                this.showFeedback(`<strong>Non...</strong> ${res.feedback || ""}` + spellingHtml, "error");
                this.ctrl.notifyWrongAnswer();
                setTimeout(() => {
                    this.isPaused = false; this.input.disabled = false; this.btnSubmit.disabled = false; this.input.focus();
                    if(this.feedback) this.feedback.style.display = "none";
                }, 2500);
            }

        } catch(e) { 
            console.error(e);
            this.showFeedback("Erreur.", "error"); 
            this.isPaused = false; this.input.disabled = false; this.btnSubmit.disabled = false;
        }
    }

    showFeedback(html, type) {
        if(!this.feedback) return;
        this.feedback.innerHTML = html;
        this.feedback.className = ""; this.feedback.classList.add(`fb-${type}`);
        this.feedback.style.display = "block";
    }
}