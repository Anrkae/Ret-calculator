import { animarEntradaFluxo } from './animations.js';

let callStartTime, callInterval;
let shiftStartTime, shiftInterval;
let pauseStartTime, pauseInterval;
let isCallActive = false;
let isShiftActive = false;
let isPauseActive = false;
let pendingCallData = null;

let db = JSON.parse(localStorage.getItem('claro_data')) || {
    calls: [],
    shifts: [],
    pauses: []
};

// --- FUNÇÕES GLOBAIS ---

window.toast = function(msg){
    const t=document.createElement('div');
    t.className='toast'; t.innerText=msg;
    document.body.appendChild(t);
    requestAnimationFrame(()=>t.classList.add('show'));
    setTimeout(()=>{
        t.classList.remove('show');
        setTimeout(()=>t.remove(),300);
    },2500);
}

window.requireConfirm = function(btn, key){
    if(btn.dataset.confirm === key){
        clearTimeout(btn._confirmTimeout);
        gsap.killTweensOf(btn);
        btn.classList.remove('confirming');
        if (key !== 'retido') btn.innerText = btn.dataset.originalText; // Não mexe no texto se for o botão de desligar
        delete btn.dataset.confirm;
        return true;
    }
    btn.dataset.confirm = key;
    btn.dataset.originalText = btn.innerText;
    if (key !== 'retido') { // Evita trocar o ícone do telefone por texto "Confirmar"
        gsap.to(btn,{ opacity:0, duration:0.15, onComplete:()=>{
            btn.innerText='Confirmar';
            gsap.to(btn,{opacity:1,duration:0.15});
        }});
    }
    btn.classList.add('confirming');
    btn._confirmTimeout=setTimeout(()=>{
        btn.classList.remove('confirming');
        if (key !== 'retido') btn.innerText=btn.dataset.originalText;
        delete btn.dataset.confirm;
    },2500);
    return false;
}

// ATUALIZAÇÃO AO CLICAR NA BOTTOM NAV
window.showPage = function(pageId){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
    document.getElementById(`nav-${pageId}`).classList.add('active');
    
    // Se clicou em estatísticas, atualiza os timers uma única vez
    if(pageId==='stats') window.updateStatsDisplay();
}

// --- LIGAÇÃO E TABULAÇÃO ---

window.startCall = function(){
    if(!isShiftActive || isPauseActive || isCallActive) return;
    isCallActive=true;
    callStartTime=Date.now();
    callInterval=setInterval(updateCallTimer,1000);
}

window.endCall = function(result){
    if(!isCallActive) return;
    const btn=event.currentTarget;
    if(!window.requireConfirm(btn, result)) return; // 'result' aqui no seu HTML é 'retido'

    clearInterval(callInterval);
    const duration = Math.floor((Date.now()-callStartTime)/1000);
    pendingCallData = { timestamp: new Date().toISOString(), duration: duration };

    abrirModalTabulacao();
}

function abrirModalTabulacao() {
    document.getElementById('modal-tabulacao').style.display = 'flex';
    document.getElementById('step-resultado').classList.remove('none');
    document.getElementById('step-motivos').classList.add('none');
}

window.handleTabulacao = function(tipo) {
    if (tipo === 'cancelado') {
        document.getElementById('step-resultado').classList.add('none');
        document.getElementById('step-motivos').classList.remove('none');
    } else {
        finalizeRecord(tipo, null);
        document.getElementById('modal-tabulacao').style.display = 'none';
    }
}

window.confirmFinalReason = function(reason) {
    const res = (reason === '021') ? 'improdutivo' : 'cancelado';
    finalizeRecord(res, reason);
    document.getElementById('modal-tabulacao').style.display = 'none';
}

function finalizeRecord(result, reason) {
    if(!pendingCallData) return;
    pendingCallData.result = result;
    pendingCallData.reason = reason;
    db.calls.push(pendingCallData);
    isCallActive=false;
    pendingCallData = null;
    document.getElementById('call-display').innerText='00:00';
    saveData();
}

// --- ESTATÍSTICAS (SÓ RODA QUANDO CHAMADA) ---

window.updateStatsDisplay = function(){
    const filter=document.getElementById('stats-filter').value;
    const now=Date.now();
    let calls=db.calls.filter(c=>{
        const d=new Date(c.timestamp);
        if(filter==='today') return d.toDateString()===(new Date()).toDateString();
        return true;
    });

    // 1. TMA em Segundos (Só números)
    const totalSecs = calls.reduce((a,c)=>a+c.duration,0);
    document.getElementById('stat-tma').innerText = calls.length ? Math.round(totalSecs/calls.length) : 0;

    // 2. Tempo Logado (Cálculo na hora do click)
    let loggedMs = db.shifts.reduce((a,s)=>a+(s.end-s.start),0);
    if(isShiftActive) loggedMs += (now - shiftStartTime);
    document.getElementById('stat-logged').innerText = formatHoursMinutesFromMs(loggedMs);

    // 3. Pausas (Cálculo na hora do click)
    let pauseMs = db.pauses.reduce((a,p)=>a+(p.end-p.start),0);
    if(isPauseActive) pauseMs += (now - pauseStartTime);
    document.getElementById('stat-pauses').innerText = formatHoursMinutesFromMs(pauseMs);

    // 4. Desconexão
    const valid = calls.filter(c => c.result === 'retido' || c.result === 'cancelado');
    const cancels = calls.filter(c => c.result === 'cancelado').length;
    document.getElementById('stat-disc').innerText = valid.length ? Math.round((cancels/valid.length)*100)+'%' : '0%';
}

// --- RESTO DA LÓGICA (SHIFTS/PAUSAS/AUX) ---

window.toggleShift = function(){
    const btn=document.getElementById('btn-shift');
    if(isShiftActive && !window.requireConfirm(btn,'shift')) return;
    if(!isShiftActive){
        isShiftActive=true; shiftStartTime=Date.now();
        btn.innerText='Encerrar Jornada'; btn.classList.replace('btn-glass','btn-danger');
        shiftInterval=setInterval(updateShiftTimer,1000);
    } else {
        if(isCallActive) finalizeRecord('retido', null);
        if(isPauseActive) window.endPause(true);
        clearInterval(shiftInterval);
        db.shifts.push({start:shiftStartTime,end:Date.now()});
        isShiftActive=false;
        btn.innerText='Iniciar Jornada'; btn.classList.replace('btn-danger','btn-glass');
    }
    animarEntradaFluxo(isShiftActive, isPauseActive);
    saveData();
}

window.startPause = function(){
    if(!isShiftActive || isCallActive || isPauseActive) return;
    if(!window.requireConfirm(event.currentTarget,'pause')) return;
    isPauseActive=true; pauseStartTime=Date.now();
    document.getElementById('active-break-display').classList.remove('none');
    pauseInterval=setInterval(()=>{
        document.getElementById('break-timer').innerText = formatTime(Math.floor((Date.now()-pauseStartTime)/1000));
    },1000);
    animarEntradaFluxo(isShiftActive, isPauseActive);
}

window.endPause = function(force){
    if(!isPauseActive) return;
    if(!force && !window.requireConfirm(event.currentTarget,'return')) return;
    clearInterval(pauseInterval);
    db.pauses.push({ type:document.getElementById('pause-type').value, start:pauseStartTime, end:Date.now() });
    isPauseActive=false;
    document.getElementById('active-break-display').classList.add('none');
    animarEntradaFluxo(isShiftActive, isPauseActive);
    saveData();
}

function updateCallTimer(){ document.getElementById('call-display').innerText=formatTime(Math.floor((Date.now()-callStartTime)/1000)); }
function updateShiftTimer(){ document.getElementById('session-timer').innerText=formatTimeFull(Math.floor((Date.now()-shiftStartTime)/1000)); }
function formatTime(s){ return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function formatTimeFull(s){
    const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function formatHoursMinutesFromMs(ms){
    const total=Math.floor(ms/60000);
    return `${Math.floor(total/60)}h ${total%60}m`;
}
function saveData(){ localStorage.setItem('claro_data',JSON.stringify(db)); updateHomeCards(); }
function updateHomeCards(){
    const calls=db.calls.filter(c=>new Date(c.timestamp).toDateString()===(new Date()).toDateString());
    document.getElementById('desc-display').innerText = calls.filter(c=>c.result==='cancelado').length;
    const total=calls.reduce((a,c)=>a+c.duration,0);
    document.getElementById('tma-display').innerText = calls.length ? Math.round(total/calls.length) : 0;
}

window.addEventListener('load',()=>{ 
    saveData(); 
    animarEntradaFluxo(false, false); 
});
