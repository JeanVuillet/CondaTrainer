import { state } from './state.js';
import { uploadFile, saveHomework, getHomeworks, fetchPlayers } from './api.js';

// ==========================================================
// 1. FONCTIONS GLOBALES (Accessibles par le HTML généré)
// ==========================================================

// --- GESTION DEVOIRS (VISUEL) ---
window.addDocToZone = function(lvlIdx, zoneId) {
    const input = document.getElementById(`input-${zoneId}-${lvlIdx}`);
    if (!input) return;
    const url = input.value.trim();
    if(!url) return alert("Veuillez coller une URL.");
    pushDocToState(lvlIdx, zoneId, url);
};

window.uploadFileToZone = async function(inputEl, lvlIdx, zoneId) {
    if (!inputEl.files || inputEl.files.length === 0) return;
    
    const file = inputEl.files[0];
    const formData = new FormData();
    formData.append('file', file);

    // Feedback visuel
    inputEl.parentElement.style.opacity = "0.5";
    inputEl.parentElement.innerHTML += " ⏳";
    
    try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.ok && data.imageUrl) {
            pushDocToState(lvlIdx, zoneId, data.imageUrl);
        } else {
            alert("Erreur upload : " + (data.error || "Inconnue"));
        }
    } catch (e) {
        console.error(e);
        alert("Erreur connexion serveur.");
    }
    // Le champ sera régénéré par renderLevelsInputs
};

function pushDocToState(lvlIdx, zoneId, url) {
    const lvl = state.tempHwLevels[lvlIdx];
    const breakIndex = lvl.attachmentUrls.indexOf("BREAK");
    
    const topDocs = breakIndex === -1 ? lvl.attachmentUrls : lvl.attachmentUrls.slice(0, breakIndex);
    const bottomDocs = breakIndex === -1 ? [] : lvl.attachmentUrls.slice(breakIndex + 1);

    if (zoneId === "top") topDocs.push(url);
    else bottomDocs.push(url);

    // Reconstruction : Top + BREAK + Bottom
    if (bottomDocs.length > 0) lvl.attachmentUrls = [...topDocs, "BREAK", ...bottomDocs];
    else lvl.attachmentUrls = topDocs;
    
    renderLevelsInputs();
}

window.removeDoc = function(lvlIdx, urlToDelete) {
    const lvl = state.tempHwLevels[lvlIdx];
    const idx = lvl.attachmentUrls.indexOf(urlToDelete);
    if (idx > -1) lvl.attachmentUrls.splice(idx, 1);
    renderLevelsInputs();
};

window.removeLevel = function(idx) { 
    state.tempHwLevels.splice(idx, 1); 
    renderLevelsInputs(); 
};

// --- GESTION LISTES (SUPPRESSION/RESET) ---
window.deleteHomework = async (id) => {
    if(confirm("Supprimer ce devoir ?")) {
        await fetch(`/api/homework/${id}`, { method: 'DELETE' });
        loadProfHomeworks();
    }
};

window.deleteBug = async (id) => {
    if(confirm("Supprimer ?")) {
        await fetch(`/api/bugs/${id}`, { method: 'DELETE' });
        loadBugs();
    }
};

window.resetPlayer = async (id) => {
    if(confirm("Réinitialiser cet élève ?")) {
        await fetch("/api/reset-player", {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({playerId:id})
        });
        fetchAndRenderPlayers();
    }
};


// ==========================================================
// 2. INITIALISATION DASHBOARD
// ==========================================================
export function initProfDashboard() {
    console.log("👨‍🏫 Init Dashboard Prof");
    const dashboard = document.getElementById("profDashboard");
    if(dashboard) dashboard.style.display = "block";
    
    // Charger données
    fetchAndRenderPlayers();

    // Onglets
    const btnStudents = document.getElementById("tabStudents");
    const btnHomeworks = document.getElementById("tabHomeworks");
    
    if(btnStudents) btnStudents.onclick = () => { 
        document.getElementById("contentStudents").style.display="block"; 
        document.getElementById("contentHomeworks").style.display="none"; 
        btnStudents.classList.add("active");
        btnHomeworks.classList.remove("active");
    };
    
    if(btnHomeworks) btnHomeworks.onclick = () => { 
        document.getElementById("contentStudents").style.display="none"; 
        document.getElementById("contentHomeworks").style.display="block"; 
        btnHomeworks.classList.add("active");
        btnStudents.classList.remove("active");
        loadProfHomeworks(); 
    };
    
    // Actions Principales
    document.getElementById("addHomeworkBtn").onclick = () => {
        state.tempHwLevels = [];
        state.editingHomeworkId = null;
        document.getElementById("createHomeworkModal").style.display = "flex";
        renderCreateHomeworkForm();
    };
    
    // Bugs
    document.getElementById("viewBugsBtn").onclick = () => { 
        loadBugs(); 
        document.getElementById("profBugListModal").style.display = "flex"; 
    };
    document.getElementById("closeBugListBtn").onclick = () => { 
        document.getElementById("profBugListModal").style.display = "none"; 
    };
    
    // Outils Élèves
    document.getElementById("testClassBtn").onclick = createTestStudent;
    
    const filter = document.getElementById("classFilter");
    if(filter) filter.onchange = applyFiltersAndRender;
    
    const search = document.getElementById("studentSearch");
    if(search) search.oninput = applyFiltersAndRender;
    
    document.getElementById("resetAllBtn").onclick = async () => {
        if(confirm("⚠️ ATTENTION : Tout effacer ?")) { 
            await fetch("/api/reset-all-players", {method:"POST"}); 
            fetchAndRenderPlayers(); 
        }
    };
}


// ==========================================================
// 3. GESTION DES ÉLÈVES (TABLEAU DÉTAILLÉ)
// ==========================================================

async function fetchAndRenderPlayers() {
    const res = await fetch('/api/players');
    state.allPlayersData = await res.json();
    applyFiltersAndRender();
}

function applyFiltersAndRender() {
    const filter = document.getElementById("classFilter").value;
    const search = document.getElementById("studentSearch").value.toLowerCase();
    
    const filtered = state.allPlayersData.filter(p => 
        (filter === "all" || p.classroom === filter) &&
        (p.firstName.toLowerCase().includes(search) || p.lastName.toLowerCase().includes(search))
    );
    
    renderPlayersTable(filtered);
}

function renderPlayersTable(players) {
    const tbody = document.getElementById("playersBody");
    tbody.innerHTML = "";

    if (players.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#666;">Aucun élève trouvé.</td></tr>`;
        return;
    }

    // Liste des chapitres à afficher
    const chapters = [
        { key: "ch1-zombie", label: "Zombie" },
        { key: "ch4-redaction", label: "Rédaction" }
    ];

    players.forEach(p => {
        let isFirstRow = true;

        chapters.forEach(chap => {
            const tr = document.createElement("tr");
            tr.style.borderBottom = isFirstRow ? "none" : "1px solid #e2e8f0";

            // Colonnes fusionnées (Nom, Classe)
            if (isFirstRow) {
                const nameTd = document.createElement("td");
                nameTd.rowSpan = chapters.length;
                nameTd.style.fontWeight = "bold";
                nameTd.style.padding = "12px";
                nameTd.style.verticalAlign = "middle";
                nameTd.style.borderBottom = "2px solid #e2e8f0";
                nameTd.textContent = `${p.firstName} ${p.lastName}`;
                tr.appendChild(nameTd);

                const classTd = document.createElement("td");
                classTd.rowSpan = chapters.length;
                classTd.style.padding = "12px";
                classTd.style.verticalAlign = "middle";
                classTd.style.borderBottom = "2px solid #e2e8f0";
                classTd.textContent = p.classroom;
                tr.appendChild(classTd);
            }

            // Progression
            const validated = p.validatedLevels || [];
            const count = validated.filter(v => typeof v === 'string' && v.includes(chap.key.split('-')[0])).length;
            
            tr.innerHTML += `
                <td style="padding:8px 12px;">${chap.label}</td>
                <td style="padding:8px 12px;">-</td>
                <td style="padding:8px 12px;">${count > 0 ? count + ' terminé(s)' : '-'}</td>
            `;

            // Actions (Fusionnées)
            if (isFirstRow) {
                const actionTd = document.createElement("td");
                actionTd.rowSpan = chapters.length;
                actionTd.style.padding = "12px";
                actionTd.style.textAlign = "right";
                actionTd.style.verticalAlign = "middle";
                actionTd.style.borderBottom = "2px solid #e2e8f0";
                
                actionTd.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
                        <button onclick="alert('Détails activité : bientôt')" style="background:#3b82f6; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:5px;">
                            🕒 Activité
                        </button>
                        <button onclick="window.resetPlayer('${p._id}')" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px;">
                            Réinitialiser
                        </button>
                    </div>
                `;
                tr.appendChild(actionTd);
                isFirstRow = false;
            }
            tbody.appendChild(tr);
        });
    });
}


// ==========================================================
// 4. CRÉATION DEVOIR (INTERFACE VISUELLE)
// ==========================================================

function renderCreateHomeworkForm(hw = null) {
    const title = hw ? hw.title : "";
    const currentClass = hw ? hw.classroom : "Toutes";
    const modal = document.getElementById("createHomeworkModal");
    
    // Si nouveau, on ajoute une question vide
    if (!hw && state.tempHwLevels.length === 0) {
        state.tempHwLevels.push({ instruction: "", attachmentUrls: [] });
    }

    const opt = (val) => `<option value="${val}" ${currentClass===val?"selected":""}>${val}</option>`;

    modal.innerHTML = `
    <div class="modal-content" style="width:95%; max-width:900px; padding:0; background:#f8fafc; border-radius:12px; overflow:hidden; max-height:90vh; display:flex; flex-direction:column;">
        
        <!-- HEADER -->
        <div style="background:white; padding:20px; border-bottom:1px solid #e2e8f0;">
            <h3 style="margin:0; text-align:center; color:#1e293b;">${hw ? "Modifier" : "Nouveau"} Devoir</h3>
            
            <div style="display:flex; gap:15px; margin-top:15px;">
                <div style="flex:2;">
                    <label style="font-weight:bold; font-size:0.9em; color:#64748b;">Titre :</label>
                    <input id="hwTitle" value="${title}" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; margin-top:5px;">
                </div>
                <div style="flex:1;">
                    <label style="font-weight:bold; font-size:0.9em; color:#64748b;">Classe :</label>
                    <select id="hwClass" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1; margin-top:5px;">
                        ${opt("Toutes")}${opt("6D")}${opt("5B")}${opt("5C")}${opt("2A")}${opt("2CD")}
                    </select>
                </div>
            </div>
        </div>

        <!-- SCROLLABLE BODY -->
        <div style="padding:20px; overflow-y:auto; flex:1;">
            <div id="levelsContainer"></div>
            
            <button id="btnAddLvl" style="width:100%; padding:15px; background:white; color:#3b82f6; border:2px dashed #3b82f6; border-radius:8px; font-weight:bold; cursor:pointer; margin-top:10px;">
                + Ajouter une nouvelle Page / Question
            </button>
        </div>

        <!-- FOOTER -->
        <div style="background:white; padding:20px; border-top:1px solid #e2e8f0; display:flex; gap:10px; justify-content:center;">
            <button onclick="document.getElementById('createHomeworkModal').style.display='none'" style="background:#94a3b8; color:white; border:none; padding:12px 30px; border-radius:8px; font-weight:bold; cursor:pointer;">Annuler</button>
            <button id="btnSaveHw" style="background:#16a34a; color:white; border:none; padding:12px 30px; border-radius:8px; font-weight:bold; cursor:pointer;">✅ ENREGISTRER</button>
        </div>
    </div>`;

    renderLevelsInputs();

    modal.querySelector("#btnAddLvl").onclick = () => { 
        state.tempHwLevels.push({ instruction: "", attachmentUrls: [] }); 
        renderLevelsInputs(); 
    };
    
    modal.querySelector("#btnSaveHw").onclick = async () => {
        const titleVal = document.getElementById("hwTitle").value;
        const clsVal = document.getElementById("hwClass").value;
        
        // Sauvegarde des textes
        state.tempHwLevels.forEach((lvl, i) => { 
            const el = document.getElementById(`lvlInst-${i}`);
            if(el) lvl.instruction = el.value; 
        });

        await saveHomework({ 
            id: state.editingHomeworkId, 
            title: titleVal, 
            classroom: clsVal, 
            levels: state.tempHwLevels 
        }, !!state.editingHomeworkId);
        
        modal.style.display='none';
        loadProfHomeworks();
    };
}

// Fonction de rendu des zones (Ligne 1 / Ligne 2)
function renderLevelsInputs() {
    const container = document.getElementById("levelsContainer");
    if(!container) return;
    container.innerHTML = "";
    
    state.tempHwLevels.forEach((lvl, idx) => {
        const breakIndex = lvl.attachmentUrls.indexOf("BREAK");
        const topDocs = breakIndex === -1 ? lvl.attachmentUrls : lvl.attachmentUrls.slice(0, breakIndex);
        const bottomDocs = breakIndex === -1 ? [] : lvl.attachmentUrls.slice(breakIndex + 1);

        const div = document.createElement("div");
        div.style.cssText = "border:1px solid #cbd5e1; padding:20px; margin-bottom:20px; background:white; border-radius:12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); position:relative;";

        // En-tête Question
        let headerHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h4 style="margin:0; color:#1e293b;">Question ${idx + 1}</h4>
                <button onclick="removeLevel(${idx})" style="color:#ef4444; border:none; background:white; font-weight:bold; cursor:pointer; padding:5px 10px; border:1px solid #fee2e2; border-radius:4px;">Supprimer</button>
            </div>
            <textarea id="lvlInst-${idx}" style="width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:6px; margin-bottom:20px; font-family:inherit;" placeholder="Consigne de la question...">${lvl.instruction}</textarea>
        `;

        // Générateur de zone visuelle
        const renderZone = (docs, label, pct, id) => {
            let zHtml = `
                <div style="background:#f8fafc; padding:15px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:10px;">
                    <div style="font-size:0.8em; font-weight:bold; color:#64748b; margin-bottom:10px; text-transform:uppercase;">${label} (${pct})</div>
                    
                    <div style="background:white; border:2px dashed #cbd5e1; border-radius:6px; padding:10px; min-height:80px; display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:center;">
                        ${docs.length === 0 ? `<span style="color:#cbd5e1;">... ou ici</span>` : ''}
                        
                        ${docs.map(u => {
                            const isPdf = u.endsWith('.pdf');
                            return `
                            <div style="width:80px; height:80px; position:relative; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; background:white;">
                                ${isPdf 
                                    ? '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#64748b; font-weight:bold;">PDF</div>' 
                                    : `<img src="${u}" style="width:100%; height:100%; object-fit:cover;">`
                                }
                                <div onclick="removeDoc(${idx}, '${u}')" style="position:absolute; top:0; right:0; background:#ef4444; color:white; width:20px; height:20px; text-align:center; line-height:20px; cursor:pointer; font-size:12px;">×</div>
                            </div>`;
                        }).join('')}
                    </div>

                    <!-- Barre d'outils AJOUT -->
                    <div style="display:flex; gap:10px; margin-top:10px;">
                        <label class="action-btn" style="background:#3b82f6; padding:6px 12px; font-size:13px; border-radius:4px; flex:1; text-align:center; cursor:pointer;">
                            📁 Fichier
                            <input type="file" onchange="uploadFileToZone(this, ${idx}, '${id}')" style="display:none;" accept="image/*,.pdf">
                        </label>
                        <div style="flex:2; display:flex;">
                            <input id="input-${id}-${idx}" placeholder="Ou coller URL..." style="flex:1; border:1px solid #cbd5e1; border-radius:4px 0 0 4px; padding:5px;">
                            <button onclick="addDocToZone(${idx}, '${id}')" style="background:#e2e8f0; border:1px solid #cbd5e1; border-left:none; padding:0 10px; border-radius:0 4px 4px 0; cursor:pointer;">OK</button>
                        </div>
                    </div>
                </div>
            `;
            return zHtml;
        };

        div.innerHTML = headerHtml + renderZone(topDocs, 'LIGNE 1 (HAUT)', '75%', 'top') + renderZone(bottomDocs, 'LIGNE 2 (BAS)', '25%', 'bottom');
        container.appendChild(div);
    });
}

// ==========================================================
// 4. AUTRES FONCTIONS (BUGS, TEST...)
// ==========================================================
async function loadProfHomeworks() {
    const tbody = document.getElementById("profHomeworksBody");
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center'>Chargement...</td></tr>";
    
    try {
        const list = await getHomeworks();
        if(list.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center'>Aucun devoir créé.</td></tr>";
            return;
        }
        tbody.innerHTML = list.map(h => `
            <tr>
                <td style="padding:12px;">${new Date(h.date).toLocaleDateString()}</td>
                <td style="padding:12px; font-weight:bold;">${h.title}</td>
                <td style="padding:12px;"><span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:12px; font-size:12px;">${h.classroom}</span></td>
                <td style="padding:12px;">${h.levels.length} Q</td>
                <td style="padding:12px;">
                    <button onclick='state.editingHomeworkId="${h._id}"; state.tempHwLevels=${JSON.stringify(h.levels)}; document.getElementById("createHomeworkModal").style.display="flex"; renderCreateHomeworkForm({title:"${h.title}", classroom:"${h.classroom}"})' style="cursor:pointer; background:#f59e0b; color:white; border:none; padding:5px 10px; border-radius:4px; margin-right:5px;">Modifier</button>
                    <button onclick="deleteHomework('${h._id}')" style="cursor:pointer; background:#fee2e2; color:#b91c1c; border:none; padding:5px 10px; border-radius:4px;">🗑️</button>
                </td>
            </tr>`).join('');
    } catch(e) { tbody.innerHTML = "<tr><td colspan='5' style='color:red'>Erreur serveur.</td></tr>"; }
}

async function loadBugs() {
    const res = await fetch("/api/bugs");
    const list = await res.json();
    document.getElementById("bugsBody").innerHTML = list.length ? list.map(b => `
        <tr>
            <td style="padding:10px;">${new Date(b.date).toLocaleDateString()}</td>
            <td style="padding:10px;">${b.reporterName}</td>
            <td style="padding:10px;">${b.description}</td>
            <td style="padding:10px;"><button onclick="deleteBug('${b._id}')" style="color:red; border:none; background:none; cursor:pointer;">X</button></td>
        </tr>`).join('') : "<tr><td colspan='4' style='text-align:center; padding:10px;'>Aucun bug.</td></tr>";
}

async function createTestStudent() {
    const cls = document.getElementById("classFilter").value;
    if(cls === "all") return alert("Sélectionnez d'abord une classe précise (ex: 5B) dans le menu déroulant.");
    
    if(confirm(`Créer un compte 'Eleve Test' en ${cls} et s'y connecter ?`)) {
        await fetch("/api/register", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({firstName:"Eleve", lastName:"Test", classroom:cls}) });
        const d = await (await fetch("/api/register", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({firstName:"Eleve", lastName:"Test", classroom:cls}) })).json();
        localStorage.setItem("player", JSON.stringify(d));
        window.location.reload();
    }
}