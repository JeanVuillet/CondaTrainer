import { state } from '../state.js';
import { uploadFile, verifyWithAI } from '../api.js';

export class HomeworkGame {
    constructor(container, controller) {
        this.c = container; 
        this.controller = controller;

        // Elements
        this.listView = this.c.querySelector("#hw-list"); 
        this.workView = this.c.querySelector("#hw-workspace");
        
        // ZONES
        this.zoneTop = this.c.querySelector("#zone-top");
        this.canvasTop = this.c.querySelector("#canvas-top");
        this.zoneBottom = this.c.querySelector("#zone-bottom");
        this.canvasBottom = this.c.querySelector("#canvas-bottom");
        this.noDocMsg = this.c.querySelector("#no-doc-msg");
        
        // Panel
        this.panel = this.c.querySelector("#floating-panel"); 
        this.header = this.c.querySelector("#panel-header"); 
        this.closeBtn = this.c.querySelector("#btn-close-work"); 
        this.stepIndicator = this.c.querySelector("#question-step");
        this.titleEl = this.c.querySelector("#panel-title"); 
        this.descEl = this.c.querySelector("#panel-desc"); 
        this.textInput = this.c.querySelector("#hw-text"); 
        this.fileInput = this.c.querySelector("#hw-file"); 
        this.fileNameDisplay = this.c.querySelector("#file-name"); 
        this.submitBtn = this.c.querySelector("#hw-submit"); 
        this.nextBtn = this.c.querySelector("#hw-next"); 
        
        // Modale IA
        this.aiModal = document.getElementById("aiFeedbackModal");
        this.aiModalContent = document.getElementById("aiModalContent");
        this.aiModalBtn = document.getElementById("aiModalCloseBtn");

        // Boutons Zoom
        this.btnZoomIn = this.c.querySelector("#btn-zoom-in");
        this.btnZoomOut = this.c.querySelector("#btn-zoom-out");

        // ETAT (Pan/Zoom) - Centré par défaut
        this.views = {
            top: { x: 0, y: 0, scale: 0.6 },
            bottom: { x: 0, y: 0, scale: 1 } // Pas de zoom sur la question en bas par défaut
        };

        this.currentHw = null; 
        this.currentLevelIndex = 0;
        
        this.initEvents(); 
        this.initPanelDrag(); 
        this.initPanelResize();
        
        // Moteur Toile Infinie (Seulement en haut)
        this.initCanvasControls(this.zoneTop, 'top');
        this.initZoomControls();
        
        this.loadHomeworks();
    }

    initEvents() {
        this.closeBtn.onclick = () => this.showList();
        this.submitBtn.onclick = () => this.submit(); 
        this.nextBtn.onclick = () => this.nextQuestion();
        this.fileInput.onchange = () => { 
            if(this.fileInput.files.length) this.fileNameDisplay.textContent = "📸 " + this.fileInput.files[0].name; 
        };
    }

    // --- MOTEUR PAN & ZOOM ---
    initCanvasControls(zone, key) {
        let isDown = false;
        let startX, startY;

        zone.addEventListener('mousedown', (e) => {
            if(e.target.closest('#floating-panel') || e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            isDown = true;
            zone.style.cursor = 'grabbing';
            startX = e.clientX - this.views[key].x;
            startY = e.clientY - this.views[key].y;
        });

        const stop = () => { isDown = false; zone.style.cursor = 'grab'; };
        zone.addEventListener('mouseleave', stop);
        zone.addEventListener('mouseup', stop);

        zone.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            this.views[key].x = e.clientX - startX;
            this.views[key].y = e.clientY - startY;
            this.updateTransform(key);
        });
    }

    initZoomControls() {
        if(this.btnZoomIn) this.btnZoomIn.onclick = () => this.zoomAll(0.2);
        if(this.btnZoomOut) this.btnZoomOut.onclick = () => this.zoomAll(-0.2);
        
        this.zoneTop.addEventListener('wheel', (e) => {
            if (e.target.closest('#floating-panel')) return;
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoomSingle('top', delta);
        });
    }

    zoomAll(delta) { this.zoomSingle('top', delta); }

    zoomSingle(key, delta) {
        const v = this.views[key];
        v.scale = Math.min(Math.max(0.1, v.scale + delta), 4);
        this.updateTransform(key);
    }

    updateTransform(key) {
        const v = this.views[key];
        const canvas = key === 'top' ? this.canvasTop : this.canvasBottom;
        if(canvas) {
            // Centrage + Pan + Zoom
            canvas.style.transform = `translate(calc(-50% + ${v.x}px), calc(-50% + ${v.y}px)) scale(${v.scale})`;
        }
    }

    resetViews() {
        this.views.top = { x: 0, y: 0, scale: 0.6 };
        this.updateTransform('top');
    }

    // --- LOGIQUE ---
    async loadHomeworks() {
      this.listView.innerHTML = "<p style='padding:20px'>Chargement...</p>";
      try {
          const res = await fetch(`/api/homework/${state.currentPlayerData.classroom}`); 
          const list = await res.json();
          this.listView.innerHTML = ""; 
          if (list.length === 0) { this.listView.innerHTML = "<p style='text-align:center'>Aucun devoir.</p>"; return; }
          list.forEach((hw, i) => {
              const div = document.createElement("div"); div.className = "hw-list-item";
              div.innerHTML = `<b>${hw.title}</b><br><small>${new Date(hw.date).toLocaleDateString()}</small>`;
              div.onclick = () => this.startHomework(hw);
              this.listView.appendChild(div);
          });
      } catch(e) { this.listView.innerHTML = "Erreur."; }
    }
    
    startHomework(hw) { 
        this.currentHw = hw; 
        this.currentLevelIndex = 0; 
        this.listView.style.display = "none"; 
        this.workView.style.display = "block"; 
        this.loadLevel(); 
    }
    
    loadLevel() {
      const levels = this.currentHw.levels || [];
      const currentLevel = levels[this.currentLevelIndex];
      this.titleEl.textContent = this.currentHw.title;
      this.stepIndicator.textContent = `${this.currentLevelIndex + 1}/${levels.length}`;
      this.textInput.value = ""; this.fileInput.value = ""; this.fileNameDisplay.textContent = "";
      this.submitBtn.style.display = "block"; this.nextBtn.style.display = "none";
      this.resultEl.style.display = "none";

      this.canvasTop.innerHTML = ""; this.canvasBottom.innerHTML = "";
      this.noDocMsg.style.display = (currentLevel.attachmentUrls.length > 0) ? "none" : "block";

      // 1. ZONE HAUTE (DOCUMENTS)
      currentLevel.attachmentUrls.forEach(u => {
          let el = document.createElement("img");
          el.src = u; 
          el.className = "doc-item-student";
          this.canvasTop.appendChild(el);
      });

      // 2. ZONE BASSE (QUESTION PROF)
      // On affiche le texte de la question en superposition ou dans la zone
      this.descEl.innerHTML = `<strong>Question :</strong> ${currentLevel.instruction}`;
      
      // On ajoute l'image de la question si elle existe
      if (currentLevel.questionImage) {
          const imgQ = document.createElement("img");
          imgQ.src = currentLevel.questionImage;
          imgQ.className = "doc-item-question"; // Style spécifique plus petit
          // On la met dans le canvas du bas, centré
          this.canvasBottom.appendChild(imgQ);
          this.zoneBottom.style.display = "flex";
      } else {
          // Si pas d'image, on peut masquer la zone du bas ou afficher le texte en gros
          this.zoneBottom.style.display = "flex";
          const textQ = document.createElement("div");
          textQ.className = "question-text-overlay"; // Style bulle blanche
          textQ.textContent = currentLevel.instruction;
          this.canvasBottom.appendChild(textQ);
      }
      
      this.resetViews();
    }
    
    // --- (Le reste : Drag Panel, Submit... identique) ---
    // Je remets Submit pour être sûr
    async submit() {
        const file = this.fileInput.files[0]; const text = this.textInput.value;
        if (!file && !text) return alert("Réponse vide !");
        this.submitBtn.disabled = true; 
        
        if(this.aiModal) { this.aiModal.style.display = "flex"; this.aiModalContent.innerHTML = "<p style='text-align:center;'>🧠 Analyse...</p>"; if(this.aiModalBtn) this.aiModalBtn.style.display = "none"; }

        try {
            let imageUrl = null;
            if (file) {
                const fd = new FormData(); fd.append('file', file);
                const r = await fetch('/api/upload', { method: 'POST', body: fd });
                const d = await r.json();
                if(d.ok) imageUrl = d.imageUrl;
            }
            
            const res = await fetch('/api/analyze-homework', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    imageUrl, userText: text, 
                    homeworkInstruction: this.currentHw.levels[this.currentLevelIndex].instruction, 
                    // On envoie le Prompt IA en plus
                    homeworkContext: this.currentHw.levels[this.currentLevelIndex].aiPrompt,
                    teacherDocUrls: this.currentHw.levels[this.currentLevelIndex].attachmentUrls, 
                    classroom: state.currentPlayerData.classroom, playerId: state.currentPlayerId, homeworkId: this.currentHw._id 
                })
            });
            const data = await res.json();
            
            if (this.aiModalContent) this.aiModalContent.innerHTML = data.feedback;
            if (this.aiModalBtn) {
                this.aiModalBtn.style.display = "inline-block";
                this.aiModalBtn.textContent = (this.currentLevelIndex < this.currentHw.levels.length - 1) ? "Suivant ➔" : "Terminer 🎉";
                this.aiModalBtn.onclick = () => { this.aiModal.style.display = "none"; this.nextQuestion(); };
            }
            this.submitBtn.style.display = "none"; this.nextBtn.style.display = "block";
        } catch (e) { 
             if(this.aiModalContent) this.aiModalContent.innerHTML = "Erreur.";
             if (this.aiModalBtn) { this.aiModalBtn.style.display="block"; this.aiModalBtn.textContent="Fermer"; this.aiModalBtn.onclick=()=>this.aiModal.style.display="none"; }
        }
        this.submitBtn.disabled = false;
    }

    nextQuestion() {
        if (this.currentLevelIndex < this.currentHw.levels.length - 1) { this.currentLevelIndex++; this.loadLevel(); } 
        else { alert("Terminé !"); this.showList(); }
    }
    
    // Inits Panel (copiés-collés du message précédent)
    initPanelDrag() {
        this.header.addEventListener('mousedown', (e) => { this.isDraggingPanel = true; this.dragOffsetX = e.clientX - this.panel.offsetLeft; this.dragOffsetY = e.clientY - this.panel.offsetTop; });
        window.addEventListener('mousemove', (e) => { if (!this.isDraggingPanel) return; this.panel.style.left = `${e.clientX - this.dragOffsetX}px`; this.panel.style.top = `${e.clientY - this.dragOffsetY}px`; });
        window.addEventListener('mouseup', () => { this.isDraggingPanel = false; });
    }
    initPanelResize() {
        const resizers = this.c.querySelectorAll('.resizer'); let currentResizer = null;
        let oW, oH, oX, oY, oMX;
        resizers.forEach(r => {
            r.addEventListener('mousedown', (e) => { 
                e.preventDefault(); e.stopPropagation(); currentResizer = r;
                oW = parseFloat(getComputedStyle(this.panel).width); oH = parseFloat(getComputedStyle(this.panel).height);
                oMX = e.pageX; 
                window.addEventListener('mousemove', resize); window.addEventListener('mouseup', stopResize);
            });
        });
        const resize = (e) => {
            if (!currentResizer) return;
            const w = oW + (e.pageX - oMX);
            if (w > 200) this.panel.style.width = w + 'px';
        };
        const stopResize = () => { window.removeEventListener('mousemove', resize); window.removeEventListener('mouseup', stopResize); };
    }
}