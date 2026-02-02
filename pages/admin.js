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
    TMA: 625, // segundos (MENOR melhor)
    JACKIN: 19500, // segundos (MAIOR melhor)
    NR17: 2400, // segundos (MENOR melhor)
    DESCON: 12.5 // % rígido
};

/* ================= INIT ================= */

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const tbody = document.getElementById('table-body');
const status = document.getElementById('status');
const headers = document.querySelectorAll('th[data-key]');

let users = [];
let sortKey = 'tma';
let sortDir = 'desc'; // padrão: TMA maior → menor

/* ================= FORMATOS ================= */

const secToHMS = s =>
    `${String(Math.floor(s / 3600)).padStart(2,'0')}:` +
    `${String(Math.floor((s % 3600) / 60)).padStart(2,'0')}:` +
    `${String(s % 60).padStart(2,'0')}`;

const secToHM = s => {
    const m = Math.floor(s / 60);
    return `${Math.floor(m / 60)}h ${m % 60}min`;
};

/* ================= CORES ================= */

const lowerBetter = (v, m) =>
    v <= m ? 'green' : v <= m * 1.1 ? 'yellow' : 'red';

const higherBetter = (v, m) =>
    v >= m ? 'green' : v >= m * 0.9 ? 'yellow' : 'red';

const desconColor = v =>
    v > METAS.DESCON ? 'red' : 'green';

/* ================= LOAD ================= */

async function loadData() {
    status.innerText = "Carregando dados…";
    
    const snap = await getDocs(collection(db, "sessoes"));
    const map = {};
    
    snap.forEach(doc => {
        const d = doc.data();
        
        if (!map[d.matricula]) {
            map[d.matricula] = {
                calls: [],
                shifts: [],
                pauses: [],
                jackin: 0
            };
        }
        
        const h = d.historico || {};
        map[d.matricula].calls.push(...(h.calls || []));
        map[d.matricula].shifts.push(...(h.shifts || []));
        map[d.matricula].pauses.push(...(h.pauses || []));
        map[d.matricula].jackin += h.jackinTime || 0;
    });
    
    users = Object.entries(map).map(([mat, u]) => {
        const atendidas = u.calls.length;
        const cancel = u.calls.filter(c => c.result === 'cancelado').length;
        const descon = atendidas ? (cancel / atendidas) * 100 : 0;
        
        const tma = atendidas ?
            Math.round(u.calls.reduce((a, c) => a + c.duration, 0) / atendidas) :
            0;
        
        const logged = u.shifts.reduce((a, s) => a + (s.end - s.start), 0) / 1000;
        const nr17 = u.shifts.length ? logged / u.shifts.length : 0;
        
        const pausaTotal = u.pauses.reduce(
            (a, p) => a + (p.end - p.start), 0
        ) / 1000;
        
        const pausaParticular = u.pauses
            .filter(p => p.type === 'particular')
            .reduce((a, p) => a + (p.end - p.start), 0) / 1000;
        
        return {
            mat,
            descon,
            tma,
            particular: Math.floor(pausaParticular),
            pausa: Math.floor(pausaTotal),
            atendidas,
            nr17: Math.floor(nr17),
            jackin: Math.floor(u.jackin / 1000)
        };
    });
    
    render();
    status.innerText = `✔ ${users.length} usuários`;
}

/* ================= SORT ================= */

function sortUsers() {
    users.sort((a, b) => {
        const v1 = a[sortKey];
        const v2 = b[sortKey];
        return sortDir === 'asc' ? v1 - v2 : v2 - v1;
    });
}

/* ================= RENDER ================= */

function render() {
    sortUsers();
    tbody.innerHTML = "";
    
    users.forEach(u => {
        tbody.innerHTML += `
            <tr>
                <td>${u.mat}</td>

                <td class="${desconColor(u.descon)}">
                    ${u.descon.toFixed(1)}%
                </td>

                <td class="${lowerBetter(u.tma, METAS.TMA)}">
                    ${u.tma}
                </td>

                <td class="${lowerBetter(u.particular, METAS.NR17)}">
                    ${secToHM(u.particular)}
                </td>

                <td>
                    ${secToHM(u.pausa)}
                </td>

                <td>${u.atendidas}</td>

                <td class="${lowerBetter(u.nr17, METAS.NR17)}">
                    ${secToHM(u.nr17)}
                </td>

                <td class="${higherBetter(u.jackin, METAS.JACKIN)}">
                    ${secToHMS(u.jackin)}
                </td>
            </tr>
        `;
    });
    
    updateSortIcons();
}

/* ================= SORT ICONS ================= */

function updateSortIcons() {
    headers.forEach(h => {
        const icon = h.querySelector('i');
        if (!icon) return;
        
        const key = h.dataset.key;
        icon.className = 'fa-solid fa-sort';
        
        if (key === sortKey) {
            icon.className =
                sortDir === 'asc' ?
                'fa-solid fa-sort-up' :
                'fa-solid fa-sort-down';
        }
    });
}

/* ================= HEADERS ================= */

headers.forEach(h => {
    const key = h.dataset.key;
    
    h.addEventListener('click', () => {
        if (sortKey === key) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            sortKey = key;
            sortDir = 'desc';
        }
        render();
    });
});

/* ================= START ================= */

loadData();