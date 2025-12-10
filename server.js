const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const crypto = require('crypto'); // For generating secure tokens and IDs

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// --- Session Management ---
const SESSIONS_FILE = './sessions.json';
let usedSessionIds = [];
let currentSessionId = "";

function loadSessionHistory() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            usedSessionIds = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error("Error loading session history:", e);
    }
}

function generateSessionId() {
    let newId;
    do {
        // Generate a long, secure random ID (hex string)
        newId = crypto.randomBytes(16).toString('hex');
    } while (usedSessionIds.includes(newId)); // Collision check
    
    usedSessionIds.push(newId);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(usedSessionIds, null, 2));
    return newId;
}

// Initialize Session
loadSessionHistory();
currentSessionId = generateSessionId();
console.log(`Initialize Session ID: ${currentSessionId}`);

// In-memory storage
const results = [];
let waitingUsers = []; 
let quizActive = false;
let configData = null;
let correctAnswersIndices = []; 
let adminSessionToken = null; 

// Load Config & Process Questions
function loadConfig() {
    try {
        const fileContents = fs.readFileSync('./config.yml', 'utf8');
        configData = yaml.load(fileContents);
        
        if (configData.questions && Array.isArray(configData.questions)) {
            correctAnswersIndices = []; // Reset
            
            // PROCESS QUESTIONS: Merge correct answer into options
            configData.questions.forEach(q => {
                const correctText = q.correct_option_text;
                
                // Add correct answer to the options list if not already there
                if (!q.options.includes(correctText)) {
                    q.options.push(correctText);
                }
                
                // Determine index
                const index = q.options.indexOf(correctText);
                if (index === -1) {
                    console.error(`Error: Correct option text "${correctText}" not found in options for question: "${q.q}". Check config.yml.`);
                    // Fallback: if not found, assume first option or handle error
                    correctAnswersIndices.push(0); // Pushing a fallback index
                } else {
                    correctAnswersIndices.push(index);
                }
            });

            console.log('--------------------------------------------------');
            console.log('CONFIG LOADED & PROCESSED');
            console.log(`Total Questions: ${correctAnswersIndices.length}`);
            console.log(`Correct Indices: ${correctAnswersIndices}`);
            console.log(`Password Protection: ${!!configData.settings.dashboard_password ? 'ENABLED' : 'DISABLED'}`);
            console.log('--------------------------------------------------');
        }
    } catch (e) {
        console.error('Error loading config.yml:', e);
    }
}

// Initial load
loadConfig();

// --- Auth Middleware ---
const checkAuth = (req, res, next) => {
    const expectedToken = adminSessionToken; // Get current active token
    if (!expectedToken) {console.log("Unauthorized: Admin session not started"); return res.status(401).json({ error: 'Unauthorized: Admin session not started' })};

    const clientToken = req.headers['x-admin-token'];
    if (clientToken === expectedToken) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

// --- Endpoints ---

// Login endpoint for dashboard
app.post('/api/admin-login', (req, res) => {
    const { password } = req.body;
    if (password === configData.settings.dashboard_password) {
        adminSessionToken = crypto.randomBytes(32).toString('hex'); // Generate a secure token
        res.json({ success: true, token: adminSessionToken });
    } else {
        res.status(401).json({ success: false, error: 'Invalid password' });
    }
});

// Admin-specific endpoints are protected
app.post('/api/start-quiz', checkAuth, (req, res) => {
    quizActive = true;
    console.log('Quiz started by admin!');
    res.json({ success: true, active: quizActive });
});

app.post('/api/stop-quiz', checkAuth, (req, res) => {
    quizActive = false;
    console.log('Quiz stopped/paused by admin.');
    res.json({ success: true, active: quizActive });
});

app.post('/api/reset-quiz', checkAuth, (req, res) => {
    quizActive = false;
    waitingUsers = [];
    results.length = 0;
    
    // Generate NEW Session ID
    currentSessionId = generateSessionId();
    
    loadConfig(); 
    console.log(`Quiz fully reset. New Session ID: ${currentSessionId}`);
    res.json({ success: true, active: quizActive, sessionId: currentSessionId });
});

app.post('/api/kick', checkAuth, (req, res) => {
    const { name } = req.body;
    waitingUsers = waitingUsers.filter(u => u !== name);
    console.log(`User KICKED: ${name}`);
    res.json({ success: true });
});

app.post('/api/save-config', checkAuth, (req, res) => {
    const newConfig = req.body;
    
    try {
        // Convert JSON to YAML
        const yamlStr = yaml.dump(newConfig);
        
        // Write to file
        fs.writeFileSync('./config.yml', yamlStr, 'utf8');
        
        // Reload in memory
        loadConfig();
        
        console.log('Config updated via GUI.');
        res.json({ success: true });
    } catch (e) {
        console.error('Error saving config:', e);
        res.status(500).json({ error: 'Failed to save config file.' });
    }
});

// Other non-admin endpoints (like config, status, join, submit, results) are public
app.get('/api/config', (req, res) => {
    if (!configData) loadConfig();
    res.json({
        settings: { client_reset_enabled: configData.settings.client_reset_enabled }, // Only send public settings
        questions: configData.questions,
        anecdotes: configData.anecdotes,
        ui_texts: configData.ui_texts
    });
});

app.get('/api/quiz-status', (req, res) => {
    res.json({ 
        active: quizActive,
        waitingCount: waitingUsers.length,
        waitingUsers: waitingUsers,
        sessionId: currentSessionId
    });
});

app.post('/api/join', (req, res) => {
    const { name } = req.body;
    
    if (quizActive) {
        return res.status(403).json({ error: configData.ui_texts.joinError });
    }

    if (name && !waitingUsers.includes(name)) {
        waitingUsers.push(name);
        console.log(`User joined lobby: ${name}`);
    }
    res.json({ success: true });
});

app.post('/api/submit', (req, res) => {
    const { name, answers } = req.body;
    
    if (!name || !answers || !Array.isArray(answers)) {
        return res.status(400).json({ error: 'Invalid data' });
    }

    let score = 0;
    answers.forEach((ans, index) => {
        if (index < correctAnswersIndices.length && ans === correctAnswersIndices[index]) {
            score++;
        }
    });

    const result = {
        name,
        score,
        total: correctAnswersIndices.length,
        timestamp: new Date().toISOString()
    };

    results.push(result);
    console.log(`New submission: ${name} - Score: ${score}/${correctAnswersIndices.length}`);

    res.json({ success: true, score, total: correctAnswersIndices.length });
});

app.get('/api/results', (req, res) => {
    const sortedResults = [...results].reverse();
    res.json(sortedResults);
});

// Serve static files for everything else
app.use(express.static(path.join(__dirname, 'public')));


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});