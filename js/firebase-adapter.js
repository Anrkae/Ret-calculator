import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyA-f7KfWUq9bcusIHmqTpSDq0S-4rC7lqs",
    authDomain: "claro-ret.firebaseapp.com",
    projectId: "claro-ret",
    storageBucket: "claro-ret.firebasestorage.app",
    messagingSenderId: "218601890292",
    appId: "1:218601890292:web:31e30552518c20ff8d19a1"
};

const app = initializeApp(firebaseConfig);
const dbFirestore = getFirestore(app);
const auth = getAuth(app);
let currentUser = null;

// --- 1. SINCRONIZAÇÃO ---
async function syncToFirebase() {
    const matricula = localStorage.getItem('claro_matricula');
    if (!auth.currentUser || !matricula) return;

    const data = JSON.parse(localStorage.getItem('claro_data')) || { calls: [], shifts: [], pauses: [] };
    const sessionLocal = JSON.parse(localStorage.getItem('claro_session')) || {};
    const todayId = new Date().toISOString().split('T')[0];

    try {
        await setDoc(doc(dbFirestore, "sessoes", `${todayId}_${matricula}`), {
            matricula,
            historico: data,
            sessao_atual: sessionLocal,
            ultima_atualizacao: serverTimestamp()
        }, { merge: true });
    } catch (e) { console.error("Erro Sync:", e); }
}

// --- 2. LOGIN E FECHAMENTO DO MODAL ---
document.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-login-anon') {
        const input = document.getElementById('login-matricula');
        const matricula = input?.value.trim();
        const modal = document.getElementById('auth-container');

        if (!matricula || matricula.length < 3) {
            alert("Insira uma matrícula válida.");
            return;
        }

        try {
            await signInAnonymously(auth);
            localStorage.setItem('claro_matricula', matricula);
            
            // CORREÇÃO 1: Fecha o modal imediatamente após login com sucesso
            if (modal) modal.style.display = 'none';

            if (window._pendingShiftAction) {
                // Pequeno delay para o Firebase processar o Auth antes de iniciar a jornada
                setTimeout(() => {
                    if (typeof window.toggleShift === 'function') {
                        window.toggleShift();
                    }
                    window._pendingShiftAction = false;
                }, 500);
            }
        } catch (err) {
            console.error("Erro login:", err);
            alert("Erro ao conectar ao servidor.");
        }
    }
});

// --- 3. INTERCEPTAÇÃO E CORREÇÃO DO TOGGLESHIFT ---
function applyInterceptors() {
    // CORREÇÃO 2: Verificação robusta para não quebrar o onclick do HTML
    if (!window.toggleShift) {
        console.warn("Aguardando main.js carregar...");
        setTimeout(applyInterceptors, 500);
        return;
    }

    const originalToggle = window.toggleShift;
    window.toggleShift = function() {
        const matricula = localStorage.getItem('claro_matricula');
        const btnShift = document.getElementById('btn-shift');
        const isShiftActive = btnShift?.innerText.includes('Encerrar');

        if (!isShiftActive && (!auth.currentUser || !matricula)) {
            window._pendingShiftAction = true;
            document.getElementById('auth-container').style.display = 'flex';
            return;
        }
        return originalToggle.apply(this, arguments);
    };

    const originalEncerrar = window.encerrarJornada;
    window.encerrarJornada = async function() {
        if (originalEncerrar) originalEncerrar.apply(this, arguments);
        await syncToFirebase();
        localStorage.removeItem('claro_matricula');
        await signOut(auth);
        window.location.reload(); 
    };

    // Auto-sync em outras funções
    ['finalizeRecord', 'saveData', 'saveSession'].forEach(fn => {
        const original = window[fn];
        if (original) {
            window[fn] = function() {
                const res = original.apply(this, arguments);
                syncToFirebase();
                return res;
            };
        }
    });
}

// Monitor de estado do Firebase
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const matricula = localStorage.getItem('claro_matricula');
    if (user && matricula) {
        const modal = document.getElementById('auth-container');
        if (modal) modal.style.display = 'none';
    }
});

// Inicialização
window.addEventListener('load', () => {
    // Aplica os interceptores assim que o DOM estiver pronto
    applyInterceptors();
});
