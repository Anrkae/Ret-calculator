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

    // Agora inclui jackinTime no histórico e jackinStart na sessão atual
    const data = JSON.parse(localStorage.getItem(getDataKey())) || { calls: [], shifts: [], pauses: [], jackinTime: 0 };
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

    const originalEncerrar = window.encerrarJornada;
    window.encerrarJornada = async function() {
        console.log("🚀 Iniciando encerramento seguro e zerando indicadores...");

        // 1. Mata todos os cronômetros globais (Kill Switch)
        const killIntervals = () => {
            window.clearInterval(window.shiftInterval);
            window.clearInterval(window.pauseInterval);
            window.clearInterval(window.callInterval);
            // Backup de segurança para qualquer outro timer perdido
            for (let i = 1; i < 100; i++) window.clearInterval(i);
        };
        killIntervals();

        // 2. Executa a limpeza lógica do main.js (salva acumulados de Jackin e Shifts)
        if (originalEncerrar) originalEncerrar.apply(this, arguments);
        
        // 3. Backup final para o Firebase com os dados consolidados
        await syncToFirebase(); 
        
        // 4. Limpeza de rastro de sessão e matrícula
        const matriculaAtual = getMatricula();
        localStorage.removeItem(`claro_session_${matriculaAtual}`);
        localStorage.removeItem('claro_matricula');
        
        // 5. Logout do Firebase
        await signOut(auth);
        
        // 6. Reload forçado para limpar o estado da memória e timers do navegador
        window.location.reload(); 
    };

    // Auto-sync ao salvar qualquer dado importante
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
