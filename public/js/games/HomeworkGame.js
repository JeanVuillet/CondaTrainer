import { state } from '../state.js';
import { uploadFile, verifyWithAI } from '../api.js';

export class HomeworkGame {
    constructor(container, controller) {
        this.c = container; 
        this.controller = controller;

        // UI
        this.listView = this.c.querySelector("#hw-list"); 
        this.workView = this.c.querySelector("#hw-workspace");
        
        // LISEUSE
        this.imgEl = this.c.querySelector("#current-doc-img");
        this.pdfEl = this.c.querySelector("#current-doc-pdf");
        this.noDocMsg = this.c.querySelector("#no-doc-msg");
        this.counterEl = this.c.querySelector("#page-counter");
        this.btnPrev = this.c.querySelector("#btn-prev-doc");
        this.btnNext = this.c.querySelector("#btn-next-doc");
        
        // INTERACTION
        this.qIndexEl = this.c.querySelector("#q-index");
        this.qTextEl = this.c.querySelector("#q-text");
        this.qImgZone = this.c.querySelector("#q-image-container");
        this.input = this.c.querySelector("#hw-text");
        this.fileInput = this.c.querySelector("#hw-file");
        this.fileName = this.c.querySelector("#file-name");
        this.btnSubmit = this.c.querySelector("#hw-submit");
        this.btnQuit = this.c.querySelector("#btn-close-work");

        // MODALE & ZOOM
        this.modal = this.c.querySelector("#ai-feedback-modal");
        this.overlay = this.c.querySelector("#ai-overlay");
        this.modalContent = this.c.querySelector("#ai-content");
        this.btnModify = this.c.querySelector("#btn-modify");
        this.btnNextQ = this.c.querySelector("#btn-next");
        
        this.btnZoomIn = this.c.querySelector("#btn-zoom-in");
        this.btnZoomOut = this.c.querySelector("#btn-zoom-out");

        // ETAT
        this.currentHw = null; 
        this.currentLevelIndex = 0;
        this.docs = []; 
        this.docIndex = 0;
        this.zoom = 1;

        this.initEvents();
        this.loadHomeworks();
        
        console.log("📚 HomeworkGame Initialisé");
    }

    initEvents() {
        if(this.btnQuit) this.btnQuit.onclick = () => this.showList();
        if(this.btnSubmit) this.btnSubmit.onclick = () => this.submit();
        
        if(this.btnPrev) this.btnPrev.onclick = () => this.changeDoc(-1);
        if(this.btnNext) this.btnNext.onclick = () => this.changeDoc(1);
        
        if(this.btnZoomIn) this.btnZoomIn.onclick = () => this.applyZoom(0.2);
        if(this.btnZoomOut) this.btnZoomOut.onclick = () => this.applyZoom(-0.2);
        
        if(this.btnModify) this.btnModify.onclick = () => this.closeModal();
        if(this.btnNextQ) this.btnNextQ.onclick = () => { this.closeModal(); this.nextQuestion(); };
        
        if(this.fileInput) {
            this.fileInput.onchange = () => { 
                if(this.fileInput.files.length && this.fileName) {
                    this.fileName.textContent = "📸 " + this.fileInput.files[0].name;
                }
            };
        }
    }

    async loadHomeworks() {
        if(this.listView) this.listView.innerHTML = "<p style='padding:20px'>Chargement...</p>";
        try {
            const res = await fetch(`/api/homework/${state.currentPlayerData.classroom}`);
            const list = await res.json();
            
            if(this.listView) {
                this.listView.innerHTML = ""; 
                if (list.length === 0) { 
                    this.listView.innerHTML = "<p style='text-align:center; padding:20px;'>Aucun devoir.</p>"; 
                    return; 
                }
                
                list.forEach((hw, i) => {
                    const div = document.createElement("div"); 
                    div.className = "hw-list-item";
                    div.innerHTML = `<b>${hw.title}</b><br><small>${new Date(hw.date).toLocaleDateString()}</small>`;
                    div.onclick = () => this.startHomework(hw);
                    this.listView.appendChild(div);
                });
            }
        } catch(e) { if(this.listView) this.listView.innerHTML = "Erreur chargement."; }
    }

    startHomework(hw) {
        this.currentHw = hw;
        this.currentLevelIndex = 0;
        if(this.listView) this.listView.style.display = "none";
        if(this.workView) this.workView.style.display = "flex";
        this.loadLevel();
    }

    loadLevel() {
        const levels = this.currentHw.levels || [];
        const currentLevel = levels[this.currentLevelIndex];
        
        // Texte Question
        if(this.qIndexEl) this.qIndexEl.textContent = `${this.currentLevelIndex + 1}/${levels.length}`;
        if(this.qTextEl) this.qTextEl.textContent = currentLevel.instruction || "Aucune consigne";

        // Image Question (Bas Gauche)
        if(this.qImgZone) {
            this.qImgZone.innerHTML = "";
            if (currentLevel.questionImage) {
                this.qImgZone.innerHTML = `<img src="${currentLevel.questionImage}" class="question-img">`;
            }
        }

        // Documents (Liseuse)
        this.docs = (currentLevel.attachmentUrls || []).filter(u => u !== "BREAK");
        this.docIndex = 0;
        this.renderCurrentDoc();

        // Reset Champs
        if(this.input) this.input.value = "";
        if(this.fileInput) this.fileInput.value = "";
        if(this.fileName) this.fileName.textContent = "";
        if(this.submitBtn) this.submitBtn.disabled = false;
    }

    renderCurrentDoc() {
        this.zoom = 1;
        this.applyZoom(0);

        // Si aucun doc
        if (this.docs.length === 0) {
            if(this.imgEl) this.imgEl.style.display = "none";
            if(this.pdfEl) this.pdfEl.style.display = "none";
            if(this.noDocMsg) this.noDocMsg.style.display = "block";
            if(this.counterEl) this.counterEl.style.display = "none";
            return;
        }

        if(this.noDocMsg) this.noDocMsg.style.display = "none";
        if(this.counterEl) {
            this.counterEl.style.display = "block";
            this.counterEl.textContent = `${this.docIndex + 1} / ${this.docs.length}`;
        }

        const url = this.docs[this.docIndex];
        const isPdf = url.toLowerCase().endsWith('.pdf');

        if (isPdf) {
            if(this.imgEl) this.imgEl.style.display = "none";
            if(this.pdfEl) {
                this.pdfEl.style.display = "block";
                this.pdfEl.src = url;
            }
        } else {
            if(this.pdfEl) this.pdfEl.style.display = "none";
            if(this.imgEl) {
                this.imgEl.style.display = "block";
                this.imgEl.src = url;
            }
        }

        // Flèches
        if(this.btnPrev) this.btnPrev.style.display = this.docIndex > 0 ? "flex" : "none";
        if(this.btnNext) this.btnNext.style.display = this.docIndex < this.docs.length - 1 ? "flex" : "none";
    }

    changeDoc(dir) {
        this.docIndex += dir;
        this.renderCurrentDoc();
    }

    applyZoom(delta) {
        this.zoom = Math.max(0.5, Math.min(3.0, this.zoom + delta));
        if(this.imgEl && this.imgEl.style.display !== "none") {
            this.imgEl.style.transform = `scale(${this.zoom})`;
        }
    }

    async submit() {
        const txt = this.input ? this.input.value : "";
        const file = (this.fileInput && this.fileInput.files) ? this.fileInput.files[0] : null;
        
        if(!txt && !file) return alert("Réponse vide !");
        
        this.submitBtn.disabled = true;
        
        if(this.modal) {
            this.modal.style.display = "flex";
            if(this.overlay) this.overlay.style.display = "block";
            this.modalContent.innerHTML = "<p style='text-align:center; color:#2563eb;'>🧠 Analyse IA...</p>";
            this.btnModify.style.display = "none";
            this.btnNextQ.style.display = "none";
        }

        try {
            let imgUrl = null;
            if(file) {
                const fd = new FormData(); fd.append('file', file);
                const r = await fetch('/api/upload', {method:'POST', body:fd});
                const d = await r.json();
                imgUrl = d.imageUrl;
            }

            const res = await fetch('/api/analyze-homework', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    imageUrl: imgUrl, userText: txt, 
                    homeworkInstruction: this.currentHw.levels[this.currentLevelIndex].instruction,
                    classroom: state.currentPlayerData.classroom, playerId: state.currentPlayerId, homeworkId: this.currentHw._id 
                })
            });
            const data = await res.json();
            
            if(this.modalContent) this.modalContent.innerHTML = data.feedback;
            if(this.btnModify) this.btnModify.style.display = "inline-block";
            
            if(this.btnNextQ) {
                this.btnNextQ.style.display = "inline-block";
                const isLast = (this.currentLevelIndex >= this.currentHw.levels.length - 1);
                this.btnNextQ.textContent = isLast ? "Terminer 🎉" : "Suivant ➔";
            }

        } catch(e) {
            if(this.modalContent) this.modalContent.innerHTML = "Erreur technique.";
            if(this.btnModify) {
                this.btnModify.style.display = "inline-block";
                this.btnModify.textContent = "Fermer";
            }
        }
        if(this.submitBtn) this.submitBtn.disabled = false;
    }

    closeModal() {
        if(this.modal) this.modal.style.display = "none";
        if(this.overlay) this.overlay.style.display = "none";
    }

    nextQuestion() {
        if (this.currentLevelIndex < this.currentHw.levels.length - 1) {
            this.currentLevelIndex++;
            this.loadLevel();
        } else {
            alert("Devoir terminé !");
            this.showList();
        }
    }

    showList() { 
        if(this.workView) this.workView.style.display = "none"; 
        if(this.listView) this.listView.style.display = "block"; 
    }
}