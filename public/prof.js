// ==========================================================
// PROF.JS - DASHBOARD & CRÉATION VISUELLE
// ==========================================================
const $prof = (sel) => document.querySelector(sel);

// Variables locales pour l'éditeur visuel
let tempRow1 = [];
let tempRow2 = [];
window.tempHwLevels = []; // Liste des questions validées

// --- INITIALISATION ---
window.initProfDashboard = function() {
    const dashboard = $prof("#profDashboard");
    if(dashboard) dashboard.style.display = "block";
    
    fetchPlayers();
    
    // Navigation Onglets
    const btnStudents = $prof("#tabStudents");
    const btnHomeworks = $prof("#tabHomeworks");
    
    if(btnStudents) btnStudents.onclick = () => { 
        $prof("#contentStudents").style.display="block"; 
        $prof("#contentHomeworks").style.display="none"; 
        btnStudents.classList.add("active");
        if(btnHomeworks) btnHomeworks.classList.remove("active");
    };
    
    if(btnHomeworks) btnHomeworks.onclick = () => { 
        $prof("#contentStudents").style.display="none"; 
        $prof("#contentHomeworks").style.display="block"; 
        if(btnStudents) btnStudents.classList.remove("active");
        btnHomeworks.classList.add("active");
        loadProfHomeworks(); 
    };
    
    // Bouton Nouveau Devoir
    const btnAdd = $prof("#addHomeworkBtn");
    if(btnAdd) btnAdd.onclick = () => {
        window.tempHwLevels = [];
        const modal = $prof("#createHomeworkModal");
        if(modal) {
            initHomeworkModal(); // Charge l'interface visuelle
            modal.style.display = "flex";
        }
    };
    
    // Boutons Bugs & Reset
    const btnBugs = $prof("#viewBugsBtn");
    if(btnBugs) btnBugs.onclick = () => { loadBugs(); $prof("#profBugListModal").style.display="flex"; };
    $prof("#closeBugListBtn").onclick = () => $prof("#profBugListModal").style.display="none";
    $prof("#resetAllBtn").onclick = async () => { if(confirm("⚠️ TOUT effacer ?")) { await fetch("/api/reset-all-players", {method:"POST"}); fetchPlayers(); } };
    
    // Filtres
    const filter = $prof("#classFilter");
    if(filter) filter.onchange = applyFiltersAndRender;
    const search = $prof("#studentSearch");
    if(search) search.oninput = applyFiltersAndRender;
    
    // Bouton Test
    $prof("#testClassBtn").onclick = async () => {
        const cls = filter.value;
        if(cls === "all") return alert("Choisissez une classe");
        const res = await fetch("/api/register", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({firstName:"Eleve", lastName:"Test", classroom:cls}) });
        const d = await res.json();
        localStorage.setItem("player", JSON.stringify(d));
        window.location.reload();
    };
};

// ==========================================================
// 2. CRÉATION DEVOIR (INTERFACE VISUELLE RESTAURÉE)
// ==========================================================

function initHomeworkModal() {
    tempRow1 = []; 
    tempRow2 = [];
    const modalContent = $prof("#createHomeworkModal .modal-content") || $prof("#createHomeworkModal");
    
    // RECONSTRUCTION DE L'INTERFACE EXACTE DE L'IMAGE 2
    modalContent.innerHTML = `
    <div style="background:white; padding:20px; border-radius:12px; width:90%; max-width:850px; margin:auto; max-height:90vh; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
        <h3 style="margin-top:0; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">➕ Nouveau Devoir</h3>
        
        <div style="margin-bottom:15px;">
            <label style="font-weight:bold; color:#475569;">Titre du Devoir :</label>
            <input id="hwTitle" placeholder="Ex: DM Géographie" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px;">
        </div>
        
        <div style="margin-bottom:20px;">
            <label style="font-weight:bold; color:#475569;">Classe concernée :</label>
            <select id="hwClass" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; margin-top:5px;">
                <option value="Toutes">Toutes les classes</option>
                <option value="6D">6eD</option>
                <option value="5B">5eB</option>
                <option value="5C">5eC</option>
                <option value="2A">2de A</option>
                <option value="2CD">2de CD</option>
            </select>
        </div>

        <!-- ZONE DE CRÉATION DE QUESTION (CADRE BLEU/VIOLET) -->
        <div style="border:2px dashed #3b82f6; background:#eff6ff; padding:20px; border-radius:12px; margin-bottom:20px;">
            <h4 style="margin-top:0; color:#1d4ed8;">➕ Nouvelle Question</h4>
            
            <textarea id="newQInst" rows="2" placeholder="Consigne de la question..." style="width:100%; padding:10px; border:1px solid #93c5fd; border-radius:6px; margin-bottom:15px;"></textarea>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <label style="font-weight:bold; color:#1e40af;">📸 Documents & Images :</label>
                <label class="action-btn" style="background:#2563eb; color:white; padding:8px 15px; border-radius:6px; cursor:pointer; font-weight:bold;">
                    📂 Ajouter des fichiers
                    <input type="file" id="newQFiles" accept=".pdf, image/*" multiple style="display:none;">
                </label>
            </div>

            <!-- ZONES DE DROP VISUELLES -->
            <div style="background:#dbeafe; padding:15px; border-radius:8px; display:flex; flex-direction:column; gap:15px;">
                <!-- LIGNE 1 -->
                <div style="background:white; border-radius:6px; padding:10px; border:1px solid #bfdbfe;">
                    <div style="font-size:0.85em; color:#64748b; font-weight:bold; margin-bottom:5px; text-transform:uppercase;">LIGNE 1 (Haut - 75%)</div>
                    <div id="visualRow1" style="min-height:100px; display:flex; gap:10px; overflow-x:auto; padding:5px; align-items:center;">
                        <span style="color:#cbd5e1; width:100%; text-align:center;">Glissez vos images ici</span>
                    </div>
                </div>
                <!-- LIGNE 2 -->
                <div style="background:white; border-radius:6px; padding:10px; border:1px solid #bfdbfe;">
                    <div style="font-size:0.85em; color:#64748b; font-weight:bold; margin-bottom:5px; text-transform:uppercase;">LIGNE 2 (Bas - 25%)</div>
                    <div id="visualRow2" style="min-height:100px; display:flex; gap:10px; overflow-x:auto; padding:5px; align-items:center;">
                        <span style="color:#cbd5e1; width:100%; text-align:center;">... ou ici</span>
                    </div>
                </div>
            </div>

            <button id="btnAddQ" style="width:100%; padding:12px; background:white; color:#2563eb; border:2px solid #2563eb; font-weight:bold; margin-top:20px; border-radius:8px; cursor:pointer; transition:0.2s;">
                Valider et Ajouter cette question
            </button>
        </div>

        <!-- LISTE DES QUESTIONS AJOUTEES -->
        <h4 style="margin-bottom:10px;">Questions Prêtes (<span id="qCount">0</span>) :</h4>
        <div id="hwQuestionsList" style="margin-bottom:20px; max-height:150px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px; padding:10px; background:#f8fafc;">
            <em style="color:#94a3b8;">Aucune question ajoutée pour l'instant.</em>
        </div>

        <div style="display:flex; gap:10px; justify-content:center; border-top:1px solid #e2e8f0; padding-top:20px;">
            <button id="btnPublishHW" style="background:#16a34a; color:white; padding:12px 30px; border:none; border-radius:8px; font-weight:bold; font-size:16px; cursor:pointer;">✅ TOUT PUBLIER</button>
            <button id="btnCancelHW" style="background:#64748b; color:white; padding:12px 30px; border:none; border-radius:8px; cursor:pointer;">Annuler</button>
        </div>
    </div>`;

    // --- LOGIQUE DES ÉVÉNEMENTS ---
    
    // 1. Ajout Fichiers (Bouton Bleu)
    const fileInput = document.getElementById("newQFiles");
    fileInput.onchange = () => {
        const newFiles = Array.from(fileInput.files);
        // Ajout par défaut dans la Ligne 1
        tempRow1 = [...tempRow1, ...newFiles]; 
        renderVisualRowsInModal(true); // true = mode fichier local (File objects)
        fileInput.value = "";
    };

    // 2. Valider une question
    const btnAddQ = document.getElementById("btnAddQ");
    btnAddQ.onclick = async () => {
        const inst = document.getElementById("newQInst").value;
        if (!inst && tempRow1.length === 0 && tempRow2.length === 0) return alert("Mettez au moins une consigne ou une image.");
        
        btnAddQ.textContent = "⏳ Upload des images en cours...";
        btnAddQ.disabled = true;

        // Préparation upload
        const allFiles = [...tempRow1, "BREAK", ...tempRow2];
        let urls = [];

        for (const item of allFiles) {
            if (item === "BREAK") {
                urls.push("BREAK");
                continue;
            }
            // Si c'est déjà une URL (cas édition), on garde. Sinon (File), on upload.
            if (typeof item === 'string') {
                urls.push(item);
            } else {
                const fd = new FormData();
                fd.append('file', item);
                try {
                    const res = await fetch('/api/upload', { method: 'POST', body: fd });
                    const d = await res.json();
                    if (d.ok) urls.push(d.imageUrl);
                } catch(e) { console.error("Erreur upload", e); }
            }
        }

        // Ajout à la liste globale du devoir
        window.tempHwLevels.push({ instruction: inst, attachmentUrls: urls });
        
        // Reset Formulaire Question
        document.getElementById("newQInst").value = "";
        tempRow1 = []; tempRow2 = [];
        renderVisualRowsInModal(true);
        btnAddQ.textContent = "Valider et Ajouter cette question";
        btnAddQ.disabled = false;
        
        updateQuestionsList();
    };

    // 3. Publier le devoir
    document.getElementById("btnPublishHW").onclick = async () => {
        const title = document.getElementById("hwTitle").value;
        const cls = document.getElementById("hwClass").value;
        if (!title || window.tempHwLevels.length === 0) return alert("Titre manquant ou aucune question ajoutée.");
        
        await fetch('/api/homework', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ title, classroom: cls, levels: window.tempHwLevels }) 
        });
        
        document.getElementById("createHomeworkModal").style.display = 'none';
        loadProfHomeworks();
    };

    document.getElementById("btnCancelHW").onclick = () => {
        document.getElementById("createHomeworkModal").style.display = 'none';
    };
}

// --- FONCTIONS D'AFFICHAGE VISUEL ---

function updateQuestionsList() {
    const list = document.getElementById("hwQuestionsList");
    document.getElementById("qCount").textContent = window.tempHwLevels.length;
    
    if (window.tempHwLevels.length === 0) {
        list.innerHTML = `<em style="color:#94a3b8;">Aucune question ajoutée.</em>`;
        return;
    }
    
    list.innerHTML = window.tempHwLevels.map((lvl, i) => `
        <div style="background:white; padding:10px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>Question ${i+1} :</strong> ${lvl.instruction.substring(0, 40)}...
                <span style="font-size:0.8em; color:#64748b; margin-left:10px;">(${lvl.attachmentUrls.length} docs)</span>
            </div>
            <button onclick="removeTempLevel(${i})" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:bold;">🗑️</button>
        </div>
    `).join('');
}

window.removeTempLevel = function(idx) {
    window.tempHwLevels.splice(idx, 1);
    updateQuestionsList();
};

function renderVisualRowsInModal(isFileMode) {
    renderZone(document.getElementById("visualRow1"), tempRow1, 1, isFileMode);
    renderZone(document.getElementById("visualRow2"), tempRow2, 2, isFileMode);
}

function renderZone(container, items, rowNum, isFileMode) {
    container.innerHTML = "";
    if (items.length === 0) {
        container.innerHTML = `<span style="color:#cbd5e1; font-size:0.9em; width:100%; text-align:center;">${rowNum===1 ? "Glissez vos images ici" : "... ou ici"}</span>`;
    }
    
    // Drag Events Container
    container.ondragover = (e) => { e.preventDefault(); container.style.background = "#eff6ff"; };
    container.ondragleave = (e) => { container.style.background = "white"; };
    container.ondrop = (e) => handleDrop(e, rowNum, null);

    items.forEach((item, index) => {
        const wrapper = document.createElement("div");
        wrapper.draggable = true;
        wrapper.style.cssText = "width:80px; height:80px; min-width:80px; position:relative; border:2px solid #e2e8f0; border-radius:6px; overflow:hidden; background:white; cursor:grab;";
        
        let url = "";
        let isPdf = false;

        if (typeof item === 'string') { // URL existante
            url = item;
            isPdf = url.toLowerCase().endsWith(".pdf");
        } else { // Fichier local (File)
            url = URL.createObjectURL(item);
            isPdf = item.type.includes("pdf");
        }

        if (isPdf) {
            wrapper.innerHTML = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#f8fafc; color:#64748b; font-weight:bold;">PDF</div>`;
        } else {
            const img = document.createElement("img");
            img.src = url;
            img.style.cssText = "width:100%; height:100%; object-fit:cover; pointer-events:none;";
            wrapper.appendChild(img);
        }

        // Bouton Supprimer
        const del = document.createElement("div");
        del.innerHTML = "&times;";
        del.style.cssText = "position:absolute; top:0; right:0; background:rgba(239,68,68,0.9); color:white; width:20px; height:20px; text-align:center; line-height:20px; cursor:pointer;";
        del.onclick = (e) => { 
            e.stopPropagation(); 
            if(rowNum===1) tempRow1.splice(index, 1); else tempRow2.splice(index, 1); 
            renderVisualRowsInModal(isFileMode); 
        };
        wrapper.appendChild(del);

        // Drag Events Item
        wrapper.addEventListener("dragstart", (e) => { e.dataTransfer.setData("srcRow", rowNum); e.dataTransfer.setData("srcIdx", index); });
        wrapper.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); handleDrop(e, rowNum, index); });
        
        container.appendChild(wrapper);
    });
}

function handleDrop(e, targetRow, targetIdx) {
    const srcRow = parseInt(e.dataTransfer.getData("srcRow"));
    const srcIdx = parseInt(e.dataTransfer.getData("srcIdx"));
    if (isNaN(srcRow)) return;

    // Retrait
    let item;
    if (srcRow === 1) item = tempRow1.splice(srcIdx, 1)[0];
    else item = tempRow2.splice(srcIdx, 1)[0];

    // Ajout
    const targetArray = (targetRow === 1) ? tempRow1 : tempRow2;
    if (targetIdx === null) targetArray.push(item);
    else targetArray.splice(targetIdx, 0, item);

    renderVisualRowsInModal(true);
}

// ==========================================================
// 3. FONCTIONS CHARGEMENT DONNÉES
// ==========================================================
async function loadProfHomeworks() {
    const tbody = $prof("#profHomeworksBody");
    tbody.innerHTML = "<tr><td>Chargement...</td></tr>";
    const res = await fetch('/api/homework-all');
    const list = await res.json();
    tbody.innerHTML = list.map(h => `<tr><td>${new Date(h.date).toLocaleDateString()}</td><td>${h.title}</td><td>${h.classroom}</td><td>${h.levels.length}</td><td><button onclick="deleteHomework('${h._id}')" style="color:red; cursor:pointer;">🗑️</button></td></tr>`).join('');
}
window.deleteHomework = async (id) => { if(confirm("Supprimer ?")) { await fetch(`/api/homework/${id}`, { method: 'DELETE' }); loadProfHomeworks(); } };

async function fetchPlayers() {
    const res = await fetch("/api/players"); window.allPlayersData = await res.json(); applyFiltersAndRender();
}
window.applyFiltersAndRender = function() {
    const f = $prof("#classFilter").value; const s = $prof("#studentSearch").value.toLowerCase();
    const l = window.allPlayersData.filter(p => (f==="all" || p.classroom===f) && (p.firstName.toLowerCase().includes(s) || p.lastName.toLowerCase().includes(s)));
    $prof("#playersBody").innerHTML = l.map(p => `<tr><td>${p.firstName} ${p.lastName}</td><td>${p.classroom}</td><td><button onclick="resetPlayer('${p._id}')">Reset</button></td></tr>`).join('');
}
window.resetPlayer = async(id) => { if(confirm("Reset ?")) { await fetch("/api/reset-player",{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:id})}); fetchPlayers(); } };
async function loadBugs() { const r = await fetch("/api/bugs"); const l = await r.json(); $prof("#bugsBody").innerHTML = l.map(b => `<tr><td>${b.description}</td><td><button onclick="deleteBug('${b._id}')">X</button></td></tr>`).join(''); }
window.deleteBug = async(id) => { await fetch(`/api/bugs/${id}`, {method:'DELETE'}); loadBugs(); };