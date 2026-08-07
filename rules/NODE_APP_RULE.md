# 🟢 TaskPulse AI - Node.js Architecture Rule & Replication Blueprint

This specification rule defines the exact architecture, data models, endpoints, background worker pattern, and UI design system required to recreate a 1-to-1 carbon copy of the TaskPulse AI Node.js Web Application.

---

## 📐 1. Technology Stack & Dependencies

- **Runtime**: Node.js v18+ (Express.js)
- **Audio Bridge**: Python WASAPI Subprocess (`node_audio_bridge.py` on Port 8001 via `http` proxy)
- **Media Processing**: `ffmpeg-static` / `fluent-ffmpeg` for converting audio/video uploads to 16kHz Mono PCM WAV
- **Persistence**: JSON File Storage (`data/meetings.json`, `data/tasks.json`, `data/settings.json`, `scratch/ollama_status.json`)
- **Frontend Stack**: Vanilla HTML5, CSS3 Custom Tokens (Dark Slate & Glassmorphism), Modern Vanilla JavaScript (Fetch API, Lucide Icons, pure JS 16kHz WAV encoder)

---

## 📁 2. File & Directory Layout

```
node/
├── server.js                   # Express.js main server (Port 3000)
├── node_audio_bridge.py        # FastAPI PyAudio/WASAPI audio bridge (Port 8001)
├── background_job_manager.py   # Non-blocking ThreadPoolExecutor background manager
├── audio_recorder.py           # Dual Audio WASAPI loopback + Microphone recorder
├── local_speech_engine.py      # Faster-Whisper / PyTorch / Vosk speech-to-text engine
├── meeting_analyzer.py        # Multi-provider AI (Ollama, Gemini, Groq, OpenAI) analyzer
├── media_processor.py          # FFmpeg audio conversion helper
├── ollama_installer.py         # Automated 1-click Ollama downloader, installer & runner
├── data/
│   ├── meetings.json
│   ├── tasks.json
│   └── settings.json
├── recordings/                 # Saved live .wav audio files
├── uploads/                    # Uploaded raw media files
├── processed/                  # Converted 16kHz mono .wav files
├── scratch/                    # Progress tracking files (ollama_status.json)
├── templates/
│   └── index.html              # Main Single Page App template
└── static/
    ├── app.js                  # Frontend Controller, Audio Encoder, Decibel Gauges, Jobs Monitor
    └── styles.css              # Custom Dark Theme & Glassmorphism Design System
```

---

## ⚡ 3. Mandatory Backend Rules & Protocols

1. **Non-Blocking Background Processing**:
   - `/api/record/stop`, `/api/record/stop_web`, and `/api/upload` MUST return an instant JSON response (`status: "background_processing"`, `job: {...}`) in `< 50ms`.
   - Audio transcription, AI analysis, and saving MUST be executed in background worker threads.

2. **100% Fail-Safe Persistence Rule**:
   - Stage 1 (Transcription) and Stage 2 (AI Analysis) MUST be wrapped in isolated `try...except` blocks.
   - If AI provider or speech engine throws an exception, fallback summary & action items MUST be generated.
   - Stage 3 (`data/meetings.json` & `data/tasks.json`) MUST be 100% guaranteed to write to disk.

3. **Zero UTF-8 Emoji Crash Rule**:
   - Status messages in `background_job_manager.py` MUST NOT contain raw unicode emojis (e.g. `✅`). Use standard ASCII text strings (`"Meeting processing completed & saved!"`) to prevent `UnicodeEncodeError` on Windows environments.

4. **Resilient HTTP 200 Proxy Fallbacks**:
   - If `node_audio_bridge.py` is offline or PyAudio is missing, `/api/record/*` routes MUST return HTTP 200 JSON fallback objects (`status: "use_web_fallback"`) instead of HTTP 500 errors, prompting the browser to seamlessly use Browser Live Recording (MediaRecorder API).

---

## 🎨 4. Frontend UI Design Tokens & Components

```css
:root {
    --bg-dark: #0b0f19;
    --card-bg: rgba(21, 28, 46, 0.75);
    --accent-blue: #3b82f6;
    --accent-cyan: #06b6d4;
    --accent-purple: #8b5cf6;
    --accent-emerald: #10b981;
    --text-white: #f8fafc;
    --text-muted: #94a3b8;
    --glass-border: 1px solid rgba(255, 255, 255, 0.08);
}
```

- **Header**: `#openBgJobsBtn` showing active running jobs badge counter.
- **Jobs Monitor Drawer**: `#bgJobsModal` polling `/api/jobs` every 1.5s with stage progress bars (`0% - 100%`).
- **Auto Session Focus**: On job completion, frontend MUST execute `loadMeetings(true)` to automatically focus and display the newly saved meeting.
