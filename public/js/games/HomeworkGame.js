import { state } from '../state.js';
import { uploadFile, verifyWithAI } from '../api.js';

export class HomeworkGame {
    constructor(container, controller) {
        this.c = container; 
        this.controller = controller;

        // UI Principale
        this.listView = this.c.querySelector("#hw-list"); 
        this.workView = this.c.querySelector("#hw-workspace");
        
        // --- LISEUSE / TOILE ---
        this.viewerContainer = this.c.querySelector("#doc-viewer"); // Le cadre
        this.panZoomContent = this.c.querySelector("#pan-zoom-content"); // La toile
        this.imgEl = this.c.querySelector("#current-doc-img");
        this.pdfEl = this.c.querySelector("#current-doc-pdf");
        this.noDocMsg = this.c.querySelector("#no-doc-msg");
        
        // Navigation Docs
        this.btnPrev = this.c.querySelector("#btn-prev-doc");
        this.btnNext = this.c.querySelector("#btn-next-doc");
        this.counterEl = this.c.querySelector("#page-counter");
        
        // Zoom
        this.btnZoomIn = this.c.querySelector("#btn-zoom-in");
        this.btnZoomOut = this.c.querySelector("#btn-zoom-out");

        // --- QUESTION / REPONSE ---
        this.qIndexEl = this.c.querySelector("#q-index");
        this.qTextEl = this.c.querySelector("#q-text");
        this.qImgZone = this.c.querySelector("#q-image-container");
        this.input = this.c.querySelector("#hw-text");
        this.fileInput = this.c.querySelector("#hw-file");
        this.fileName = this.c.querySelector("#file-name");
        this.btnSubmit = this.c.querySelector("#hw-submit");
        this.btnQuit = this.c.querySelector("#btn-close-work");

        // --- MODALE ---
        this.modal = this.c.querySelector("#ai-feedback-modal");
        this.overlay = this.c.querySelector("#ai-overlay");
        this.modalContent = this.c.querySelector("#ai-content");
        this.btnModify = this.c.querySelector("#btn-modify");
        this.btnNextQ = this.c.querySelector("#btn-next");

        // --- ETAT ---
        this.currentHw = null; 
        this.currentLevelIndex = 0;
        this.docs = []; // Liste des docs de la question
        this.docIndex = 0;
        
        // Etat View (Pan & Zoom)
        this.viewState = { x: 0, y: 0, scale: 1 };

        this.initEvents();
        this.initPanZoom(); // Active le Drag
        this.loadHomeworks();
    }

    initEvents() {
        this.btnQuit.onclick = () => this.showList();
        
        // Le bouton Envoyer était cassé, voici la correction :
        this.btnSubmit.onclick = (e) => {
            e.preventDefault(); // Sécurité
            this.submit();
        };
        
        this.btnPrev.onclick = () => this.changeDoc(-1);
        this.btnNext.onclick = () => this.changeDoc(1);
        
        this.btnZoomIn.onclick = () => this.zoom(0.2);
        this.btnZoomOut.onclick = () => this.zoom(-0.2);
        
        this.btnModify.onclick = () => this.closeModal();
        this.btnNextQ.onclick = () => { this.closeModal(); this.nextQuestion(); };
        
        this.fileInput.onchange = () => { 
            if(this.fileInput.files.length) this.fileName.textContent = "📸 Image OK"; 
        };
    }

    // --- MOTEUR PAN & ZOOM ---
    initPanZoom() {
        let isDown = false;
        let startX, startY;

        // Mouse Down
        this.viewerContainer.addEventListener('mousedown', (e) => {
            if(e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            isDown = true;
            this.viewerContainer.style.cursor = 'grabbing';
            // Position de la souris relative au décalage actuel
            startX = e.clientX - this.viewState.x;
            startY = e.clientY - this.viewState.y;
        });

        // Mouse Move
        window.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            this.viewState.x = e.clientX - startX;
            this.viewState.y = e.clientY - startY;
            this.updateTransform();
        });

        // Mouse Up
        window.addEventListener('mouseup', () => {
            isDown = false;
            this.viewerContainer.style.cursor = 'grab';
        });

        // Molette
        this.viewerContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom(delta);
        });
    }

    zoom(delta) {
        this.viewState.scale = Math.min(Math.max(0.2, this.viewState.scale + delta), 5);
        this.updateTransform();
    }

    updateTransform() {
        // Centre + Pan + Scale
        this.panZoomContent.style.transform = `translate(calc(-50% + ${this.viewState.x}px), calc(-50% + ${this.viewState.y}px)) scale(${this.viewState.scale})`;
    }

    resetView() {
        this.viewState = { x: 0, y: 0, scale: 0.9 }; // Un peu dézoomé par défaut
        this.updateTransform();
    }

    // --- LOGIQUE JEU ---
    async loadHomeworks() {
        this.listView.innerHTML = "<p>Chargement...</p>";
        try {
            const res = await fetch(`/api/homework/${state.currentPlayerData.classroom}`);
            const list = await res.json();
            
            if(list.length === 0) { this.listView.innerHTML = "<p style='text-align:center'>Rien à faire.</p>"; return; }
            
            this.listView.innerHTML = list.map((hw, i) => `
                <div class="hw-list-item" data-idx="${i}">
                    <b>${hw.title}</b><br><small>${new Date(hw.date).toLocaleDateString()}</small>
                </div>
            `).join('');

            this.listView.querySelectorAll(".hw-list-item").forEach(item => {
                item.onclick = () => this.openHw(list[item.dataset.idx]);
            });
        } catch(e) { this.listView.innerHTML = "Erreur."; }
    }

    openHw(hw) {
        this.currentHw = hw;
        this.currentLevelIndex = 0;
        this.listView.style.display = "none";
        this.workView.style.display = "flex"; // Flex pour le layout vertical
        this.loadLevel();
    }

    loadLevel() {
        const lvl = this.currentHw.levels[this.currentLevelIndex];
        
        // 1. Textes
        this.qIndexEl.textContent = `${this.currentLevelIndex + 1}/${this.currentHw.levels.length}`;
        this.qTextEl.textContent = lvl.instruction;
        
        // 2. Image Question (Bas Gauche)
        this.qImgZone.innerHTML = "";
        if (lvl.questionImage) {
            this.qImgZone.innerHTML = `<img src="${lvl.questionImage}" style="max-width:100%; max-height:150px; margin-top:5px; border:1px solid #ccc;">`;
        }

        // 3. Documents (Haut)
        // On filtre BREAK (car ici on a une liseuse simple)
        this.docs = lvl.attachmentUrls.filter(u => u !== "BREAK");
        this.docIndex = 0;
        this.renderCurrentDoc();

        // 4. Reset Inputs
        this.input.value = "";
        this.fileInput.value = "";
        this.fileName.textContent = "";
        this.submitBtn.style.display = "block";
    }

    renderCurrentDoc() {
        this.resetView(); // On recentre à chaque changement de page

        if (this.docs.length === 0) {
            this.imgEl.style.display = "none";
            this.pdfEl.style.display = "none";
            this.noDocMsg.style.display = "block";
            this.counterEl.style.display = "none";
            return;
        }

        this.noDocMsg.style.display = "none";
        this.counterEl.style.display = "block";
        this.counterEl.textContent = `${this.docIndex + 1} / ${this.docs.length}`;

        const url = this.docs[this.docIndex];
        
        if (url.endsWith('.pdf')) {
            this.imgEl.style.display = "none";
            this.pdfEl.style.display = "block";
            this.pdfEl.src = url;
        } else {
            this.pdfEl.style.display = "none";
            this.imgEl.style.display = "block";
            this.imgEl.src = url;
        }

        // Flèches
        this.btnPrev.style.display = this.docIndex > 0 ? "flex" : "none";
        this.btnNext.style.display = this.docIndex < this.docs.length - 1 ? "flex" : "none";
    }

    changeDoc(dir) {
        this.docIndex += dir;
        this.renderCurrentDoc();
    }

    async submit() {
        const txt = this.input.value;
        const file = this.fileInput.files[0];
        
        if(!txt && !file) return alert("Réponse vide !");
        
        this.submitBtn.disabled = true;
        this.modal.style.display = "flex";
        this.overlay.style.display = "block";
        this.modalContent.innerHTML = "🧠 Analyse en cours...";
        this.btnModify.style.display = "none";
        this.btnNextQ.style.display = "none";

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
                    homeworkContext: this.currentHw.levels[this.currentLevelIndex].aiPrompt,
                    classroom: state.currentPlayerData.classroom, 
                    playerId: state.currentPlayerId, homeworkId: this.currentHw._id 
                })
            });
            const data = await res.json();
            
            this.modalContent.innerHTML = data.feedback;
            this.btnModify.style.display = "inline-block";
            this.btnNextQ.style.display = "inline-block";
            
            const isLast = (this.currentLevelIndex >= this.currentHw.levels.length - 1);
            this.btnNextQ.textContent = isLast ? "Terminer 🎉" : "Suivant ➔";

        } catch(e) {
            this.modalContent.innerHTML = "Erreur technique.";
            this.btnModify.style.display = "inline-block";
            this.btnModify.textContent = "Fermer";
        }
        this.submitBtn.disabled = false;
    }

    closeModal() {
        this.modal.style.display = "none";
        this.overlay.style.display = "none";
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
    
    showList() { this.workView.style.display="none"; this.listView.style.display="block"; }
}