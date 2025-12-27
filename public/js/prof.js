import { state } from './state.js';
import { uploadFile, saveHomework, getHomeworks, fetchPlayers } from './api.js';

// ==========================================================
// 1. FONCTIONS GLOBALES (HTML DYNAMIQUE)
// ==========================================================

// --- DRAG & DROP (RÉORGANISER DOCUMENTS) ---
window.allowDrop = function(ev) {
    ev.preventDefault();
    ev.currentTarget.style.background = "#e0f2fe"; // Feedback visuel bleu
};

window.dragleave = function(ev) {
    ev.currentTarget.style.background = "white";
};

window.dragStartDoc = function(ev, lvlIdx, zoneId, docIndex) {
    ev.dataTransfer.setData("lvlIdx", lvlIdx);
    ev.dataTransfer.setData("zoneId", zoneId);
    ev.dataTransfer.setData("docIndex", docIndex);
    ev.dataTransfer.effectAllowed = "move";
};

window.dropDoc = function(ev, destLvlIdx, destZoneId, destIndex) {
    ev.preventDefault();
    ev.currentTarget.style.background = "white";

    const srcLvlIdx = parseInt(ev.dataTransfer.getData("lvlIdx"));
    const srcZoneId = ev.dataTransfer.getData("zoneId");
    const srcDocIndex = parseInt(ev.dataTransfer.getData("docIndex"));

    // On ne déplace que dans la même question pour simplifier (et éviter de perdre des données)
    if (srcLvlIdx !== destLvlIdx) return;

    const lvl = state.tempHwLevels[srcLvlIdx];
    
    // Récupération des listes
    // Note : Actuellement la Ligne 2 (questionImage) est une string unique, 
    // donc le Drag n'est pertinent que pour la Ligne 1 (Liste).
    // On va supposer qu'on réorganise la Ligne 1.
    
    const breakIndex = lvl.attachmentUrls.indexOf("BREAK");
    // Extraction Ligne 1 (Top)
    let topDocs = breakIndex === -1 ? lvl.attachmentUrls : lvl.attachmentUrls.slice(0, breakIndex);
    // Extraction Ligne 2 (Bottom) - s'il y a des docs supplémentaires
    let bottomDocs = breakIndex === -1 ? [] : lvl.attachmentUrls.slice(breakIndex + 1);

    // On travaille sur la liste source
    let sourceList = (srcZoneId === 'top') ? topDocs : bottomDocs;
    
    // On déplace l'élément
    if (srcDocIndex >= 0 && srcDocIndex < sourceList.length) {
        const item = sourceList.splice(srcDocIndex, 1)[0];
        
        // Si on drop sur "top", on l'insère au bon endroit
        if (destZoneId === 'top') {
            if (destIndex === null) topDocs.push(item); // A la fin
            else topDocs.splice(destIndex, 0, item);
        }
    }

    // Reconstitution
    if (bottomDocs.length > 0) lvl.attachmentUrls = [...topDocs, "BREAK", ...bottomDocs];
    else lvl.attachmentUrls = topDocs;

    renderLevelsInputs();
};

// --- UPLOAD ---
window.uploadFileToZone = async function(inputEl, lvlIdx, zoneId) {
    if (!inputEl.files || inputEl.files.length === 0) return;
    
    const label = inputEl.parentElement;
    const originalText = label.innerText;
    label.innerHTML = "⏳ Upload..."; // Feedback

    // Boucle sur TOUS les fichiers (Multi-upload)
    for (let i = 0; i < inputEl.files.length; i++) {
        const file = inputEl.files[i];
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            
            if (data.ok && data.imageUrl) {
                pushDocToState(lvlIdx, zoneId, data.imageUrl);
            } else {
                console.error("Erreur upload fichier", file.name);
            }
        } catch (e) {
            console.error(e);
            alert("Erreur réseau upload");
        }
    }
    // Pas besoin de reset manuel, le render le fera
};

window.addDocToZone = function(lvlIdx, zoneId) {
    const input = document.getElementById(`input-${zoneId}-${lvlIdx}`);
    if (!input) return;
    const url = input.value.trim();
    if(url) pushDocToState(lvlIdx, zoneId, url);
};

function pushDocToState(lvlIdx, zoneId, url) {
    const lvl = state.tempHwLevels[lvlIdx];
    if (zoneId === 'top') {
        lvl.attachmentUrls.push(url);
    } else {
        lvl.questionImage = url;
    }
    renderLevelsInputs();
}

window.removeDoc = function(lvlIdx, url, zone) {
    const lvl = state.tempHwLevels[lvlIdx];
    if (zone === 'top') {
        const idx = lvl.attachmentUrls.indexOf(url);
        if (idx > -1) lvl.attachmentUrls.splice(idx, 1);
    } else {
        lvl.questionImage = null;
    }
    renderLevelsInputs();
};

window.removeLevel = function(idx) { 
    state.tempHwLevels.splice(idx, 1); 
    renderLevelsInputs(); 
};

// --- GESTION LISTES ---

// Correction MODIFIER : Utilise l'index pour éviter les bugs de string
window.openEditModalByIndex = function(index) {
    try {
        const hw = state.homeworksList[index];
        if (!hw) return alert("Erreur: Devoir introuvable.");

        state.editingHomeworkId = hw._id;
        state.tempHwLevels = JSON.parse(JSON.stringify(hw.levels));
        
        document.getElementById("createHomeworkModal").style.display = "flex";
        renderCreateHomeworkForm(hw);
    } catch(e) {
        console.error(e);
        alert("Erreur ouverture édition.");
    }
};

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
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({playerId:id})
        }); 
        fetchAndRenderPlayers(); 
    } 
};

// ==========================================================
// 2. INIT & DASHBOARD
// ==========================================================
export function initProfDashboard() {
    const dashboard = document.getElementById("profDashboard");
    if(dashboard) dashboard.style.display = "block";
    
    fetchAndRenderPlayers();

    // Onglets
    document.getElementById("tabStudents").onclick = () => { 
        document.getElementById("contentStudents").style.display="block"; 
        document.getElementById("contentHomeworks").style.display="none"; 
        document.getElementById("tabStudents").classList.add("active");
        document.getElementById("tabHomeworks").classList.remove("active");
    };
    document.getElementById("tabHomeworks").onclick = () => { 
        document.getElementById("contentStudents").style.display="none"; 
        document.getElementById("contentHomeworks").style.display="block"; 
        document.getElementById("tabHomeworks").classList.add("active");
        document.getElementById("tabStudents").classList.remove("active");
        loadProfHomeworks(); 
    };

    // Actions
    document.getElementById("addHomeworkBtn").onclick = () => {
        state.tempHwLevels = []; 
        state.editingHomeworkId = null; 
        document.getElementById("createHomeworkModal").style.display = "flex";
        renderCreateHomeworkForm();
    };
    
    document.getElementById("viewBugsBtn").onclick = () => { loadBugs(); document.getElementById("profBugListModal").style.display="flex"; };
    document.getElementById("closeBugListBtn").onclick = () => { document.getElementById("profBugListModal").style.display="none"; };
    
    // --- TESTER CLASSE CORRIGÉ ---
    const btnTest = document.getElementById("testClassBtn");
    if(btnTest) {
        btnTest.onclick = async () => {
            const select = document.getElementById("classFilter");
            const cls = select ? select.value : "all";
            
            if(cls === "all") return alert("Sélectionnez d'abord une classe précise (ex: 5B).");
            
            try {
                const res = await fetch("/api/register", { 
                    method:"POST", headers:{"Content-Type":"application/json"}, 
                    body:JSON.stringify({firstName:"Eleve", lastName:"Test", classroom:cls}) 
                });
                
                const d = await res.json();
                if(d.ok) {
                    localStorage.setItem("player", JSON.stringify(d));
                    window.location.reload();
                } else {
                    alert("Erreur création: " + d.error);
                }
            } catch(e) { console.error(e); alert("Erreur réseau"); }
        };
    }

    document.getElementById("classFilter").onchange = applyFiltersAndRender;
    document.getElementById("studentSearch").oninput = applyFiltersAndRender;
    document.getElementById("resetAllBtn").onclick = async () => { 
        if(confirm("⚠️ TOUT effacer ?")) { 
            await fetch("/api/reset-all-players", {method:"POST"}); 
            fetchAndRenderPlayers(); 
        } 
    };
}

// ==========================================================
// 3. RENDU FORMULAIRE (DRAG & DROP + MULTI-UPLOAD)
// ==========================================================
function renderCreateHomeworkForm(hw = null) {
    const title = hw ? hw.title : "";
    const currentClass = hw ? hw.classroom : "Toutes";
    const modal = document.getElementById("createHomeworkModal");
    
    if (!hw && state.tempHwLevels.length === 0) {
        state.tempHwLevels.push({ instruction: "", aiPrompt: "", attachmentUrls: [], questionImage: null });
    }

    const opt = (val) => `<option value="${val}" ${currentClass===val?"selected":""}>${val}</option>`;

    modal.innerHTML = `
    <div class="modal-content" style="width:95%; max-width:900px; padding:20px; background:white; border-radius:12px; max-height:90vh; overflow-y:auto;">
        <h3>${hw ? "Modifier" : "Nouveau"} Devoir</h3>
        <div style="margin-bottom:15px;"><label>Titre :</label><input id="hwTitle" value="${title}" style="width:100%; padding:8px; border:1px solid #ccc;"></div>
        <div style="margin-bottom:15px;"><label>Classe :</label><select id="hwClass" style="width:100%; padding:8px; border:1px solid #ccc;">${opt("Toutes")}${opt("6D")}${opt("5B")}${opt("5C")}${opt("2A")}${opt("2CD")}</select></div>
        
        <div id="levelsContainer"></div>
        <button id="btnAddLvl" style="width:100%; padding:10px; margin-top:10px; background:#e0f2fe; color:#0369a1; border:1px dashed #0369a1;">+ Ajouter Question</button>
        
        <div style="margin-top:20px; text-align:right;">
            <button onclick="document.getElementById('createHomeworkModal').style.display='none'" style="margin-right:10px;">Annuler</button>
            <button id="btnSaveHw" style="background:#16a34a; color:white; padding:10px;">Enregistrer</button>
        </div>
    </div>`;

    renderLevelsInputs();
    modal.querySelector("#btnAddLvl").onclick = () => { state.tempHwLevels.push({instruction:"", aiPrompt:"", attachmentUrls:[], questionImage:null}); renderLevelsInputs(); };
    modal.querySelector("#btnSaveHw").onclick = saveForm;
}

window.renderLevelsInputs = function() {
    const container = document.getElementById("levelsContainer");
    if(!container) return;
    container.innerHTML = "";
    
    state.tempHwLevels.forEach((lvl, idx) => {
        const div = document.createElement("div");
        div.style.cssText = "border:1px solid #ccc; padding:15px; margin-bottom:20px; background:#f9f9f9; border-radius:8px;";

        const renderTop = () => `
            <div style="margin-bottom:15px; border-bottom:1px dashed #ccc; padding-bottom:15px;"
                 ondrop="window.dropDoc(event, ${idx}, 'top', null)" 
                 ondragover="window.allowDrop(event)"
                 ondragleave="window.dragleave(event)">
                 
                <strong style="color:#2563eb;">LIGNE 1 : Documents (Haut) - Glissez pour trier</strong>
                
                <div style="display:flex; flex-wrap:wrap; gap:10px; margin:10px 0; min-height:60px; background:white; padding:10px; border:1px solid #ddd;">
                    ${lvl.attachmentUrls.length === 0 ? '<span style="color:#aaa;">Aucun document</span>' : ''}
                    
                    ${lvl.attachmentUrls.map((u, docIdx) => `
                        <div draggable="true" 
                             ondragstart="window.dragStartDoc(event, ${idx}, 'top', ${docIdx})"
                             ondrop="event.stopPropagation(); window.dropDoc(event, ${idx}, 'top', ${docIdx})"
                             style="position:relative; width:60px; height:60px; border:1px solid #ccc; cursor:grab;">
                             
                            ${u.endsWith('.pdf') ? '<div style="font-size:30px; text-align:center;">📄</div>' : `<img src="${u}" style="width:100%; height:100%; object-fit:cover;">`}
                            
                            <button onclick="removeDoc(${idx}, '${u}', 'top')" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border:none; border-radius:50%; width:20px; height:20px; cursor:pointer;">x</button>
                        </div>
                    `).join('')}
                </div>
                
                <div style="display:flex; gap:10px;">
                    <label style="background:#3b82f6; color:white; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:13px;">
                        📂 Ajouter Fichiers
                        <!-- MULTIPLE ACTIVE -->
                        <input type="file" multiple onchange="uploadFileToZone(this, ${idx}, 'top')" style="display:none;" accept="image/*,.pdf">
                    </label>
                    <input id="input-top-${idx}" placeholder="Ou coller URL" style="border:1px solid #ccc; padding:4px;">
                    <button onclick="addDocToZone(${idx}, 'top')">OK</button>
                </div>
            </div>`;

        const renderBottom = () => `
            <div>
                <strong style="color:#2563eb;">LIGNE 2 : Question (Bas)</strong>
                <div style="display:flex; gap:20px; margin-top:10px;">
                    <div style="width:150px; text-align:center;">
                        <div style="width:100%; height:100px; background:white; border:1px solid #ccc; display:flex; align-items:center; justify-content:center; overflow:hidden; margin-bottom:5px;">
                            ${lvl.questionImage ? 
                                `<img src="${lvl.questionImage}" style="width:100%; height:100%; object-fit:contain;">` : 
                                `<span style="color:#aaa;">Aucune image</span>`
                            }
                        </div>
                        ${lvl.questionImage ? 
                            `<button onclick="removeDoc(${idx}, null, 'bottom')" style="color:red;">Supprimer</button>` :
                            `<label style="color:#2563eb; cursor:pointer; text-decoration:underline;">
                                Ajouter Image
                                <input type="file" onchange="uploadFileToZone(this, ${idx}, 'bottom')" style="display:none;" accept="image/*">
                            </label>`
                        }
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column; gap:10px;">
                        <div>
                            <label style="font-weight:bold; font-size:0.9em;">Texte de la Question :</label>
                            <textarea id="lvlInst-${idx}" style="width:100%; height:50px; padding:5px; border:1px solid #ccc;">${lvl.instruction || ''}</textarea>
                        </div>
                        <div>
                            <label style="font-weight:bold; font-size:0.9em;">Message pour l'IA (Secret) :</label>
                            <textarea id="lvlPrompt-${idx}" style="width:100%; height:50px; padding:5px; border:1px solid #ccc; background:#f0f9ff;" placeholder="Ex: Vérifie la date...">${lvl.aiPrompt || ''}</textarea>
                        </div>
                    </div>
                </div>
            </div>`;

        div.innerHTML = `<div style="display:flex; justify-content:space-between;"><h4>Page ${idx+1}</h4> <button onclick="removeLevel(${idx})" style="color:red;">Suppr</button></div>${renderTop()}${renderBottom()}`;
        container.appendChild(div);
    });
};

async function saveForm() {
    const titleVal = document.getElementById("hwTitle").value;
    const clsVal = document.getElementById("hwClass").value;
    state.tempHwLevels.forEach((lvl, i) => { 
        lvl.instruction = document.getElementById(`lvlInst-${i}`).value; 
        lvl.aiPrompt = document.getElementById(`lvlPrompt-${i}`).value;
    });
    await saveHomework({ id: state.editingHomeworkId, title: titleVal, classroom: clsVal, levels: state.tempHwLevels }, !!state.editingHomeworkId);
    document.getElementById('createHomeworkModal').style.display='none';
    loadProfHomeworks();
}

// --- CHARGEMENT LISTE ---
async function loadProfHomeworks() {
    const tbody = document.getElementById("profHomeworksBody");
    tbody.innerHTML = "<tr><td colspan='5'>Chargement...</td></tr>";
    
    try {
        const list = await getHomeworks();
        state.homeworksList = list; // STOCKAGE EN MEMOIRE

        if (list.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center'>Aucun devoir.</td></tr>";
            return;
        }

        tbody.innerHTML = list.map((h, index) => `
            <tr>
                <td style="padding:12px;">${new Date(h.date).toLocaleDateString()}</td>
                <td style="padding:12px; font-weight:bold;">${h.title}</td>
                <td style="padding:12px;"><span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:12px; font-size:12px;">${h.classroom}</span></td>
                <td style="padding:12px;">${h.levels.length} Q</td>
                <td style="padding:12px;">
                    <button onclick="window.openEditModalByIndex(${index})" style="cursor:pointer; background:#f59e0b; color:white; border:none; padding:5px 10px; border-radius:4px; margin-right:5px;">Modif</button>
                    <button onclick="deleteHomework('${h._id}')" style="cursor:pointer; background:#fee2e2; color:#b91c1c; border:none; padding:5px 10px; border-radius:4px;">🗑️</button>
                </td>
            </tr>`).join('');
    } catch(e) { tbody.innerHTML = "<tr><td colspan='5' style='color:red'>Erreur serveur.</td></tr>"; }
}

async function fetchAndRenderPlayers() { 
    const list = await fetchPlayers(); state.allPlayersData = list; applyFiltersAndRender(); 
}
function applyFiltersAndRender() { 
    const f=document.getElementById("classFilter").value; const s=document.getElementById("studentSearch").value.toLowerCase();
    const l=state.allPlayersData.filter(p=>(f==="all"||p.classroom===f)&&(p.firstName.toLowerCase().includes(s)||p.lastName.toLowerCase().includes(s)));
    document.getElementById("playersBody").innerHTML = l.map(p=>`<tr><td style="padding:10px;">${p.firstName} ${p.lastName}</td><td style="padding:10px;">${p.classroom}</td><td style="padding:10px;">-</td><td style="padding:10px;">-</td><td style="padding:10px;">-</td><td style="padding:10px;"><button onclick="resetPlayer('${p._id}')" style="cursor:pointer; background:#fee2e2; color:#b91c1c; border:none; padding:5px 10px; border-radius:4px;">Reset</button></td></tr>`).join(''); 
}
async function loadBugs() { const l=await (await fetch("/api/bugs")).json(); document.getElementById("bugsBody").innerHTML=l.map(b=>`<tr><td>${b.description}</td><td><button onclick="deleteBug('${b._id}')">X</button></td></tr>`).join(''); }