import { state } from '../state.js';
import { uploadFile, verifyWithAI } from '../api.js';

export class HomeworkGame {
    constructor(container, controller) {
        this.c = container; 
        this.controller = controller;

        console.log("📚 HomeworkGame V-FIX Loaded");

        // UI
        this.listView = this.c.querySelector("#hw-list"); 
        this.workView = this.c.querySelector("#hw-workspace");
        
        // TOILE
        this.viewerContainer = this.c.querySelector("#doc-viewer"); 
        this.panZoomContent = this.c.querySelector("#pan-zoom-content");
        this.imgEl = this.c.querySelector("#current-doc-img");
        this.pdfEl = this.c.querySelector("#current-doc-pdf");
        this.noDocMsg = this.c.querySelector("#no-doc-msg");
        this.counterEl = this.c.querySelector("#page-counter");
        
        // NAV
        this.btnPrev = this.c.querySelector("#btn-prev-doc");
        this.btnNext = this.c.querySelector("#btn-next-doc");
        this.btnZoomIn = this.c.querySelector("#btn-zoom-in");
        this.btnZoomOut = this.c.querySelector("#btn-zoom-out");
        
        // FORM
        this.qIndexEl = this.c.querySelector("#q-index");
        this.qTextEl = this.c.querySelector("#q-text");
        this.qImgZone = this.c.querySelector("#q-image-container");
        this.input = this.c.querySelector("#hw-text");
        this.fileInput = this.c.querySelector("#hw-file");
        this.fileName = this.c.querySelector("#file-name");
        this.btnSubmit = this.c.querySelector("#hw-submit");
        this.btnQuit = this.c.querySelector("#btn-close-work");

        // MODALE
        this.aiModal = document.getElementById("ai-feedback-modal");
        this.aiContent = document.getElementById("ai-content");
        this.btnModify = document.getElementById("btn-modify");
        this.btnNextQ = document.getElementById("btn-next");
        this.overlay = document.getElementById("ai-overlay");

        // ETAT
        this.currentHw = null; 
        this.currentLevelIndex = 0;
        this.docs = []; 
        this.docIndex = 0;
        
        // ETAT VUE (Position & Zoom)
        this.view = { x: 0, y: 0, scale: 0.8 }; 

        this.initEvents();
        this.initPanZoom(); 
        this.loadHomeworks();
    }

    initEvents() {
        if(this.btnQuit) this.btnQuit.onclick = () => this.showList();
        
        if(this.btnSubmit) {
            this.btnSubmit.onclick = (e) => {
                e.preventDefault(); 
                this.submit();
            };
        }
        
        if(this.btnPrev) this.btnPrev.onclick = () => this.changeDoc(-1);
        if(this.btnNext) this.btnNext.onclick = () => this.changeDoc(1);
        if(this.btnZoomIn) this.btnZoomIn.onclick = () => this.zoom(0.2);
        if(this.btnZoomOut) this.btnZoomOut.onclick = () => this.zoom(-0.2);
        
        if(this.btnModify) this.btnModify.onclick = () => this.closeModal();
        if(this.btnNextQ) this.btnNextQ.onclick = () => { this.closeModal(); this.nextQuestion(); };
        
        if(this.fileInput) {
            this.fileInput.onchange = () => { 
                if(this.fileInput.files.length) this.fileName.textContent = "📸 Image OK"; 
            };
        }
    }

    // --- MOTEUR DE DÉPLACEMENT ---
    initPanZoom() {
        if(!this.viewerContainer) return;

        let isDown = false;
        let startX, startY;

        this.viewerContainer.addEventListener('mousedown', (e) => {
            if(e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            isDown = true;
            this.viewerContainer.style.cursor = 'grabbing';
            // On calcule le point de départ par rapport à la position actuelle
            startX = e.clientX - this.view.x;
            startY = e.clientY - this.view.y;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            this.view.x = e.clientX - startX;
            this.view.y = e.clientY - startY;
            this.updateTransform();
        });

        window.addEventListener('mouseup', () => {
            isDown = false;
            if(this.viewerContainer) this.viewerContainer.style.cursor = 'grab';
        });

        this.viewerContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom(delta);
        });
    }

    zoom(delta) {
        this.view.scale = Math.min(Math.max(0.1, this.view.scale + delta), 5);
        this.updateTransform();
    }

    updateTransform() {
        if(this.panZoomContent) {
            // Le contenu est centré par CSS/JS, le translate le déplace
            this.panZoomContent.style.transform = 
                `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.scale})`;
        }
    }

    resetView() {
        // Reset à 0,0 (Centre)
        this.view = { x: 0, y: 0, scale: 0.8 }; 
        this.updateTransform();
    }

    // --- CHARGEMENT ---
    async loadHomeworks() {
        if(this.listView) this.listView.innerHTML = "<p>Chargement...</p>";
        try {
            const res = await fetch(`/api/homework/${state.currentPlayerData.classroom}`);
            const list = await res.json();
            
            if(this.listView) {
                this.listView.innerHTML = ""; 
                if (list.length === 0) { 
                    this.listView.innerHTML = "<p style='text-align:center;'>Rien à faire.</p>"; 
                    return; 
                }
                list.forEach((hw, i) => {
                    const div = document.createElement("div"); div.className = "hw-list-item";
                    div.innerHTML = `<b>${hw.title}</b><br><small>${new Date(hw.date).toLocaleDateString()}</small>`;
                    div.onclick = () => this.startHomework(hw);
                    this.listView.appendChild(div);
                });
            }
        } catch(e) { if(this.listView) this.listView.innerHTML = "Erreur."; }
    }

    startHomework(hw) {
        this.currentHw = hw;
        this.currentLevelIndex = 0;
        if(this.listView) this.listView.style.display = "none";
        if(this.workView) this.workView.style.display = "flex"; // FLEX IMPORTANT
        this.loadLevel();
    }

    loadLevel() {
        const levels = this.currentHw.levels || [];
        const currentLevel = levels[this.currentLevelIndex];
        
        // Sécurité : Vérifie que les éléments existent avant de les modifier
        if(this.qIndexEl) this.qIndexEl.textContent = `${this.currentLevelIndex + 1}/${levels.length}`;
        if(this.qTextEl) this.qTextEl.textContent = currentLevel.instruction || "Aucune consigne";
        
        if(this.qImgZone) {
            this.qImgZone.innerHTML = "";
            if (currentLevel.questionImage) {
                this.qImgZone.innerHTML = `<img src="${currentLevel.questionImage}" class="question-img" style="max-height:150px; max-width:100%;">`;
            }
        }

        // Documents
        this.docs = (currentLevel.attachmentUrls || []).filter(u => u !== "BREAK");
        this.docIndex = 0;
        this.renderCurrentDoc();

        // Reset
        if(this.input) this.input.value = "";
        if(this.fileInput) this.fileInput.value = "";
        if(this.fileName) this.fileName.textContent = "";
        if(this.submitBtn) this.submitBtn.disabled = false;
    }

    renderCurrentDoc() {
        this.resetView(); 

        // Si aucun document
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

        // Gestion Flèches
        if(this.btnPrev) this.btnPrev.style.display = this.docIndex > 0 ? "flex" : "none";
        if(this.btnNext) this.btnNext.style.display = this.docIndex < this.docs.length - 1 ? "flex" : "none";
    }

    changeDoc(dir) {
        this.docIndex += dir;
        this.renderCurrentDoc();
    }

    async submit() {
        const txt = this.input ? this.input.value : "";
        const file = (this.fileInput && this.fileInput.files) ? this.fileInput.files[0] : null;
        
        if(!txt && !file) return alert("Réponse vide !");
        
        this.submitBtn.disabled = true;
        
        if(this.aiModal) {
            this.aiModal.style.display = "flex";
            if(this.overlay) this.overlay.style.display = "block";
            if(this.modalContent) this.modalContent.innerHTML = "<p style='text-align:center;'>🧠 Analyse...</p>";
            if(this.btnModify) this.btnModify.style.display = "none";
            if(this.btnNextQ) this.btnNextQ.style.display = "none";
        }

        try {
            let imgUrl = null;
            if(file) {
                const fd = new FormData(); fd.append('file', file);
                const r = await fetch('/api/upload', {method:'POST', body:fd});
                const d = await r.json();
                if(d.ok) imgUrl = d.imageUrl;
            }
            
            const lvl = this.currentHw.levels[this.currentLevelIndex];
            const res = await fetch('/api/analyze-homework', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    imageUrl: imgUrl, userText: txt, 
                    homeworkInstruction: lvl.instruction,
                    homeworkContext: lvl.aiPrompt,
                    classroom: state.currentPlayerData.classroom, playerId: state.currentPlayerId, homeworkId: this.currentHw._id 
                })
            });
            const data = await res.json();
            
            if (this.modalContent) this.modalContent.innerHTML = data.feedback;
            if (this.btnModify) this.btnModify.style.display = "inline-block";
            
            if (this.btnNextQ) {
                this.btnNextQ.style.display = "inline-block";
                const isLast = (this.currentLevelIndex >= this.currentHw.levels.length - 1);
                this.btnNextQ.textContent = isLast ? "Terminer 🎉" : "Suivant ➔";
            }

        } catch(e) {
            console.error(e);
            if(this.modalContent) this.modalContent.innerHTML = "Erreur technique.";
            if(this.btnModify) {
                this.btnModify.style.display = "inline-block";
                this.btnModify.textContent = "Fermer";
            }
        }
        if(this.submitBtn) this.submitBtn.disabled = false;
    }

    closeModal() {
        if(this.aiModal) this.aiModal.style.display = "none";
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