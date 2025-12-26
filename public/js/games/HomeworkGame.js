import { state } from '../state.js';

export class HomeworkGame {
    constructor(container, controller) {
        this.c = container;
        this.ctrl = controller;

        // Elements UI
        this.list = this.c.querySelector("#hw-list");
        this.view = this.c.querySelector("#hw-workspace");
        this.titleEl = this.c.querySelector("#panel-title");
        this.descEl = this.c.querySelector("#panel-desc");
        this.zoneTop = this.c.querySelector("#zone-top");
        this.zoneBottom = this.c.querySelector("#zone-bottom");
        this.input = this.c.querySelector("#hw-text");
        this.fileInput = this.c.querySelector("#hw-file");
        
        // Zones de Feedback
        this.resultEl = this.c.querySelector("#hw-result"); // La réponse de l'IA
        this.loadingEl = this.c.querySelector("#hw-loading"); // Le message "Analyse..." (si présent dans le HTML)
        
        // Si le loadingEl n'existe pas dans le template, on utilise resultEl temporairement
        if (!this.loadingEl) {
            this.loadingEl = document.createElement("div");
            this.loadingEl.style.display = "none";
            this.loadingEl.style.color = "#2563eb";
            this.loadingEl.style.fontWeight = "bold";
            this.loadingEl.textContent = "🧠 Analyse de l'IA en cours...";
            this.resultEl.parentNode.insertBefore(this.loadingEl, this.resultEl);
        }

        // Boutons
        this.btnSubmit = this.c.querySelector("#hw-submit");
        this.btnNext = this.c.querySelector("#hw-next");
        this.btnClose = this.c.querySelector("#btn-close-work");

        // Liaisons Événements
        this.btnClose.onclick = () => { 
            this.view.style.display = "none"; 
            this.list.style.display = "block"; 
        };
        
        this.btnSubmit.onclick = () => {
            console.log("📤 Clic sur Envoyer");
            this.submit();
        };
        
        // Charger la liste
        this.loadHomeworks();
    }

    async loadHomeworks() {
        this.list.innerHTML = "<p style='padding:10px'>Chargement des devoirs...</p>";
        
        if (!state.currentPlayerData || !state.currentPlayerData.classroom) {
            this.list.innerHTML = "<p style='padding:10px; color:red'>Erreur : Classe non définie.</p>";
            return;
        }

        try {
            const res = await fetch(`/api/homework/${state.currentPlayerData.classroom}`);
            const data = await res.json();
            
            if (data.length === 0) {
                this.list.innerHTML = "<p style='padding:20px; text-align:center'>Aucun devoir à faire pour l'instant.</p>";
                return;
            }

            this.list.innerHTML = data.map((hw, i) => `
                <div class="hw-item" style="padding:15px; border-bottom:1px solid #eee; cursor:pointer; background:white; margin-bottom:5px; border-radius:6px; transition: background 0.2s;" data-idx="${i}" onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background='white'">
                    <b style="color:#1e3a8a">${hw.title}</b><br>
                    <small style="color:#64748b">📅 ${new Date(hw.date).toLocaleDateString()} • ${hw.levels.length} question(s)</small>
                </div>
            `).join('');

            // Ajout des listeners sur les éléments générés
            this.list.querySelectorAll(".hw-item").forEach(item => {
                item.onclick = () => this.openHw(data[item.dataset.idx]);
            });
            
        } catch(e) { 
            console.error("Erreur chargement devoirs:", e);
            this.list.innerHTML = "Erreur de connexion au serveur."; 
        }
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
        
        // Reset UI
        this.descEl.innerHTML = `<strong>Question ${idx + 1}/${this.currentHw.levels.length} :</strong> ${lvl.instruction}`;
        this.input.value = "";
        this.fileInput.value = "";
        
        this.resultEl.innerHTML = ""; // Vider le feedback précédent
        this.loadingEl.style.display = "none";
        
        this.btnSubmit.style.display = "block";
        this.btnSubmit.disabled = false;
        this.btnSubmit.textContent = "Envoyer à l'IA 🤖";
        this.btnSubmit.style.background = "#2563eb";
        
        this.btnNext.style.display = "none";

        // Affichage Documents (Split View)
        this.zoneTop.innerHTML = "";
        this.zoneBottom.innerHTML = "";
        
        let targetZone = this.zoneTop;
        
        if (lvl.attachmentUrls && lvl.attachmentUrls.length > 0) {
            lvl.attachmentUrls.forEach(u => {
                if (u === "BREAK") {
                    targetZone = this.zoneBottom; // On passe en bas
                    return;
                }
                
                let el;
                if (u.endsWith('.pdf')) {
                    el = document.createElement("iframe");
                    el.src = u;
                    el.style.width = "100%"; el.style.height = "100%"; el.style.border = "none";
                } else {
                    el = document.createElement("img");
                    el.src = u;
                    el.style.maxWidth = "100%"; el.style.maxHeight = "100%"; el.style.objectFit = "contain";
                }
                targetZone.appendChild(el);
            });
        } else {
            this.zoneTop.innerHTML = "<p style='color:#ccc; text-align:center; margin-top:20px;'>Aucun document joint.</p>";
        }
    }

    async submit() {
        const text = this.input.value.trim();
        const file = this.fileInput.files[0];
        
        if(!text && !file) return alert("Écris une réponse ou joins une photo avant d'envoyer !");
        
        // UI Chargement
        this.btnSubmit.disabled = true;
        this.resultEl.style.display = "none";
        this.loadingEl.style.display = "block";

        let imgUrl = null;
        
        try {
            // 1. Upload image si présente
            if (file) {
                console.log("Upload image...");
                const fd = new FormData(); fd.append('file', file);
                const r = await fetch('/api/upload', { method: 'POST', body: fd });
                const d = await r.json();
                if(d.ok) imgUrl = d.imageUrl;
                else throw new Error("Erreur upload image");
            }

            // 2. Analyse IA
            console.log("Envoi à l'IA...");
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
            
            // 3. Affichage Résultat
            this.loadingEl.style.display = "none";
            this.resultEl.style.display = "block";
            
            // Insertion HTML sécurisé
            this.resultEl.innerHTML = data.feedback;
            this.resultEl.style.color = "#111827";
            this.resultEl.style.background = "#f0fdf4";
            this.resultEl.style.padding = "10px";
            this.resultEl.style.borderRadius = "6px";
            this.resultEl.style.border = "1px solid #bbf7d0";
            
            // 4. Gestion des Boutons (Logique "Améliorer")
            
            // Le bouton Envoyer redevient dispo mais change de texte (pour amélioration)
            this.btnSubmit.disabled = false;
            this.btnSubmit.textContent = "🔄 Renvoyer une version corrigée";
            this.btnSubmit.style.background = "#f59e0b"; // Orange pour signaler la modification
            this.btnSubmit.style.display = "inline-block";
            
            // Le bouton Suivant apparaît
            this.btnNext.style.display = "inline-block";
            this.btnNext.textContent = (this.currentQIdx < this.currentHw.levels.length - 1) ? "Question Suivante ➔" : "Terminer le Devoir 🎉";
            
            // Action du bouton Suivant
            this.btnNext.onclick = () => {
                if (this.currentQIdx < this.currentHw.levels.length - 1) {
                    this.loadLevel(this.currentQIdx + 1);
                } else {
                    alert("Devoir terminé ! Bravo !");
                    this.c.querySelector("#btn-close-work").click(); // Retour liste
                }
            };

        } catch (e) {
            console.error(e);
            this.loadingEl.style.display = "none";
            this.resultEl.style.display = "block";
            this.resultEl.innerHTML = `<p style="color:red">❌ Erreur technique : ${e.message}</p>`;
            this.btnSubmit.disabled = false;
        }
    }
}