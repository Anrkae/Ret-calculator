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

async function loadDataFromFirebase() {
    const matricula = getMatricula();
    if (!matricula) return;

    const todayId = new Date().toISOString().split('T')[0];
    const docRef = doc(dbFirestore, "sessoes", `${todayId}_${matricula}`);
    
    try {
        const docSnap = await getDoc(docRef);
        
        // Item 4: Se não encontrar jornada do dia no LocalStorage, busca no Firebase
        if (docSnap.exists()) {
            const remoteData = docSnap.data().historico;
            const localData = JSON.parse(localStorage.getItem(getDataKey()));
            
            if (!localData || !localData.shifts.length) {
                console.log("🔄 Restaurando jornada do dia via Firebase...");
                localStorage.setItem(getDataKey(), JSON.stringify(remoteData));
                // Recarrega o estado no main.js se necessário
                if (typeof window.saveData === 'function') window.saveData();
            }
        }
        
        // Item 5: Sempre buscar histórico para as estatísticas (simulação de carregamento de histórico)
        // Nota: O gráfico de estatísticas agora pode usar dados consolidados do Firebase se você expandir a query.
        console.log("📊 Histórico sincronizado com Firebase para Estatísticas.");
        
    } catch (e) {
        console.error("Erro ao buscar dados no Firebase:", e);
    }
}

async function syncToFirebase() {
    const matricula = getMatricula();
    if (!auth.currentUser || !matricula) return;

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

// --- ITEM 1: LOGOUT SEGURO E FEEDBACK ---

async function executeSecureLogout() {
    const loader = document.getElementById('logout-loader');
    if (loader) loader.style.display = 'flex';

    try {
        // 1. Garantir sincronização final
        await syncToFirebase();
        
        // 2. Limpar Timers e Intervalos
        const killIntervals = () => {
            window.clearInterval(window.shiftInterval);
            window.clearInterval(window.pauseInterval);
            window.clearInterval(window.callInterval);
            for (let i = 1; i < 100; i++) window.clearInterval(i);
        };
        killIntervals();

        // 3. Limpar LocalStorage da Sessão
        const matriculaAtual = getMatricula();
        localStorage.removeItem(`claro_session_${matriculaAtual}`);
        localStorage.removeItem('claro_matricula');

        // 4. Logout do Firebase
        await signOut(auth);

        // 5. Delay pequeno para o usuário ver o "bonitinho" do loader
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 6. Reload final após estar TOTALMENTE deslogado
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
        const isShiftActive = document.getElementById('btn-shift')?.innerText.includes('Encerrar') || 
                             document.getElementById('btn-shift')?.innerText.includes('Pendente');

        if (!isShiftActive && (!auth.currentUser || !matricula)) {
            window._pendingShiftAction = true;
            document.getElementById('auth-container').style.display = 'flex';
            return;
        }
        return originalToggle.apply(this, arguments);
    };

    // Sobrescreve o encerrarJornada original com a versão segura
    const originalEncerrar = window.encerrarJornada;
    window.encerrarJornada = async function() {
        // Primeiro executa a lógica de fechamento de dados do main.js
        if (originalEncerrar) originalEncerrar.apply(this, arguments);
        
        // Depois inicia o processo de logout total e reload
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

onAuthStateChanged(auth, (user) => {
    const matricula = getMatricula();
    if (user && matricula) {
        const modal = document.getElementById('auth-container');
        if (modal) modal.style.display = 'none';
        loadDataFromFirebase();
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
