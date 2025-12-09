const tableBody = document.querySelector('#results-table tbody');
const totalEl = document.getElementById('total-fills');
const perfectEl = document.getElementById('perfect-fills');
const refreshBtn = document.getElementById('refresh-btn');
const startStopBtn = document.getElementById('start-stop-btn');
const statusBadge = document.getElementById('quiz-status-badge');
const resetBtn = document.getElementById('reset-btn');
const confettiBtn = document.getElementById('confetti-btn');
const waitingListEl = document.getElementById('waiting-users-list');
const waitingCountEl = document.getElementById('waiting-count');

// Views
const dashboardContent = document.getElementById('dashboard-content');
const liveView = document.getElementById('live-view');
const podiumView = document.getElementById('podium-view');
const podiumContainer = document.getElementById('podium-container');
const controlPanel = document.getElementById('main-control-panel');
const backToListBtn = document.getElementById('back-to-list-btn');

// Auth Elements
const loginOverlay = document.getElementById('login-overlay');
const loginBtn = document.getElementById('login-btn');
const passInput = document.getElementById('admin-pass');
const authError = document.getElementById('auth-error');

// State
let lastPerfectCount = 0;
let isFirstLoad = true;
let isQuizActive = false;
let currentResults = [];
let adminToken = sessionStorage.getItem('dashboard_token') || "";

// --- Auth Logic ---
if (adminToken) {
    loginOverlay.style.display = 'none';
    dashboardContent.style.display = 'block'; // Show content
    fetchData(); // Start fetching if token exists
} else {
    // If no token, overlay is visible by default (CSS)
    // and dashboardContent is hidden
}

loginBtn.addEventListener('click', async () => {
    const password = passInput.value;
    authError.textContent = '';
    
    try {
        const response = await fetch('/api/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            adminToken = data.token;
            sessionStorage.setItem('dashboard_token', adminToken);
            loginOverlay.style.display = 'none';
            dashboardContent.style.display = 'block'; // Show dashboard
            fetchData(); // Start dashboard operations
        } else {
            authError.textContent = data.error || 'Ismeretlen hiba.';
        }
    } catch (error) {
        authError.textContent = 'Hálózati hiba vagy a szerver nem elérhető.';
        console.error("Login error:", error);
    }
});

function getHeaders(extraHeaders = {}) {
    return {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken,
        ...extraHeaders
    };
}

// Global fetch wrapper for protected endpoints
async function protectedFetch(url, options = {}) {
    options.headers = getHeaders(options.headers);
    const response = await fetch(url, options);

    if (response.status === 401) {
        authError.textContent = 'Autentikáció szükséges. Jelentkezz be újra.';
        loginOverlay.style.display = 'flex'; // Show login overlay again
        dashboardContent.style.display = 'none'; // Hide content
        sessionStorage.removeItem('dashboard_token');
        adminToken = ""; // Clear token
        alert("A munkameneted lejárt vagy hibás a jelszó. Kérlek, jelentkezz be újra.");
        return null; // Indicate failure
    }
    return response.json();
}

// --- Control Panel Logic ---
startStopBtn.addEventListener('click', async () => {
    if (isQuizActive) {
        if(!confirm("Leállítod a kvízt és megmutatod a győzteseket?")) return;
        
        const data = await protectedFetch('/api/stop-quiz', { method: 'POST' });
        if (data && data.success) {
            updateStatusUI(false);
            revealPodium();
        }

    } else {
        if(!confirm("Indulhat a kvíz minden résztvevőnek?")) return;

        const data = await protectedFetch('/api/start-quiz', { method: 'POST' });
        if (data && data.success) {
            updateStatusUI(true);
            showLiveView();
            fetchData();
        }
    }
});

resetBtn.addEventListener('click', async () => {
    if(!confirm("FIGYELEM! Új kör indítása: Törlődik minden eredmény!")) return;
    
    const data = await protectedFetch('/api/reset-quiz', { method: 'POST' });
    if (data && data.success) {
        alert("Új kör előkészítve.");
        lastPerfectCount = 0;
        showLiveView();
        checkStatus();
        fetchData();
    }
});

function kickUser(name) {
    if(!confirm(`Biztosan ki akarod dobni ezt a felhasználót: ${name}?`)) return;

    protectedFetch('/api/kick', { 
        method: 'POST', 
        body: JSON.stringify({ name })
    })
    .then(data => {
        if(data && data.success) {
            checkStatus(); // Refresh list immediately
        }
    });
}

backToListBtn.addEventListener('click', () => {
    showLiveView();
});

confettiBtn.addEventListener('click', () => fireConfetti());

// ... Rest of the functions (fireConfetti, updateStatusUI, renderWaitingUsers, etc.) ...
// Merged for brevity, ensuring existing logic is kept

function showLiveView() {
    podiumView.style.display = 'none';
    liveView.style.display = 'block';
    controlPanel.style.display = 'block';
}

function revealPodium() {
    const sorted = [...currentResults].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(a.timestamp) - new Date(b.timestamp);
    });
    const top3 = sorted.slice(0, 3);
    
    if (top3.length === 0) {
        alert("Még nincs eredmény!");
        return;
    }

    liveView.style.display = 'none';
    controlPanel.style.display = 'none';
    podiumView.style.display = 'block';
    podiumContainer.innerHTML = '';

    const placesMap = [
        { rank: 1, cls: 'place-1', label: '1. Hely', medal: '🥇' },
        { rank: 2, cls: 'place-2', label: '2. Hely', medal: '🥈' },
        { rank: 3, cls: 'place-3', label: '3. Hely', medal: '🥉' }
    ];

    top3.forEach((user, index) => {
        const place = placesMap[index];
        const div = document.createElement('div');
        div.className = `podium-place ${place.cls}`;
        div.innerHTML = `
            <div class="winner-name">${user.name}</div>
            <div class="podium-box">
                <div class="medal-icon">${place.medal}</div>
                <div class="winner-score">${user.score}/${user.total}</div>
                <div style="font-size:0.8rem; margin-top:5px; opacity:0.7">${new Date(user.timestamp).toLocaleTimeString()}</div>
            </div>
        `;
        podiumContainer.appendChild(div);
    });

    const tl = gsap.timeline();
    if (document.querySelector('.place-3')) tl.to('.place-3', { opacity: 1, y: 0, duration: 1, ease: "back.out(1.7)" });
    if (document.querySelector('.place-2')) tl.to('.place-2', { opacity: 1, y: 0, duration: 1, ease: "back.out(1.7)" }, "-=0.5");
    tl.to('.place-1', { opacity: 1, y: 0, duration: 1.2, ease: "elastic.out(1, 0.3)", onComplete: () => fireConfetti() }, "-=0.5");
}

function updateStatusUI(isActive) {
    isQuizActive = isActive;
    
    if (isActive) {
        statusBadge.textContent = "JÁTÉK FOLYAMATBAN";
        statusBadge.style.background = "var(--success)";
        
        startStopBtn.textContent = "Kvíz Leállítása & Eredményhirdetés";
        startStopBtn.style.background = "var(--ink-light)"; 
        startStopBtn.style.borderColor = "var(--ink-light)";
    } else {
        statusBadge.textContent = "VÁRAKOZÁS";
        statusBadge.style.background = "var(--ink-light)";
        
        startStopBtn.textContent = "Kvíz Indítása";
        startStopBtn.style.background = "var(--success)"; 
        startStopBtn.style.borderColor = "var(--success)";
    }
}

function renderWaitingUsers(users) {
    waitingCountEl.textContent = users.length;
    waitingListEl.innerHTML = '';
    if (users.length === 0) {
        waitingListEl.innerHTML = '<span style="font-style: italic; opacity: 0.6;">Még senki nem csatlakozott...</span>';
        return;
    }
    users.forEach(name => {
        const chip = document.createElement('div');
        chip.className = 'user-chip';
        chip.innerHTML = `
            <span>${name}</span>
            <button class="kick-btn" title="Kirúgás">×</button>
        `;
        chip.querySelector('.kick-btn').onclick = () => kickUser(name);
        waitingListEl.appendChild(chip);
    });
}

async function checkStatus() {
    const data = await fetch('/api/quiz-status').then(res => res.json());
    if (data) {
        updateStatusUI(data.active);
        if (data.waitingUsers) renderWaitingUsers(data.waitingUsers);
        if (data.sessionId) console.log("Current Session ID:", data.sessionId);
    }
}

async function fetchData() {
    refreshBtn.style.opacity = '0.7';
    checkStatus();

    const data = await fetch('/api/results').then(res => res.json());
    if (data) {
        currentResults = data; 
        renderTable(data);
        updateStats(data);
        refreshBtn.style.opacity = '1';
        
        const perfects = data.filter(d => d.score === d.total).length;
        if (perfects > lastPerfectCount && !isFirstLoad) {
            fireConfetti();
        }
        lastPerfectCount = perfects;
        isFirstLoad = false;
    }
}

function renderTable(data) {
    tableBody.innerHTML = '';
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center; opacity: 0.5;">Még nem érkezett válasz.</td></tr>';
        return;
    }
    data.forEach(entry => {
        const tr = document.createElement('tr');
        const date = new Date(entry.timestamp);
        const timeStr = date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const isPerfect = entry.score === entry.total;
        const scoreClass = isPerfect ? 'score-perfect' : '';
        const nameDisplay = isPerfect ? `🏆 ${entry.name}` : entry.name;
        const rowStyle = isPerfect ? 'background: rgba(39, 174, 96, 0.1);' : '';

        tr.style = rowStyle;
        tr.innerHTML = `<td>${nameDisplay}</td><td class="${scoreClass}">${entry.score} / ${entry.total}</td><td>${timeStr}</td>`;
        tableBody.appendChild(tr);
    });
}

function updateStats(data) {
    totalEl.textContent = data.length;
    const perfects = data.filter(d => d.score === d.total).length;
    perfectEl.textContent = perfects;
}

function fireConfetti() {
    const colors = ['#c5a059', '#8b3a3a', '#2c241b', '#fdfbf7', '#d4af37'];
    const count = 200; 
    for (let i = 0; i < count; i++) {
        createParticle(colors, 'left');
        createParticle(colors, 'right');
    }
}
function createParticle(colors, side) {
    const el = document.createElement('div');
    const size = Math.random() * 12 + 6;
    el.style.position = 'fixed';
    el.style.width = size + 'px';
    el.style.height = (Math.random() * 0.4 + 0.8) * size + 'px'; 
    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    el.style.zIndex = '9999';
    el.style.pointerEvents = 'none';
    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    
    const startX = side === 'left' ? 0 : window.innerWidth;
    const startY = window.innerHeight;
    el.style.left = startX + 'px';
    el.style.top = startY + 'px';
    document.body.appendChild(el);

    const angleBase = side === 'left' ? -Math.PI / 4 : -Math.PI * 0.75; 
    const angleVar = (Math.random() - 0.5) * 1.5; 
    const angle = angleBase + angleVar;
    const velocity = Math.random() * 800 + 400; 
    const xEnd = Math.cos(angle) * velocity + startX;
    const yEnd = Math.sin(angle) * velocity + startY;
    const tl = gsap.timeline({ onComplete: () => el.remove() });
    tl.to(el, { x: (xEnd - startX) * 1.5, y: (yEnd - startY) * 1.2, rotation: Math.random() * 1000, duration: Math.random() * 1 + 1.5, ease: "power4.out" });
    gsap.to(el, { y: window.innerHeight + 100, duration: Math.random() * 2 + 2, ease: "power1.in", delay: 0.1 });
}

refreshBtn.addEventListener('click', fetchData);
setInterval(fetchData, 5000);
