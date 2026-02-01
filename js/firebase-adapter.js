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

// --- UTILITÁRIOS DE CHAVE DINÂMICA ---
const getMatricula = () => localStorage.getItem('claro_matricula');
const getDataKey = () => `claro_data_${getMatricula()}`;
const getSessionKey = () => `claro_session_${getMatricula()}`;

async function syncToFirebase() {
    const matricula = getMatricula();
    if (!auth.currentUser || !matricula) return;

    const data = JSON.parse(localStorage.getItem(getDataKey())) || { calls: [], shifts: [], pauses: [] };
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

// --- INTERCEPTADORES ---
function applyInterceptors() {
    if (!window.toggleShift || !window.encerrarJornada) {
        setTimeout(applyInterceptors, 100);
        return;
    }

    const originalToggle = window.toggleShift;
    window.toggleShift = function() {
        const matricula = getMatricula();
        const btnShift = document.getElementById('btn-shift');
        const isShiftActive = btnShift?.innerText.includes('Encerrar') || btnShift?.innerText.includes('Pendente');

        if (!isShiftActive && (!auth.currentUser || !matricula)) {
            window._pendingShiftAction = true;
            document.getElementById('auth-container').style.display = 'flex';
            return;
        }
        return originalToggle.apply(this, arguments);
    };

    // O PONTO CRÍTICO: Matar os cronômetros e limpar a sessão antes do reload
    const originalEncerrar = window.encerrarJornada;
    window.encerrarJornada = async function() {
        console.log("🚀 Iniciando encerramento seguro...");

        // 1. Mata todos os Intervals globais IMEDIATAMENTE
        const killIntervals = () => {
            for (let i = 1; i < 9999; i++) window.clearInterval(i);
        };
        killIntervals();

        // 2. Executa a limpeza lógica do main.js (salva o shift final no db local)
        if (originalEncerrar) originalEncerrar.apply(this, arguments);
        
        // 3. Backup final para o Firebase com o status "Off-line"
        await syncToFirebase(); 
        
        // 4. Limpeza de rastro: remove matrícula e a sessão específica
        const matriculaAtual = getMatricula();
        localStorage.removeItem(`claro_session_${matriculaAtual}`);
        localStorage.removeItem('claro_matricula');
        
        // 5. Logout do Firebase
        await signOut(auth);
        
        // 6. Reload limpo
        window.location.reload(); 
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

onAuthStateChanged(auth, (user) => {
    const matricula = getMatricula();
    if (user && matricula) {
        const modal = document.getElementById('auth-container');
        if (modal) modal.style.display = 'none';
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
                    window.toggleShift();
                    window._pendingShiftAction = false;
                }
            } catch (err) { 
                alert("Falha na conexão."); 
            }
        }
    }
});

window.addEventListener('load', applyInterceptors);
