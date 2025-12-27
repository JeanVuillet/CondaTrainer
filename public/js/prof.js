import { state } from './state.js';
import { uploadFile, saveHomework, getHomeworks, fetchPlayers } from './api.js';

// ==========================================================
// 1. GESTION DES COPIES ÉLÈVES (VUE PROF)
// ==========================================================

window.viewSubmissions = async function(hwId, hwClass) {
    try {
        const players = state.allPlayersData.filter(p => p.classroom === hwClass || hwClass === "Toutes");
        const res = await fetch(`/api/submissions/${hwId}`);
        const submissions = await res.json();

        const modal = document.createElement('div');
        modal.className = "modal-overlay";
        modal.style.display = "flex";
        modal.innerHTML = `
            <div class="modal-content" style="width:90%; max-width:800px; max-height:85vh; overflow-y:auto;">
                <h3>Copies : ${hwClass}</h3>
                <table style="width:100%; border-collapse:collapse; margin-top:15px;">
                    <thead style="background:#f1f5f9;">
                        <tr><th style="padding:10px; text-align:left;">Élève</th><th>Statut</th><th>Note</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        ${players.map(p => {
                            const sub = submissions.find(s => s.playerId && (s.playerId._id === p._id || s.playerId === p._id));
                            return `
                                <tr>
                                    <td style="padding:10px; border-bottom:1px solid #eee;">${p.firstName} ${p.lastName}</td>
                                    <td style="padding:10px; border-bottom:1px solid #eee; text-align:center;">
                                        ${sub ? '✅ Rendu' : '<span style="color:gray;">⏳ En attente</span>'}
                                    </td>
                                    <td style="padding:10px; border-bottom:1px solid #eee; text-align:center;">
                                        ${sub ? (sub.levelsResults[0]?.grade || '-') : '-'}
                                    </td>
                                    <td style="padding:10px; border-bottom:1px solid #eee; text-align:center;">
                                        ${sub ? `<button onclick="window.openStudentCopy('${sub._id}')" style="background:#2563eb; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">Voir la copie</button>` : '-'}
                                    </td>
                                </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                <button onclick="this.closest('.modal-overlay').remove()" style="margin-top:20px; padding:10px; cursor:pointer;">Fermer</button>
            </div>`;
        document.body.appendChild(modal);
    } catch (e) { alert("Erreur chargement copies"); }
};

window.openStudentCopy = async function(subId) {
    const res = await fetch(`/api/submission-detail/${subId}`);
    const sub = await res.json();

    const modal = document.createElement('div');
    modal.className = "modal-overlay";
    modal.style.zIndex = "2100";
    modal.style.display = "flex";
    modal.innerHTML = `
        <div class="modal-content" style="width:95%; max-width:1000px; max-height:90vh; overflow-y:auto; text-align:left;">
            <h3>Copie de ${sub.playerId.firstName} ${sub.playerId.lastName}</h3>
            <div id="copy-container">
                ${sub.levelsResults.map((r, i) => `
                    <div style="margin-bottom:20px; padding:15px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                        <h4>Question ${r.levelIndex + 1}</h4>
                        <p><strong>Réponse :</strong> ${r.userText || '<i>Texte absent</i>'}</p>
                        ${r.userImageUrl ? `<img src="${r.userImageUrl}" style="max-width:300px; border:1px solid #ccc; border-radius:8px;">` : ''}
                        <hr>
                        <label>Commentaire Prof :</label>
                        <textarea class="t-fb" style="width:100%; height:80px; margin-bottom:10px; display:block; width:100%;">${r.teacherFeedback || r.aiFeedback}</textarea>
                        <label>Note :</label>
                        <input class="t-grade" value="${r.grade}" style="width:100px; padding:5px;">
                    </div>`).join('')}
            </div>
            <div style="text-align:right;">
                <button id="btnSaveCorr" style="background:#16a34a; color:white; padding:10px 20px; border-radius:6px; border:none; cursor:pointer; font-weight:bold;">💾 Enregistrer</button>
                <button onclick="this.closest('.modal-overlay').remove()" style="margin-left:10px; cursor:pointer;">Annuler</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    modal.querySelector("#btnSaveCorr").onclick = async () => {
        const results = sub.levelsResults.map((r, i) => ({
            ...r,
            teacherFeedback: modal.querySelectorAll(".t-fb")[i].value,
            grade: modal.querySelectorAll(".t-grade")[i].value
        }));
        await fetch('/api/update-correction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subId, levelsResults: results })
        });
        alert("✅ Copie enregistrée !");
        modal.remove();
    };
};

// ==========================================================
// 2. GESTION CRÉATION ET MODIFICATION DEVOIRS
// ==========================================================

window.allowDrop = (ev) => ev.preventDefault();
window.dragStartDoc = (ev, lvlIdx, zoneId, docIndex) => {
    ev.dataTransfer.setData("lvlIdx", lvlIdx);
    ev.dataTransfer.setData("docIndex", docIndex);
};
window.dropDoc = (ev, destLvlIdx) => {
    ev.preventDefault();
    const srcLvlIdx = parseInt(ev.dataTransfer.getData("lvlIdx"));
    const srcDocIdx = parseInt(ev.dataTransfer.getData("docIndex"));
    if (srcLvlIdx !== destLvlIdx) return;
    const docs = state.tempHwLevels[destLvlIdx].attachmentUrls;
    const [removed] = docs.splice(srcDocIdx, 1);
    docs.push(removed);
    renderLevelsInputs();
};

window.uploadFileToZone = async function(inputEl, lvlIdx, zoneId) {
    if (!inputEl.files || inputEl.files.length === 0) return;
    const originalLabel = inputEl.parentElement.innerText;
    inputEl.parentElement.innerText = "⏳ Upload...";

    for (let file of inputEl.files) {
        const res = await uploadFile(file);
        if (res.ok) {
            if (zoneId === 'top') state.tempHwLevels[lvlIdx].attachmentUrls.push(res.imageUrl);
            else state.tempHwLevels[lvlIdx].questionImage = res.imageUrl;
        }
    }
    renderLevelsInputs();
};

window.removeDoc = function(lvlIdx, url, zone) {
    const lvl = state.tempHwLevels[lvlIdx];
    if (zone === 'top') lvl.attachmentUrls = lvl.attachmentUrls.filter(u => u !== url);
    else lvl.questionImage = null;
    renderLevelsInputs();
};

window.removeLevel = (idx) => { state.tempHwLevels.splice(idx, 1); renderLevelsInputs(); };

// --- RENDU DU FORMULAIRE ---
function renderCreateHomeworkForm(hw = null) {
    const title = hw ? hw.title : "";
    const currentClass = hw ? hw.classroom : "Toutes";
    const modal = document.getElementById("createHomeworkModal");
    const opt = (val) => `<option value="${val}" ${currentClass===val?"selected":""}>${val}</option>`;

    modal.innerHTML = `
    <div class="modal-content" style="width:95%; max-width:900px; padding:25px; background:white; border-radius:15px; max-height:90vh; overflow-y:auto;">
        <h3>${hw ? "Modifier" : "Nouveau"} Devoir</h3>
        <div style="margin-bottom:15px;"><label>Titre :</label><input id="hwTitle" value="${title}" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:6px;"></div>
        <div style="margin-bottom:15px;"><label>Classe :</label><select id="hwClass" style="width:100%; padding:10px; border:1px solid #ccc;">${opt("Toutes")}${opt("6D")}${opt("5B")}${opt("5C")}${opt("2A")}${opt("2CD")}</select></div>
        <div id="levelsContainer"></div>
        <button id="btnAddLvl" style="width:100%; padding:12px; margin-top:10px; background:#f1f5f9; border:1px dashed #ccc; cursor:pointer;">+ Ajouter Question / Page</button>
        <div style="margin-top:25px; text-align:right;">
            <button onclick="document.getElementById('createHomeworkModal').style.display='none'" style="padding:10px;">Annuler</button>
            <button id="btnSaveHw" style="background:#16a34a; color:white; padding:12px 30px; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">🚀 Enregistrer le Devoir</button>
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
        div.style.cssText = "border:1px solid #e2e8f0; padding:15px; margin-top:20px; background:#f8fafc; border-radius:10px; position:relative;";
        
        div.innerHTML = `
            <button onclick="window.removeLevel(${idx})" style="position:absolute; top:10px; right:10px; color:red; border:none; background:none; cursor:pointer;">Suppr</button>
            <h4 style="color:#2563eb; margin-top:0;">Page ${idx+1}</h4>
            
            <!-- LIGNE 1 : DOCUMENTS -->
            <div style="margin-bottom:20px; padding:10px; border:1px dashed #cbd5e1; background:white;" ondrop="window.dropDoc(event, ${idx})" ondragover="window.allowDrop(event)">
                <label style="font-weight:bold; font-size:0.9em; color:#475569;">LIGNE 1 : Documents de référence (Liseuse du haut)</label>
                <div style="display:flex; flex-wrap:wrap; gap:10px; margin:10px 0;">
                    ${lvl.attachmentUrls.map((url, dIdx) => `
                        <div draggable="true" ondragstart="window.dragStartDoc(event, ${idx}, 'top', ${dIdx})" style="position:relative; width:60px; height:60px; border:1px solid #ccc;">
                            <img src="${url}" style="width:100%; height:100%; object-fit:cover;">
                            <button onclick="window.removeDoc(${idx}, '${url}', 'top')" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border-radius:50%; border:none; width:18px; height:18px; font-size:10px; cursor:pointer;">x</button>
                        </div>`).join('')}
                    <label style="width:60px; height:60px; border:2px dashed #ccc; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:24px; background:white;">
                        + <input type="file" multiple onchange="window.uploadFileToZone(this, ${idx}, 'top')" style="display:none;">
                    </label>
                </div>
            </div>

            <!-- LIGNE 2 : QUESTION -->
            <div style="display:flex; gap:15px;">
                <div style="width:130px; text-align:center;">
                    <label style="font-weight:bold; font-size:0.8em;">Image Question</label>
                    <div style="width:100%; height:100px; border:1px solid #ccc; background:white; margin-top:5px; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative;">
                        ${lvl.questionImage ? `<img src="${lvl.questionImage}" style="width:100%; height:100%; object-fit:contain;">` : '<span style="color:#aaa; font-size:10px;">Aucune</span>'}
                        <label style="position:absolute; inset:0; cursor:pointer;"><input type="file" onchange="window.uploadFileToZone(this, ${idx}, 'bottom')" style="display:none;"></label>
                    </div>
                    ${lvl.questionImage ? `<button onclick="window.removeDoc(${idx}, null, 'bottom')" style="font-size:10px; color:red; border:none; background:none; cursor:pointer;">Supprimer</button>` : ''}
                </div>
                <div style="flex:1;">
                    <label style="font-weight:bold; font-size:0.8em;">Consigne / Texte de la Question :</label>
                    <textarea id="lvlInst-${idx}" style="width:100%; height:70px; padding:8px; border-radius:6px; border:1px solid #ccc; display:block;">${lvl.instruction || ''}</textarea>
                    <label style="font-weight:bold; font-size:0.8em; color:#0369a1; margin-top:5px; display:block;">Message secret pour l'IA (Correction) :</label>
                    <textarea id="lvlPrompt-${idx}" style="width:100%; height:40px; padding:5px; border-radius:4px; border:1px solid #0369a1; background:#f0f9ff; display:block; width:100%;">${lvl.aiPrompt || ''}</textarea>
                </div>
            </div>`;
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
    const res = await saveHomework({ id: state.editingHomeworkId, title: titleVal, classroom: clsVal, levels: state.tempHwLevels }, !!state.editingHomeworkId);
    if(res.ok) { document.getElementById('createHomeworkModal').style.display='none'; loadProfHomeworks(); }
}

// ==========================================================
// 3. LOGIQUE DASHBOARD (INITIALISATION)
// ==========================================================

export function initProfDashboard() {
    const dashboard = document.getElementById("profDashboard");
    if(dashboard) dashboard.style.display = "block";
    
    fetchAndRenderPlayers();

    // --- NAVIGATION ONGLETS ---
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

    // --- BOUTON TESTER CLASSE (RÉPARÉ) ---
    const btnTest = document.getElementById("testClassBtn");
    if(btnTest) {
        btnTest.onclick = async () => {
            const select = document.getElementById("classFilter");
            const cls = select ? select.value : "all";
            if(cls === "all") return alert("Sélectionnez une classe précise (ex: 5B).");
            
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
                    alert("Erreur : " + d.error);
                }
            } catch(e) { alert("Erreur réseau"); }
        };
    }

    // --- BOUTON RESET ALL (RÉPARÉ) ---
    const resetAllBtn = document.getElementById("resetAllBtn");
    if(resetAllBtn) {
        resetAllBtn.onclick = async () => {
            if(confirm("⚠️ Voulez-vous vraiment supprimer toute la progression de TOUS les élèves ?")) {
                await fetch("/api/reset-all-players", { method: "POST" });
                fetchAndRenderPlayers();
            }
        };
    }

    // Actions Devoirs
    document.getElementById("addHomeworkBtn").onclick = () => {
        state.tempHwLevels = [{ instruction: "", aiPrompt: "", attachmentUrls: [], questionImage: null }]; 
        state.editingHomeworkId = null; 
        document.getElementById("createHomeworkModal").style.display = "flex";
        renderCreateHomeworkForm();
    };

    document.getElementById("classFilter").onchange = applyFiltersAndRender;
    document.getElementById("studentSearch").oninput = applyFiltersAndRender;
}

async function loadProfHomeworks() {
    const tbody = document.getElementById("profHomeworksBody");
    tbody.innerHTML = "<tr><td colspan='5'>Chargement...</td></tr>";
    try {
        const list = await getHomeworks();
        state.homeworksList = list;
        tbody.innerHTML = list.map((h, idx) => `
            <tr>
                <td style="padding:10px; border-bottom:1px solid #eee;">${new Date(h.date).toLocaleDateString()}</td>
                <td style="padding:10px; border-bottom:1px solid #eee;"><b>${h.title}</b></td>
                <td style="padding:10px; border-bottom:1px solid #eee;">${h.classroom}</td>
                <td style="padding:10px; border-bottom:1px solid #eee;">
                    <button onclick="window.viewSubmissions('${h._id}', '${h.classroom}')" style="background:#2563eb; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer;">👁️ Copies</button>
                    <button onclick="window.openEditModalByIndex(${idx})" style="background:#f59e0b; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer; margin-left:5px;">Modif</button>
                    <button onclick="window.deleteHomework('${h._id}')" style="background:none; border:none; cursor:pointer; margin-left:10px;">🗑️</button>
                </td>
            </tr>`).join('');
    } catch(e) { tbody.innerHTML = "<tr><td>Erreur.</td></tr>"; }
}

async function fetchAndRenderPlayers() { 
    state.allPlayersData = await fetchPlayers(); 
    applyFiltersAndRender(); 
}

function applyFiltersAndRender() { 
    const f = document.getElementById("classFilter").value; 
    const s = document.getElementById("studentSearch").value.toLowerCase();
    const tbody = document.getElementById("playersBody");
    if(!tbody) return;

    const filtered = state.allPlayersData.filter(p => (f==="all"||p.classroom===f) && (p.firstName.toLowerCase().includes(s) || p.lastName.toLowerCase().includes(s)));
    
    tbody.innerHTML = filtered.map(p => `
        <tr>
            <td style="padding:10px;">${p.firstName} ${p.lastName}</td>
            <td style="padding:10px;">${p.classroom}</td>
            <td style="padding:10px;"><button onclick="window.resetPlayer('${p._id}')" style="color:red; background:none; border:none; cursor:pointer;">Reset</button></td>
        </tr>`).join(''); 
}

// --- Fonctions Globales ---
window.openEditModalByIndex = (index) => {
    const hw = state.homeworksList[index];
    state.editingHomeworkId = hw._id;
    state.tempHwLevels = JSON.parse(JSON.stringify(hw.levels));
    document.getElementById("createHomeworkModal").style.display = "flex";
    renderCreateHomeworkForm(hw);
};
window.deleteHomework = async (id) => { if(confirm("Supprimer ?")) { await fetch(`/api/homework/${id}`, { method: 'DELETE' }); loadProfHomeworks(); } };
window.resetPlayer = async (id) => { if(confirm("Reset ?")) { await fetch("/api/reset-player", {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({playerId:id})}); fetchAndRenderPlayers(); } };