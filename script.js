let callStartTime, callInterval;
let shiftStartTime, shiftInterval;
let pauseStartTime, pauseInterval;
let isCallActive = false;
let isShiftActive = false;
let isPauseActive = false;

// LS
let db = JSON.parse(localStorage.getItem('claro_data')) || {
    calls: [], // {timestamp, duração, type}
    shifts: [], // {inicio, end}
    pauses: [] // {type, inicio, end}
};

function saveData() {
    localStorage.setItem('claro_data', JSON.stringify(db));
    updateStatsDisplay();
}

// Nav
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
    document.getElementById(`nav-${pageId}`).classList.add('active');
}

function startCall() {
    if (isCallActive) return;
    isCallActive = true;
    callStartTime = Date.now();
    callInterval = setInterval(updateCallTimer, 1000);
}

function updateCallTimer() {
    const diff = Math.floor((Date.now() - callStartTime) / 1000);
    document.getElementById('call-display').innerText = formatTime(diff);
}

function endCall(result) {
    if (!isCallActive) return;
    clearInterval(callInterval);
    const duration = Math.floor((Date.now() - callStartTime) / 1000);
    
    db.calls.push({ timestamp: new Date(), duration, result });
    saveData();
    
    isCallActive = false;
    document.getElementById('call-display').innerText = "00:00";
}

function toggleShift() {
    const btn = document.getElementById('btn-shift');
    if (!isShiftActive) {
        isShiftActive = true;
        shiftStartTime = Date.now();
        btn.innerText = "Encerrar Jornada";
        btn.classList.replace('btn-glass', 'btn-danger');
        document.getElementById('shift-status').innerText = "Em Jornada";
        shiftInterval = setInterval(updateShiftTimer, 1000);
    } else {
        isShiftActive = false;
        db.shifts.push({ start: shiftStartTime, end: Date.now() });
        saveData();
        clearInterval(shiftInterval);
        btn.innerText = "Iniciar Jornada";
        btn.classList.replace('btn-danger', 'btn-glass');
        document.getElementById('shift-status').innerText = "Off-line";
        document.getElementById('session-timer').innerText = "00:00:00";
    }
}

function updateShiftTimer() {
    const diff = Math.floor((Date.now() - shiftStartTime) / 1000);
    document.getElementById('session-timer').innerText = formatTimeFull(diff);
}

// Sossego
function startPause() {
    if (!isShiftActive || isPauseActive) return;
    isPauseActive = true;
    const type = document.getElementById('pause-type').value;
    pauseStartTime = Date.now();
    document.getElementById('active-break-display').style.display = 'block';
    pauseInterval = setInterval(() => {
        const diff = Math.floor((Date.now() - pauseStartTime) / 1000);
        document.getElementById('break-timer').innerText = formatTime(diff);
    }, 1000);
}

function endPause() {
    if (!isPauseActive) return;
    clearInterval(pauseInterval);
    db.pauses.push({ type: document.getElementById('pause-type').value, start: pauseStartTime, end: Date.now() });
    saveData();
    isPauseActive = false;
    document.getElementById('active-break-display').style.display = 'none';
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function formatTimeFull(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function toggleSnippet() {
    document.getElementById('jackin-snippet').classList.toggle('minimized');
}

function updateStatsDisplay() {
    const filter = document.getElementById('stats-filter').value;
    const now = new Date();
    
    let filteredCalls = db.calls.filter(call => {
        const d = new Date(call.timestamp);
        if (filter === 'today') return d.toDateString() === now.toDateString();
        if (filter === 'current_month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        return true; // Simplificado para o exemplo
    });

    // TMA
    const totalDuration = filteredCalls.reduce((acc, curr) => acc + curr.duration, 0);
    const tma = filteredCalls.length ? Math.round(totalDuration / filteredCalls.length) : 0;
    document.getElementById('stat-tma').innerText = formatTime(tma);

    // Desconexão
    const cancels = filteredCalls.filter(c => c.result === 'cancelado').length;
    const discRate = filteredCalls.length ? Math.round((cancels / filteredCalls.length) * 100) : 0;
    document.getElementById('stat-disc').innerText = `${discRate}%`;

    // Pausas
    document.getElementById('stat-pauses').innerText = db.pauses.length;

    // Tempo Logado
    const totalLogged = db.shifts.reduce((acc, curr) => acc + (curr.end - curr.start), 0);
    const hours = Math.floor(totalLogged / 3600000);
    const mins = Math.floor((totalLogged % 3600000) / 60000);
    document.getElementById('stat-logged').innerText = `${hours}h ${mins}m`;
}

updateStatsDisplay();
