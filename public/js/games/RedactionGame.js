import { state } from '../state.js';
import { verifyWithAI } from '../api.js';

export class RedactionGame {
    constructor(container, controller) {
        this.c = container;
        this.ctrl = controller;

        this.qEl = container.querySelector("#redac-q");
        this.input = container.querySelector("#redac-answer");
        this.btnSubmit = container.querySelector("#redac-submit");
        this.loading = container.querySelector("#redac-loading");
        this.analysis = container.querySelector("#analysis-area");
        this.textGood = container.querySelector("#text-good");
        this.btnCont = container.querySelector("#redac-continue");
        
        this.btnSubmit.onclick = () => this.check();
        this.btnCont.onclick = () => this.ctrl.notifyCorrectAnswer();
        
        console.log("📝 Redaction Game Ready");
    }
    
    loadQuestion(q) {
        this.currentQ = q;
        this.qEl.innerHTML = q.q.replace(/\n/g, "<br>");
        this.input.value = "";
        
        this.analysis.style.display = "none";
        this.loading.style.display = "none";
        this.btnCont.style.display = "none";
        
        this.input.disabled = false;
        this.btnSubmit.style.display = "block";
        this.btnSubmit.disabled = false;
        this.btnSubmit.textContent = "Envoyer à l'IA 🤖";
    }
    
    async check() {
        const val = this.input.value.trim();
        if(!val) return alert("Écris quelque chose !");
        
        this.input.disabled = true;
        this.btnSubmit.disabled = true;
        this.btnSubmit.style.display = "none";
        this.loading.style.display = "block";
        
        try {
            const res = await verifyWithAI({
                question: this.currentQ.q, 
                userAnswer: val, 
                expectedAnswer: this.currentQ.a, 
                playerId: state.currentPlayerId,
                redactionMode: "generic" // Ou q.mode si défini dans le JSON
            });
            
            this.loading.style.display = "none";
            this.analysis.style.display = "block";
            
            let content = res.feedback || res.short_comment || "Pas de commentaire.";
            if(res.grade) content = `<strong>Note: ${res.grade}</strong><br>` + content;
            
            this.textGood.innerHTML = content;
            
            if(res.status === "correct") {
                this.textGood.style.color = "#166534";
                this.textGood.style.borderLeft = "4px solid #22c55e";
                this.btnCont.style.display = "block";
            } else {
                this.textGood.style.color = "#991b1b";
                this.textGood.style.borderLeft = "4px solid #ef4444";
                
                this.input.disabled = false;
                this.btnSubmit.style.display = "block";
                this.btnSubmit.disabled = false;
                this.btnSubmit.textContent = "Réessayer";
                this.ctrl.notifyWrongAnswer();
            }
        } catch(e) {
            console.error(e);
            this.loading.style.display = "none";
            this.input.disabled = false;
            this.btnSubmit.style.display = "block";
            this.btnSubmit.disabled = false;
            alert("Erreur de connexion IA");
        }
    }
}