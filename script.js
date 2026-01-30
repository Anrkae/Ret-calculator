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

function toast(msg){
    const t=document.createElement('div');
    t.className='toast';
    t.innerText=msg;
    document.body.appendChild(t);
    requestAnimationFrame(()=>t.classList.add('show'));
    setTimeout(()=>{
        t.classList.remove('show');
        setTimeout(()=>t.remove(),300);
    },2500);
}

function requireConfirm(btn, key){
    if(btn.dataset.confirm === key){
        clearTimeout(btn._confirmTimeout);
        gsap.killTweensOf(btn);
        btn.classList.remove('confirming');
        btn.innerText = btn.dataset.originalText;
        delete btn.dataset.confirm;
        return true;
    }

    btn.dataset.confirm = key;
    btn.dataset.originalText = btn.innerText;

    gsap.to(btn,{
        opacity:0,
        duration:0.15,
        onComplete:()=>{
            btn.innerText='Confirmar';
            gsap.to(btn,{opacity:1,duration:0.15});
        }
    });

    btn.classList.add('confirming');

    btn._confirmTimeout=setTimeout(()=>{
        gsap.to(btn,{
            opacity:0,
            duration:0.15,
            onComplete:()=>{
                btn.classList.remove('confirming');
                btn.innerText=btn.dataset.originalText;
                gsap.to(btn,{opacity:1,duration:0.15});
                delete btn.dataset.confirm;
            }
        });
    },2500);

    return false;
}

function saveData(){
    localStorage.setItem('claro_data',JSON.stringify(db));
    updateStatsDisplay();
    updateHomeCards();
}

function showPage(pageId){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
    document.getElementById(`nav-${pageId}`).classList.add('active');
    if(pageId==='stats') updateStatsDisplay();
}

function startCall(){
    if(!isShiftActive) return toast('Você está offline');
    if(isPauseActive) return toast('Finalize a pausa');
    if(isCallActive) return toast('Ligação já ativa');
    isCallActive=true;
    callStartTime=Date.now();
    callInterval=setInterval(updateCallTimer,1000);
}

function updateCallTimer(){
    const diff=Math.floor((Date.now()-callStartTime)/1000);
    document.getElementById('call-display').innerText=formatTime(diff);
}

function endCall(result){
    if(!isCallActive) return toast('Nenhuma ligação ativa');
    const btn=document.activeElement;
    if(!requireConfirm(btn,result)) return;

    clearInterval(callInterval);
    const duration=Math.floor((Date.now()-callStartTime)/1000);

    pendingCallData = {
        timestamp: new Date().toISOString(),
        duration: duration,
        result: result,
        reason: null
    };

    if(result === 'cancelado') {
        document.getElementById('modal-motivos').style.display = 'flex';
    } else {
        finalizeRecord(result, null);
    }
}

function confirmReason(reason) {
    const btn = event.currentTarget;
    if (!requireConfirm(btn, reason)) return;

    document.getElementById('modal-motivos').style.display = 'none';
    if(reason === '021') {
        finalizeRecord('improdutivo', '021');
    } else {
        finalizeRecord('cancelado', reason);
    }
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

function toggleShift(){
    const btn=document.getElementById('btn-shift');
    if(isShiftActive && !requireConfirm(btn,'shift')) return;
    const snippet=document.getElementById('jackin-snippet');
    const statusText=document.getElementById('shift-status');
    if(!isShiftActive){
        isShiftActive=true;
        shiftStartTime=Date.now();
        btn.innerText='Encerrar Jornada';
        btn.classList.replace('btn-glass','btn-danger');
        statusText.innerText='Em Jornada';
        snippet.classList.replace('status-off','status-on');
        shiftInterval=setInterval(updateShiftTimer,1000);
        updateSnippetIcon();
        return;
    }
    if(isCallActive) finalizeRecord('retido', null);
    if(isPauseActive) endPause(true);
    clearInterval(shiftInterval);
    db.shifts.push({start:shiftStartTime,end:Date.now()});
    isShiftActive=false;
    btn.innerText='Iniciar Jornada';
    btn.classList.replace('btn-danger','btn-glass');
    statusText.innerText='Off-line';
    snippet.classList.replace('status-on','status-off');
    document.getElementById('session-timer').innerText='00:00:00';
    updateSnippetIcon();
    saveData();
}

function updateShiftTimer(){
    const diff=Math.floor((Date.now()-shiftStartTime)/1000);
    document.getElementById('session-timer').innerText=formatTimeFull(diff);
}

function startPause(){
    if(!isShiftActive) return toast('Você está offline');
    if(isCallActive) return toast('Finalize a ligação');
    if(isPauseActive) return toast('Pausa já ativa');
    const btn=document.activeElement;
    if(!requireConfirm(btn,'pause')) return;
    isPauseActive=true;
    pauseStartTime=Date.now();
    document.getElementById('active-break-display').style.display='block';
    pauseInterval=setInterval(()=>{
        const diffSeconds = Math.floor((Date.now()-pauseStartTime)/1000);
        document.getElementById('break-timer').innerText = formatTime(diffSeconds);
    },1000);
}

function endPause(force){
    if(!isPauseActive){
        toast('Nenhuma pausa ativa');
        return;
    }
    const btn=document.activeElement;
    if(!force && !requireConfirm(btn,'return')) return;
    clearInterval(pauseInterval);
    db.pauses.push({
        type:document.getElementById('pause-type').value,
        start:pauseStartTime,
        end:Date.now()
    });
    isPauseActive=false;
    document.getElementById('active-break-display').style.display='none';
    saveData();
}

function toggleSnippet() {
    const snippet = document.getElementById('jackin-snippet');
    snippet.classList.toggle('minimized');
    updateSnippetIcon();
}

function updateSnippetIcon() {
    const snippet = document.getElementById('jackin-snippet');
    const btn = document.getElementById('toggle-snippet');
    if (snippet.classList.contains('minimized')) {
        btn.innerHTML = '<i class="fa-solid fa-stopwatch"></i>';
        btn.style.color = isShiftActive ? '#00ff6a' : '#fff';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        btn.style.color = '';
    }
}

function formatTime(s){
    const m=Math.floor(s/60);
    const sec=s%60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function formatTimeFull(s){
    const h=Math.floor(s/3600);
    const m=Math.floor((s%3600)/60);
    const sec=s%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function formatHoursMinutesFromMs(ms){
    const total=Math.floor(ms/60000);
    return `${Math.floor(total/60)}h ${total%60}m`;
}

function updateHomeCards(){
    const today=new Date().toDateString();
    const calls=db.calls.filter(c=>new Date(c.timestamp).toDateString()===today);
    document.getElementById('desc-display').innerText =
        calls.filter(c=>c.result==='cancelado').length;
    const total=calls.reduce((a,c)=>a+c.duration,0);
    document.getElementById('tma-display').innerText =
        calls.length ? Math.round(total/calls.length) : 0;
}

function updateStatsDisplay(){
    const filter=document.getElementById('stats-filter').value;
    const now=new Date();
    let calls=db.calls.filter(c=>{
        const d=new Date(c.timestamp);
        if(filter==='today') return d.toDateString()===now.toDateString();
        if(filter==='current_month')
            return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
        return true;
    });
    const total=calls.reduce((a,c)=>a+c.duration,0);
    document.getElementById('stat-tma').innerText =
        calls.length ? formatTime(Math.round(total/calls.length)) : "00:00";
    const validPerformance = calls.filter(c => c.result === 'retido' || c.result === 'cancelado');
    const cancels = calls.filter(c => c.result === 'cancelado').length;
    document.getElementById('stat-disc').innerText =
        validPerformance.length ? Math.round((cancels/validPerformance.length)*100)+'%' : '0%';
    const pauseMs=db.pauses.reduce((a,p)=>a+(p.end-p.start),0);
    document.getElementById('stat-pauses').innerText =
        formatHoursMinutesFromMs(pauseMs);
    let logged=db.shifts.reduce((a,s)=>a+(s.end-s.start),0);
    if(isShiftActive) logged+=Date.now()-shiftStartTime;
    document.getElementById('stat-logged').innerText =
        formatHoursMinutesFromMs(logged);
}

updateStatsDisplay();
updateHomeCards();

const carrossel=document.querySelector('.carrossel');
const cards=Array.from(carrossel.querySelectorAll('.card'));
let index=0;
let autoSlide;

function goTo(i){
    const y=window.scrollY;
    cards[i].scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
    window.scrollTo({top:y});
}

function toggleSlide(){
    index=index===0?1:0;
    goTo(index);
}

function start(){
    autoSlide=setInterval(toggleSlide,3500);
}

function stop(){
    clearInterval(autoSlide);
}

window.addEventListener('load',()=>{
    goTo(index);
    start();
});

carrossel.addEventListener('touchstart',stop,{passive:true});
carrossel.addEventListener('touchend',start);
