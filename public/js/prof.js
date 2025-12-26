import { state } from './state.js';
import { uploadFile, saveHomework, getHomeworks, fetchPlayers } from './api.js';

// ==========================================================
// 1. FONCTIONS GLOBALES (DRAG & DROP + ACTIONS)
// ==========================================================

// --- DRAG & DROP LOGIC ---
window.allowDrop = function(ev) {
    ev.preventDefault(); // Nécessaire pour autoriser le drop
    ev.currentTarget.style.background = "#e0f2fe"; // Feedback visuel
};

window.dragleave = function(ev) {
    ev.currentTarget.style.background = "white";
};

window.drag = function(ev, lvlIdx, zoneId, itemIdx) {
    // On stocke les infos de l'élément déplacé
    ev.dataTransfer.setData("lvlIdx", lvlIdx);
    ev.dataTransfer.setData("srcZone", zoneId);
    ev.dataTransfer.setData("srcItemIdx", itemIdx);
};

window.drop = function(ev, destLvlIdx, destZoneId) {
    ev.preventDefault();
    ev.currentTarget.style.background = "white";

    const srcLvlIdx = parseInt(ev.dataTransfer.getData("lvlIdx"));
    const srcZone = ev.dataTransfer.getData("srcZone");
    const srcItemIdx = parseInt(ev.dataTransfer.getData("srcItemIdx"));

    // Sécurité
    if (srcLvlIdx !== destLvlIdx) return; // On ne déplace pas entre questions différentes pour l'instant

    const lvl = state.tempHwLevels[srcLvlIdx];
    const breakIndex = lvl.attachmentUrls.indexOf("BREAK");
    
    // Récupération des tableaux actuels
    const topDocs = breakIndex === -1 ? lvl.attachmentUrls : lvl.attachmentUrls.slice(0, breakIndex);
    const bottomDocs = breakIndex === -1 ? [] : lvl.attachmentUrls.slice(breakIndex + 1);

    // 1. Retirer l'élément de la source
    let item;
    if (srcZone === 'top') {
        item = topDocs.splice(srcItemIdx, 1)[0];
    } else {
        item = bottomDocs.splice(srcItemIdx, 1)[0];
    }

    // 2. Ajouter l'élément à la destination
    if (destZoneId === 'top') {
        topDocs.push(item);
    } else {
        bottomDocs.push(item);
    }

    // 3. Reconstruire le tableau unique
    if (bottomDocs.length > 0) {
        lvl.attachmentUrls = [...topDocs, "BREAK", ...bottomDocs];
    } else {
        lvl.attachmentUrls = topDocs;
    }

    // 4. Rafraîchir
    renderLevelsInputs();
};

// --- AUTRES ACTIONS ---
window.addDocToZone = function(lvlIdx, zoneId) {
    const input = document.getElementById(`input-${zoneId}-${lvlIdx}`);
    if (!input) return;
    const url = input.value.trim();
    if(!url) return; 
    pushDocToState(lvlIdx, zoneId, url);
};

window.uploadFileToZone = async function(inputEl, lvlIdx, zoneId) {
    if (!inputEl.files || inputEl.files.length === 0) return;
    const file = inputEl.files[0];
    const formData = new FormData();
    formData.append('file', file);

    inputEl.parentElement.innerHTML += " ⏳";
    
    try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.ok) pushDocToState(lvlIdx, zoneId, data.imageUrl);
        else alert("Erreur upload");
    } catch (e) { alert("Erreur réseau"); }
};

function pushDocToState(lvlIdx, zoneId, url) {
    const lvl = state.tempHwLevels[lvlIdx];
    const breakIndex = lvl.attachmentUrls.indexOf("BREAK");
    const top = breakIndex === -1 ? lvl.attachmentUrls : lvl.attachmentUrls.slice(0, breakIndex);
    const bottom = breakIndex === -1 ? [] : lvl.attachmentUrls.slice(breakIndex + 1);

    if (zoneId === "top") top.push(url); else bottom.push(url);
    lvl.attachmentUrls = bottom.length > 0 ? [...top, "BREAK", ...bottom] : top;
    renderLevelsInputs();
}

window.removeDoc = function(lvlIdx, url) {
    const lvl = state.tempHwLevels[lvlIdx];
    const idx = lvl.attachmentUrls.indexOf(url);
    if(idx > -1) lvl.attachmentUrls.splice(idx, 1);
    renderLevelsInputs();
};

window.removeLevel = function(idx) { state.tempHwLevels.splice(idx, 1); renderLevelsInputs(); };

// --- ACTIONS LISTES ---
window.deleteHomework = async (id) => { if(confirm("Supprimer ?")) { await fetch(`/api/homework/${id}`, { method: 'DELETE' }); loadProfHomeworks(); } };
window.deleteBug = async (id) => { await fetch(`/api/bugs/${id}`, { method: 'DELETE' }); loadBugs(); };
window.resetPlayer = async (id) => { if(confirm("Reset ?")) { await fetch("/api/reset-player", {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:id})}); fetchAndRenderPlayers(); } };


// ==========================================================
// 2. INIT & DASHBOARD
// ==========================================================
export function initProfDashboard() {
    state.$("#profDashboard").style.display = "block";
    fetchAndRenderPlayers();

    state.$("#tabStudents").onclick = () => { state.$("#contentStudents").style.display="block"; state.$("#contentHomeworks").style.display="none"; state.$("#tabStudents").classList.add("active"); state.$("#tabHomeworks").classList.remove("active"); };
    state.$("#tabHomeworks").onclick = () => { state.$("#contentStudents").style.display="none"; state.$("#contentHomeworks").style.display="block"; state.$("#tabHomeworks").classList.add("active"); state.$("#tabStudents").classList.remove("active"); loadProfHomeworks(); };

    state.$("#addHomeworkBtn").onclick = () => {
        state.tempHwLevels = []; state.editingHomeworkId = null;
        state.$("#createHomeworkModal").style.display = "flex";
        renderCreateHomeworkForm();
    };

    state.$("#viewBugsBtn").onclick = () => { loadBugs(); state.$("#profBugListModal").style.display="flex"; };
    state.$("#closeBugListBtn").onclick = () => { state.$("#profBugListModal").style.display="none"; };
    
    state.$("#testClassBtn").onclick = createTestStudent;
    state.$("#classFilter").onchange = applyFiltersAndRender;
    state.$("#studentSearch").oninput = applyFiltersAndRender;
    state.$("#resetAllBtn").onclick = async () => { if(confirm("TOUT effacer ?")) { await fetch("/api/reset-all-players", {method:"POST"}); fetchAndRenderPlayers(); } };
}

// ==========================================================
// 3. LOGIQUE SANS POPUP (TEST STUDENT)
// ==========================================================
async function createTestStudent() {
    const cls = state.$("#classFilter").value;
    if(cls === "all") return alert("Sélectionnez d'abord une classe précise (ex: 5B).");
    
    // PLUS DE CONFIRM() ICI, ACTION DIRECTE
    await fetch("/api/register", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({firstName:"Eleve", lastName:"Test", classroom:cls}) });
    const d = await (await fetch("/api/register", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({firstName:"Eleve", lastName:"Test", classroom:cls}) })).json();
    localStorage.setItem("player", JSON.stringify(d));
    window.location.reload();
}

// ==========================================================
// 4. RENDU FORMULAIRE (DRAG & DROP ACTIF)
// ==========================================================
function renderCreateHomeworkForm(hw = null) {
    const title = hw ? hw.title : "";
    const currentClass = hw ? hw.classroom : "Toutes";
    const modal = state.$("#createHomeworkModal");
    if (!hw && state.tempHwLevels.length === 0) state.tempHwLevels.push({ instruction: "", attachmentUrls: [] });

    const opt = (val) => `<option value="${val}" ${currentClass===val?"selected":""}>${val}</option>`;

    modal.innerHTML = `
    <div class="modal-content" style="width:95%; max-width:900px; padding:20px; background:white; border-radius:12px; max-height:90vh; overflow-y:auto;">
        <h3 style="margin-top:0;">${hw ? "Modifier" : "Nouveau"} Devoir</h3>
        <div style="margin-bottom:15px;"><label>Titre :</label><input id="hwTitle" value="${title}" style="width:100%; padding:8px; border:1px solid #ccc;"></div>
        <div style="margin-bottom:15px;"><label>Classe :</label><select id="hwClass" style="width:100%; padding:8px;">${opt("Toutes")}${opt("6D")}${opt("5B")}${opt("5C")}${opt("2A")}${opt("2CD")}</select></div>
        
        <div id="levelsContainer"></div>
        <button id="btnAddLvl" style="width:100%; padding:10px; margin-top:10px; background:#e0f2fe; color:#0369a1; border:1px dashed #0369a1;">+ Ajouter Page</button>
        
        <div style="margin-top:20px; text-align:right;">
            <button onclick="document.getElementById('createHomeworkModal').style.display='none'" style="margin-right:10px;">Annuler</button>
            <button id="btnSaveHw" style="background:#16a34a; color:white; padding:8px 20px; border:none;">Enregistrer</button>
        </div>
    </div>`;

    renderLevelsInputs();
    modal.querySelector("#btnAddLvl").onclick = () => { state.tempHwLevels.push({instruction:"", attachmentUrls:[]}); renderLevelsInputs(); };
    modal.querySelector("#btnSaveHw").onclick = async () => {
        const titleVal = document.getElementById("hwTitle").value;
        const clsVal = document.getElementById("hwClass").value;
        state.tempHwLevels.forEach((lvl, i) => { const el = document.getElementById(`lvlInst-${i}`); if(el) lvl.instruction = el.value; });
        await saveHomework({ id: state.editingHomeworkId, title: titleVal, classroom: clsVal, levels: state.tempHwLevels }, !!state.editingHomeworkId);
        modal.style.display='none'; loadProfHomeworks();
    };
}

window.renderLevelsInputs = function() {
    const container = document.getElementById("levelsContainer");
    if(!container) return;
    container.innerHTML = "";
    
    state.tempHwLevels.forEach((lvl, idx) => {
        const breakIndex = lvl.attachmentUrls.indexOf("BREAK");
        const topDocs = breakIndex === -1 ? lvl.attachmentUrls : lvl.attachmentUrls.slice(0, breakIndex);
        const bottomDocs = breakIndex === -1 ? [] : lvl.attachmentUrls.slice(breakIndex + 1);

        const renderZone = (docs, label, zoneId) => `
            <div style="background:#f9f9f9; padding:10px; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:10px;" 
                 ondrop="window.drop(event, ${idx}, '${zoneId}')" 
                 ondragover="window.allowDrop(event)" 
                 ondragleave="window.dragleave(event)">
                <div style="font-weight:bold; font-size:0.9em; color:#64748b; margin-bottom:5px;">${label}</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px; min-height:60px;">
                    ${docs.length === 0 ? '<span style="color:#ccc; font-size:0.8em; align-self:center;">Glissez des fichiers ici</span>' : ''}
                    ${docs.map((u, itemIdx) => `
                        <div draggable="true" ondragstart="window.drag(event, ${idx}, '${zoneId}', ${itemIdx})" 
                             style="width:60px; height:60px; position:relative; cursor:grab; border:1px solid #ccc; background:white; display:flex; align-items:center; justify-content:center;">
                            ${u.endsWith('.pdf') ? '📄' : `<img src="${u}" style="width:100%; height:100%; object-fit:cover;">`}
                            <div onclick="removeDoc(${idx}, '${u}')" style="position:absolute; top:-5px; right:-5px; background:red; color:white; width:15px; height:15px; font-size:10px; border-radius:50%; text-align:center; line-height:15px; cursor:pointer;">x</div>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top:5px; display:flex; gap:5px;">
                    <label style="background:#3b82f6; color:white; padding:4px 8px; font-size:12px; border-radius:4px; cursor:pointer;">📂 <input type="file" onchange="uploadFileToZone(this, ${idx}, '${zoneId}')" style="display:none;" accept="image/*,.pdf"></label>
                </div>
            </div>`;

        const div = document.createElement("div");
        div.style.cssText = "border:1px solid #ccc; padding:15px; margin-bottom:15px; background:white; border-radius:8px;";
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><strong>Question ${idx+1}</strong> <button onclick="removeLevel(${idx})" style="color:red; border:none; background:none; cursor:pointer;">🗑️</button></div>
            <textarea id="lvlInst-${idx}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; margin-bottom:10px;" placeholder="Consigne...">${lvl.instruction}</textarea>
            ${renderZone(topDocs, 'ZONE HAUTE', 'top')}
            ${renderZone(bottomDocs, 'ZONE BASSE', 'bottom')}
        `;
        container.appendChild(div);
    });
};

// ... (Garde les fonctions loadProfHomeworks, fetchAndRenderPlayers, loadBugs identiques) ...
async function loadProfHomeworks() { const r=await getHomeworks(); state.$("#profHomeworksBody").innerHTML=r.map(h=>`<tr><td>${h.title}</td><td>${h.classroom}</td><td><button onclick='state.editingHomeworkId="${h._id}"; state.tempHwLevels=${JSON.stringify(h.levels)}; document.getElementById("createHomeworkModal").style.display="flex"; renderCreateHomeworkForm({title:"${h.title}",classroom:"${h.classroom}"})'>Modif</button> <button onclick="deleteHomework('${h._id}')" style="color:red">X</button></td></tr>`).join(''); }
async function fetchAndRenderPlayers() { const r=await fetchPlayers(); state.allPlayersData=r; applyFiltersAndRender(); }
function applyFiltersAndRender() { 
    const f=state.$("#classFilter").value; const s=state.$("#studentSearch").value.toLowerCase();
    const l=state.allPlayersData.filter(p=>(f==="all"||p.classroom===f)&&(p.firstName.toLowerCase().includes(s)||p.lastName.toLowerCase().includes(s)));
    renderPlayersTable(l);
}
function renderPlayersTable(l) { 
    state.$("#playersBody").innerHTML = l.map(p=>`<tr><td style="padding:10px; font-weight:bold;">${p.firstName} ${p.lastName}</td><td>${p.classroom}</td><td>-</td><td>-</td><td>-</td><td><button onclick="resetPlayer('${p._id}')">Reset</button></td></tr>`).join('');
}
async function loadBugs() { const r=await fetch("/api/bugs"); const l=await r.json(); state.$("#bugsBody").innerHTML = l.map(b=>`<tr><td>${b.description}</td><td><button onclick="deleteBug('${b._id}')">X</button></td></tr>`).join(''); }