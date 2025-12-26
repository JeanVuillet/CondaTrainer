// Fonction générique pour gérer les erreurs
async function handleResponse(res) {
    if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
    return await res.json();
}

export async function login(firstName, lastName, classroom) {
    const res = await fetch("/api/register", { 
        method: "POST", headers: {"Content-Type":"application/json"}, 
        body: JSON.stringify({ firstName, lastName, classroom }) 
    });
    return handleResponse(res);
}

export async function uploadFile(file) {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    return handleResponse(res);
}

export async function saveHomework(data, isEdit) {
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/api/homework/${data.id}` : '/api/homework';
    // On nettoie l'ID pour l'envoi si c'est une création
    const payload = { ...data };
    if (!isEdit) delete payload.id;
    
    const res = await fetch(url, { 
        method: method, headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify(payload) 
    });
    return handleResponse(res);
}

export async function getHomeworks() {
    const res = await fetch('/api/homework-all');
    return handleResponse(res);
}

export async function verifyWithAI(payload) {
    const res = await fetch("/api/verify-answer-ai", { 
        method: "POST", headers: {"Content-Type":"application/json"}, 
        body: JSON.stringify(payload) 
    });
    return handleResponse(res);
}

export async function fetchPlayers() {
    const res = await fetch("/api/players");
    return handleResponse(res);
}

export async function reportBug(payload) {
    await fetch('/api/report-bug', { 
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
    });
}