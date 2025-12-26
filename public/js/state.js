export const state = {
    // Session
    currentPlayerId: null,
    currentPlayerData: null,
    
    // État du Jeu
    isGameActive: false,
    isGlobalPaused: false,
    locked: false,
    
    // Données
    levels: [],
    localScores: [],
    general: 0,
    currentLevel: 0,
    currentIndex: -1,
    lives: 4,
    MAX_LIVES: 4,
    
    // Cheat Codes
    isRKeyDown: false,
    isTKeyDown: false,
    
    // Instances
    currentGameModuleInstance: null,
    allQuestionsData: {},

    // Prof
    tempHwLevels: [], 
    editingHomeworkId: null,
    allPlayersData: [],

    // Helpers
    $: (sel) => document.querySelector(sel),
    getClassKey: (c) => {
        if(!c) return "default";
        c = c.toUpperCase();
        if (c.includes("6")) return "6e";
        if (c.includes("5")) return "5e";
        if (c.includes("2")) return "2de";
        return "default";
    }
};

// Chargement auto session
const saved = JSON.parse(localStorage.getItem("player") || "null");
if(saved) {
    state.currentPlayerId = saved.id;
    state.currentPlayerData = saved;
}

// --- GESTION ROBUSTE DES TOUCHES R + T ---
document.addEventListener("keydown", (e) => { 
    // Ignore si l'utilisateur écrit dans un champ texte (input/textarea)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key.toLowerCase() === "r") {
        state.isRKeyDown = true;
    } 
    if (e.key.toLowerCase() === "t") {
        state.isTKeyDown = true;
    }
    
    // Debug temporaire pour vérifier
    if(state.isRKeyDown && state.isTKeyDown) console.log("🕵️ Mode Cheat Prêt !");
});

document.addEventListener("keyup", (e) => { 
    if (e.key.toLowerCase() === "r") state.isRKeyDown = false; 
    if (e.key.toLowerCase() === "t") state.isTKeyDown = false; 
});