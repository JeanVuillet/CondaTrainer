import { state } from '../state.js';
import { uploadFile, verifyWithAI } from '../api.js';

export class HomeworkGame {
    constructor(container, controller) {
        this.container = container; 
        this.controller = controller;

        // Elements
        this.listView = container.querySelector("#hw-list"); 
        this.workView = container.querySelector("#hw-workspace");
        this.zoneTop = container.querySelector("#zone-top");
        this.zoneBottom = container.querySelector("#zone-bottom");
        this.noDocMsg = container.querySelector("#no-doc-msg");
        
        // Panel Flottant
        this.panel = container.querySelector("#floating-panel"); 
        this.header = container.querySelector("#panel-header"); 
        this.closeBtn = container.querySelector("#btn-close-work"); 
        this.stepIndicator = container.querySelector("#question-step");
        this.titleEl = container.querySelector("#panel-title"); 
        this.descEl = container.querySelector("#panel-desc"); 
        this.textInput = container.querySelector("#hw-text"); 
        this.fileInput = container.querySelector("#hw-file"); 
        this.fileNameDisplay = container.querySelector("#file-name"); 
        this.submitBtn = container.querySelector("#hw-submit"); 
        this.nextBtn = container.querySelector("#hw-next"); 
        this.loadingEl = container.querySelector("#hw-loading"); 
        this.resultEl = container.querySelector("#hw-result");

        this.currentHw = null; 
        this.currentLevelIndex = 0;
        
        // Init
        this.initEvents(); 
        this.initPanelDrag(); 
        this.initPanelResize();
    }

    initEvents() {
        this.closeBtn.onclick = () => this.showList();
        this.submitBtn.onclick = () => this.submit(); 
        this.nextBtn.onclick = () => this.nextQuestion();
        this.fileInput.onchange = () => { 
            if(this.fileInput.files.length) this.fileNameDisplay.textContent = "📸 " + this.fileInput.files[0].name; 
        };
    }

    // Gestion du Drag de la fenêtre blanche
    initPanelDrag() {
        this.header.addEventListener('mousedown', (e) => { 
            this.isDraggingPanel = true; 
            this.dragOffsetX = e.clientX - this.panel.offsetLeft; 
            this.dragOffsetY = e.clientY - this.panel.offsetTop; 
            this.panel.style.opacity = "0.9"; 
        });
        window.addEventListener('mousemove', (e) => { 
            if (!this.isDraggingPanel) return; 
            this.panel.style.left = `${e.clientX - this.dragOffsetX}px`; 
            this.panel.style.top = `${e.clientY - this.dragOffsetY}px`; 
        });
        window.addEventListener('mouseup', () => { 
            this.isDraggingPanel = false; 
            this.panel.style.opacity = "1"; 
        });
    }

    // Gestion du Redimensionnement de la fenêtre blanche
    initPanelResize() {
        const resizers = this.container.querySelectorAll('.resizer'); 
        let currentResizer = null;
        
        resizers.forEach(r => {
            r.addEventListener('mousedown', (e) => { 
                e.preventDefault(); e.stopPropagation(); currentResizer = r;
                this.original_width = parseFloat(getComputedStyle(this.panel, null).getPropertyValue('width').replace('px', ''));
                this.original_height = parseFloat(getComputedStyle(this.panel, null).getPropertyValue('height').replace('px', ''));
                this.original_x = this.panel.getBoundingClientRect().left; 
                this.original_y = this.panel.getBoundingClientRect().top;
                this.original_mouse_x = e.pageX; 
                this.original_mouse_y = e.pageY;
                
                const parentRect = this.workView.getBoundingClientRect(); 
                this.parent_offset_x = parentRect.left; 
                this.parent_offset_y = parentRect.top;
                
                window.addEventListener('mousemove', resize); 
                window.addEventListener('mouseup', stopResize);
            });
        });

        const resize = (e) => {
            const cls = currentResizer.className; 
            let width = this.original_width; 
            let height = this.original_height; 
            let top = this.original_y - this.parent_offset_y; 
            let left = this.original_x - this.parent_offset_x;
            
            if (cls.includes('e')) width = this.original_width + (e.pageX - this.original_mouse_x);
            if (cls.includes('s')) height = this.original_height + (e.pageY - this.original_mouse_y);
            if (cls.includes('w')) { 
                width = this.original_width - (e.pageX - this.original_mouse_x); 
                left = (this.original_x - this.parent_offset_x) + (e.pageX - this.original_mouse_x); 
            }
            if (cls.includes('n')) { 
                height = this.original_height - (e.pageY - this.original_mouse_y); 
                top = (this.original_y - this.parent_offset_y) + (e.pageY - this.original_mouse_y); 
            }
            if (width > 200) { this.panel.style.width = width + 'px'; this.panel.style.left = left + 'px'; }
            if (height > 200) { this.panel.style.height = height + 'px'; this.panel.style.top = top + 'px'; }
        };
        
        const stopResize = () => { 
            window.removeEventListener('mousemove', resize); 
            window.removeEventListener('mouseup', stopResize); 
        };
    }

    async loadHomeworks() {
      this.listView.innerHTML = "Chargement..."; this.showList();
      try {
          const res = await fetch(`/api/homework/${state.currentPlayerData.classroom}`); 
          const list = await res.json();
          this.listView.innerHTML = ""; 
          if (list.length === 0) { this.listView.innerHTML = "<p style='text-align:center'>Aucun devoir à faire.</p>"; return; }
          list.forEach(hw => {
              const div = document.createElement("div"); div.className = "hw-list-item";
              const qCount = hw.levels ? hw.levels.length : 1;
              div.innerHTML = `<strong>${hw.title}</strong> (${qCount} Q)<br><small>${new Date(hw.date).toLocaleDateString()}</small>`;
              div.onclick = () => this.startHomework(hw);
              this.listView.appendChild(div);
          });
      } catch(e) { this.listView.innerHTML = "Erreur chargement."; }
    }
    
    startHomework(hw) { 
        this.currentHw = hw; 
        this.currentLevelIndex = 0; 
        this.listView.style.display = "none"; 
        this.workView.style.display = "block"; 
        this.loadLevel(); 
    }
    
    loadLevel() {
      const levels = this.currentHw.levels || [{ instruction: this.currentHw.description, attachmentUrls: this.currentHw.attachmentUrl ? [this.currentHw.attachmentUrl] : [] }];
      const currentLevel = levels[this.currentLevelIndex];
      
      this.titleEl.textContent = this.currentHw.title;
      this.descEl.textContent = currentLevel.instruction;
      this.stepIndicator.textContent = `${this.currentLevelIndex + 1}/${levels.length}`;
      this.textInput.value = ""; this.fileInput.value = ""; this.fileNameDisplay.textContent = ""; this.resultEl.style.display = "none";
      this.submitBtn.style.display = "block"; this.nextBtn.style.display = "none";

      this.zoneTop.innerHTML = "";
      this.zoneBottom.innerHTML = "";
      
      const urls = currentLevel.attachmentUrls || [];
      this.noDocMsg.style.display = (urls.length > 0) ? "none" : "block";

      const breakIndex = urls.indexOf("BREAK");
      const hasBottomContent = (breakIndex !== -1 && breakIndex < urls.length - 1);

      if (hasBottomContent) {
          this.zoneBottom.style.display = "flex";
          this.zoneTop.style.flex = "3"; 
          this.zoneTop.style.borderBottom = "4px solid #f59e0b"; 
      } else {
          this.zoneBottom.style.display = "none";
          this.zoneTop.style.flex = "1"; 
          this.zoneTop.style.borderBottom = "none";
      }

      let currentZone = this.zoneTop;
      urls.forEach(url => {
          if (url === "BREAK") { currentZone = this.zoneBottom; return; }
          if(!url) return;
          
          let el;
          if (url.endsWith(".pdf")) {
              el = document.createElement("iframe"); el.src = url; el.className = "doc-item-student";
              el.style.width="500px"; 
          } else {
              el = document.createElement("img"); el.src = url; el.className = "doc-item-student";
          }
          currentZone.appendChild(el);
      });
    }
    
    showList() { this.workView.style.display = "none"; this.listView.style.display = "block"; }
    
    async submit() {
        const file = this.fileInput.files[0]; const text = this.textInput.value;
        if (!file && !text) return alert("Remplis au moins le texte ou ajoute une image !");
        
        this.submitBtn.disabled = true; 
        this.loadingEl.style.display = "block"; 
        this.resultEl.style.display = "none";
        
        try {
            let imageUrl = null;
            if (file) {
                // Utilisation de la nouvelle fonction API
                const res = await uploadFile(file);
                if (res.ok) imageUrl = res.imageUrl; else throw new Error("Erreur upload image");
            }
            
            const levels = this.currentHw.levels || [{ instruction: this.currentHw.description, attachmentUrls: [this.currentHw.attachmentUrl] }];
            const currentLevel = levels[this.currentLevelIndex];

            // Utilisation de l'API centralisée (nouvelle architecture)
            const res = await fetch('/api/analyze-homework', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    imageUrl, 
                    userText: text, 
                    homeworkInstruction: currentLevel.instruction, 
                    teacherDocUrls: currentLevel.attachmentUrls, 
                    classroom: state.currentPlayerData.classroom,
                    playerId: state.currentPlayerId,
                    homeworkId: this.currentHw._id 
                })
            });
            const data = await res.json();
            
            this.resultEl.innerHTML = data.feedback;
            this.resultEl.style.display = "block";
            this.submitBtn.style.display = "none"; this.nextBtn.style.display = "block";
            
            if (this.currentLevelIndex >= levels.length - 1) { 
                this.nextBtn.textContent = "Terminer le devoir 🎉"; this.nextBtn.style.backgroundColor = "#eab308"; 
            } else { 
                this.nextBtn.textContent = "Question Suivante ➔"; this.nextBtn.style.backgroundColor = "#16a34a"; 
            }
        } catch (e) { alert("Erreur : " + e.message); }
        
        this.submitBtn.disabled = false; this.loadingEl.style.display = "none";
    }
    
    nextQuestion() {
        const levels = this.currentHw.levels || [{}];
        if (this.currentLevelIndex < levels.length - 1) { 
            this.currentLevelIndex++; this.loadLevel(); 
        } else { 
            alert("Devoir terminé ! Bravo !"); this.showList(); 
        }
    }
  }