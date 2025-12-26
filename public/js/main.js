import { state } from './state.js';
import { login } from './api.js';
import { initProfDashboard } from './prof.js';
import { initStudentInterface } from './eleve.js';

document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Vérification Session existante
    if (state.currentPlayerData) {
        state.$("#registerCard").style.display = "none";
        // On affiche le badge
        if (state.$("#studentBadge")) {
            state.$("#studentBadge").textContent = `${state.currentPlayerData.firstName} ${state.currentPlayerData.lastName}`;
            state.$("#studentBadge").style.display = "block";
        }
        // On affiche le bouton déconnexion
        if (state.$("#logoutBtn")) {
            state.$("#logoutBtn").style.display = "block";
        }
        
        // Router : Prof ou Élève ?
        if (state.currentPlayerData.id === "prof") {
            initProfDashboard();
        } else {
            initStudentInterface();
        }
    }

    // 2. Gestion du Formulaire de Connexion
    const form = state.$("#registerForm");
    if(form) form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const firstName = state.$("#firstName").value.trim();
        const lastName = state.$("#lastName").value.trim();
        const classroom = state.$("#classroom").value;
        const btn = state.$("#startBtn");

        // --- CORRECTION ICI : INTERCEPTION PROF ---
        if(firstName.toLowerCase() === "jean" && lastName.toLowerCase() === "vuillet") {
            state.$("#profPasswordModal").style.display = "block";
            return; // On arrête ici, on n'appelle pas l'API élève
        }
        // ------------------------------------------

        btn.disabled = true;
        try {
            const data = await login(firstName, lastName, classroom);
            if(data.ok) {
                localStorage.setItem("player", JSON.stringify(data));
                window.location.reload();
            } else {
                throw new Error(data.error || "Erreur inconnue");
            }
        } catch(err) { 
            alert("Erreur connexion : " + err.message); 
            btn.disabled = false;
        }
    });
    
    // 3. Validation Mot de Passe Prof
    state.$("#validateProfPasswordBtn")?.addEventListener("click", (e) => {
        e.preventDefault(); // Empêche le rechargement si c'est dans un form
        if(state.$("#profPassword").value === "Clemenceau1919") {
            const profData = { 
                id: "prof", 
                firstName: "Jean", 
                lastName: "Vuillet", 
                classroom: "Professeur" 
            };
            localStorage.setItem("player", JSON.stringify(profData));
            window.location.reload();
        } else {
            alert("Mot de passe incorrect !");
        }
    });
    
    // 4. Déconnexion
    const logoutBtn = state.$("#logoutBtn");
    if(logoutBtn) {
        logoutBtn.onclick = () => {
            localStorage.removeItem("player");
            window.location.reload();
        };
    }
});