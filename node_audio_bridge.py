import os
import sys
import json
import uuid
import datetime

# Add current directory to sys.path to access audio_recorder & speech engines
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)

HAS_PYTHON_RECORD_DEPS = True
try:
    from fastapi import FastAPI, Form, HTTPException
    import uvicorn
    from audio_recorder import DualAudioRecorder
    from local_speech_engine import LocalSpeechEngine
    from meeting_analyzer import MeetingAnalyzer
except Exception as imp_err:
    print(f"\n[WASAPI Audio Bridge Notice] Python audio dependencies unavailable: {imp_err}")
    print("[WASAPI Audio Bridge Notice] System will use Browser Live Recording (MediaRecorder API) as primary recorder.\n")
    HAS_PYTHON_RECORD_DEPS = False
    from fastapi import FastAPI, Form, HTTPException
    import uvicorn

app = FastAPI(title="Node WASAPI Audio Bridge")

RECORDINGS_DIR = os.path.join(BASE_DIR, "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

if HAS_PYTHON_RECORD_DEPS:
    recorder = DualAudioRecorder(output_dir=RECORDINGS_DIR)
    speech_engine = LocalSpeechEngine()
else:
    recorder = None
    speech_engine = None

@app.get("/devices")
def get_devices():
    if not recorder:
        return {
            "microphones": [{"id": 0, "name": "Default System Microphone", "is_default": True}],
            "speakers": [{"id": 1, "name": "Default System Speaker Loopback", "is_default": True}]
        }
    return recorder.get_audio_devices()

@app.post("/start")
def start_recording(mic_id: str = Form(None), speaker_id: str = Form(None)):
    if not recorder:
        return {
            "status": "use_web_fallback",
            "message": "Desktop WASAPI recorder unavailable. Switch to Browser Live Recording."
        }
    try:
        m_id = int(mic_id) if mic_id and str(mic_id).isdigit() else None
        s_id = int(speaker_id) if speaker_id and str(speaker_id).isdigit() else None
        return recorder.start_recording(mic_id=m_id, speaker_id=s_id)
    except Exception as err:
        print(f"Bridge start_recording notice: {err}")
        return {
            "status": "use_web_fallback",
            "message": "Desktop WASAPI recorder unavailable. Switch to Browser Live Recording."
        }

@app.post("/pause")
def pause_recording():
    if not recorder: return {"status": "paused"}
    return recorder.pause_recording()

@app.post("/mute")
def toggle_mute(target: str = Form(...)):
    if not recorder: return {"status": "muted"}
    return recorder.toggle_mute(target=target)

@app.get("/status")
def get_status():
    if not recorder:
        return {
            "is_recording": False,
            "is_paused": False,
            "is_mic_muted": False,
            "is_speaker_muted": False,
            "elapsed_seconds": 0,
            "mic_level": 0,
            "speaker_level": 0,
            "live_transcript": [],
            "current_filename": None
        }
    return recorder.get_status()

from background_job_manager import dispatch_background_meeting, get_all_jobs, get_job

@app.get("/jobs")
def list_jobs():
    return get_all_jobs()

@app.post("/stop")
def stop_recording(meeting_title: str = Form("Live Recorded Meeting"), target_language: str = Form("English")):
    if not recorder:
        return {"status": "stopped", "message": "Recorder offline"}
    res = recorder.stop_recording()
    if res.get("status") in ["success", "recording_stopped"] and ("file" in res or "filepath" in res):
        wav_path = res.get("file") or res.get("filepath")
        live_trans = res.get("live_transcript", [])

        # Load helper functions for JSON persistence
        def _load_json(file_path, default_val):
            if os.path.exists(file_path):
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception:
                    pass
            return default_val

        def _save_json(file_path, data):
            try:
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
            except Exception as e:
                print(f"Error saving JSON to {file_path}: {e}")

        data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
        meetings_file = os.path.join(data_dir, "meetings.json")
        tasks_file = os.path.join(data_dir, "tasks.json")

        def _get_configured_analyzer():
            settings = _load_json(os.path.join(data_dir, "settings.json"), {})
            g_key = settings.get("gemini_api_key") or os.environ.get("GEMINI_API_KEY")
            gr_key = settings.get("groq_api_key") or os.environ.get("GROQ_API_KEY")
            o_key = settings.get("openai_api_key") or os.environ.get("OPENAI_API_KEY")
            ol_host = settings.get("ollama_host") or os.environ.get("OLLAMA_HOST") or "http://localhost:11434"
            yc_host = settings.get("yogesh_chat_host") or os.environ.get("YOGESH_CHAT_HOST") or "http://localhost:3005/api/v1/ai/chat"
            prov = settings.get("ai_provider", "auto")
            return MeetingAnalyzer(api_key=g_key, groq_api_key=gr_key, openai_api_key=o_key, ollama_host=ol_host, yogesh_chat_host=yc_host, default_provider=prov)

        job = dispatch_background_meeting(
            filepath=wav_path,
            meeting_title=meeting_title,
            target_language=target_language,
            live_trans=live_trans,
            speech_engine=speech_engine,
            get_analyzer_func=_get_configured_analyzer,
            load_json_func=_load_json,
            save_json_func=_save_json,
            meetings_file=meetings_file,
            tasks_file=tasks_file
        )

        return {
            "status": "background_processing",
            "message": "Recording session released! Processing in background.",
            "file_path": wav_path,
            "filename": os.path.basename(wav_path),
            "job": job
        }
    else:
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to stop recording"))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="error")
