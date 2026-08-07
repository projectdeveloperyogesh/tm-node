# 🐍 TaskPulse AI - Python FastAPI Architecture Rule & Replication Blueprint

This specification rule defines the exact architecture, data models, endpoints, background worker pattern, and UI design system required to recreate a 1-to-1 carbon copy of the TaskPulse AI Python FastAPI Application.

---

## 📐 1. Technology Stack & Dependencies

- **Framework**: Python 3.10+ (FastAPI + Uvicorn)
- **Audio Capture**: `pyaudiowpatch` (Windows WASAPI loopback + Microphone capture)
- **Speech Engine**: `faster-whisper` / `whisper` / `vosk`
- **AI Intelligence Providers**: Ollama (Local Llama 3.2), Google Gemini 1.5 Flash (`google-generativeai`), Groq, OpenAI (`openai`)
- **Persistence**: JSON Storage (`data/meetings.json`, `data/tasks.json`, `data/settings.json`, `scratch/ollama_status.json`)
- **Frontend Stack**: Jinja2 Templates (`templates/index.html`), Lucide Icons, Pure JavaScript 16kHz PCM WAV Encoder

---

## 📁 2. File & Directory Layout

```
python/
├── main.py                     # FastAPI main application (Port 8000)
├── background_job_manager.py   # Non-blocking ThreadPoolExecutor background manager
├── audio_recorder.py           # WASAPI dual loopback + Mic PyAudio recorder
├── local_speech_engine.py      # Faster-Whisper local speech-to-text engine
├── meeting_analyzer.py        # Multi-provider AI analyzer (Ollama / Gemini / Groq / OpenAI)
├── media_processor.py          # PyAV / MoviePy / FFmpeg media processing pipeline
├── ollama_installer.py         # Standalone Ollama downloader, installer & runner
├── data/
│   ├── meetings.json
│   ├── tasks.json
│   └── settings.json
├── recordings/                 # Saved live .wav audio files
├── uploads/                    # Uploaded raw media files
├── processed/                  # Converted 16kHz mono .wav files
├── templates/
│   └── index.html              # Main Single Page App template
└── static/
    ├── app.js                  # Frontend Controller, Audio Encoder, Decibel Gauges, Jobs Monitor
    └── styles.css              # Custom Dark Theme & Glassmorphism Design System
```

---

## ⚡ 3. Mandatory FastAPI Route & Encoding Rules

1. **Explicit Route Disambiguation**:
   - Distinct endpoints MUST be used for collections vs items (`/api/jobs` for listing, `/api/job/{job_id}` for single item) to prevent FastAPI path collision errors.

2. **Windows `PYTHONIOENCODING=utf-8` Enforcer**:
   - `os.environ["PYTHONIOENCODING"] = "utf-8"` MUST be set at the very top of `main.py`.
   - All file open calls MUST explicitly set `encoding="utf-8"`.

3. **Background Job Manager Contract**:
   - `dispatch_background_meeting(...)` MUST execute worker threads via `ThreadPoolExecutor(max_workers=3)`.
   - Stage 1 (Transcription), Stage 2 (AI Analysis), and Stage 3 (Saving) MUST be fully fail-safe so every session is 100% guaranteed to save to `data/meetings.json` & `data/tasks.json`.
   - Status strings MUST NOT contain non-ASCII emojis (e.g. `✅`) to prevent Windows console charmap encoding crashes.

4. **Multi-Provider AI Fallback Engine**:
   - Provider order: `Auto` (Ollama Local -> Gemini -> Groq -> OpenAI -> Local Rule-based NLP).
   - If Ollama port `11434` or cloud API keys are missing/unreachable, `MeetingAnalyzer` MUST automatically fall back to local regex/keyword NLP extraction (`_local_nlp_analysis`).

---

## 🎨 4. Frontend Integration & Control Pipeline

- **Live Decibel Gauges**: `audio_recorder.get_status()` returns `mic_level` & `speaker_level` (`0 - 100`).
- **Web Fallback**: If WASAPI bridge is disabled or fails to initialize, `app.js` catches the status and invokes `startWebBrowserRecording()`.
- **Automatic Reload**: `loadJobs()` tracks completed job IDs in a `Set` and triggers `loadMeetings(true)` upon completion.
