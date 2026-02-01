import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

const getMatricula = () => localStorage.getItem('claro_matricula');
const getDataKey = () => `claro_data_${getMatricula()}`;
const getSessionKey = () => `claro_session_${getMatricula()}`;

// --- ITEM 4 & 5: BUSCA INTELIGENTE DE DADOS ---

// Função global para que o main.js possa esperar a resposta do Firebase
window.fetchFromFirebase = async function() {
    const matricula = getMatricula();
    if (!matricula) return null;

    const todayId = new Date().toISOString().split('T')[0];
    const docRef = doc(dbFirestore, "sessoes", `${todayId}_${matricula}`);
    
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            console.log("✅ Dados recuperados do Firebase.");
            return docSnap.data().historico;
        }
    } catch (e) {
        console.error("Erro ao buscar dados no Firebase:", e);
    }
    return null;
};

async function syncToFirebase() {
    const matricula = getMatricula();
    if (!auth.currentUser || !matricula) return;

    const data = JSON.parse(localStorage.getItem(getDataKey()));
    
    // PROTEÇÃO CRUCIAL: Não sincroniza se os dados locais estiverem vazios/zerados
    // Isso evita que um localStorage limpo apague uma jornada ativa no Firebase
    if (!data || (!data.calls.length && !data.shifts.length && !data.jackinTime)) {
        console.log("⚠️ Sync abortado: Dados locais vazios para evitar sobrescrita.");
        return; 
    }

    const sessionLocal = JSON.parse(localStorage.getItem(getSessionKey())) || {};
    const todayId = new Date().toISOString().split('T')[0];

    try {
        await setDoc(doc(dbFirestore, "sessoes", `${todayId}_${matricula}`), {
            matricula,
            historico: data,
            sessao_atual: sessionLocal,
            ultima_atualizacao: serverTimestamp()
        }, { merge: true });
    } catch (e) { 
        console.error("❌ Erro Sync Firebase:", e); 
    }
}

// --- ITEM 1: LOGOUT SEGURO E FEEDBACK ---

async function executeSecureLogout() {
    const loader = document.getElementById('logout-loader');
    if (loader) loader.style.display = 'flex';

    try {
        // 1. Garantir sincronização final antes de limpar tudo
        await syncToFirebase();
        
        // 2. Limpar Timers e Intervalos
        window.clearInterval(window.shiftInterval);
        window.clearInterval(window.pauseInterval);
        window.clearInterval(window.callInterval);

        // 3. Limpar LocalStorage (Sessão e Matrícula)
        const matriculaAtual = getMatricula();
        localStorage.removeItem(`claro_session_${matriculaAtual}`);
        localStorage.removeItem('claro_matricula');

        // 4. Logout do Firebase
        await signOut(auth);

        // 5. Delay visual para o loader
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 6. Reload final
        window.location.reload();
        
    } catch (e) {
        console.error("Erro durante logout:", e);
        window.location.reload();
    }
}

// --- INTERCEPTADORES ---

function applyInterceptors() {
    if (!window.toggleShift || !window.encerrarJornada) {
        setTimeout(applyInterceptors, 100);
        return;
    }

    const originalToggle = window.toggleShift;
    window.toggleShift = function() {
        const matricula = getMatricula();
        const btn = document.getElementById('btn-shift');
        const isShiftActive = btn?.innerText.includes('Encerrar') || btn?.innerText.includes('Pendente');

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
        await executeSecureLogout();
    };

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

onAuthStateChanged(auth, async (user) => {
    const matricula = getMatricula();
    if (user && matricula) {
        const modal = document.getElementById('auth-container');
        if (modal) modal.style.display = 'none';
        
        // Se o LocalStorage estiver zerado ao entrar, força a recuperação imediata
        if (!localStorage.getItem(getDataKey())) {
            const remoteData = await window.fetchFromFirebase();
            if (remoteData) {
                localStorage.setItem(getDataKey(), JSON.stringify(remoteData));
                if (window.updateStatsDisplay) window.updateStatsDisplay();
            }
        }
        syncToFirebase();
    }
});

document.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-login-anon') {
        const input = document.getElementById('login-matricula');
        const matricula = input?.value.trim();
        
        if (matricula && matricula.length >= 3) {
            try {
                localStorage.setItem('claro_matricula', matricula);
                await signInAnonymously(auth);
                
                if (window._pendingShiftAction) {
                    // O toggleShift no main.js agora é async e lidará com o restoreSession
                    window.toggleShift();
                    window._pendingShiftAction = false;
                }
            } catch (err) { 
                console.error("Auth error:", err);
            }
        }
    }
});

window.addEventListener('load', applyInterceptors);
