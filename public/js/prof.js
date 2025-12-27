import { state } from './state.js';
import { uploadFile, saveHomework, getHomeworks, fetchPlayers } from './api.js';

// ==========================================================
// 1. FONCTIONS GLOBALES
// ==========================================================
window.addDocToZone = function(lvlIdx, zoneId) {
    const input = document.getElementById(`input-${zoneId}-${lvlIdx}`);
    if (!input) return;
    const url = input.value.trim();
    if(url) pushDocToState(lvlIdx, zoneId, url);
};

window.uploadFileToZone = async function(inputEl, lvlIdx, zoneId) {
    if (!inputEl.files || inputEl.files.length === 0) return;
    
    // Feedback
    const label = inputEl.parentElement;
    const originalText = label.innerText;
    label.innerHTML = "⏳ ...";

    for (let i = 0; i < inputEl.files.length; i++) {
        const file = inputEl.files[i];
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.ok) pushDocToState(lvlIdx, zoneId, data.imageUrl);
        } catch (e) { console.error(e); }
    }
    label.innerHTML = originalText;
};

function pushDocToState(lvlIdx, zoneId, url) {
    const lvl = state.tempHwLevels[lvlIdx];
    if (zoneId === 'top') lvl.attachmentUrls.push(url);
    else lvl.questionImage = url;
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

// ==========================================================
// 2. INIT & DASHBOARD
// ==========================================================
export function initProfDashboard() {
    console.log("👨‍🏫 Init Dashboard Prof");
    const dashboard = document.getElementById("profDashboard");
    if(dashboard) dashboard.style.display = "block";
    
    fetchAndRenderPlayers();

    // Onglets
    document.getElementById("tabStudents").onclick = () => { 
        document.getElementById("contentStudents").style.display="block"; 
        document.getElementById("contentHomeworks").style.display="none"; 
    };
    document.getElementById("tabHomeworks").onclick = () => { 
        document.getElementById("contentStudents").style.display="none"; 
        document.getElementById("contentHomeworks").style.display="block"; 
        loadProfHomeworks(); 
    };

    // --- CORRECTION CRITIQUE : BOUTON TEST ---
    const btnTest = document.getElementById("testClassBtn");
    if(btnTest) {
        console.log("✅ Bouton Test détecté");
        btnTest.onclick = async () => {
            console.log("🖱️ Clic sur Tester Classe");
            const select = document.getElementById("classFilter");
            const cls = select ? select.value : "all";
            
            if(cls === "all") return alert("Sélectionnez d'abord une classe précise (ex: 5B) dans le menu déroulant.");
            
            // Création/Connexion directe
            try {
                const res = await fetch("/api/register", { 
                    method:"POST", 
                    headers:{"Content-Type":"application/json"}, 
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
    } else {
        console.error("❌ Bouton testClassBtn introuvable dans le HTML !");
    }

    // Autres boutons
    document.getElementById("addHomeworkBtn").onclick = () => {
        state.tempHwLevels = []; state.editingHomeworkId = null;
        document.getElementById("createHomeworkModal").style.display = "flex";
        renderCreateHomeworkForm();
    };
    
    document.getElementById("viewBugsBtn").onclick = () => { loadBugs(); document.getElementById("profBugListModal").style.display="flex"; };
    document.getElementById("closeBugListBtn").onclick = () => { document.getElementById("profBugListModal").style.display="none"; };
    
    document.getElementById("classFilter").onchange = applyFiltersAndRender;
    document.getElementById("studentSearch").oninput = applyFiltersAndRender;
    document.getElementById("resetAllBtn").onclick = async () => { if(confirm("⚠️ TOUT effacer ?")) { await fetch("/api/reset-all-players", {method:"POST"}); fetchAndRenderPlayers(); } };
}

// ==========================================================
// 3. RENDU FORMULAIRE
// ==========================================================
function renderCreateHomeworkForm(hw = null) {
    const title = hw ? hw.title : "";
    const modal = state.$("#createHomeworkModal");
    if (!hw && state.tempHwLevels.length === 0) state.tempHwLevels.push({ instruction: "", aiPrompt: "", attachmentUrls: [], questionImage: null });

    const opt = (val) => `<option value="${val}" ${hw && hw.classroom===val?"selected":""}>${val}</option>`;

    modal.innerHTML = `
    <div class="modal-content" style="width:95%; max-width:900px; padding:20px; background:white; max-height:90vh; overflow-y:auto;">
        <h3>${hw ? "Modifier" : "Nouveau"} Devoir</h3>
        <input id="hwTitle" value="${title}" placeholder="Titre" style="width:100%; padding:10px; margin-bottom:10px;">
        <select id="hwClass" style="width:100%; padding:10px; margin-bottom:20px;">
            ${opt("Toutes")}${opt("6D")}${opt("5B")}${opt("5C")}${opt("2A")}${opt("2CD")}
        </select>
        <div id="levelsContainer"></div>
        <button id="btnAddLvl" style="width:100%; padding:10px; margin-top:10px; background:#e0f2fe; color:#0369a1;">+ Ajouter Question</button>
        <div style="margin-top:20px; text-align:right;">
            <button onclick="document.getElementById('createHomeworkModal').style.display='none'">Annuler</button>
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
            <div style="margin-bottom:15px; border-bottom:1px dashed #ccc; padding-bottom:15px;">
                <strong style="color:#2563eb;">LIGNE 1 : Documents (Haut)</strong>
                <div style="display:flex; flex-wrap:wrap; gap:10px; margin:10px 0;">
                    ${lvl.attachmentUrls.map(u => `
                        <div style="position:relative; width:60px; height:60px; border:1px solid #ccc;">
                            <img src="${u}" style="width:100%; height:100%; object-fit:cover;">
                            <button onclick="removeDoc(${idx}, '${u}', 'top')" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border-radius:50%; width:20px; cursor:pointer;">x</button>
                        </div>
                    `).join('')}
                </div>
                <label style="background:#3b82f6; color:white; padding:5px 10px; border-radius:4px; cursor:pointer;">
                    📂 Ajouter Fichiers
                    <input type="file" multiple onchange="uploadFileToZone(this, ${idx}, 'top')" style="display:none;" accept="image/*,.pdf">
                </label>
            </div>`;

        const renderBottom = () => `
            <div>
                <strong style="color:#2563eb;">LIGNE 2 : Question (Bas)</strong>
                <div style="display:flex; gap:20px; margin-top:10px;">
                    <div style="width:150px; text-align:center;">
                        <div style="width:100%; height:100px; background:white; border:1px solid #ccc; display:flex; align-items:center; justify-content:center; overflow:hidden; margin-bottom:5px;">
                            ${lvl.questionImage ? `<img src="${lvl.questionImage}" style="width:100%; height:100%; object-fit:contain;">` : `<span style="color:#aaa;">Aucune image</span>`}
                        </div>
                        ${lvl.questionImage ? `<button onclick="removeDoc(${idx}, null, 'bottom')" style="color:red;">Supprimer</button>` :
                        `<label style="color:#2563eb; cursor:pointer; text-decoration:underline;">Ajouter Image<input type="file" onchange="uploadFileToZone(this, ${idx}, 'bottom')" style="display:none;" accept="image/*"></label>`}
                    </div>
                    <div style="flex:1;">
                        <label>Texte Question :</label>
                        <textarea id="lvlInst-${idx}" style="width:100%; height:50px;">${lvl.instruction || ''}</textarea>
                        <label>Prompt IA (Secret) :</label>
                        <textarea id="lvlPrompt-${idx}" style="width:100%; height:50px; background:#f0f9ff;">${lvl.aiPrompt || ''}</textarea>
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

// --- LISTES ---
async function loadProfHomeworks() {
    const tbody = document.getElementById("profHomeworksBody");
    tbody.innerHTML = "<tr><td colspan='5'>Chargement...</td></tr>";
    const list = await getHomeworks();
    tbody.innerHTML = list.length ? list.map(h => `<tr><td>${h.title}</td><td>${h.classroom}</td><td><button onclick='window.openEditModal("${encodeURIComponent(JSON.stringify(h))}")'>Modif</button> <button onclick="deleteHomework('${h._id}')" style="color:red">X</button></td></tr>`).join('') : "<tr><td colspan='5'>Vide</td></tr>";
}
window.openEditModal = function(hwString) {
    const hw = JSON.parse(decodeURIComponent(hwString));
    state.editingHomeworkId = hw._id;
    state.tempHwLevels = JSON.parse(JSON.stringify(hw.levels));
    document.getElementById("createHomeworkModal").style.display = "flex";
    renderCreateHomeworkForm(hw);
};
window.deleteHomework = async (id) => { if(confirm("Supprimer ?")) { await fetch(`/api/homework/${id}`, { method: 'DELETE' }); loadProfHomeworks(); } };

async function fetchAndRenderPlayers() { 
    const list = await fetchPlayers(); state.allPlayersData = list; applyFiltersAndRender(); 
}
function applyFiltersAndRender() { 
    const f=document.getElementById("classFilter").value; const s=document.getElementById("studentSearch").value.toLowerCase();
    const l=state.allPlayersData.filter(p=>(f==="all"||p.classroom===f)&&(p.firstName.toLowerCase().includes(s)||p.lastName.toLowerCase().includes(s)));
    renderPlayersTable(l);
}
function renderPlayersTable(l) { document.getElementById("playersBody").innerHTML = l.map(p=>`<tr><td>${p.firstName} ${p.lastName}</td><td>${p.classroom}</td><td>-</td><td>-</td><td>-</td><td><button onclick="window.resetPlayer('${p._id}')">Reset</button></td></tr>`).join(''); }

async function loadBugs() { const l=await (await fetch("/api/bugs")).json(); document.getElementById("bugsBody").innerHTML=l.map(b=>`<tr><td>${b.description}</td><td><button onclick="deleteBug('${b._id}')">X</button></td></tr>`).join(''); }
window.deleteBug = async(id)=>{ await fetch(`/api/bugs/${id}`, {method:'DELETE'}); loadBugs(); };