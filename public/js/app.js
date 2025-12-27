// ==========================================================
// 1. STATE & API UNIFIÉS
// ==========================================================
export const state = {
    user: JSON.parse(localStorage.getItem("player") || "null"),
    questionsData: null,
    isRKeyDown: false,
    isTKeyDown: false,
    getClassKey: (c) => {
        if(!c) return "default";
        c = c.toUpperCase();
        if (c.includes("6")) return "6e";
        if (c.includes("5")) return "5e";
        if (c.includes("2")) return "2de";
        return "default";
    }
};

export const api = {
    async post(url, data) {
        const r = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        return await r.json();
    },
    async get(url) {
        const r = await fetch(url);
        return await r.json();
    }
};

// ==========================================================
// 2. GESTION DES CHEAT CODES (R+T)
// ==========================================================
document.addEventListener("keydown", (e) => { 
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key) {
        const k = e.key.toLowerCase();
        if (k === "r") state.isRKeyDown = true;
        if (k === "t") state.isTKeyDown = true;
    }
});
document.addEventListener("keyup", (e) => { 
    if (e.key) {
        const k = e.key.toLowerCase();
        if (k === "r") state.isRKeyDown = false; 
        if (k === "t") state.isTKeyDown = false; 
    }
});

// ==========================================================
// 3. ROUTAGE & CONNEXION
// ==========================================================
import { initProfDashboard } from './prof.js';
import { initStudentInterface } from './eleve.js';

document.addEventListener("DOMContentLoaded", () => {
    if (state.user) {
        document.getElementById("registerCard").style.display = "none";
        document.getElementById("studentBadge").textContent = `${state.user.firstName} ${state.user.lastName}`;
        document.getElementById("studentBadge").style.display = "block";
        document.getElementById("logoutBtn").style.display = "block";
        if (state.user.id === "prof") initProfDashboard(); else initStudentInterface();
    }

    document.getElementById("registerForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const firstName = document.getElementById("firstName").value.trim();
        const lastName = document.getElementById("lastName").value.trim();
        const classroom = document.getElementById("classroom").value;

        if(firstName.toLowerCase() === "jean" && lastName.toLowerCase() === "vuillet") {
            document.getElementById("profPasswordModal").style.display = "block";
            return;
        }

        const res = await api.post('/api/register', { firstName, lastName, classroom });
        if(res.ok) {
            localStorage.setItem("player", JSON.stringify(res));
            window.location.reload();
        } else { alert("Élève non trouvé."); }
    });

    document.getElementById("validateProfPasswordBtn")?.addEventListener("click", () => {
        if(document.getElementById("profPassword").value === "Clemenceau1919") {
            const prof = { id: "prof", firstName: "Jean", lastName: "Vuillet", classroom: "Professeur" };
            localStorage.setItem("player", JSON.stringify(prof));
            window.location.reload();
        } else { alert("MDP Incorrect"); }
    });

    document.getElementById("logoutBtn")?.addEventListener("click", () => {
        localStorage.removeItem("player");
        window.location.reload();
    });
});