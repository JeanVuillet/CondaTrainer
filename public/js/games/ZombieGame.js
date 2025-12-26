import { state } from '../state.js';
import { verifyWithAI } from '../api.js';

export class ZombieGame {
    constructor(container, controller) {
        console.log("🧟 [ZOMBIE] Constructeur...");
        this.c = container;
        this.ctrl = controller;

        // Elements
        this.arena = container.querySelector("#zombie-arena");
        this.zombie = container.querySelector("#z-zombie");
        this.projectile = container.querySelector("#z-projectile");
        this.qEl = container.querySelector("#z-question");
        this.feedback = container.querySelector("#feedback-bubble");
        
        // Inputs
        this.aiZone = container.querySelector("#ai-input-zone");
        this.input = container.querySelector("#z-answer");
        this.btnSubmit = container.querySelector("#z-submit");

        // QCM
        this.qcmZone = container.querySelector("#options-grid");
        this.optBtns = container.querySelectorAll(".option-btn");

        this.zPos = 20; 
        this.interval = null; 
        this.projInterval = null; 
        this.isPaused = false;

        // Listeners
        if(this.btnSubmit) this.btnSubmit.onclick = () => this.checkAI();
        if(this.input) this.input.onkeydown = (e) => { if(e.key==="Enter") this.checkAI(); };
        
        // Listeners QCM
        this.optBtns.forEach((btn, idx) => {
            btn.onclick = (e) => {
                // Petit effet visuel au clic
                e.target.style.transform = "scale(0.95)";
                setTimeout(() => e.target.style.transform = "scale(1)", 100);
                this.checkQCM(idx);
            };
        });
    }

    loadQuestion(q) {
        console.log("🧟 [ZOMBIE] Question reçue:", q);
        this.currentQ = q;
        
        if(this.qEl) this.qEl.textContent = q.q;
        if(this.feedback) { this.feedback.style.display = "none"; this.feedback.innerHTML = ""; }
        
        // Reset Jeu
        this.stop(); 
        this.zPos = 20; 
        if(this.zombie) { this.zombie.style.right = "20px"; this.zombie.style.display = "block"; }
        if(this.projectile) this.projectile.style.display = "none";
        this.isPaused = false;

        // --- AFFICHAGE : LE MOMENT DE VÉRITÉ ---
        const hasOptions = (q.options && Array.isArray(q.options) && q.options.length > 0);

        if (hasOptions) {
            console.log("👉 MODE QCM ACTIVÉ (" + q.options.length + " options)");
            
            // 1. On cache l'input texte
            if(this.aiZone) this.aiZone.style.display = 'none';
            
            // 2. On affiche la grille de boutons
            if(this.qcmZone) this.qcmZone.style.display = 'grid';

            // 3. On remplit les boutons
            this.optBtns.forEach((btn, i) => {
                // Reset style
                btn.style.background = "white";
                btn.style.color = "#1e293b";
                btn.style.borderColor = "#e2e8f0";
                
                if (q.options[i]) {
                    btn.textContent = q.options[i];
                    btn.style.display = "block"; // On s'assure qu'il est visible
                } else {
                    btn.style.display = "none"; // On cache s'il n'y a pas d'option
                }
            });

        } else {
            console.log("👉 MODE TEXTE (IA) ACTIVÉ");
            
            // 1. On cache les boutons
            if(this.qcmZone) this.qcmZone.style.display = 'none';
            
            // 2. On affiche l'input
            if(this.aiZone) this.aiZone.style.display = 'flex';
            
            if(this.input) {
                this.input.value = "";
                this.input.disabled = false;
                setTimeout(() => this.input.focus(), 100);
            }
            if(this.btnSubmit) this.btnSubmit.disabled = false;
        }
        
        this.start();
    }

    start() {
        if(this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => {
            if(state.isGlobalPaused || this.ctrl.getState().isLocked || this.isPaused) return;
            
            this.zPos += 1.0; 
            if(this.zombie) this.zombie.style.right = this.zPos + "px";
            
            if(this.arena && this.zPos > (this.arena.offsetWidth - 80)) {
                this.handleZombieBite();
            }
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
        if(this.feedback) this.feedback.style.display = "none";
        if(!this.projectile) { this.handleZombieHit(); return; }
        
        let projX = 60; 
        this.projectile.style.left = projX + "px";
        this.projectile.style.bottom = "45px"; // Ajusté selon template
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

    // --- CHECK QCM ---
    checkQCM(idx) {
        if (this.isPaused) return;
        
        console.log("Clic bouton index:", idx);
        
        const selected = this.currentQ.options[idx];
        const correct = this.currentQ.a;
        
        // Vérification robuste
        let isCorrect = false;
        if (typeof correct === 'number') isCorrect = (idx === correct);
        else isCorrect = (selected === correct);

        const btn = this.optBtns[idx];

        if (isCorrect) {
            btn.style.background = "#dcfce7";
            btn.style.borderColor = "#22c55e";
            btn.style.color = "#15803d";
            this.isPaused = true; 
            this.shootProjectile();
        } else {
            btn.style.background = "#fee2e2";
            btn.style.borderColor = "#ef4444";
            btn.style.color = "#991b1b";
            
            // Reset visuel après 0.5s
            setTimeout(() => {
                btn.style.background = "white";
                btn.style.borderColor = "#e2e8f0";
                btn.style.color = "#1e293b";
            }, 500);
            
            this.ctrl.notifyWrongAnswer(); 
        }
    }

    // --- CHECK IA ---
    async checkAI() {
        const val = this.input.value.trim(); if(!val) return;
        this.isPaused = true; 
        this.input.disabled = true; this.btnSubmit.disabled = true;
        this.showFeedback("🧠 L'IA réfléchit...", "hint");

        try {
            const res = await verifyWithAI({
                question: this.currentQ.q, userAnswer: val, expectedAnswer: this.currentQ.a, playerId: state.currentPlayerId
            });

            let spellingHtml = "";
            if(res.corrections && res.corrections.length > 0) {
                spellingHtml = "<br><strong>Fautes :</strong><ul class='spelling-list'>";
                res.corrections.forEach(c => spellingHtml += `<li><s>${c.wrong}</s> → <b>${c.correct}</b></li>`);
                spellingHtml += "</ul>";
            }

            const btnHtml = `<div style="margin-top:10px;"><button id="btn-read-ok" style="background:#2563eb; color:white; border:none; padding:8px 16px; border-radius:4px; font-weight:bold; cursor:pointer;">OK</button></div>`;

            if(res.status === "correct") {
                const msg = spellingHtml ? "<strong>Juste !</strong> Mais..." : "<strong>Excellent !</strong>";
                this.showModalAndListen(msg + spellingHtml, "success", btnHtml, () => {
                    this.feedback.style.display = "none";
                    this.shootProjectile();
                });
            } else {
                this.showModalAndListen(`<strong>Non...</strong> ${res.feedback || ""}` + spellingHtml, "error", btnHtml, () => {
                    this.feedback.style.display = "none";
                    this.ctrl.notifyWrongAnswer(); 
                    this.isPaused = false;
                    this.input.disabled = false;
                    this.btnSubmit.disabled = false;
                    this.input.focus();
                });
            }
        } catch(e) { 
            this.showFeedback("Erreur.", "error"); 
            this.isPaused = false; this.input.disabled = false; this.btnSubmit.disabled = false;
        }
    }

    showModalAndListen(htmlContent, type, btnHtml, callback) {
        if(!this.feedback) return;
        this.feedback.innerHTML = htmlContent + btnHtml;
        this.feedback.className = ""; this.feedback.classList.add(`fb-${type}`);
        this.feedback.style.display = "block";
        this.feedback.style.zIndex = "100";
        this.feedback.style.pointerEvents = "auto";
        setTimeout(() => {
            const btn = this.c.querySelector("#btn-read-ok");
            if(btn) btn.onclick = (e) => { e.stopPropagation(); callback(); };
        }, 50);
    }
    
    showFeedback(html, type) {
        if(!this.feedback) return;
        this.feedback.innerHTML = html;
        this.feedback.className = ""; this.feedback.classList.add(`fb-${type}`);
        this.feedback.style.display = "block";
    }
}