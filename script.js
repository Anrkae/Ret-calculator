let callStartTime, callInterval;
let shiftStartTime, shiftInterval;
let pauseStartTime, pauseInterval;
let isCallActive = false;
let isShiftActive = false;
let isPauseActive = false;

let db = JSON.parse(localStorage.getItem('claro_data')) || {
    calls: [],
    shifts: [],
    pauses: []
};

(function() {
    const style = document.createElement('style');
    style.innerHTML = `
        .toast{
            position:fixed;
            bottom:90px;
            left:50%;
            transform:translateX(-50%) translateY(20px);
            padding:16px 22px;
            border-radius:16px;
            background:rgba(20,20,20,.9);
            backdrop-filter:blur(10px);
            color:#fff;
            font-weight:600;
            opacity:0;
            transition:.3s;
            z-index:9999;
            box-shadow:0 10px 30px rgba(0,0,0,.4)
        }
        .toast.show{
            opacity:1;
            transform:translateX(-50%) translateY(0)
        }
        .confirming{
            position:relative;
            overflow:hidden
        }
        .confirming::after{
            content:'';
            position:absolute;
            inset:0;
            background:rgba(0,0,0,.35);
            transform:translateX(-100%);
            animation:confirmSlide 2.5s linear forwards
        }
        @keyframes confirmSlide{
            to{transform:translateX(0)}
        }
    `;
    document.head.appendChild(style);
})();

function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerText = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    }, 2500);
}

function saveData() {
    localStorage.setItem('claro_data', JSON.stringify(db));
    updateStatsDisplay();
    updateHomeCards();
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
    document.getElementById(`nav-${pageId}`).classList.add('active');
    if (pageId === 'stats') updateStatsDisplay();
}

function requireConfirm(btn, key) {
    if (btn.dataset.confirm === key) return true;
    btn.dataset.confirm = key;
    btn.dataset.originalText = btn.innerText;
    btn.innerText = 'Confirmar';
    btn.classList.add('confirming');
    setTimeout(() => {
        btn.classList.remove('confirming');
        btn.innerText = btn.dataset.originalText;
        delete btn.dataset.confirm;
    }, 2500);
    return false;
}

function startCall() {
    if (!isShiftActive) return toast('Você está offline');
    if (isPauseActive) return toast('Finalize a pausa');
    if (isCallActive) return toast('Ligação já ativa');
    isCallActive = true;
    callStartTime = Date.now();
    callInterval = setInterval(updateCallTimer, 1000);
}

function updateCallTimer() {
    const diff = Math.floor((Date.now() - callStartTime) / 1000);
    document.querySelector('.timer-container h2').innerText = formatTime(diff);
}

function endCall(result) {
    if (!isCallActive) return toast('Nenhuma ligação ativa');
    const btn = document.activeElement;
    if (!requireConfirm(btn, result)) return;
    clearInterval(callInterval);
    const duration = Math.floor((Date.now() - callStartTime) / 1000);
    db.calls.push({ timestamp: new Date().toISOString(), duration, result });
    isCallActive = false;
    document.querySelector('.timer-container h2').innerText = '00:00';
    saveData();
}

function toggleShift() {
    const btn = document.getElementById('btn-shift');
    if (isShiftActive && !requireConfirm(btn, 'shift')) return;
    const snippet = document.getElementById('jackin-snippet');
    const statusText = document.getElementById('shift-status');
    
    if (!isShiftActive) {
        isShiftActive = true;
        shiftStartTime = Date.now();
        btn.innerText = 'Encerrar Jornada';
        btn.classList.replace('btn-glass', 'btn-danger');
        statusText.innerText = 'Em Jornada';
        snippet.classList.replace('status-off', 'status-on');
        shiftInterval = setInterval(updateShiftTimer, 1000);
        return;
    }
    
    if (isCallActive) endCall('retido');
    if (isPauseActive) endPause(true);
    
    clearInterval(shiftInterval);
    db.shifts.push({ start: shiftStartTime, end: Date.now() });
    isShiftActive = false;
    btn.innerText = 'Iniciar Jornada';
    btn.classList.replace('btn-danger', 'btn-glass');
    statusText.innerText = 'Off-line';
    snippet.classList.replace('status-on', 'status-off');
    document.getElementById('session-timer').innerText = '00:00:00';
    saveData();
}

function updateShiftTimer() {
    const diff = Math.floor((Date.now() - shiftStartTime) / 1000);
    document.getElementById('session-timer').innerText = formatTimeFull(diff);
}

function startPause() {
    if (!isShiftActive) return toast('Você está offline');
    if (isCallActive) return toast('Finalize a ligação');
    if (isPauseActive) return toast('Pausa já ativa');
    const btn = document.activeElement;
    if (!requireConfirm(btn, 'pause')) return;
    isPauseActive = true;
    pauseStartTime = Date.now();
    document.getElementById('active-break-display').style.display = 'block';
    pauseInterval = setInterval(updatePauseHeader, 1000);
}

function updatePauseHeader() {
    const sec = Math.floor((Date.now() - pauseStartTime) / 1000);
    document.getElementById('break-timer').innerText =
        sec < 3600 ? formatTime(sec) : formatTimeFull(sec);
}

function endPause(force) {
    if (!isPauseActive) return toast('Nenhuma pausa ativa');
    const btn = document.activeElement;
    if (!force && !requireConfirm(btn, 'return')) return;
    clearInterval(pauseInterval);
    db.pauses.push({
        type: document.getElementById('pause-type').value,
        start: pauseStartTime,
        end: Date.now()
    });
    isPauseActive = false;
    document.getElementById('active-break-display').style.display = 'none';
    saveData();
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function formatTimeFull(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function formatHoursMinutes(ms) {
    const total = Math.floor(ms / 60000);
    return `${Math.floor(total/60)}h ${total%60}m`;
}

function toggleSnippet() {
    document.getElementById('jackin-snippet').classList.toggle('minimized');
}

function updateHomeCards() {
    const today = new Date().toDateString();
    const calls = db.calls.filter(c => new Date(c.timestamp).toDateString() === today);
    document.querySelector('.desc-container h2').innerText =
        calls.filter(c => c.result === 'cancelado').length;
    const total = calls.reduce((a, c) => a + c.duration, 0);
    document.querySelector('.tma-container h2').innerText =
        calls.length ? Math.round(total / calls.length) : 0;
}

function updateStatsDisplay() {
    const filter = document.getElementById('stats-filter').value;
    const now = new Date();
    let calls = db.calls.filter(c => {
        const d = new Date(c.timestamp);
        if (filter === 'today') return d.toDateString() === now.toDateString();
        if (filter === 'current_month')
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        return true;
    });
    
    const total = calls.reduce((a, c) => a + c.duration, 0);
    document.getElementById('stat-tma').innerText =
        calls.length ? Math.round(total / calls.length) : 0;
    
    const cancels = calls.filter(c => c.result === 'cancelado').length;
    document.getElementById('stat-disc').innerText =
        calls.length ? Math.round((cancels / calls.length) * 100) + '%' : '0%';
    
    const pauseMs = db.pauses.reduce((a, p) => a + (p.end - p.start), 0);
    document.getElementById('stat-pauses').innerText =
        formatHoursMinutes(pauseMs);
    
    let logged = db.shifts.reduce((a, s) => a + (s.end - s.start), 0);
    if (isShiftActive) logged += Date.now() - shiftStartTime;
    document.getElementById('stat-logged').innerText =
        formatHoursMinutes(logged);
}

updateStatsDisplay();
updateHomeCards();

const carrossel = document.querySelector('.carrossel');
const cards = Array.from(carrossel.querySelectorAll('.card'));
let index = 0;
let autoSlide;

function goTo(i) {
    const y = window.scrollY;
    cards[i].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    window.scrollTo({ top: y });
}

function toggleSlide() {
    index = index === 0 ? 1 : 0;
    goTo(index);
}

function start() {
    autoSlide = setInterval(toggleSlide, 3500);
}

function stop() {
    clearInterval(autoSlide);
}

window.addEventListener('load', () => {
    goTo(index);
    start();
});

carrossel.addEventListener('touchstart', stop, { passive: true });
carrossel.addEventListener('touchend', start);