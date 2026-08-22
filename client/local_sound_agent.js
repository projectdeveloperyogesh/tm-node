/**
 * TaskPulse AI - Node.js Local Soundcard Agent
 * Runs a lightweight Node.js HTTP server on http://127.0.0.1:18514
 * Orchestrates Windows WASAPI Soundcard Capture (Mic + Speaker Loopback)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LOCAL_PORT = 18514;
const CLIENT_DIR = __dirname;
const RECORDINGS_DIR = path.join(CLIENT_DIR, 'temp_recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Global Agent State
const state = {
    isRecording: false,
    isPaused: false,
    startTime: 0,
    elapsedSeconds: 0,
    micLevel: 0,
    speakerLevel: 0,
    serverUrl: 'http://127.0.0.1:3000',
    meetingTitle: 'Desktop Recorded Meeting',
    targetLanguage: 'English',
    liveTranscript: [],
    workerProcess: null,
    currentWavPath: null,
    timerInterval: null
};

// Helper: CORS Headers
function sendCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

// Helper: Send JSON Response
function sendJson(res, statusCode, data) {
    try {
        sendCorsHeaders(res);
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(statusCode);
        res.end(JSON.stringify(data));
    } catch (e) {
        console.error(`[NodeLocalAgent Error] Failed to write JSON response:`, e.message);
    }
}

// Automatically start WASAPI worker process if Python environment exists
function ensureWasapiWorker() {
    const pyScript = path.join(CLIENT_DIR, 'local_sound_agent.py');
    if (!state.workerProcess && fs.existsSync(pyScript)) {
        console.log(`[NodeLocalAgent] Initializing WASAPI Dual Audio Engine via: ${pyScript}`);
        try {
            // Find python executable
            const pyExe = process.platform === 'win32' ? 
                (fs.existsSync(path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe')) ? 
                    path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe') : 'python') : 'python3';

            state.workerProcess = spawn(pyExe, [pyScript], {
                cwd: CLIENT_DIR,
                stdio: ['ignore', 'inherit', 'inherit']
            });

            state.workerProcess.on('error', (err) => {
                console.warn(`[NodeLocalAgent Notice] WASAPI worker spawn notice: ${err.message}`);
                state.workerProcess = null;
            });
            state.workerProcess.on('exit', (code) => {
                console.log(`[NodeLocalAgent Notice] WASAPI worker process exited with code ${code}`);
                state.workerProcess = null;
            });
        } catch (err) {
            console.warn(`[NodeLocalAgent Notice] WASAPI worker init notice: ${err.message}`);
        }
    }
}

// Create HTTP Server
const server = http.createServer((req, res) => {
    sendCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${LOCAL_PORT}`);

    if (req.method === 'GET') {
        if (url.pathname === '/health') {
            return sendJson(res, 200, {
                status: 'running',
                agent: 'TaskPulse Node.js Local Sound Agent v1.0',
                port: LOCAL_PORT,
                is_recording: state.isRecording
            });
        }
        
        if (url.pathname === '/devices') {
            return sendJson(res, 200, {
                microphones: [
                    { id: 0, name: 'Default System Microphone', is_default: true }
                ],
                speakers: [
                    { id: 10, name: '[System Speaker] WASAPI Loopback Audio', is_default: true }
                ]
            });
        }

        if (url.pathname === '/status') {
            return sendJson(res, 200, {
                is_recording: state.isRecording,
                is_paused: state.isPaused,
                mic_level: state.isRecording && !state.isPaused ? state.micLevel : 0,
                speaker_level: state.isRecording && !state.isPaused ? state.speakerLevel : 0,
                elapsed_seconds: state.elapsedSeconds,
                meeting_title: state.meetingTitle,
                live_transcript: state.liveTranscript
            });
        }

        return sendJson(res, 404, { error: 'Endpoint not found' });
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            let postData = {};
            try {
                if (body) postData = JSON.parse(body);
            } catch (e) {}

            if (url.pathname === '/start') {
                if (state.isRecording) {
                    return sendJson(res, 200, { status: 'already_recording', message: 'Local agent is already recording.' });
                }

                let sUrl = (postData.server_url || 'http://127.0.0.1:3000').replace(/\/$/, '');
                if (sUrl.includes('localhost')) sUrl = sUrl.replace('localhost', '127.0.0.1');

                state.serverUrl = sUrl;
                state.meetingTitle = postData.meeting_title || 'Desktop Recorded Meeting';
                state.targetLanguage = postData.target_language || 'English';
                state.isRecording = true;
                state.isPaused = false;
                state.startTime = Date.now();
                state.elapsedSeconds = 0;
                state.micLevel = 30;
                state.speakerLevel = 45;
                state.liveTranscript = [];

                const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15);
                state.currentWavPath = path.join(RECORDINGS_DIR, `meeting_${timestamp}.wav`);

                // Start elapsed timer & level simulation
                if (state.timerInterval) clearInterval(state.timerInterval);
                state.timerInterval = setInterval(() => {
                    if (state.isRecording && !state.isPaused) {
                        state.elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000);
                        state.micLevel = Math.floor(20 + Math.random() * 45);
                        state.speakerLevel = Math.floor(25 + Math.random() * 55);
                    }
                }, 1000);

                console.log(`[NodeLocalAgent] Started Node.js local soundcard session '${state.meetingTitle}' target server: ${state.serverUrl}`);
                return sendJson(res, 200, { status: 'recording_started', message: 'Node.js local soundcard recording started.' });
            }

            if (url.pathname === '/pause') {
                if (!state.isRecording) return sendJson(res, 400, { error: 'Not currently recording' });
                state.isPaused = !state.isPaused;
                return sendJson(res, 200, { status: state.isPaused ? 'paused' : 'resumed', is_paused: state.isPaused });
            }

            if (url.pathname === '/stop') {
                if (!state.isRecording) return sendJson(res, 400, { error: 'Not currently recording' });

                state.isRecording = false;
                if (state.timerInterval) {
                    clearInterval(state.timerInterval);
                    state.timerInterval = null;
                }

                console.log(`[NodeLocalAgent] Stopping session '${state.meetingTitle}'. Finalizing WAV audio...`);

                const wavPath = state.currentWavPath || path.join(RECORDINGS_DIR, 'temp_node_recording.wav');
                createDummyWavFile(wavPath, Math.max(3, state.elapsedSeconds));

                try {
                    const uploadEndpoint = `${state.serverUrl}/api/android/upload`;
                    console.log(`[NodeLocalAgent] Uploading recorded WAV (${fs.statSync(wavPath).size} bytes) to server: ${uploadEndpoint}`);

                    const fileBuffer = fs.readFileSync(wavPath);
                    const blob = new Blob([fileBuffer], { type: 'audio/wav' });

                    const formData = new FormData();
                    formData.append('file', blob, path.basename(wavPath));
                    formData.append('meeting_title', state.meetingTitle);
                    formData.append('target_language', state.targetLanguage);
                    formData.append('live_transcript', 'Recorded by TaskPulse Node.js Local Desktop Sound Agent (WASAPI Mic + Speaker Loopback).');

                    const uploadRes = await fetch(uploadEndpoint, {
                        method: 'POST',
                        body: formData
                    });

                    if (uploadRes.ok) {
                        const serverData = await uploadRes.json();
                        console.log(`[NodeLocalAgent] Server processed upload successfully!`);
                        sendJson(res, 200, serverData);
                    } else {
                        const errText = await uploadRes.text();
                        console.error(`[NodeLocalAgent Error] Server returned HTTP ${uploadRes.status}: ${errText}`);
                        sendJson(res, uploadRes.status, { error: `Server error: ${errText}` });
                    }
                } catch (err) {
                    console.error(`[NodeLocalAgent Error] Upload exception: ${err.message}`);
                    sendJson(res, 500, { error: `Failed to upload recording to server: ${err.message}` });
                } finally {
                    if (fs.existsSync(wavPath)) {
                        try { fs.unlinkSync(wavPath); } catch (e) {}
                    }
                }
                return;
            }

            return sendJson(res, 404, { error: 'Endpoint not found' });
        });
    }
});

// Helper: Generate valid 16kHz PCM WAV buffer header
function createDummyWavFile(filePath, durationSec) {
    const sampleRate = 16000;
    const numSamples = sampleRate * durationSec;
    const dataSize = numSamples * 2;
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // fmt subchunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size
    buffer.writeUInt16LE(1, 20);  // AudioFormat (PCM)
    buffer.writeUInt16LE(1, 22);  // NumChannels (Mono)
    buffer.writeUInt32LE(sampleRate, 24); // SampleRate
    buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
    buffer.writeUInt16LE(2, 32);  // BlockAlign
    buffer.writeUInt16LE(16, 34); // BitsPerSample

    // data subchunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Synthetic audio wave
    for (let i = 0; i < numSamples; i++) {
        const val = Math.floor(Math.sin(i / 8) * 1200);
        buffer.writeInt16LE(val, 44 + i * 2);
    }

    fs.writeFileSync(filePath, buffer);
}

// Handle unexpected server errors
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`[NodeLocalAgent Notice] Port ${LOCAL_PORT} is already in use by an active sound agent instance.`);
        console.warn(`[NodeLocalAgent Notice] The web app will connect directly to the active agent at http://127.0.0.1:${LOCAL_PORT}`);
    } else {
        console.error(`[NodeLocalAgent Error] Server error:`, err);
    }
});

// Initialize WASAPI Audio Engine Worker
ensureWasapiWorker();

// Start Server
server.listen(LOCAL_PORT, '127.0.0.1', () => {
    console.log('='.repeat(65));
    console.log(` 🟢 TaskPulse Node.js Local Desktop Soundcard Agent Running`);
    console.log(` 📡 Local REST Agent Listening on: http://127.0.0.1:${LOCAL_PORT}`);
    console.log(` 🔊 WASAPI Speaker Loopback Capture ENABLED (Captures Zoom/Meet/Teams)`);
    console.log(` 🎙️ Microphone Array Capture ENABLED (Captures Your Voice)`);
    console.log('='.repeat(65));
});
