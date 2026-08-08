const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
require('dotenv').config();

const SpeechService = require('./services/speechService');
const MediaProcessor = require('./services/mediaProcessor');
const MeetingAnalyzer = require('./services/meetingAnalyzer');

const app = express();
const PORT = process.env.PORT || 3000;
const BRIDGE_PORT = 8001;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Directories
const BASE_DIR = __dirname;
const RECORDINGS_DIR = path.join(BASE_DIR, 'recordings');
const UPLOADS_DIR = path.join(BASE_DIR, 'uploads');
const PROCESSED_DIR = path.join(BASE_DIR, 'processed');
const DATA_DIR = path.join(BASE_DIR, 'data');
const STATIC_DIR = path.join(BASE_DIR, 'static');
const TEMPLATES_DIR = path.join(BASE_DIR, 'templates');

[RECORDINGS_DIR, UPLOADS_DIR, PROCESSED_DIR, DATA_DIR, STATIC_DIR, TEMPLATES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Serve Static Assets
app.use('/static', express.static(STATIC_DIR));
app.use('/recordings', express.static(RECORDINGS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// Auto Start WASAPI Audio Bridge Helper for Windows Desktop Soundcard Recording
let bridgeProcess = null;
function findPythonExec() {
    const candidates = [
        path.join(BASE_DIR, '.venv', 'Scripts', 'python.exe'),
        path.join(BASE_DIR, '.venv', 'bin', 'python'),
        path.join(path.dirname(BASE_DIR), '.venv', 'Scripts', 'python.exe'),
        path.join(path.dirname(BASE_DIR), '.venv', 'bin', 'python'),
        'python',
        'python3',
        'py'
    ];
    for (const cand of candidates) {
        if (cand.includes(path.sep) && fs.existsSync(cand)) {
            return cand;
        }
    }
    return process.platform === 'win32' ? 'python' : 'python3';
}

let bridgeRestartAttempts = 0;
let lastBridgeRestartTime = 0;

function startAudioBridge() {
    const pythonExec = findPythonExec();
    const scriptPath = path.join(BASE_DIR, 'node_audio_bridge.py');

    console.log(`[Node.js Express Server] Launching WASAPI Dual Audio Bridge via: ${pythonExec}`);
    bridgeProcess = spawn(pythonExec, [scriptPath], {
        cwd: BASE_DIR,
        stdio: 'inherit'
    });

    bridgeProcess.on('error', (err) => {
        console.warn(`[Node.js Express Server] Audio bridge notice: ${err.message}`);
    });

    bridgeProcess.on('exit', (code, signal) => {
        console.warn(`[Node.js Express Server] Audio bridge exited with code ${code}, signal ${signal}`);
        bridgeProcess = null;
        
        const now = Date.now();
        if (now - lastBridgeRestartTime > 10000) {
            bridgeRestartAttempts = 0;
        }
        
        if (bridgeRestartAttempts < 5) {
            bridgeRestartAttempts++;
            lastBridgeRestartTime = now;
            console.log(`[Node.js Express Server] Auto-restarting audio bridge (Attempt ${bridgeRestartAttempts}/5)...`);
            setTimeout(startAudioBridge, 1500);
        } else {
            console.error(`[Node.js Express Server] Audio bridge failed multiple times. Web Browser Recorder mode will act as primary.`);
        }
    });
}
startAudioBridge();

// Configure Multer for File Uploads
const storageRecordings = multer.diskStorage({
    destination: (req, file, cb) => cb(null, RECORDINGS_DIR),
    filename: (req, file, cb) => {
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const ext = path.extname(file.originalname) || '.wav';
        cb(null, `web_rec_${timestamp}${ext}`);
    }
});
const uploadRecordings = multer({ storage: storageRecordings });

const storageUploads = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        cb(null, `upload_${timestamp}_${file.originalname}`);
    }
});
const uploadMedia = multer({ storage: storageUploads });

// Services
const mediaProcessor = new MediaProcessor(UPLOADS_DIR, PROCESSED_DIR);

const MEETINGS_FILE = path.join(DATA_DIR, 'meetings.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function loadJson(filePath, defaultVal = []) {
    if (!fs.existsSync(filePath)) return defaultVal;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        return defaultVal;
    }
}

function saveJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getGeminiApiKey() {
    const settings = loadJson(SETTINGS_FILE, {});
    return settings.gemini_api_key || process.env.GEMINI_API_KEY || null;
}

// HTTP Helper for Audio Bridge
function proxyToBridge(method, endpoint, postData = null, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        if (!bridgeProcess) {
            startAudioBridge();
        }

        let postBody = '';
        let headers = {};
        if (postData) {
            const params = new URLSearchParams();
            for (const key in postData) params.append(key, postData[key]);
            postBody = params.toString();
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postBody)
            };
        }

        const req = http.request({
            hostname: '127.0.0.1',
            port: BRIDGE_PORT,
            path: endpoint,
            method: method,
            headers: headers,
            timeout: timeoutMs
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: { detail: data } });
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                statusCode: 200,
                body: { status: "background_processing", message: "Recording released! Processing session in background." }
            });
        });

        req.on('error', (err) => {
            resolve({
                statusCode: 200,
                body: { status: "background_processing", message: "Recording released! Processing session in background." }
            });
        });

        if (postBody) req.write(postBody);
        req.end();
    });
}

// --- Routes ---

// Serve UI Index
app.get('/', (req, res) => {
    res.sendFile(path.join(TEMPLATES_DIR, 'index.html'));
});

// Audio Devices List (Real Soundcard Hardware)
app.get('/api/devices', async (req, res) => {
    try {
        const bridgeRes = await proxyToBridge('GET', '/devices');
        res.status(bridgeRes.statusCode).json(bridgeRes.body);
    } catch (err) {
        res.json({
            microphones: [{ id: 0, name: "Default System Microphone" }],
            speakers: [{ id: 1, name: "Default System Speaker Loopback" }]
        });
    }
});

app.get('/api/jobs', async (req, res) => {
    try {
        const bridgeRes = await proxyToBridge('GET', '/jobs');
        res.status(bridgeRes.statusCode).json(bridgeRes.body);
    } catch (err) {
        res.json([]);
    }
});

// Desktop Audio Recording Start
app.post('/api/record/start', async (req, res) => {
    try {
        const bridgeRes = await proxyToBridge('POST', '/start', req.body);
        res.status(bridgeRes.statusCode).json(bridgeRes.body);
    } catch (err) {
        res.json({
            status: "use_web_fallback",
            message: "Desktop soundcard recorder unavailable on this system. Switch to Browser Live Recording."
        });
    }
});

// Pause / Resume Desktop Audio Recording
app.post('/api/record/pause', async (req, res) => {
    try {
        const bridgeRes = await proxyToBridge('POST', '/pause');
        res.status(bridgeRes.statusCode).json(bridgeRes.body);
    } catch (err) {
        res.json({ status: "paused" });
    }
});

// Toggle Mic / Speaker Mute Status
app.post('/api/record/mute', async (req, res) => {
    try {
        const target = req.body.target || "mic";
        const bridgeRes = await proxyToBridge('POST', '/mute', { target: target });
        res.status(bridgeRes.statusCode).json(bridgeRes.body);
    } catch (err) {
        res.json({ status: "muted" });
    }
});

// Audio Gauges & Live Stream Status
app.get('/api/record/status', async (req, res) => {
    try {
        const bridgeRes = await proxyToBridge('GET', '/status');
        res.status(bridgeRes.statusCode).json(bridgeRes.body);
    } catch (err) {
        res.json({
            is_recording: false,
            is_paused: false,
            is_mic_muted: false,
            is_speaker_muted: false,
            elapsed_seconds: 0,
            mic_level: 0,
            speaker_level: 0,
            live_transcript: [],
            current_filename: null
        });
    }
});

// Stop Desktop Dual Audio Recording & Extract Intelligence
app.post('/api/record/stop', async (req, res) => {
    try {
        const meetingTitle = req.body.meeting_title || "Live Recorded Meeting";
        const targetLanguage = req.body.target_language || "English";

        const bridgeRes = await proxyToBridge('POST', '/stop', { meeting_title: meetingTitle, target_language: targetLanguage }, 60000);
        return res.json(bridgeRes.body || {
            status: "background_processing",
            message: "Recording released! Processing session in background."
        });
    } catch (err) {
        return res.json({
            status: "background_processing",
            message: "Recording released! Processing session in background."
        });
    }
});

// Handle Live Web Browser Audio Recordings
app.post('/api/record/stop_web', uploadRecordings.single('file'), async (req, res) => {
    try {
        const file = req.file;
        const meetingTitle = req.body.meeting_title || "Web Live Recorded Meeting";
        const targetLanguage = req.body.target_language || "English";

        if (!file) {
            return res.status(400).json({ detail: "No audio file received." });
        }

        const liveTranscript = req.body.live_transcript || "";

        const processedWav = await mediaProcessor.processMediaFile(file.path);
        const apiKey = getGeminiApiKey();
        const analyzer = new MeetingAnalyzer(apiKey);
        const speechService = new SpeechService(apiKey);

        let analysis = await analyzer.analyzeAudioFile(processedWav, meetingTitle, targetLanguage);
        let transcriptText = liveTranscript.trim() || analysis.transcript;

        if (!transcriptText || transcriptText.trim().length === 0) {
            const transcribeRes = await speechService.transcribeAudio(processedWav);
            transcriptText = transcribeRes.text;
        }

        const meetingId = Math.random().toString(36).substring(2, 10);
        const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

        const meetingObj = {
            id: meetingId,
            title: meetingTitle,
            language: targetLanguage,
            created_at: createdAt,
            audio_url: `/recordings/${file.filename}`,
            audio_filename: file.filename,
            transcript: transcriptText,
            segments: [{ start: "00:00", end: "End", speaker: "Speaker", text: transcriptText }],
            summary: analysis.summary,
            items_discussed: analysis.items_discussed,
            task_count: analysis.tasks.length,
            prompt: analysis.prompt || "",
            curl_command: analysis.curl_command || "",
            response_raw: analysis.response_raw || ""
        };

        const meetings = loadJson(MEETINGS_FILE, []);
        meetings.unshift(meetingObj);
        saveJson(MEETINGS_FILE, meetings);

        const existingTasks = loadJson(TASKS_FILE, []);
        const newTasks = analysis.tasks.map(t => ({
            ...t,
            meeting_id: meetingId,
            language: targetLanguage
        }));
        newTasks.forEach(t => existingTasks.unshift(t));
        saveJson(TASKS_FILE, existingTasks);

        res.json({
            status: "success",
            meeting: meetingObj,
            tasks: newTasks
        });
    } catch (err) {
        res.status(500).json({ detail: err.message });
    }
});

// Upload Media Files (.wav, .mp3, .mp4, .webm)
app.post('/api/upload', uploadMedia.single('file'), async (req, res) => {
    try {
        const file = req.file;
        const meetingTitle = req.body.meeting_title || (file ? file.originalname : "Uploaded Media");
        const targetLanguage = req.body.target_language || "English";

        if (!file) {
            return res.status(400).json({ detail: "No media file uploaded." });
        }

        const processedWav = await mediaProcessor.processMediaFile(file.path);
        const apiKey = getGeminiApiKey();
        const analyzer = new MeetingAnalyzer(apiKey);
        const speechService = new SpeechService(apiKey);

        let analysis = await analyzer.analyzeAudioFile(processedWav, meetingTitle, targetLanguage);
        let transcriptText = analysis.transcript;

        if (!transcriptText || transcriptText.trim().length === 0) {
            const transcribeRes = await speechService.transcribeAudio(processedWav);
            transcriptText = transcribeRes.text;
        }

        const meetingId = Math.random().toString(36).substring(2, 10);
        const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

        const meetingObj = {
            id: meetingId,
            title: meetingTitle,
            language: targetLanguage,
            created_at: createdAt,
            audio_url: `/uploads/${file.filename}`,
            audio_filename: file.originalname,
            transcript: transcriptText,
            segments: [{ start: "00:00", end: "End", speaker: "Speaker", text: transcriptText }],
            summary: analysis.summary,
            items_discussed: analysis.items_discussed,
            task_count: analysis.tasks.length
        };

        const meetings = loadJson(MEETINGS_FILE, []);
        meetings.unshift(meetingObj);
        saveJson(MEETINGS_FILE, meetings);

        const existingTasks = loadJson(TASKS_FILE, []);
        const newTasks = analysis.tasks.map(t => ({
            ...t,
            meeting_id: meetingId,
            language: targetLanguage
        }));
        newTasks.forEach(t => existingTasks.unshift(t));
        saveJson(TASKS_FILE, existingTasks);

        res.json({
            status: "success",
            meeting: meetingObj,
            tasks: newTasks
        });
    } catch (err) {
        res.status(500).json({ detail: err.message });
    }
});

// Meetings Management APIs
app.get('/api/meetings', (req, res) => {
    res.json(loadJson(MEETINGS_FILE, []));
});

app.get('/api/meetings/:id', (req, res) => {
    const meetings = loadJson(MEETINGS_FILE, []);
    const m = meetings.find(item => item.id === req.params.id);
    if (m) res.json(m);
    else res.status(404).json({ detail: "Meeting not found" });
});

app.post('/api/meetings/:id/reanalyze', async (req, res) => {
    const targetLanguage = req.body.language || "English";
    const meetings = loadJson(MEETINGS_FILE, []);
    const mIdx = meetings.findIndex(item => item.id === req.params.id);

    if (mIdx === -1) {
        return res.status(404).json({ detail: "Meeting not found" });
    }

    const meeting = meetings[mIdx];
    const apiKey = getGeminiApiKey();
    const analyzer = new MeetingAnalyzer(apiKey);
    const analysis = await analyzer.analyzeMeeting(meeting.transcript || "", meeting.title, targetLanguage);

    meeting.summary = analysis.summary;
    meeting.items_discussed = analysis.items_discussed;
    meeting.language = targetLanguage;
    meeting.task_count = analysis.tasks.length;

    meetings[mIdx] = meeting;
    saveJson(MEETINGS_FILE, meetings);

    let existingTasks = loadJson(TASKS_FILE, []);
    existingTasks = existingTasks.filter(t => t.meeting_id !== req.params.id);
    const newTasks = analysis.tasks.map(t => ({
        ...t,
        meeting_id: req.params.id,
        language: targetLanguage
    }));
    newTasks.forEach(t => existingTasks.unshift(t));
    saveJson(TASKS_FILE, existingTasks);

    res.json({
        status: "success",
        meeting: meeting,
        tasks: newTasks
    });
});

// Delete All Meetings & Recordings
app.delete('/api/meetings_all', (req, res) => {
    saveJson(MEETINGS_FILE, []);
    saveJson(TASKS_FILE, []);

    let deletedCount = 0;
    [RECORDINGS_DIR, UPLOADS_DIR, PROCESSED_DIR].forEach(folder => {
        if (fs.existsSync(folder)) {
            fs.readdirSync(folder).forEach(file => {
                try {
                    fs.unlinkSync(path.join(folder, file));
                    deletedCount++;
                } catch (e) {}
            });
        }
    });

    res.json({
        status: "success",
        message: `Successfully deleted all meeting sessions, tasks, and ${deletedCount} audio files.`
    });
});

app.delete('/api/meetings/:id', (req, res) => {
    let meetings = loadJson(MEETINGS_FILE, []);
    meetings = meetings.filter(m => m.id !== req.params.id);
    saveJson(MEETINGS_FILE, meetings);

    let tasks = loadJson(TASKS_FILE, []);
    tasks = tasks.filter(t => t.id !== req.params.id);
    saveJson(TASKS_FILE, tasks);

    res.json({ status: "deleted", meeting_id: req.params.id });
});

// Tasks Board APIs
app.get('/api/tasks', (req, res) => {
    res.json(loadJson(TASKS_FILE, []));
});

app.post('/api/tasks', (req, res) => {
    const tasks = loadJson(TASKS_FILE, []);
    const task = req.body;
    task.id = task.id || Math.random().toString(36).substring(2, 10);
    task.status = task.status || "todo";
    task.subtasks = task.subtasks || [];
    tasks.unshift(task);
    saveJson(TASKS_FILE, tasks);
    res.json(task);
});

app.put('/api/tasks/:id', (req, res) => {
    const tasks = loadJson(TASKS_FILE, []);
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx !== -1) {
        tasks[idx] = { ...tasks[idx], ...req.body };
        saveJson(TASKS_FILE, tasks);
        res.json(tasks[idx]);
    } else {
        res.status(404).json({ detail: "Task not found" });
    }
});

app.delete('/api/tasks/:id', (req, res) => {
    let tasks = loadJson(TASKS_FILE, []);
    tasks = tasks.filter(t => t.id !== req.params.id);
    saveJson(TASKS_FILE, tasks);
    res.json({ status: "deleted", task_id: req.params.id });
});

// Ollama Auto-Setup APIs
app.get('/api/ollama/status', (req, res) => {
    const { exec } = require('child_process');
    exec('python -c "import ollama_installer; print(ollama_installer.is_ollama_running())"', (err, stdout) => {
        const isRunning = stdout.trim() === 'True';
        res.json({ running: isRunning });
    });
});

app.get('/api/ollama/progress', (req, res) => {
    const paths = [
        path.join(__dirname, 'scratch', 'ollama_status.json'),
        path.join(__dirname, '..', 'python', 'scratch', 'ollama_status.json')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            try {
                const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                return res.json(data);
            } catch (e) {}
        }
    }
    const { exec } = require('child_process');
    exec('python -c "import ollama_installer, json; print(json.dumps(ollama_installer.get_ollama_progress()))"', (err, stdout) => {
        try {
            res.json(JSON.parse(stdout.trim()));
        } catch (e) {
            res.json({ status: "idle", percent: 0, message: "Checking status..." });
        }
    });
});

app.post('/api/ollama/setup', (req, res) => {
    const { spawn } = require('child_process');
    const model = req.body.model_name || "llama3.2";
    
    // Spawn detached process so Windows keeps setup running independently
    const child = spawn('python', ['-c', `import ollama_installer; ollama_installer.run_setup_standalone('${model}')`], {
        detached: true,
        stdio: 'ignore'
    });
    child.unref();

    res.json({ status: "started", message: "Ollama auto-setup initiated." });
});

// Settings APIs
app.get('/api/settings', (req, res) => {
    const settings = loadJson(SETTINGS_FILE, {});
    res.json({
        ai_provider: settings.ai_provider || "auto",
        gemini_api_key: settings.gemini_api_key || "",
        groq_api_key: settings.groq_api_key || "",
        openai_api_key: settings.openai_api_key || "",
        ollama_host: settings.ollama_host || "http://localhost:11434"
    });
});

app.post('/api/settings', (req, res) => {
    const settings = loadJson(SETTINGS_FILE, {});
    ["ai_provider", "gemini_api_key", "groq_api_key", "openai_api_key", "ollama_host"].forEach(k => {
        if (req.body[k] !== undefined) {
            settings[k] = req.body[k];
        }
    });
    saveJson(SETTINGS_FILE, settings);
    res.json({ status: "saved" });
});

const AI_LOGS_FILE = path.join(DATA_DIR, 'ai_logs.json');

app.get('/api/ai/logs', (req, res) => {
    const logs = loadJson(AI_LOGS_FILE, []);
    res.json(logs);
});

app.delete('/api/ai/logs', (req, res) => {
    saveJson(AI_LOGS_FILE, []);
    res.json({ status: "cleared" });
});

// Start Express Web Server
app.listen(PORT, () => {
    console.log(`TaskPulse AI (Option 1 Hybrid Engine) running on http://127.0.0.1:${PORT}`);
});
