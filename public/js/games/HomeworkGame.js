import { state } from '../state.js';
import { uploadFile, verifyWithAI } from '../api.js';

export class HomeworkGame {
    constructor(container, controller) {
        this.c = container; 
        this.controller = controller;

        console.log("📚 [HOMEWORK] Démarrage...");

        // UI Principale
        this.listView = this.c.querySelector("#hw-list"); 
        this.workView = this.c.querySelector("#hw-workspace");
        
        // LISEUSE / TOILE
        this.viewerContainer = this.c.querySelector("#doc-viewer"); 
        this.panZoomContent = this.c.querySelector("#pan-zoom-content");
        this.imgEl = this.c.querySelector("#current-doc-img");
        this.pdfEl = this.c.querySelector("#current-doc-pdf");
        this.noDocMsg = this.c.querySelector("#no-doc-msg");
        this.counterEl = this.c.querySelector("#page-counter");
        
        // Navigation
        this.btnPrev = this.c.querySelector("#btn-prev-doc");
        this.btnNext = this.c.querySelector("#btn-next-doc");
        this.btnZoomIn = this.c.querySelector("#btn-zoom-in");
        this.btnZoomOut = this.c.querySelector("#btn-zoom-out");
        
        // QUESTION / REPONSE
        this.qIndexEl = this.c.querySelector("#q-index");
        this.qTextEl = this.c.querySelector("#q-text");
        this.qImgZone = this.c.querySelector("#q-image-container");
        this.input = this.c.querySelector("#hw-text");
        this.fileInput = this.c.querySelector("#hw-file");
        this.fileNameDisplay = this.c.querySelector("#file-name"); // Correction nom variable
        
        // BOUTONS CRITIQUES
        this.submitBtn = this.c.querySelector("#hw-submit"); // Uniformisé : submitBtn
        this.btnQuit = this.c.querySelector("#btn-close-work"); // Uniformisé : btnQuit

        // MODALE IA
        this.modal = document.getElementById("ai-feedback-modal");
        this.modalContent = document.getElementById("ai-content");
        this.btnModify = document.getElementById("btn-modify");
        this.btnNextQ = document.getElementById("btn-next");
        this.overlay = document.getElementById("ai-overlay");

        // ETAT
        this.currentHw = null; 
        this.currentLevelIndex = 0;
        this.docs = []; 
        this.docIndex = 0;
        this.zoom = 1;
        
        // Etat View (Pan & Zoom)
        this.viewState = { x: 0, y: 0, scale: 1 };

        // Lancement
        this.initEvents();
        this.initPanZoom(); 
        this.loadHomeworks();
    }

    initEvents() {
        if (this.btnQuit) this.btnQuit.onclick = () => this.showList();
        
        // CORRECTION MAJEURE ICI : On utilise bien this.submitBtn
        if (this.submitBtn) {
            this.submitBtn.onclick = (e) => {
                e.preventDefault(); 
                this.submit();
            };
        } else {
            console.error("❌ Bouton #hw-submit introuvable dans le template !");
        }
        
        if (this.btnPrev) this.btnPrev.onclick = () => this.changeDoc(-1);
        if (this.btnNext) this.btnNext.onclick = () => this.changeDoc(1);
        
        if (this.btnZoomIn) this.btnZoomIn.onclick = () => this.applyZoom(0.2);
        if (this.btnZoomOut) this.btnZoomOut.onclick = () => this.applyZoom(-0.2);
        
        if (this.btnModify) this.btnModify.onclick = () => this.closeModal();
        if (this.btnNextQ) this.btnNextQ.onclick = () => { this.closeModal(); this.nextQuestion(); };
        
        if (this.fileInput) {
            this.fileInput.onchange = () => { 
                if (this.fileInput.files.length && this.fileNameDisplay) {
                    this.fileNameDisplay.textContent = "📸 " + this.fileInput.files[0].name; 
                }
            };
        }
    }

    // --- MOTEUR PAN & ZOOM (Sur #pan-zoom-content) ---
    initPanZoom() {
        if(!this.viewerContainer) return;

        let isDown = false;
        let startX, startY;

        this.viewerContainer.addEventListener('mousedown', (e) => {
            if(e.target.tagName === 'BUTTON' || e.target.closest('.doc-controls')) return;
            e.preventDefault();
            isDown = true;
            this.viewerContainer.style.cursor = 'grabbing';
            startX = e.clientX - this.viewState.x;
            startY = e.clientY - this.viewState.y;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            this.viewState.x = e.clientX - startX;
            this.viewState.y = e.clientY - startY;
            this.updateTransform();
        });

        window.addEventListener('mouseup', () => {
            isDown = false;
            this.viewerContainer.style.cursor = 'grab';
        });

        this.viewerContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.applyZoom(delta);
        });
    }

    applyZoom(delta) {
        this.zoom = Math.min(Math.max(0.2, this.zoom + delta), 5);
        this.updateTransform();
    }

    updateTransform() {
        if(this.panZoomContent) {
            // Centre (-50%, -50%) + Déplacement (x, y) + Zoom
            this.panZoomContent.style.transform = `translate(calc(-50% + ${this.viewState.x}px), calc(-50% + ${this.viewState.y}px)) scale(${this.zoom})`;
        }
    }

    resetView() {
        this.viewState = { x: 0, y: 0 };
        this.zoom = 1.0; 
        this.updateTransform();
    }

    // --- CHARGEMENT ---
    async loadHomeworks() {
      if(this.listView) this.listView.innerHTML = "<p style='padding:20px'>Chargement...</p>";
      try {
          if (!state.currentPlayerData) return;
          const res = await fetch(`/api/homework/${state.currentPlayerData.classroom}`); 
          const list = await res.json();
          
          if(this.listView) {
              this.listView.innerHTML = ""; 
              if (list.length === 0) { 
                  this.listView.innerHTML = "<p style='text-align:center; padding:20px;'>Aucun devoir à faire.</p>"; 
                  return; 
              }
              
              list.forEach((hw, i) => {
                  const div = document.createElement("div"); div.className = "hw-list-item";
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
      
      if(this.qIndexEl) this.qIndexEl.textContent = `${this.currentLevelIndex + 1}/${levels.length}`;
      if(this.qTextEl) this.qTextEl.textContent = currentLevel.instruction || "Aucune consigne";
      
      // Image Question
      if(this.qImgZone) {
          this.qImgZone.innerHTML = "";
          if (currentLevel.questionImage) {
              this.qImgZone.innerHTML = `<img src="${currentLevel.questionImage}" style="max-width:100%; max-height:150px; margin-top:10px; border:1px solid #ccc;">`;
          }
      }

      // Documents (Liseuse)
      this.docs = (currentLevel.attachmentUrls || []).filter(u => u !== "BREAK");
      this.docIndex = 0;
      this.renderCurrentDoc();

      // Reset Form
      if(this.input) this.input.value = "";
      if(this.fileInput) this.fileInput.value = "";
      if(this.fileNameDisplay) this.fileNameDisplay.textContent = "";
      if(this.submitBtn) {
          this.submitBtn.style.display = "block";
          this.submitBtn.disabled = false; // Reset état
      }
    }

    renderCurrentDoc() {
        this.resetView(); 

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

    async submit() {
        const txt = this.input ? this.input.value : "";
        const file = (this.fileInput && this.fileInput.files) ? this.fileInput.files[0] : null;
        
        if(!txt && !file) return alert("Réponse vide !");
        
        // CORRECTION CRITIQUE : Vérifie que le bouton existe avant de le désactiver
        if(this.submitBtn) this.submitBtn.disabled = true;
        
        if(this.modal) {
            this.modal.style.display = "flex";
            if(this.overlay) this.overlay.style.display = "block";
            this.modalContent.innerHTML = "<p style='text-align:center;'>🧠 Analyse en cours...</p>";
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
                    homeworkContext: this.currentHw.levels[this.currentLevelIndex].aiPrompt,
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
            // On cache le bouton "Envoyer" une fois l'analyse faite
            if(this.submitBtn) this.submitBtn.style.display = "none";

        } catch(e) {
            console.error(e);
            if(this.modalContent) this.modalContent.innerHTML = "Erreur technique.";
            if(this.btnModify) {
                this.btnModify.style.display = "inline-block";
                this.btnModify.textContent = "Fermer";
            }
            // En cas d'erreur, on réactive le bouton
            if(this.submitBtn) this.submitBtn.disabled = false;
        }
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