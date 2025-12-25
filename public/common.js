// ==========================================================
// COMMON.JS - VARIABLES GLOBALES & OUTILS
// ==========================================================
window.$ = (sel) => document.querySelector(sel);

// --- VARIABLES GLOBALES ---
window.isGameActive = false;
window.isGlobalPaused = false;
window.allQuestionsData = {}; 
window.isProfessorMode = false;

// Variables pour le Prof (doivent être ici pour être accessibles partout)
window.tempHwLevels = []; 
window.editingHomeworkId = null;
window.allPlayersData = [];

// État du Joueur
const saved = JSON.parse(localStorage.getItem("player") || "null");
window.currentPlayerId = saved ? saved.id : null;
window.currentPlayerData = saved || null;

// État du Jeu (Zombie/Redac)
window.levels = [];
window.localScores = [];
window.general = 0;
window.currentLevel = 0;
window.currentIndex = -1;
window.lives = 4;
window.MAX_LIVES = 4;
window.locked = false;
window.currentGameModuleInstance = null;

// Gestion Clavier (Cheat codes)
window.isRKeyDown = false; 
window.isTKeyDown = false;
document.addEventListener("keydown", (e) => { if (e.key.toLowerCase() === "r") window.isRKeyDown = true; if (e.key.toLowerCase() === "t") window.isTKeyDown = true; });
document.addEventListener("keyup", (e) => { if (e.key.toLowerCase() === "r") window.isRKeyDown = false; if (e.key.toLowerCase() === "t") window.isTKeyDown = false; });

// --- AUTHENTIFICATION ---
document.addEventListener("DOMContentLoaded", () => {
    // Gestionnaire Login
    const form = window.$("#registerForm");
    if(form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault(); 
            const btn = window.$("#startBtn");
            btn.disabled = true;
            
            const body = { 
                firstName: window.$("#firstName").value, 
                lastName: window.$("#lastName").value, 
                classroom: window.$("#classroom").value 
            };

            if(body.firstName.toLowerCase()==="jean" && body.lastName.toLowerCase()==="vuillet") { 
                window.$("#profPasswordModal").style.display="block"; 
                btn.disabled=false; 
                return; 
            }

            try {
                const res = await fetch("/api/register", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
                const d = await res.json(); 
                if(!res.ok) throw new Error(d.error);
                localStorage.setItem("player", JSON.stringify(d)); 
                window.location.reload();
            } catch(err) { alert(err.message); btn.disabled=false; }
        });
    }

    // Validation Prof
    window.$("#validateProfPasswordBtn")?.addEventListener("click", () => { 
        if(window.$("#profPassword").value === "Clemenceau1919") { 
            localStorage.setItem("player", JSON.stringify({ id: "prof", firstName: "Jean", lastName: "Vuillet", classroom: "Professeur" })); 
            window.location.reload(); 
        } 
    });

    // Logout
    const logoutBtn = window.$("#logoutBtn");
    if(logoutBtn) logoutBtn.onclick = () => { localStorage.removeItem("player"); window.location.reload(); };

    // Initialisation
    if (window.currentPlayerData) {
        if(window.$("#registerCard")) window.$("#registerCard").style.display = "none";
        if(window.$("#studentBadge")) {
            window.$("#studentBadge").textContent = `${window.currentPlayerData.firstName} ${window.currentPlayerData.lastName}`;
            window.$("#studentBadge").style.display = "block";
        }
        if(logoutBtn) logoutBtn.style.display = "block";

        if (window.currentPlayerData.id === "prof") {
            window.isProfessorMode = true;
            if(window.initProfDashboard) window.initProfDashboard();
        } else {
            if(window.initStudentInterface) window.initStudentInterface();
        }
    } else {
        if(window.$("#registerCard")) window.$("#registerCard").style.display = "block";
    }
});

// Helper pour les classes
window.getClassKey = function(c) { 
    if(!c) return "default"; 
    c = c.toUpperCase(); 
    if (c.includes("6")) return "6e"; 
    if (c.includes("5")) return "5e"; 
    if (c.includes("2")) return "2de"; 
    return "default"; 
};