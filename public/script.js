// Global Config Placeholder
let appContent = {}; 
let configSettings = {};

// --- STATE ---
let currentQuestion = 0;
let anecdoteIndex = 0;
let answers = [];
let username = "";
let pollInterval = null;
let gameWatchdogInterval = null;
let clientSessionId = null; // New: Track current session

// --- DOM ELEMENTS ---
const elems = {
    loginView: document.getElementById('login-view'),
    waitingView: document.getElementById('waiting-view'),
    quizView: document.getElementById('quiz-view'),
    resultView: document.getElementById('result-view'),
    username: document.getElementById('username'),
    startBtn: document.getElementById('start-btn'),
    error: document.getElementById('login-error'),
    questionText: document.getElementById('question-text'),
    optionsContainer: document.getElementById('options-container'),
    anecdoteText: document.getElementById('anecdote-text'),
    prevAnec: document.getElementById('prev-anecdote'),
    nextAnec: document.getElementById('next-anecdote'),
    questionCounter: document.getElementById('question-counter'),
    playerName: document.getElementById('player-name-display'),
    waitingPlayerName: document.getElementById('waiting-player-name'),
    stamp: document.getElementById('stamp'),
    questionCard: document.getElementById('question-card'),
    resultMsg: document.getElementById('result-message')
};

// --- INIT ---
// First fetch config, then fetch status to get session ID
Promise.all([
    fetch('/api/config').then(res => res.json()),
    fetch('/api/quiz-status').then(res => res.json())
]).then(([configData, statusData]) => {
    // Process Config
    if (configData.ui_texts && configData.questions && configData.anecdotes) {
        appContent = {
            ...configData.ui_texts,
            questions: configData.questions,
            anecdotes: configData.anecdotes
        };
    } else {
        console.error("Invalid config structure");
        return;
    }
    configSettings = configData.settings || {};
    
    // Process Session
    clientSessionId = statusData.sessionId;
    console.log("Session ID:", clientSessionId);

    initApp();
    
    // Start global watchdog for session changes (even on login screen)
    setInterval(checkGlobalSession, 5000);

}).catch(err => {
    console.error("Failed to load initial data:", err);
    elems.anecdoteText.textContent = "Error loading application.";
});

function initApp() {
    if (configSettings.client_reset_enabled) {
        addClientResetButton();
    }

    // Check completion for THIS specific session
    const storageKey = `arany_quiz_completed_${clientSessionId}`;
    if (localStorage.getItem(storageKey)) {
        updateUI(); 
        showResult(true);
    } else {
        updateUI();
        startAnecdoteCarousel();
    }
}

// --- Global Session Watchdog ---
function checkGlobalSession() {
    fetch('/api/quiz-status')
        .then(res => res.json())
        .then(data => {
            if (data.sessionId !== clientSessionId) {
                console.log("New session detected! Reloading...");
                location.reload(); // Simplest way to reset client state for new session
            }
        })
        .catch(err => console.log("Session check error:", err));
}

function addClientResetButton() {
    const btn = document.createElement('button');
    btn.innerHTML = '↺ Reset (Dev)';
    btn.style.position = 'fixed';
    btn.style.bottom = '10px';
    btn.style.left = '10px';
    btn.style.zIndex = '10000';
    btn.style.background = 'rgba(139, 58, 58, 0.8)';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.padding = '5px 10px';
    btn.style.borderRadius = '5px';
    btn.style.fontSize = '0.8rem';
    btn.style.cursor = 'pointer';
    
    btn.onclick = () => {
        if(confirm('Törlöd a helyi adatokat és újrakezded?')) {
            const storageKey = `arany_quiz_completed_${clientSessionId}`;
            localStorage.removeItem(storageKey);
            location.reload();
        }
    };
    document.body.appendChild(btn);
}

// --- EVENTS ---
elems.startBtn.addEventListener('click', enterLobby);
elems.prevAnec.addEventListener('click', () => changeAnecdote(-1));
elems.nextAnec.addEventListener('click', () => changeAnecdote(1));

// --- FUNCTIONS ---

function updateUI() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (appContent[key]) el.textContent = appContent[key];
    });
    elems.username.placeholder = appContent.placeholder;
    elems.anecdoteText.textContent = appContent.anecdotes[anecdoteIndex];
    
    if (elems.quizView.style.display !== 'none') {
       elems.questionCounter.textContent = `${appContent.qCounter}: ${currentQuestion + 1} / ${appContent.questions.length}`;
       if (currentQuestion < appContent.questions.length) {
            loadQuestion(false); 
       }
    }
}

function startAnecdoteCarousel() { /* Manual */ }

function changeAnecdote(dir) {
    const list = appContent.anecdotes;
    anecdoteIndex += dir;
    if (anecdoteIndex >= list.length) anecdoteIndex = 0;
    if (anecdoteIndex < 0) anecdoteIndex = list.length - 1;
    gsap.to(elems.anecdoteText, { opacity: 0, duration: 0.2, onComplete: () => {
        elems.anecdoteText.textContent = list[anecdoteIndex];
        gsap.to(elems.anecdoteText, { opacity: 1, duration: 0.2 });
    }});
}

function enterLobby() {
    const name = elems.username.value.trim();
    if (name.length < 2) {
        elems.error.textContent = appContent.errorName;
        return;
    }
    username = name;
    elems.waitingPlayerName.textContent = username;
    
    fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: username })
    })
    .then(res => {
        if (!res.ok) {
            if (res.status === 403) throw new Error("QuizActive");
            throw new Error("JoinFailed");
        }
        return res.json();
    })
    .then(() => {
        gsap.to(elems.loginView, { y: -20, opacity: 0, duration: 0.4, onComplete: () => {
            elems.loginView.style.display = 'none';
            elems.waitingView.style.display = 'block';
            gsap.fromTo(elems.waitingView, { opacity: 0 }, { opacity: 1, duration: 0.4 });
            startPolling();
        }});
    })
    .catch(err => {
        if (err.message === "QuizActive") {
            elems.error.textContent = appContent.joinError || "A játék már elindult!";
        } else {
            console.error(err);
        }
    });
}

function startPolling() {
    checkStatus();
    pollInterval = setInterval(checkStatus, 2000);
}

function checkStatus() {
    fetch('/api/quiz-status')
        .then(res => res.json())
        .then(data => {
            if (data.active) {
                clearInterval(pollInterval);
                startQuiz();
            } else {
                if (data.waitingUsers && !data.waitingUsers.includes(username)) {
                    clearInterval(pollInterval);
                    alert(appContent.kickedError || "Ki lettél dobva a játékból.");
                    location.reload();
                }
            }
        })
        .catch(err => console.log("Polling error:", err));
}

function checkGameStatus() {
    fetch('/api/quiz-status')
        .then(res => res.json())
        .then(data => {
            if (!data.active) {
                clearInterval(gameWatchdogInterval);
                finishQuiz(true); 
            }
        })
        .catch(err => console.log("Watchdog error:", err));
}

function startQuiz() {
    elems.playerName.textContent = username;
    gameWatchdogInterval = setInterval(checkGameStatus, 3000);

    gsap.to(elems.waitingView, { y: -20, opacity: 0, duration: 0.4, onComplete: () => {
        elems.waitingView.style.display = 'none';
        elems.quizView.style.display = 'block';
        gsap.fromTo(elems.quizView, { opacity: 0 }, { opacity: 1, duration: 0.4 });
        loadQuestion(true);
    }});
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function typeWriter(element, text, speed = 30) {
    element.innerHTML = ""; 
    let i = 0;
    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}

function loadQuestion(animate = true) {
    const qData = appContent.questions[currentQuestion];
    
    if (animate) {
        typeWriter(elems.questionText, qData.q, 40); 
    } else {
        elems.questionText.textContent = qData.q;
    }
    
    elems.questionCounter.textContent = `${appContent.qCounter}: ${currentQuestion + 1} / ${appContent.questions.length}`;
    elems.optionsContainer.innerHTML = '';
    
    let optionsWithIndices = qData.options.map((opt, index) => ({ text: opt, originalIndex: index }));
    optionsWithIndices = shuffleArray(optionsWithIndices);

    optionsWithIndices.forEach((optObj, visualIndex) => {
        const btn = document.createElement('div');
        btn.className = 'option-btn';
        const prefix = String.fromCharCode(65 + visualIndex); 
        btn.innerHTML = `<strong>${prefix})</strong> ${optObj.text}`;
        btn.onclick = () => handleAnswer(optObj.originalIndex, btn);
        
        if (animate) {
            btn.style.opacity = 0;
        }
        
        elems.optionsContainer.appendChild(btn);
    });

    if (animate) {
        gsap.fromTo(elems.questionCard, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" });
        gsap.fromTo('.option-btn', { x: -10, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, stagger: 0.1, delay: 1.5 });
    }
}

function handleAnswer(originalIndex, btn) {
    const allBtns = document.querySelectorAll('.option-btn');
    allBtns.forEach(b => b.style.pointerEvents = 'none');
    answers.push(originalIndex);
    btn.style.background = 'var(--ink)';
    btn.style.color = 'var(--paper)';
    btn.querySelector('strong').style.color = 'var(--paper)';

    setTimeout(() => {
        gsap.to(elems.questionCard, { x: -20, opacity: 0, duration: 0.3, onComplete: () => {
            currentQuestion++;
            if (currentQuestion < appContent.questions.length) {
                loadQuestion(true);
            } else {
                finishQuiz(false);
            }
        }});
    }, 500);
}

function finishQuiz(forced = false) {
    if (gameWatchdogInterval) clearInterval(gameWatchdogInterval);

    elems.quizView.style.display = 'none';
    elems.resultView.style.display = 'block';
    
    if (forced) {
        elems.resultMsg.innerHTML = "A játék véget ért.<br>Nézd a kivetítőt az eredményekért!";
        elems.stamp.style.opacity = 0;
        // Mark completed for THIS session
        const storageKey = `arany_quiz_completed_${clientSessionId}`;
        localStorage.setItem(storageKey, 'true');
        return;
    }

    elems.resultMsg.textContent = appContent.sending;

    fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: username, answers })
    })
    .then(res => res.json())
    .then(data => {
        const storageKey = `arany_quiz_completed_${clientSessionId}`;
        localStorage.setItem(storageKey, 'true');
        displayEndScreen(data);
    })
    .catch(() => {
        elems.resultMsg.textContent = appContent.submitError;
        setTimeout(() => { displayEndScreen({ score: 0, total: 3 }); }, 1500);
    });
}

function displayEndScreen(data) {
    const isPerfect = data.score === data.total;
    let msg = `${appContent.thanks} ${username}!<br>${appContent.resultPrefix} ${data.score} / ${data.total}`;
    elems.resultMsg.innerHTML = msg;
    if (isPerfect) {
        elems.stamp.textContent = appContent.perfect;
        elems.stamp.style.opacity = 1;
        gsap.fromTo(elems.stamp, { scale: 2, opacity: 0, rotation: 10 }, { scale: 1, opacity: 1, rotation: -5, duration: 0.5, ease: "back.out(1.7)" });
        fireConfetti(); 
    } else {
        elems.stamp.style.opacity = 0;
    }
}

function showResult(alreadyDone) {
    if (!appContent.alreadyDone) return; 

    elems.loginView.style.display = 'none';
    elems.waitingView.style.display = 'none';
    elems.quizView.style.display = 'none';
    elems.resultView.style.display = 'block';
    if (alreadyDone) {
        elems.resultMsg.textContent = appContent.alreadyDone;
        elems.stamp.style.opacity = 0;
    }
}

function fireConfetti() {
    const colors = ['#c5a059', '#8b3a3a', '#2c241b', '#fdfbf7', '#d4af37'];
    const count = 150; 
    for (let i = 0; i < count; i++) {
        createParticle(colors, 'left');
        createParticle(colors, 'right');
    }
}
function createParticle(colors, side) {
    const el = document.createElement('div');
    const size = Math.random() * 10 + 5;
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