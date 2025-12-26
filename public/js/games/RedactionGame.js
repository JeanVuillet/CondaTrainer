import { state } from '../state.js';
import { verifyWithAI } from '../api.js';

export class RedactionGame {
    constructor(container, controller) {
        this.container = container;
        this.ctrl = controller;
        
        this.qEl = container.querySelector("#redac-q");
        this.input = container.querySelector("#redac-answer");
        this.btn = container.querySelector("#redac-submit");
        this.loading = container.querySelector("#redac-loading");
        this.analysis = container.querySelector("#analysis-area");
        this.textGood = container.querySelector("#text-good");
        this.btnCont = container.querySelector("#redac-continue");
        
        this.btn.onclick = () => this.check();
        this.btnCont.onclick = () => this.ctrl.notifyCorrectAnswer();
    }
    
    loadQuestion(q) {
        this.currentQ = q;
        this.qEl.textContent = q.q;
        this.input.value = "";
        
        this.analysis.style.display = "none";
        this.loading.style.display = "none";
        this.btnCont.style.display = "none";
        this.input.disabled = false;
        this.btn.style.display = "block";
    }
    
    async check() {
        const val = this.input.value.trim();
        if(!val) return alert("Écris quelque chose !");
        
        this.input.disabled = true;
        this.btn.style.display = "none";
        this.loading.style.display = "block";
        
        try {
            const res = await verifyWithAI({
                question: this.currentQ.q, 
                userAnswer: val, 
                expectedAnswer: this.currentQ.a, 
                playerId: state.currentPlayerId,
                redactionMode: this.currentQ.mode || "generic"
            });
            
            this.loading.style.display = "none";
            this.analysis.style.display = "block";
            
            let content = res.feedback || res.short_comment || "Pas de commentaire.";
            if(res.grade) content = `<strong>Note: ${res.grade}</strong><br>` + content;
            
            this.textGood.innerHTML = content;
            
            if(res.status === "correct") {
                this.textGood.style.color = "#166534";
                this.btnCont.style.display = "block";
            } else {
                this.textGood.style.color = "#991b1b";
                this.input.disabled = false;
                this.btn.style.display = "block";
                this.btn.textContent = "Réessayer";
                this.ctrl.notifyWrongAnswer();
            }
        } catch(e) {
            this.loading.style.display = "none";
            this.input.disabled = false;
            this.btn.style.display = "block";
            alert("Erreur connexion");
        }
    }
}