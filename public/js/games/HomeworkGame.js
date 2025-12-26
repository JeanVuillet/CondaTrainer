import { state } from '../state.js';

export class HomeworkGame {
    constructor(container, controller) {
        this.c = container;
        this.ctrl = controller;

        // UI
        this.list = this.c.querySelector("#hw-list");
        this.view = this.c.querySelector("#hw-workspace");
        this.titleEl = this.c.querySelector("#panel-title");
        this.descEl = this.c.querySelector("#panel-desc");
        this.zoneTop = this.c.querySelector("#zone-top");
        this.zoneBottom = this.c.querySelector("#zone-bottom");
        this.input = this.c.querySelector("#hw-text");
        this.fileInput = this.c.querySelector("#hw-file");
        this.fileName = this.c.querySelector("#file-name");
        this.btnSubmit = this.c.querySelector("#hw-submit");
        this.btnClose = this.c.querySelector("#btn-close-work");

        // Modale Feedback IA (Globale dans index.html)
        this.modal = document.getElementById("aiFeedbackModal");
        this.modalContent = document.getElementById("aiModalContent");
        this.modalBtn = document.getElementById("aiModalCloseBtn");

        // Events
        this.btnClose.onclick = () => { this.view.style.display="none"; this.list.style.display="block"; };
        this.btnSubmit.onclick = () => this.submit();
        
        if(this.fileInput) {
            this.fileInput.onchange = () => {
                if(this.fileInput.files.length > 0) this.fileName.textContent = "✅ Image chargée";
                else this.fileName.textContent = "";
            };
        }

        this.loadHomeworks();
    }

    async loadHomeworks() {
        this.list.innerHTML = "<div style='padding:10px'>Chargement...</div>";
        try {
            const res = await fetch(`/api/homework/${state.currentPlayerData.classroom}`);
            const data = await res.json();
            
            if(data.length === 0) {
                this.list.innerHTML = "<div style='padding:20px; text-align:center'>Aucun devoir.</div>";
                return;
            }

            this.list.innerHTML = data.map((hw, i) => `
                <div class="hw-item" style="padding:15px; border-bottom:1px solid #eee; cursor:pointer; background:white;" data-idx="${i}">
                    <div style="font-weight:bold; color:#1e3a8a;">${hw.title}</div>
                    <div style="font-size:0.85em; color:#64748b;">📅 ${new Date(hw.date).toLocaleDateString()} • ${hw.levels.length} questions</div>
                </div>
            `).join('');

            this.list.querySelectorAll(".hw-item").forEach(item => {
                item.onclick = () => this.openHw(data[item.dataset.idx]);
            });
        } catch(e) { this.list.innerHTML = "Erreur chargement."; }
    }

    openHw(hwData) {
        this.currentHw = hwData;
        this.currentQIdx = 0;
        this.list.style.display = "none"; 
        this.view.style.display = "flex";
        this.titleEl.textContent = this.currentHw.title;
        this.loadLevel(0);
    }

    loadLevel(idx) {
        this.currentQIdx = idx;
        const lvl = this.currentHw.levels[idx];
        
        // Texte consigne
        this.descEl.innerHTML = `<strong>Question ${idx+1} / ${this.currentHw.levels.length} :</strong> ${lvl.instruction}`;
        this.input.value = "";
        this.fileInput.value = "";
        this.fileName.textContent = "";

        // Images
        this.zoneTop.innerHTML = "";
        this.zoneBottom.innerHTML = "";
        let target = this.zoneTop;

        lvl.attachmentUrls.forEach(u => {
            if(u === "BREAK") { target = this.zoneBottom; return; }
            
            let el;
            if(u.endsWith(".pdf")) {
                el = document.createElement("iframe");
                el.src = u;
                el.style.width="200px"; el.style.height="140px"; el.style.border="none";
            } else {
                el = document.createElement("img");
                el.src = u;
                el.onclick = () => window.open(u, '_blank'); // Zoom au clic
            }
            target.appendChild(el);
        });
    }

    async submit() {
        const text = this.input.value.trim();
        const file = this.fileInput.files[0];
        if(!text && !file) return alert("Réponse vide !");

        // Ouvrir modale chargement
        this.modal.style.display = "flex";
        this.modalContent.innerHTML = "<p style='text-align:center; color:#2563eb; font-weight:bold;'>🧠 L'IA analyse votre travail...</p>";
        this.modalBtn.style.display = "none"; // Cache le bouton pendant chargement

        let imgUrl = null;
        try {
            if(file) {
                const fd = new FormData(); fd.append('file', file);
                const r = await fetch('/api/upload', {method:'POST', body:fd});
                const d = await r.json();
                if(d.ok) imgUrl = d.imageUrl;
            }

            const res = await fetch('/api/analyze-homework', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    imageUrl: imgUrl, 
                    userText: text, 
                    homeworkInstruction: this.currentHw.levels[this.currentQIdx].instruction, 
                    teacherDocUrls: this.currentHw.levels[this.currentQIdx].attachmentUrls, 
                    classroom: state.currentPlayerData.classroom, 
                    playerId: state.currentPlayerId,
                    homeworkId: this.currentHw._id
                })
            });
            const data = await res.json();

            // Affichage Résultat dans la modale
            this.modalContent.innerHTML = data.feedback;
            this.modalBtn.style.display = "inline-block";
            
            // Configuration du bouton de fermeture de la modale
            this.modalBtn.textContent = (this.currentQIdx < this.currentHw.levels.length - 1) ? "Question Suivante ➔" : "Terminer le Devoir 🎉";
            
            this.modalBtn.onclick = () => {
                this.modal.style.display = "none";
                if (this.currentQIdx < this.currentHw.levels.length - 1) {
                    this.loadLevel(this.currentQIdx + 1);
                } else {
                    alert("Devoir terminé !");
                    this.c.querySelector("#btn-close-work").click();
                }
            };

        } catch(e) {
            this.modalContent.innerHTML = "<p style='color:red'>Erreur de connexion.</p>";
            this.modalBtn.style.display = "inline-block";
            this.modalBtn.textContent = "Fermer";
            this.modalBtn.onclick = () => this.modal.style.display = "none";
        }
    }
}