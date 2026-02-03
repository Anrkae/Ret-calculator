import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================= CONFIG ================= */

const firebaseConfig = {
    apiKey: "AIzaSyA-f7KfWUq9bcusIHmqTpSDq0S-4rC7lqs",
    authDomain: "claro-ret.firebaseapp.com",
    projectId: "claro-ret",
    storageBucket: "claro-ret.firebasestorage.app",
    messagingSenderId: "218601890292",
    appId: "1:218601890292:web:31e30552518c20ff8d19a1"
};

const METAS = {
    TMA: 625,
    JACKIN: 19500,
    TEMPO_LOGADO: 22800, // 6h20min
    DESCON: 12.5
};

/* ================= INIT ================= */

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const tbody = document.getElementById('table-body');
const status = document.getElementById('status');
const headers = document.querySelectorAll('th[data-key]');
const search = document.getElementById('search');
const dateFilter = document.getElementById('date-filter');

let users = [];
let rawDocs = [];
let sortKey = 'tma';
let sortDir = 'desc';

/* ================= UTILS ================= */

const secToHMS = s =>
    `${String(Math.floor(s / 3600)).padStart(2,'0')}:` +
    `${String(Math.floor((s % 3600) / 60)).padStart(2,'0')}:` +
    `${String(Math.floor(s % 60)).padStart(2,'0')}`;

const secToHM = s => {
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}min`;
};

const lowerBetter = (v, m) =>
    v <= m ? 'green' : v <= m * 1.1 ? 'yellow' : 'red';

const higherBetter = (v, m) =>
    v >= m ? 'green' : v >= m * 0.9 ? 'yellow' : 'red';

const desconColor = v =>
    v > METAS.DESCON ? 'red' : 'green';

/* ================= DATE FILTER ================= */

function inRange(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const docDate = new Date(y, m - 1, d);
    const now = new Date();
    
    if (dateFilter.value === 'today') {
        return docDate.toDateString() === now.toDateString();
    }
    
    if (dateFilter.value === 'month') {
        return (
            docDate.getMonth() === now.getMonth() &&
            docDate.getFullYear() === now.getFullYear()
        );
    }
    
    if (dateFilter.value === 'last7') {
        const diff = (now - docDate) / 86400000;
        return diff <= 7;
    }
    
    return true;
}

/* ================= LOAD ================= */

async function loadData() {
    status.innerText = "Carregando dados…";
    
    const snap = await getDocs(collection(db, "sessoes"));
    rawDocs = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
    }));
    
    applyFilters();
}

/* ================= PROCESS ================= */

function applyFilters() {
    const map = {};
    const agora = Date.now();
    
    rawDocs.forEach(doc => {
        const dateId = doc.id.split('_')[0];
        if (!inRange(dateId)) return;
        
        const mat = doc.matricula;
        if (!map[mat]) {
            map[mat] = { calls: [], shifts: [], pauses: [], jackin: 0, activeTime: 0, dates: new Set() };
        }
        
        const h = doc.historico || {};
        const sessao = doc.sessao_atual || {};

        map[mat].calls.push(...(h.calls || []));
        map[mat].shifts.push(...(h.shifts || []));
        map[mat].pauses.push(...(h.pauses || []));
        map[mat].jackin += h.jackinTime || 0;

        // Registrar datas que tiveram atividade para cálculo da média
        if ((h.shifts && h.shifts.length > 0) || sessao.isShiftActive) {
            map[mat].dates.add(dateId);
        }

        // Tempo da sessão que ainda está aberta
        if (sessao.isShiftActive && sessao.shiftStart) {
            map[mat].activeTime += (agora - sessao.shiftStart);
        }
    });
    
    users = Object.entries(map).map(([mat, u]) => {
        const atendidas = u.calls.length;
        const cancel = u.calls.filter(c => c.result === 'cancelado').length;
        const descon = atendidas ? (cancel / atendidas) * 100 : 0;
        
        const tma = atendidas ?
            Math.round(u.calls.reduce((a, c) => a + c.duration, 0) / atendidas) :
            0;
        
        const diasTrabalhados = u.dates.size || 1;
        
        // SOMA TOTAL EM SEGUNDOS (Histórico + Sessão Ativa)
        const tempoLogadoTotalSec = (u.shifts.reduce((a, s) => a + (s.end - s.start), 0) + u.activeTime) / 1000;
        
        const pausaTotalSec = u.pauses.reduce((a, p) => a + (p.end - p.start), 0) / 1000;
        
        const pausaParticularSec = u.pauses
            .filter(p => String(p.type).toLowerCase() === 'particular')
            .reduce((a, p) => a + (p.end - p.start), 0) / 1000;
        
        const jackinTotalSec = u.jackin / 1000;
        
        return {
            mat,
            descon,
            tma,
            // AQUI A MÁGICA: Divide o total pelo número de dias com jornada
            particular: Math.floor(pausaParticularSec / diasTrabalhados),
            pausa: Math.floor(pausaTotalSec / diasTrabalhados),
            atendidas: Math.round(atendidas / diasTrabalhados), // Média de atendidas/dia
            tempoLogado: Math.floor(tempoLogadoTotalSec / diasTrabalhados),
            jackin: Math.floor(jackinTotalSec / diasTrabalhados)
        };
    });
    
    render();
    status.innerText = `✔ ${users.length} usuários`;
}

/* ================= SORT ================= */

function sortUsers() {
    users.sort((a, b) =>
        sortDir === 'asc' ?
        a[sortKey] - b[sortKey] :
        b[sortKey] - a[sortKey]
    );
}

/* ================= RENDER ================= */

function render() {
    sortUsers();
    tbody.innerHTML = "";
    
    users
        .filter(u => u.mat.toLowerCase().includes(search.value.toLowerCase()))
        .forEach(u => {
            tbody.innerHTML += `
                <tr>
                    <td>${u.mat}</td>
                    <td class="${desconColor(u.descon)}">${u.descon.toFixed(1)}%</td>
                    <td class="${lowerBetter(u.tma, METAS.TMA)}">${u.tma}</td>
                    <td>${secToHM(u.particular)}</td>
                    <td>${secToHM(u.pausa)}</td>
                    <td>${u.atendidas}</td>
                    <td class="${higherBetter(u.tempoLogado, METAS.TEMPO_LOGADO)}">
                        ${secToHM(u.tempoLogado)}
                    </td>
                    <td class="${higherBetter(u.jackin, METAS.JACKIN)}">
                        ${secToHMS(u.jackin)}
                    </td>
                </tr>
            `;
        });
    
    updateSortIcons();
}

/* ================= ICONS ================= */

function updateSortIcons() {
    headers.forEach(h => {
        const icon = h.querySelector('i');
        if (!icon) return;
        
        icon.className = 'fa-solid fa-sort';
        if (h.dataset.key === sortKey) {
            icon.className =
                sortDir === 'asc' ?
                'fa-solid fa-sort-up' :
                'fa-solid fa-sort-down';
        }
    });
}

/* ================= EVENTS ================= */

headers.forEach(h => {
    h.addEventListener('click', () => {
        const key = h.dataset.key;
        sortDir = sortKey === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc';
        sortKey = key;
        render();
    });
});

search.addEventListener('input', render);
dateFilter.addEventListener('change', applyFilters);

/* ================= START ================= */

loadData();
