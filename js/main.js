import { animarEntradaFluxo } from './animations.js';

// Variáveis de estado expostas no window para o Kill Switch do Adapter
window.shiftInterval = null;
window.pauseInterval = null;
window.callInterval = null;

let callStartTime;
let shiftStartTime;
let pauseStartTime;
let jackinStartTime; // Início do bloco de tempo produtivo atual

let isCallActive = false;
let isShiftActive = false;
let isPauseActive = false;
let isPausePending = false; 
let pendingCallData = null;

// --- AJUSTE: CHAVE DINÂMICA POR MATRÍCULA ---
const getMatricula = () => localStorage.getItem('claro_matricula') || 'default';
const getDataKey = () => `claro_data_${getMatricula()}`;
const getSessionKey = () => `claro_session_${getMatricula()}`;

// db agora inclui jackinTime para acumular o tempo produtivo
let db = { calls: [], shifts: [], pauses: [], jackinTime: 0 };

// --- CORE: PERSISTÊNCIA E SESSÃO ---

window.saveSession = function() {
    const sessionData = { 
        isShiftActive, isPauseActive, 
        shiftStart: shiftStartTime, 
        pauseStart: pauseStartTime, 
        jackinStart: jackinStartTime,
        pendingCall: pendingCallData 
    };
    localStorage.setItem(getSessionKey(), JSON.stringify(sessionData));
};

window.saveData = function() { 
    localStorage.setItem(getDataKey(), JSON.stringify(db)); 
    updateHomeCards(); 
    window.updateStatsDisplay(); 
};

function restoreSession() {
    db = JSON.parse(localStorage.getItem(getDataKey())) || { calls: [], shifts: [], pauses: [], jackinTime: 0 };
    const savedSession = JSON.parse(localStorage.getItem(getSessionKey()));
    
    if (savedSession) {
        if (savedSession.isShiftActive) {
            const isToday = new Date(savedSession.shiftStart).toDateString() === new Date().toDateString();
            if (isToday) {
                vincularJornada(savedSession.shiftStart, savedSession.jackinStart);
            } else {
                isShiftActive = false;
                db.jackinTime = 0; // Reseta acumulado se for novo dia
                window.saveSession();
            }
        }

        if (savedSession.isPauseActive) {
            isPauseActive = true;
            pauseStartTime = savedSession.pauseStart;
            document.getElementById('active-break-display').classList.remove('none');
            window.clearInterval(window.pauseInterval);
            window.pauseInterval = setInterval(updatePauseTimer, 1000);
        }

        if (savedSession.pendingCall) {
            pendingCallData = savedSession.pendingCall;
            document.getElementById('modal-tabulacao').style.display = 'flex';
        }
    }

    animarEntradaFluxo(isShiftActive, isPauseActive, false);
    syncTelefoniaUI(false); 
    updateHomeCards();
    window.updateSnippetIcon();
}

// --- INTERFACE ---

function syncTelefoniaUI(animate = true) {
    const telContainer = document.querySelector('.telefone');
    const btnAtender = document.querySelector('.btn-atender');
    const btnDesligar = document.querySelector('.btn-desligar');
    const minimizarTel = document.getElementById('minimizar-tel');

    const updateVisibility = () => {
        btnAtender.classList.add('none');
        btnDesligar.classList.add('none');
        minimizarTel.classList.add('none');

        if (!isShiftActive) return;
        if (isPauseActive) { minimizarTel.classList.remove('none'); }
        else if (isCallActive) { btnDesligar.classList.remove('none'); }
        else { btnAtender.classList.remove('none'); }
    };

    if (animate && telContainer) {
        gsap.to(telContainer, {
            rotation: "+=360", duration: 0.6, ease: "back.inOut(1.7)",
            onStart: () => setTimeout(updateVisibility, 300) 
        });
    } else {
        updateVisibility();
    }
}

window.toggleSnippet = function() {
    const snippet = document.getElementById('jackin-snippet');
    gsap.to(snippet, {
        rotation: "+=360", duration: 0.6, ease: "power2.inOut",
        onStart: () => {
            setTimeout(() => {
                snippet.classList.toggle('minimized');
                window.updateSnippetIcon();
            }, 300);
        }
    });
};

window.updateSnippetIcon = function() {
    const btn = document.getElementById('toggle-snippet');
    const snippet = document.getElementById('jackin-snippet');
    if (!btn || !snippet) return;
    const isMin = snippet.classList.contains('minimized');
    btn.innerHTML = isMin 
        ? `<img src="svg/timer.svg" class="icon-svg" style="width:20px">`
        : `<img src="svg/xmark.svg" class="icon-svg" style="width:16px">`;
};

// --- JORNADA E JACKIN ---

function vincularJornada(startTime, savedJackinStart) {
    isShiftActive = true;
    shiftStartTime = startTime;
    // Se não houver pausa ativa, o Jackin começa/retoma agora
    if (!isPauseActive) jackinStartTime = savedJackinStart || Date.now();
    
    const btn = document.getElementById('btn-shift');
    btn.innerText = 'Encerrar Jornada';
    btn.classList.replace('btn-glass', 'btn-danger');
    
    document.getElementById('shift-status').innerText = 'Em Jornada';
    document.getElementById('jackin-container-header').classList.remove('none');
    document.getElementById('jackin-snippet').classList.replace('status-off', 'status-on');
    document.getElementById('pause-type').classList.remove('none');
    document.querySelector('.btn-pausa').classList.remove('none');
    
    window.clearInterval(window.shiftInterval);
    window.shiftInterval = setInterval(updateShiftTimer, 1000);
}

window.toggleShift = function() {
    const btn = document.getElementById('btn-shift');
    if (isShiftActive && !window.requireConfirm(btn, 'shift')) return;

    if (!isShiftActive) {
        restoreSession(); 
        const today = new Date().toDateString();
        const jornadaExistente = db.shifts.find(s => new Date(s.start).toDateString() === today);

        if (jornadaExistente) {
            window.toast("Retomando jornada de hoje...");
            vincularJornada(jornadaExistente.start);
            db.shifts = db.shifts.filter(s => s !== jornadaExistente);
        } else {
            db.jackinTime = 0; // Novo dia, nova contagem
            vincularJornada(Date.now());
        }
        animarEntradaFluxo(true, false, false);
    } else {
        window.encerrarJornada();
    }
    syncTelefoniaUI(true);
    window.saveSession();
    window.saveData();
};

window.encerrarJornada = function() {
    if (pendingCallData) window.finalizeRecord('improdutivo', 'fechamento_forçado');
    if (isCallActive) {
        window.clearInterval(window.callInterval);
        pendingCallData = { timestamp: new Date().toISOString(), duration: Math.floor((Date.now() - callStartTime) / 1000) };
        window.finalizeRecord('retido', null);
    }
    
    // Antes de encerrar, salva o Jackin acumulado deste bloco
    if (isShiftActive && !isPauseActive && jackinStartTime) {
        db.jackinTime += (Date.now() - jackinStartTime);
    }
    
    if (isPauseActive) window.endPause(true);
    
    window.clearInterval(window.shiftInterval);
    window.clearInterval(window.pauseInterval);
    window.clearInterval(window.callInterval);

    if (shiftStartTime) db.shifts.push({ start: shiftStartTime, end: Date.now() });
    
    isShiftActive = false;
    shiftStartTime = null;
    jackinStartTime = null;

    const btn = document.getElementById('btn-shift');
    btn.innerText = 'Iniciar Jornada';
    btn.classList.replace('btn-danger', 'btn-glass');
    
    document.getElementById('shift-status').innerText = 'Off-line';
    document.getElementById('session-timer').innerText = '00:00:00';
    document.getElementById('jackin-timer-header').innerText = '00:00:00';
    document.getElementById('jackin-container-header').classList.add('none');
    document.getElementById('jackin-snippet').classList.replace('status-on', 'status-off');
    document.getElementById('pause-type').classList.add('none');
    document.querySelector('.btn-pausa').classList.add('none');
    
    animarEntradaFluxo(false, false, false);
    window.saveSession();
    window.saveData();
};

// --- PAUSA E LIGAÇÕES ---

window.startPause = function() {
    if (!isShiftActive || isPauseActive || pendingCallData) return;
    if (isPausePending) { isPausePending = false; window.toast('Pausa cancelada'); updatePauseBtnUI(); return; }
    if (isCallActive) { isPausePending = true; window.toast('Pausa agendada!'); updatePauseBtnUI(); return; }
    if (!window.requireConfirm(event.currentTarget, 'pause')) return;
    window.executarInicioPausa();
};

window.executarInicioPausa = function() {
    // Ao iniciar pausa, o bloco Jackin termina e acumula no db
    if (jackinStartTime) {
        db.jackinTime += (Date.now() - jackinStartTime);
        jackinStartTime = null;
    }
    
    isPauseActive = true; pauseStartTime = Date.now();
    document.getElementById('active-break-display').classList.remove('none');
    window.clearInterval(window.pauseInterval);
    window.pauseInterval = setInterval(updatePauseTimer, 1000);
    syncTelefoniaUI(true); animarEntradaFluxo(true, true, true);
    updatePauseBtnUI(); window.saveSession();
};

window.endPause = function(force) {
    if (!isPauseActive) return;
    if (!force && !window.requireConfirm(event.currentTarget, 'return')) return;
    
    window.clearInterval(window.pauseInterval);
    db.pauses.push({ type: document.getElementById('pause-type').value, start: pauseStartTime, end: Date.now() });
    
    isPauseActive = false;
    pauseStartTime = null;
    // Ao retornar da pausa, um novo bloco Jackin começa
    jackinStartTime = Date.now();
    
    document.getElementById('active-break-display').classList.add('none');
    syncTelefoniaUI(true); animarEntradaFluxo(true, false, true);
    window.saveSession(); window.saveData();
};

window.startCall = function() {
    if (!isShiftActive || isPauseActive || isCallActive || pendingCallData) return;
    isCallActive = true; callStartTime = Date.now();
    window.clearInterval(window.callInterval);
    window.callInterval = setInterval(updateCallTimer, 1000);
    syncTelefoniaUI(true); window.saveSession();
};

window.endCall = function(result) {
    if (!isCallActive) return;
    if (!window.requireConfirm(event.currentTarget, result)) return;
    window.clearInterval(window.callInterval);
    pendingCallData = { timestamp: new Date().toISOString(), duration: Math.floor((Date.now() - callStartTime) / 1000) };
    isCallActive = false;
    document.getElementById('modal-tabulacao').style.display = 'flex';
    syncTelefoniaUI(true); window.saveSession();
};

window.finalizeRecord = function(result, reason) {
    if (!pendingCallData) return;
    pendingCallData.result = result; pendingCallData.reason = reason;
    db.calls.push(pendingCallData); pendingCallData = null;
    document.getElementById('modal-tabulacao').style.display = 'none';
    document.getElementById('call-display').innerText = '00:00';
    window.saveSession(); window.saveData();
    if (isPausePending) { isPausePending = false; updatePauseBtnUI(); window.executarInicioPausa(); }
};

// --- AUXILIARES ---

function updatePauseBtnUI() {
    const btnPausa = document.querySelector('.btn-pausa');
    if (!btnPausa) return;
    btnPausa.innerText = isPausePending ? "Cancelar Pausa" : "Pausa";
    isPausePending ? btnPausa.classList.add('btn-warning') : btnPausa.classList.remove('btn-warning');
}

function updateCallTimer() { 
    if(!callStartTime) return;
    document.getElementById('call-display').innerText = formatTime(Math.floor((Date.now()-callStartTime)/1000)); 
}

function updateShiftTimer() { 
    if(!shiftStartTime) return;
    const now = Date.now();
    // Timer de Sessão (Tempo Logado corrido)
    document.getElementById('session-timer').innerText = formatTimeFull(Math.floor((now-shiftStartTime)/1000)); 
    
    // Timer Jackin (Só incrementa se não estiver em pausa)
    if (!isPauseActive && jackinStartTime) {
        const currentJackinSession = now - jackinStartTime;
        const totalJackinMs = (db.jackinTime || 0) + currentJackinSession;
        document.getElementById('jackin-timer-header').innerText = formatTimeFull(Math.floor(totalJackinMs/1000));
    }
}

function updatePauseTimer() { 
    if(!pauseStartTime) return;
    document.getElementById('break-timer').innerText = formatTime(Math.floor((Date.now()-pauseStartTime)/1000)); 
}

function formatTime(s) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function formatTimeFull(s) {
    const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function formatHoursMinutesFromMs(ms) {
    const totalMin = Math.floor(ms/60000);
    return `${Math.floor(totalMin/60)}h ${totalMin%60}m`;
}

function updateHomeCards() {
    const calls = db.calls.filter(c => new Date(c.timestamp).toDateString() === (new Date()).toDateString());
    document.getElementById('desc-display').innerText = calls.filter(c => c.result === 'cancelado').length;
    const total = calls.reduce((a, c) => a + c.duration, 0);
    document.getElementById('tma-display').innerText = calls.length ? Math.round(total / calls.length) : 0;
}

window.updateStatsDisplay = function() {
    const filter = document.getElementById('stats-filter').value;
    const now = Date.now();
    const isToday = filter === 'today';

    let filteredCalls = db.calls.filter(c => {
        const d = new Date(c.timestamp);
        return isToday ? d.toDateString() === new Date().toDateString() : true;
    });

    const daysWithActivity = [...new Set(db.shifts.map(s => new Date(s.start).toDateString()))].length || 1;

    // TMA e Desconexão
    const totalTmaSec = filteredCalls.reduce((a,c) => a + c.duration, 0);
    document.getElementById('stat-tma').innerText = filteredCalls.length ? Math.round(totalTmaSec / filteredCalls.length) : 0;
    const validDesconexao = filteredCalls.filter(c => c.result === 'retido' || c.result === 'cancelado');
    const totalCancels = filteredCalls.filter(c => c.result === 'cancelado').length;
    document.getElementById('stat-disc').innerText = validDesconexao.length ? Math.round((totalCancels / validDesconexao.length) * 100) + '%' : '0%';

    // Tempo Logado
    let rawLoggedMs = db.shifts.reduce((a,s) => a + (s.end - s.start), 0) + (isShiftActive ? (now - shiftStartTime) : 0);
    let finalLoggedMs = isToday ? rawLoggedMs : (rawLoggedMs / daysWithActivity);
    document.getElementById('stat-logged').innerText = formatHoursMinutesFromMs(finalLoggedMs);

    // Pausas
    let rawPauseMs = db.pauses.reduce((a,p) => a + (p.end - p.start), 0) + (isPauseActive ? (now - pauseStartTime) : 0);
    let finalPauseMs = isToday ? rawPauseMs : (rawPauseMs / daysWithActivity);
    document.getElementById('stat-pauses').innerText = formatHoursMinutesFromMs(finalPauseMs);

    // JACKIN (Tempo de Produção)
    let currentJackinMs = (db.jackinTime || 0) + ((!isPauseActive && jackinStartTime) ? (now - jackinStartTime) : 0);
    let finalJackinMs = isToday ? currentJackinMs : (currentJackinMs / daysWithActivity);
    document.getElementById('stat-jackin').innerText = formatHoursMinutesFromMs(finalJackinMs);
};

window.showPage = function(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
    document.getElementById(`nav-${pageId}`).classList.add('active');
    if (pageId === 'stats') window.updateStatsDisplay();
};

window.handleTabulacao = function(tipo) {
    tipo === 'cancelado' ? (document.getElementById('step-resultado').classList.add('none'), document.getElementById('step-motivos').classList.remove('none')) : window.finalizeRecord(tipo, null);
};

window.confirmFinalReason = function(reason) { window.finalizeRecord(reason === '021' ? 'improdutivo' : 'cancelado', reason); };

window.requireConfirm = function(btn, key) {
    if (btn.dataset.confirm === key) { btn.classList.remove('confirming'); delete btn.dataset.confirm; return true; }
    btn.dataset.confirm = key; btn.classList.add('confirming');
    setTimeout(() => { btn.classList.remove('confirming'); delete btn.dataset.confirm; }, 2500);
    return false;
};

window.toast = function(msg) {
    const t = document.createElement('div');
    t.style = "position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);backdrop-filter:blur(5px);color:white;padding:12px 24px;border-radius:30px;z-index:10000;font-size:14px;box-shadow:0 4px 15px rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);";
    t.innerText = msg; document.body.appendChild(t);
    gsap.fromTo(t, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 });
    setTimeout(() => { gsap.to(t, { opacity: 0, y: -20, onComplete: () => t.remove() }); }, 3000);
};

window.addEventListener('load', () => {
    if (localStorage.getItem('claro_matricula')) {
        restoreSession();
    }
});
