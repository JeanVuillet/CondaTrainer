import { state } from '../state.js';
import { uploadFile, verifyWithAI } from '../api.js';

export class HomeworkGame {
    constructor(container, controller) {
        this.c = container; 
        this.controller = controller;

        console.log("📚 HomeworkGame V-FIX + Dual Zoom Loaded");

        // --- UI LISEUSE (HAUT) ---
        this.listView = this.c.querySelector("#hw-list"); 
        this.workView = this.c.querySelector("#hw-workspace");
        this.viewerContainer = this.c.querySelector("#doc-viewer"); 
        this.panZoomContent = this.c.querySelector("#pan-zoom-content");
        this.imgEl = this.c.querySelector("#current-doc-img");
        this.pdfEl = this.c.querySelector("#current-doc-pdf");
        this.noDocMsg = this.c.querySelector("#no-doc-msg");
        this.counterEl = this.c.querySelector("#page-counter");
        this.btnPrev = this.c.querySelector("#btn-prev-doc");
        this.btnNext = this.c.querySelector("#btn-next-doc");
        this.btnZoomIn = this.c.querySelector("#btn-zoom-in");
        this.btnZoomOut = this.c.querySelector("#btn-zoom-out");
        
        // --- UI QUESTION (BAS) ---
        this.qIndexEl = this.c.querySelector("#q-index");
        this.qTextEl = this.c.querySelector("#q-text");
        this.qImgZone = this.c.querySelector("#q-image-container"); // Le conteneur (doc-viewer-container)
        this.qPanZoomContent = this.c.querySelector("#pan-zoom-question-content"); // La cible
        this.btnZoomInQ = this.c.querySelector("#btn-zoom-in-q");
        this.btnZoomOutQ = this.c.querySelector("#btn-zoom-out-q");

        // --- FORM & MODALE ---
        this.input = this.c.querySelector("#hw-text");
        this.fileInput = this.c.querySelector("#hw-file");
        this.fileName = this.c.querySelector("#file-name");
        this.btnSubmit = this.c.querySelector("#hw-submit");
        this.btnQuit = this.c.querySelector("#btn-close-work");
        this.aiModal = document.getElementById("ai-feedback-modal");
        this.aiContent = document.getElementById("ai-content");
        this.btnModify = document.getElementById("btn-modify");
        this.btnNextQ = document.getElementById("btn-next");
        this.overlay = document.getElementById("ai-overlay");

        // --- ETATS ---
        this.currentHw = null; 
        this.currentLevelIndex = 0;
        this.docs = []; 
        this.docIndex = 0;
        
        // Position & Zoom Liseuse (Haut)
        this.view = { x: 0, y: 0, scale: 1.3 }; 
        // Position & Zoom Question (Bas)
        this.viewQ = { x: 0, y: 0, scale: 1.0 }; 

        this.initEvents();
        this.setupPanZoom(this.viewerContainer, 'doc'); // Setup Haut
        this.setupPanZoom(this.qImgZone, 'q');         // Setup Bas
        this.loadHomeworks();
    }

    initEvents() {
        if(this.btnQuit) this.btnQuit.onclick = () => this.showList();
        if(this.btnSubmit) this.btnSubmit.onclick = (e) => { e.preventDefault(); this.submit(); };
        
        // Nav Liseuse
        if(this.btnPrev) this.btnPrev.onclick = () => this.changeDoc(-1);
        if(this.btnNext) this.btnNext.onclick = () => this.changeDoc(1);
        if(this.btnZoomIn) this.btnZoomIn.onclick = () => this.zoom(0.2, 'doc');
        if(this.btnZoomOut) this.btnZoomOut.onclick = () => this.zoom(-0.2, 'doc');
        
        // Zoom Question
        if(this.btnZoomInQ) this.btnZoomInQ.onclick = () => this.zoom(0.2, 'q');
        if(this.btnZoomOutQ) this.btnZoomOutQ.onclick = () => this.zoom(-0.2, 'q');

        if(this.btnModify) this.btnModify.onclick = () => this.closeModal();
        if(this.btnNextQ) this.btnNextQ.onclick = () => { this.closeModal(); this.nextQuestion(); };
        
        if(this.fileInput) {
            this.fileInput.onchange = () => { 
                if(this.fileInput.files.length) this.fileName.textContent = "📸 Photo OK"; 
            };
        }
    }

    // --- MOTEUR PAN & ZOOM GÉNÉRIQUE ---
    setupPanZoom(container, type) {
        if(!container) return;
        let isDown = false;
        let startX, startY;

        container.addEventListener('mousedown', (e) => {
            if(e.target.tagName === 'BUTTON') return;
            isDown = true;
            container.style.cursor = 'grabbing';
            const v = (type === 'doc') ? this.view : this.viewQ;
            startX = e.clientX - v.x;
            startY = e.clientY - v.y;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            const v = (type === 'doc') ? this.view : this.viewQ;
            v.x = e.clientX - startX;
            v.y = e.clientY - startY;
            this.updateTransform(type);
        });

        window.addEventListener('mouseup', () => {
            isDown = false;
            container.style.cursor = 'grab';
        });

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom(delta, type);
        });
    }

    zoom(delta, type) {
        const v = (type === 'doc') ? this.view : this.viewQ;
        v.scale = Math.min(Math.max(0.1, v.scale + delta), 5);
        this.updateTransform(type);
    }

updateTransform(type) {
    if(type === 'doc' && this.panZoomContent) {
        this.panZoomContent.style.transform = `translate(-50%, -50%) translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.scale})`;
    } else if(type === 'q' && this.qPanZoomContent) {
        this.qPanZoomContent.style.transform = `translate(-50%, -50%) translate(${this.viewQ.x}px, ${this.viewQ.y}px) scale(${this.viewQ.scale})`;
    }
}

resetView(type) {
        if(type === 'doc') { 
            this.view = { x: 0, y: 0, scale: 1.3 }; 
            this.updateTransform('doc'); 
        } else { 
            // Pour la question, on commence à scale 1, loadLevel l'ajustera après l'onload
            this.viewQ = { x: 0, y: 0, scale: 1.0 }; 
            this.updateTransform('q'); 
        }
    }

    // --- LOGIQUE DE JEU ---
    async loadHomeworks() {
        if(this.listView) this.listView.innerHTML = "<p>Chargement des devoirs...</p>";
        try {
            const res = await fetch(`/api/homework/${state.currentPlayerData.classroom}`);
            const list = await res.json();
            if(this.listView) {
                this.listView.innerHTML = ""; 
                if (list.length === 0) { this.listView.innerHTML = "<p>Aucun devoir pour ta classe.</p>"; return; }
                list.forEach((hw) => {
                    const div = document.createElement("div"); div.className = "hw-list-item";
                    div.innerHTML = `<b>${hw.title}</b><br><small>${new Date(hw.date).toLocaleDateString()}</small>`;
                    div.onclick = () => this.startHomework(hw);
                    this.listView.appendChild(div);
                });
            }
        } catch(e) { console.error(e); }
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
    
    // --- 1. LOGIQUE DU TEXTE (CONSIGNE) ---
    if(this.qTextEl) {
        if (currentLevel.instruction && currentLevel.instruction.trim() !== "") {
            this.qTextEl.textContent = currentLevel.instruction;
            this.qTextEl.style.display = "block";
            // On lui donne un peu plus de style si c'est le seul élément
            this.qTextEl.style.padding = "15px";
            this.qTextEl.style.fontSize = "1.1em";
        } else {
            this.qTextEl.style.display = "none";
        }
    }
    
    // --- 2. LOGIQUE DE L'IMAGE (CADRE NOIR) ---
    if(this.qImgZone && this.qPanZoomContent) {
        this.qPanZoomContent.innerHTML = "";
        
        if (currentLevel.questionImage) {
            // IMAGE PRÉSENTE : On affiche le cadre
            this.qImgZone.style.display = "block";
            
            const img = document.createElement('img');
            img.src = currentLevel.questionImage;
            img.style.display = "block";
            img.style.webkitUserDrag = "none";

            img.onload = () => {
                const containerW = this.qImgZone.offsetWidth;
                const containerH = this.qImgZone.offsetHeight;
                const imgW = img.naturalWidth;
                const imgH = img.naturalHeight;

                // Zoom largeur 100%
                const scale = containerW / imgW;
                this.viewQ.scale = scale;

                // Calcul pour coller EN HAUT
                const scaledImgHeight = imgH * scale;
                this.viewQ.x = 0;
                this.viewQ.y = (scaledImgHeight - containerH) / 2;

                this.updateTransform('q');
            };
            this.qPanZoomContent.appendChild(img);
        } else {
            // IMAGE ABSENTE : On cache le cadre noir totalement
            this.qImgZone.style.display = "none";
        }
    }

    // --- 3. DOCUMENTS LISEUSE (HAUT) ---
    this.docs = (currentLevel.attachmentUrls || []).filter(u => u !== "BREAK");
    this.docIndex = 0;
    this.renderCurrentDoc();

    // --- 4. RESET FORMULAIRE ---
    if(this.input) this.input.value = "";
    if(this.fileInput) this.fileInput.value = "";
    if(this.fileName) this.fileName.textContent = "";
    if(this.btnSubmit) this.btnSubmit.disabled = false;
}

    renderCurrentDoc() {
        this.resetView('doc'); 
        if (this.docs.length === 0) {
            if(this.imgEl) this.imgEl.style.display = "none";
            if(this.pdfEl) this.pdfEl.style.display = "none";
            if(this.noDocMsg) this.noDocMsg.style.display = "block";
            return;
        }
        if(this.noDocMsg) this.noDocMsg.style.display = "none";
        const url = this.docs[this.docIndex];
        const isPdf = url.toLowerCase().endsWith('.pdf');
        if (isPdf) {
            if(this.imgEl) this.imgEl.style.display = "none";
            if(this.pdfEl) { this.pdfEl.style.display = "block"; this.pdfEl.src = url; }
        } else {
            if(this.pdfEl) this.pdfEl.style.display = "none";
            if(this.imgEl) { this.imgEl.style.display = "block"; this.imgEl.src = url; }
        }
        if(this.counterEl) this.counterEl.textContent = `${this.docIndex + 1} / ${this.docs.length}`;
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
        
        if(this.btnSubmit) this.btnSubmit.disabled = true;
        if(this.aiModal) {
            this.aiModal.style.display = "flex";
            if(this.overlay) this.overlay.style.display = "block";
            if(this.aiContent) this.aiContent.innerHTML = "<p style='text-align:center;'>🧠 L'IA analyse tous tes documents...</p>";
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
                    imageUrl: imgUrl, 
                    userText: txt, 
                    homeworkInstruction: lvl.instruction,
                    homeworkContext: lvl.aiPrompt,
                    questionImage: lvl.questionImage, // L'image de la question
                    teacherDocUrls: this.docs,         // Les docs de la ligne 1
                    classroom: state.currentPlayerData.classroom, 
                    playerId: state.currentPlayerId 
                })
            });
            const data = await res.json();
            if (this.aiContent) this.aiContent.innerHTML = data.feedback;
            if (this.btnModify) this.btnModify.style.display = "inline-block";
            if (this.btnNextQ) {
                this.btnNextQ.style.display = "inline-block";
                const isLast = (this.currentLevelIndex >= this.currentHw.levels.length - 1);
                this.btnNextQ.textContent = isLast ? "Terminer 🎉" : "Suivant ➔";
            }
        } catch(e) {
            console.error(e);
            if(this.aiContent) this.aiContent.innerHTML = "Erreur technique.";
        }
        if(this.btnSubmit) this.btnSubmit.disabled = false;
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
            alert("Bravo, devoir terminé !");
            this.showList();
        }
    }
    
    showList() { 
        if(this.workView) this.workView.style.display = "none"; 
        if(this.listView) this.listView.style.display = "block"; 
    }
}