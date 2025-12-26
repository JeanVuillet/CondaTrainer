import { state } from './state.js';
import { uploadFile, saveHomework, getHomeworks, fetchPlayers, reportBug } from './api.js';

// --- HACKS POUR HTML DYNAMIQUE (Onclick) ---
window.addDocToZone = (idx, zone) => {
    const url = document.getElementById(`input-${zone}-${idx}`).value;
    if(url) pushDoc(idx, zone, url);
};

window.uploadFileToZone = async (input, idx, zone) => {
    if(input.files[0]) {
        const res = await uploadFile(input.files[0]);
        if(res.ok) pushDoc(idx, zone, res.imageUrl);
        else alert("Erreur upload");
    }
};

window.removeDoc = (lvlIdx, url) => {
    const lvl = state.tempHwLevels[lvlIdx];
    const idx = lvl.attachmentUrls.indexOf(url);
    if(idx > -1) lvl.attachmentUrls.splice(idx, 1);
    renderLevels();
};

window.removeLevel = (idx) => {
    state.tempHwLevels.splice(idx, 1);
    renderLevels();
};

function pushDoc(lvlIdx, zoneId, url) {
    const lvl = state.tempHwLevels[lvlIdx];
    const breakIndex = lvl.attachmentUrls.indexOf("BREAK");
    const top = breakIndex === -1 ? lvl.attachmentUrls : lvl.attachmentUrls.slice(0, breakIndex);
    const bottom = breakIndex === -1 ? [] : lvl.attachmentUrls.slice(breakIndex + 1);

    if (zoneId === "top") top.push(url); else bottom.push(url);
    lvl.attachmentUrls = bottom.length > 0 ? [...top, "BREAK", ...bottom] : top;
    renderLevels();
}

// --- INITIALISATION DASHBOARD ---
export function initProfDashboard() {
    console.log("👨‍🏫 Init Dashboard Prof");
    const dashboard = document.getElementById("profDashboard");
    if(dashboard) dashboard.style.display = "block";
    
    loadPlayers();

    // -- NAVIGATION --
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
        loadHomeworksList(); 
    };

    // -- BOUTON TEST CLASSE (Corrigé) --
    const btnTest = document.getElementById("testClassBtn");
    if(btnTest) {
        btnTest.onclick = async () => {
            const select = document.getElementById("classFilter");
            const cls = select ? select.value : "all";
            if(cls === "all") return alert("Sélectionnez une classe précise (ex: 6D) dans le filtre à gauche.");
            
            if(confirm(`Créer un compte 'Eleve Test' en ${cls} et s'y connecter ?`)) {
                await fetch("/api/register", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({firstName:"Eleve", lastName:"Test", classroom:cls}) });
                // Connexion auto
                const loginRes = await fetch("/api/register", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({firstName:"Eleve", lastName:"Test", classroom:cls}) });
                const d = await loginRes.json();
                localStorage.setItem("player", JSON.stringify(d));
                window.location.reload();
            }
        };
    }

    // -- BOUTON BUGS (Corrigé) --
    const btnBugs = document.getElementById("viewBugsBtn");
    const modalBugs = document.getElementById("profBugListModal");
    const closeBugs = document.getElementById("closeBugListBtn");

    if(btnBugs) btnBugs.onclick = () => { 
        loadBugs(); 
        if(modalBugs) modalBugs.style.display = "flex"; 
    };
    if(closeBugs) closeBugs.onclick = () => { 
        if(modalBugs) modalBugs.style.display = "none"; 
    };

    // -- AUTRES --
    const btnAdd = document.getElementById("addHomeworkBtn");
    if(btnAdd) btnAdd.onclick = () => {
        state.tempHwLevels = [];
        document.getElementById("createHomeworkModal").style.display = "flex";
        renderForm();
    };
    
    const resetBtn = document.getElementById("resetAllBtn");
    if(resetBtn) resetBtn.onclick = async () => { 
        if(confirm("⚠️ TOUT effacer ?")) { await fetch("/api/reset-all-players", {method:"POST"}); loadPlayers(); } 
    };
    
    const filter = document.getElementById("classFilter");
    if(filter) filter.onchange = applyFiltersAndRender;
    const search = document.getElementById("studentSearch");
    if(search) search.oninput = applyFiltersAndRender;
}

// ... (Reste des fonctions renderForm, renderLevels, loadHomeworksList, loadPlayers, loadBugs inchangées) ...
// Je te remets loadBugs pour être sûr
async function loadBugs() {
    const tbody = document.getElementById("bugsBody");
    tbody.innerHTML = "<tr><td colspan='4'>Chargement...</td></tr>";
    try {
        const res = await fetch('/api/bugs');
        const list = await res.json();
        tbody.innerHTML = list.length ? list.map(b => `
            <tr>
                <td style="padding:8px;">${new Date(b.date).toLocaleDateString()}</td>
                <td style="padding:8px;">${b.reporterName}</td>
                <td style="padding:8px;">${b.description}</td>
                <td style="padding:8px;"><button onclick="deleteBug('${b._id}')" style="color:red; cursor:pointer; border:none; background:none; font-weight:bold;">X</button></td>
            </tr>`).join('') : "<tr><td colspan='4'>Aucun bug.</td></tr>";
    } catch(e) { tbody.innerHTML = "<tr><td colspan='4'>Erreur.</td></tr>"; }
}

window.deleteBug = async(id) => { if(confirm("Supprimer ?")) { await fetch(`/api/bugs/${id}`, {method:'DELETE'}); loadBugs(); } };

// (Ajoute ici le reste des fonctions renderForm, renderLevels... si tu ne les as pas déjà, dis-le moi)
// Je suppose que tu as gardé le code de mon message précédent pour la partie création de devoir.
function renderForm(hw = null) {
    // ... (Code identique à la réponse précédente pour l'interface visuelle) ...
    // Si tu as besoin que je le recolle, dis-le.
    const title = hw ? hw.title : "";
    const modal = document.getElementById("createHomeworkModal");
    if(!hw && state.tempHwLevels.length === 0) state.tempHwLevels.push({ instruction: "", attachmentUrls: [] });

    modal.innerHTML = `
    <div class="modal-content" style="width:90%; max-width:800px; max-height:90vh; overflow-y:auto; background:white; padding:20px; border-radius:10px;">
        <h3>${hw ? "Modifier" : "Nouveau"} Devoir</h3>
        <input id="hwTitle" value="${title}" placeholder="Titre" style="width:100%; padding:8px; margin-bottom:10px;">
        <select id="hwClass" style="width:100%; padding:8px; margin-bottom:20px;">
            <option value="6D">6eD</option><option value="5B">5eB</option><option value="5C">5eC</option>
            <option value="2A">2de A</option>
        </select>
        <div id="levelsContainer"></div>
        <button id="btnAddLvl" style="margin-top:10px; padding:8px;">+ Question</button>
        <div style="margin-top:20px; text-align:right;">
            <button onclick="document.getElementById('createHomeworkModal').style.display='none'" style="margin-right:10px;">Annuler</button>
            <button id="btnSaveHw" style="background:#16a34a; color:white; border:none; padding:10px 20px;">Enregistrer</button>
        </div>
    </div>`;

    renderLevels();

    modal.querySelector("#btnAddLvl").onclick = () => { state.tempHwLevels.push({instruction:"", attachmentUrls:[]}); renderLevels(); };
    modal.querySelector("#btnSaveHw").onclick = async () => {
        const titleVal = document.getElementById("hwTitle").value;
        const clsVal = document.getElementById("hwClass").value;
        state.tempHwLevels.forEach((lvl, i) => { const el = document.getElementById(`lvlInst-${i}`); if(el) lvl.instruction = el.value; });
        await saveHomework({ id: state.editingHomeworkId, title: titleVal, classroom: clsVal, levels: state.tempHwLevels }, !!state.editingHomeworkId);
        modal.style.display='none';
        loadHomeworksList();
    };
}

function renderLevels() {
    const container = document.getElementById("levelsContainer");
    if(!container) return;
    container.innerHTML = "";
    state.tempHwLevels.forEach((lvl, idx) => {
        const breakIndex = lvl.attachmentUrls.indexOf("BREAK");
        const top = breakIndex === -1 ? lvl.attachmentUrls : lvl.attachmentUrls.slice(0, breakIndex);
        const bottom = breakIndex === -1 ? [] : lvl.attachmentUrls.slice(breakIndex + 1);
        const renderZone = (docs, id) => `
            <div style="background:#f9f9f9; padding:10px; margin-top:5px; border-radius:4px;">
                <strong>Zone ${id}</strong>
                <div style="display:flex; flex-wrap:wrap; gap:5px; margin:5px 0;">
                    ${docs.map(u => `<div style="background:white; border:1px solid #ddd; padding:2px;">Doc <button onclick="removeDoc(${idx},'${u}')" style="color:red;cursor:pointer;">x</button></div>`).join('')}
                </div>
                <div style="display:flex; gap:5px;">
                    <input id="input-${id}-${idx}" placeholder="URL">
                    <button onclick="addDocToZone(${idx}, '${id}')">Ajouter</button>
                    <label style="background:#3b82f6; color:white; padding:2px 8px; cursor:pointer;">📂 <input type="file" onchange="uploadFileToZone(this, ${idx}, '${id}')" style="display:none;" accept="image/*,.pdf"></label>
                </div>
            </div>`;
        const div = document.createElement("div");
        div.style.cssText = "border:1px solid #ccc; padding:10px; margin-bottom:10px; background:white;";
        div.innerHTML = `<div style="display:flex; justify-content:space-between;"><strong>Question ${idx+1}</strong> <button onclick="removeLevel(${idx})" style="color:red;">Suppr</button></div><textarea id="lvlInst-${idx}" style="width:100%; margin:5px 0;">${lvl.instruction}</textarea>${renderZone(top, 'top')}${renderZone(bottom, 'bottom')}`;
        container.appendChild(div);
    });
}
async function loadHomeworksList() { const list = await getHomeworks(); document.getElementById("profHomeworksBody").innerHTML = list.map(h => `<tr><td>${h.title}</td><td>${h.classroom}</td></tr>`).join(''); }
async function loadPlayers() { const list = await fetchPlayers(); state.allPlayersData = list; applyFiltersAndRender(); }
window.applyFiltersAndRender = function() {
    const f = document.getElementById("classFilter").value; const s = document.getElementById("studentSearch").value.toLowerCase();
    const l = state.allPlayersData.filter(p => (f==="all" || p.classroom===f) && (p.firstName.toLowerCase().includes(s) || p.lastName.toLowerCase().includes(s)));
    document.getElementById("playersBody").innerHTML = l.map(p => `<tr><td>${p.firstName} ${p.lastName}</td><td>${p.classroom}</td></tr>`).join("");
}
window.resetPlayer = async(id) => { if(confirm("Reset ?")) { await fetch("/api/reset-player",{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:id})}); loadPlayers(); } };