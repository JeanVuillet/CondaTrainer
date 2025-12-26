import { state } from './state.js';
import { uploadFile, saveHomework, getHomeworks, fetchPlayers } from './api.js';

// --- VARIABLES LOCALES POUR L'ÉDITEUR VISUEL ---
let tempRow1 = [];
let tempRow2 = [];

// --- INITIALISATION DU DASHBOARD ---
export function initProfDashboard() {
    state.$("#profDashboard").style.display = "block";
    
    // Charger les élèves
    fetchAndRenderPlayers();

    // Onglets
    state.$("#tabStudents").onclick = () => { 
        state.$("#contentStudents").style.display="block"; 
        state.$("#contentHomeworks").style.display="none"; 
        state.$("#tabStudents").classList.add("active");
        state.$("#tabHomeworks").classList.remove("active");
    };
    state.$("#tabHomeworks").onclick = () => { 
        state.$("#contentStudents").style.display="none"; 
        state.$("#contentHomeworks").style.display="block"; 
        state.$("#tabHomeworks").classList.add("active");
        state.$("#tabStudents").classList.remove("active");
        loadProfHomeworks(); 
    };

    // Actions
    state.$("#addHomeworkBtn").onclick = () => {
        state.tempHwLevels = [];
        state.$("#createHomeworkModal").style.display = "flex";
        initHomeworkModal(); // Lance l'interface visuelle
    };
    
    // Bugs
    state.$("#viewBugsBtn").onclick = () => { loadBugs(); state.$("#profBugListModal").style.display="flex"; };
    state.$("#closeBugListBtn").onclick = () => { state.$("#profBugListModal").style.display="none"; };
    
    // Filtres & Test
    state.$("#testClassBtn").onclick = createTestStudent;
    state.$("#classFilter").onchange = applyFiltersAndRender;
    state.$("#studentSearch").oninput = applyFiltersAndRender;
    state.$("#resetAllBtn").onclick = async () => { 
        if(confirm("⚠️ TOUT effacer ?")) { await fetch("/api/reset-all-players", {method:"POST"}); fetchAndRenderPlayers(); } 
    };
}

// ==========================================================
// PARTIE 1 : GESTION DES ÉLÈVES (TABLEAU DÉTAILLÉ)
// ==========================================================

async function fetchAndRenderPlayers() {
    const res = await fetch('/api/players');
    state.allPlayersData = await res.json();
    applyFiltersAndRender();
}

function applyFiltersAndRender() {
    const filter = state.$("#classFilter").value;
    const search = state.$("#studentSearch").value.toLowerCase();
    
    const filtered = state.allPlayersData.filter(p => 
        (filter === "all" || p.classroom === filter) &&
        (p.firstName.toLowerCase().includes(search) || p.lastName.toLowerCase().includes(search))
    );
    
    renderPlayersTable(filtered);
}

function renderPlayersTable(players) {
    const tbody = state.$("#playersBody");
    tbody.innerHTML = "";

    if (players.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">Aucun élève trouvé.</td></tr>`;
        return;
    }

    // Liste des chapitres à afficher dans le tableau
    const chapters = [
        { id: "ch1-zombie", label: "Zombie" },
        { id: "ch4-redaction", label: "Rédaction" }
    ];

    players.forEach(p => {
        // Pour chaque élève, on crée plusieurs lignes (une par chapitre)
        // La première ligne contient le Nom et la Classe avec un rowspan
        
        let isFirstRow = true;

        chapters.forEach(chap => {
            const tr = document.createElement("tr");
            
            // Colonnes communes (Nom, Classe, Actions) - Seulement sur la 1ère ligne
            if (isFirstRow) {
                tr.innerHTML += `
                    <td rowspan="${chapters.length}" style="font-weight:bold; vertical-align:middle;">${p.firstName} ${p.lastName}</td>
                    <td rowspan="${chapters.length}" style="vertical-align:middle;">${p.classroom}</td>
                `;
            }

            // Colonnes spécifiques au chapitre
            // (Logique simplifiée pour l'affichage : on suppose qu'on récupère l'info du JSON global ou de l'élève)
            // Ici on met des placeholders dynamiques basés sur les données de l'élève
            
            // Calcul progression (exemple)
            const validated = p.validatedLevels || [];
            // On compte combien de niveaux de ce chapitre sont validés (filtre simple sur l'ID string)
            const count = validated.filter(v => typeof v === 'string' && v.includes(chap.id.split('-')[0])).length; 
            
            tr.innerHTML += `
                <td>${chap.label}</td>
                <td>-</td> <!-- Niveau actuel -->
                <td>${count > 0 ? count + ' terminé(s)' : '-'}</td>
            `;

            if (isFirstRow) {
                tr.innerHTML += `
                    <td rowspan="${chapters.length}" style="vertical-align:middle;">
                        <button class="action-btn" style="background:#3b82f6; font-size:12px; padding:5px 10px;" onclick="alert('Détails activité bientôt')">🕒 Activité</button>
                        <button class="action-btn" style="background:#fee2e2; color:#b91c1c; font-size:12px; padding:5px 10px; margin-top:5px;" onclick="window.resetPlayer('${p._id}')">Réinitialiser</button>
                    </td>
                `;
                isFirstRow = false;
            }
            
            tbody.appendChild(tr);
        });
    });
}

// ==========================================================
// PARTIE 2 : CRÉATION DEVOIR (INTERFACE VISUELLE)
// ==========================================================

function initHomeworkModal() {
    tempRow1 = [];
    tempRow2 = [];
    const modalContent = state.$("#createHomeworkModal");

    modalContent.innerHTML = `
    <div class="modal-content" style="width:95%; max-width:900px; padding:0; background:#f8fafc; border-radius:12px; overflow:hidden;">
        <!-- Header Blanc -->
        <div style="background:white; padding:20px; border-bottom:1px solid #e2e8f0;">
            <h3 style="margin:0; text-align:center; color:#1e293b;">Nouveau Devoir</h3>
            
            <div style="margin-top:20px;">
                <label style="font-weight:bold; font-size:0.9em; color:#64748b;">Titre du devoir :</label>
                <input id="hwTitle" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; margin-top:5px;">
            </div>
            <div style="margin-top:15px;">
                <label style="font-weight:bold; font-size:0.9em; color:#64748b;">Classe :</label>
                <select id="hwClass" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; margin-top:5px;">
                    <option value="6D">6eD</option><option value="5B">5eB</option><option value="5C">5eC</option>
                    <option value="2A">2de A</option><option value="2CD">2de CD</option>
                </select>
            </div>
        </div>

        <!-- Corps Gris / Bleu -->
        <div style="padding:20px; max-height:60vh; overflow-y:auto;">
            
            <!-- CADRE DE CRÉATION (Dashed Blue) -->
            <div style="border:2px dashed #3b82f6; background:white; border-radius:12px; padding:20px; position:relative;">
                <h4 style="margin-top:0; color:#2563eb; display:flex; align-items:center; gap:5px;">
                    ➕ Nouvelle Question
                </h4>

                <textarea id="newQInst" rows="2" placeholder="Consigne de la question..." style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; font-family:inherit;"></textarea>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px; margin-bottom:10px;">
                    <label style="font-weight:bold; color:#475569;">📸 Documents & Images :</label>
                    <label class="action-btn" style="cursor:pointer; display:flex; align-items:center; gap:5px;">
                        📂 Ajouter des fichiers
                        <input type="file" id="newQFiles" accept=".pdf, image/*" multiple style="display:none;">
                    </label>
                </div>

                <!-- ZONE VISUELLE LIGNE 1 -->
                <div style="background:#f1f5f9; border-radius:8px; padding:10px; margin-bottom:10px; border:1px solid #e2e8f0;">
                    <div style="font-size:0.8em; font-weight:bold; color:#64748b; margin-bottom:5px; text-transform:uppercase;">LIGNE 1 (Haut - 75%)</div>
                    <div id="visualRow1" style="min-height:100px; background:white; border:2px dashed #cbd5e1; border-radius:6px; display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap; padding:10px;">
                        <span style="color:#cbd5e1;">Glissez vos images ici</span>
                    </div>
                </div>

                <!-- ZONE VISUELLE LIGNE 2 -->
                <div style="background:#f1f5f9; border-radius:8px; padding:10px; border:1px solid #e2e8f0;">
                    <div style="font-size:0.8em; font-weight:bold; color:#64748b; margin-bottom:5px; text-transform:uppercase;">LIGNE 2 (Bas - 25%)</div>
                    <div id="visualRow2" style="min-height:80px; background:white; border:2px dashed #cbd5e1; border-radius:6px; display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap; padding:10px;">
                        <span style="color:#cbd5e1;">... ou ici</span>
                    </div>
                </div>

                <button id="btnAddQ" style="width:100%; margin-top:20px; padding:12px; background:white; border:2px solid #2563eb; color:#2563eb; font-weight:bold; border-radius:8px; cursor:pointer;">
                    Valider et Ajouter cette question
                </button>
            </div>

            <!-- LISTE DES QUESTIONS -->
            <div style="margin-top:20px;">
                <h4 style="margin-bottom:10px;">Questions Prêtes (<span id="qCount">0</span>) :</h4>
                <div id="hwQuestionsList" style="background:white; border:1px solid #e2e8f0; border-radius:8px; padding:10px; min-height:50px;">
                    <em style="color:#94a3b8;">Aucune question ajoutée.</em>
                </div>
            </div>

        </div>

        <!-- Footer -->
        <div style="background:white; padding:20px; border-top:1px solid #e2e8f0; display:flex; gap:10px; justify-content:center;">
            <button onclick="document.getElementById('createHomeworkModal').style.display='none'" style="background:#94a3b8; color:white; border:none; padding:12px 30px; border-radius:8px; font-weight:bold;">Annuler</button>
            <button id="btnPublishHW" style="background:#16a34a; color:white; border:none; padding:12px 30px; border-radius:8px; font-weight:bold;">✅ ENREGISTRER</button>
        </div>
    </div>
    `;

    setupVisualEditorEvents();
}

function setupVisualEditorEvents() {
    const fileInput = document.getElementById("newQFiles");
    
    // GESTION UPLOAD MASSIF
    fileInput.onchange = () => {
        const newFiles = Array.from(fileInput.files);
        tempRow1 = [...tempRow1, ...newFiles]; // Par défaut en haut
        renderVisualRows(true);
        fileInput.value = "";
    };

    // BOUTON VALIDER QUESTION
    const btnAddQ = document.getElementById("btnAddQ");
    btnAddQ.onclick = async () => {
        const inst = document.getElementById("newQInst").value;
        if (!inst && tempRow1.length === 0 && tempRow2.length === 0) return alert("Question vide !");
        
        btnAddQ.textContent = "⏳ Envoi des images...";
        btnAddQ.disabled = true;

        const allItems = [...tempRow1, "BREAK", ...tempRow2];
        let urls = [];

        for (const item of allItems) {
            if (item === "BREAK") { urls.push("BREAK"); continue; }
            if (typeof item === 'string') { urls.push(item); } // Déjà URL
            else {
                const fd = new FormData(); fd.append('file', item);
                try {
                    const res = await fetch('/api/upload', {method:'POST', body:fd});
                    const d = await res.json();
                    if(d.ok) urls.push(d.imageUrl);
                } catch(e) {}
            }
        }

        state.tempHwLevels.push({ instruction: inst, attachmentUrls: urls });
        
        // Reset
        tempRow1 = []; tempRow2 = []; document.getElementById("newQInst").value = "";
        renderVisualRows(true);
        updateQuestionsList();
        
        btnAddQ.textContent = "Valider et Ajouter cette question";
        btnAddQ.disabled = false;
    };

    // BOUTON PUBLIER
    document.getElementById("btnPublishHW").onclick = async () => {
        const title = document.getElementById("hwTitle").value;
        const cls = document.getElementById("hwClass").value;
        if (!title || state.tempHwLevels.length === 0) return alert("Titre ou questions manquants");
        
        await saveHomework({ title, classroom: cls, levels: state.tempHwLevels }, false);
        document.getElementById("createHomeworkModal").style.display = 'none';
        loadProfHomeworks();
    };
}

function renderVisualRows(isFileMode) {
    renderZone(document.getElementById("visualRow1"), tempRow1, 1, isFileMode);
    renderZone(document.getElementById("visualRow2"), tempRow2, 2, isFileMode);
}

function renderZone(container, items, rowNum, isFileMode) {
    container.innerHTML = "";
    if (items.length === 0) {
        container.innerHTML = `<span style="color:#cbd5e1;">${rowNum===1 ? "Glissez ici" : "ou ici"}</span>`;
    }
    
    // DRAG & DROP LOGIQUE
    container.ondragover = e => e.preventDefault();
    container.ondrop = e => {
        e.preventDefault();
        const srcRow = parseInt(e.dataTransfer.getData("row"));
        const srcIdx = parseInt(e.dataTransfer.getData("idx"));
        let item = (srcRow === 1) ? tempRow1.splice(srcIdx, 1)[0] : tempRow2.splice(srcIdx, 1)[0];
        (rowNum === 1 ? tempRow1 : tempRow2).push(item);
        renderVisualRows(isFileMode);
    };

    items.forEach((item, index) => {
        const div = document.createElement("div");
        div.draggable = true;
        div.style.cssText = "width:80px; height:80px; border:1px solid #ddd; background:white; position:relative; display:flex; align-items:center; justify-content:center; cursor:grab;";
        
        let content = "";
        if (typeof item !== 'string' && item.type.includes('pdf')) content = "📄";
        else if (typeof item === 'string' && item.endsWith('.pdf')) content = "📄";
        else {
            const url = (typeof item === 'string') ? item : URL.createObjectURL(item);
            content = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;">`;
        }
        
        div.innerHTML = content + `<div onclick="event.stopPropagation(); ${(rowNum===1 ? 'tempRow1' : 'tempRow2')}.splice(${index},1); renderVisualRows(${isFileMode});" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border-radius:50%; width:20px; height:20px; text-align:center; line-height:20px; cursor:pointer; font-size:12px;">x</div>`;
        
        div.addEventListener("dragstart", (e) => { e.dataTransfer.setData("row", rowNum); e.dataTransfer.setData("idx", index); });
        container.appendChild(div);
    });
}

function updateQuestionsList() {
    const list = document.getElementById("hwQuestionsList");
    document.getElementById("qCount").textContent = state.tempHwLevels.length;
    list.innerHTML = state.tempHwLevels.map((l,i) => `
        <div style="border-bottom:1px solid #eee; padding:5px; display:flex; justify-content:space-between;">
            <span>Q${i+1}: ${l.instruction.substring(0,30)}...</span>
            <button onclick="window.removeHwLevel(${i})" style="color:red; border:none; background:none; cursor:pointer;">🗑️</button>
        </div>
    `).join('');
}

// Helpers globaux
window.removeHwLevel = (i) => { state.tempHwLevels.splice(i, 1); updateQuestionsList(); };
window.resetPlayer = async(id) => { if(confirm("Reset ?")) { await fetch("/api/reset-player",{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:id})}); fetchAndRenderPlayers(); } };
window.deleteBug = async(id) => { await fetch(`/api/bugs/${id}`, {method:'DELETE'}); loadBugs(); };
window.deleteHomework = async(id) => { if(confirm("Supprimer ?")) { await fetch(`/api/homework/${id}`, {method:'DELETE'}); loadProfHomeworks(); } };

// Fonctions chargement
async function loadBugs() { const r = await fetch("/api/bugs"); const l = await r.json(); state.$("#bugsBody").innerHTML = l.map(b => `<tr><td>${b.description}</td><td><button onclick="deleteBug('${b._id}')">X</button></td></tr>`).join(''); }
async function loadProfHomeworks() { const r = await fetch('/api/homework-all'); const l = await r.json(); state.$("#profHomeworksBody").innerHTML = l.map(h => `<tr><td>${h.title}</td><td>${h.classroom}</td><td><button onclick="deleteHomework('${h._id}')">X</button></td></tr>`).join(''); }
async function createTestStudent() { const c = state.$("#classFilter").value; if(c==="all") return alert("Classe?"); await fetch("/api/register", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({firstName:"Eleve", lastName:"Test", classroom:c}) }); window.location.reload(); }