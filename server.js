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
function proxyToBridge(method, endpoint, postData = null) {
    return new Promise((resolve, reject) => {
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
            headers: headers
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

        req.on('error', (err) => {
            reject(err);
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

// Desktop Audio Recording Start
app.post('/api/record/start', async (req, res) => {
    try {
        const bridgeRes = await proxyToBridge('POST', '/start', req.body);
        res.status(bridgeRes.statusCode).json(bridgeRes.body);
    } catch (err) {
        res.status(500).json({ detail: "Audio bridge error starting recording." });
    }
});

// Pause / Resume Desktop Audio Recording
app.post('/api/record/pause', async (req, res) => {
    try {
        const bridgeRes = await proxyToBridge('POST', '/pause');
        res.status(bridgeRes.statusCode).json(bridgeRes.body);
    } catch (err) {
        res.status(500).json({ detail: "Audio bridge error toggling pause." });
    }
});

// Toggle Mic / Speaker Mute Status
app.post('/api/record/mute', async (req, res) => {
    try {
        const target = req.body.target || "mic";
        const bridgeRes = await proxyToBridge('POST', '/mute', { target: target });
        res.status(bridgeRes.statusCode).json(bridgeRes.body);
    } catch (err) {
        res.status(500).json({ detail: "Audio bridge error toggling mute." });
    }
});

// Audio Gauges & Live Stream Status
app.get('/api/record/status', async (req, res) => {
    try {
        const bridgeRes = await proxyToBridge('GET', '/status');
        res.status(bridgeRes.statusCode).json(bridgeRes.body);
    } catch (err) {
        res.json({ is_recording: false, elapsed_seconds: 0, mic_level: 0, speaker_level: 0 });
    }
});

// Stop Desktop Dual Audio Recording & Extract Intelligence
app.post('/api/record/stop', async (req, res) => {
    try {
        const meetingTitle = req.body.meeting_title || "Live Recorded Meeting";
        const targetLanguage = req.body.target_language || "English";

        const bridgeRes = await proxyToBridge('POST', '/stop', { meeting_title: meetingTitle, target_language: targetLanguage });
        
        if (bridgeRes.statusCode !== 200 || !bridgeRes.body.file_path) {
            return res.status(400).json({ detail: bridgeRes.body.detail || "Failed to stop desktop recording." });
        }

        const filename = bridgeRes.body.filename;
        const transcriptText = bridgeRes.body.transcript || `Recorded session for ${meetingTitle}`;
        const segments = bridgeRes.body.segments || [{ start: "00:00", end: "End", speaker: "Speaker", text: transcriptText }];
        const summaryText = bridgeRes.body.summary || `Summary for ${meetingTitle}`;
        const itemsDiscussed = bridgeRes.body.items_discussed || [];
        const rawTasks = bridgeRes.body.tasks || [];

        const meetingId = Math.random().toString(36).substring(2, 10);
        const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

        const meetingObj = {
            id: meetingId,
            title: meetingTitle,
            language: targetLanguage,
            created_at: createdAt,
            audio_url: `/recordings/${filename}`,
            audio_filename: filename,
            transcript: transcriptText,
            segments: segments,
            summary: summaryText,
            items_discussed: itemsDiscussed,
            task_count: rawTasks.length
        };

        const meetings = loadJson(MEETINGS_FILE, []);
        meetings.unshift(meetingObj);
        saveJson(MEETINGS_FILE, meetings);

        const existingTasks = loadJson(TASKS_FILE, []);
        const newTasks = rawTasks.map(t => ({
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

// Handle Live Web Browser Audio Recordings
app.post('/api/record/stop_web', uploadRecordings.single('file'), async (req, res) => {
    try {
        const file = req.file;
        const meetingTitle = req.body.meeting_title || "Web Live Recorded Meeting";
        const targetLanguage = req.body.target_language || "English";

        if (!file) {
            return res.status(400).json({ detail: "No audio file received." });
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
            audio_url: `/recordings/${file.filename}`,
            audio_filename: file.filename,
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

// Settings APIs
app.get('/api/settings', (req, res) => {
    const settings = loadJson(SETTINGS_FILE, {});
    res.json({ gemini_api_key: settings.gemini_api_key || "" });
});

app.post('/api/settings', (req, res) => {
    const settings = loadJson(SETTINGS_FILE, {});
    if (req.body.gemini_api_key !== undefined) {
        settings.gemini_api_key = req.body.gemini_api_key;
    }
    saveJson(SETTINGS_FILE, settings);
    res.json({ status: "saved" });
});

// Start Express Web Server
app.listen(PORT, () => {
    console.log(`TaskPulse AI (Option 1 Hybrid Engine) running on http://127.0.0.1:${PORT}`);
});
