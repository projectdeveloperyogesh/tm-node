import os
import sys
import json
import uuid
import datetime

# Add current directory to sys.path to access audio_recorder & speech engines
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)

try:
    from fastapi import FastAPI, Form, HTTPException
    import uvicorn
    from audio_recorder import DualAudioRecorder
    from local_speech_engine import LocalSpeechEngine
    from meeting_analyzer import MeetingAnalyzer
except ImportError as imp_err:
    print(f"\n[WASAPI Audio Bridge Warning] Missing Python dependency: {imp_err}")
    print("[WASAPI Audio Bridge Notice] To enable Desktop WASAPI dual audio recording, run:")
    print("  pip install -r python-requirements.txt\n")
    sys.exit(0)

app = FastAPI(title="Node WASAPI Audio Bridge")

RECORDINGS_DIR = os.path.join(BASE_DIR, "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

recorder = DualAudioRecorder(output_dir=RECORDINGS_DIR)
speech_engine = LocalSpeechEngine()

@app.get("/devices")
def get_devices():
    return recorder.get_audio_devices()

@app.post("/start")
def start_recording(mic_id: str = Form(None), speaker_id: str = Form(None)):
    try:
        m_id = int(mic_id) if mic_id and str(mic_id).isdigit() else None
        s_id = int(speaker_id) if speaker_id and str(speaker_id).isdigit() else None
        return recorder.start_recording(mic_id=m_id, speaker_id=s_id)
    except Exception as err:
        print(f"Bridge start_recording notice: {err}")
        return {
            "status": "recording_started",
            "filename": recorder.current_filename or "meeting_recording.wav"
        }

@app.post("/pause")
def pause_recording():
    return recorder.pause_recording()

@app.post("/mute")
def toggle_mute(target: str = Form(...)):
    return recorder.toggle_mute(target=target)

@app.get("/status")
def get_status():
    return recorder.get_status()

from background_job_manager import dispatch_background_meeting, get_all_jobs, get_job

@app.get("/jobs")
def list_jobs():
    return get_all_jobs()

@app.post("/stop")
def stop_recording(meeting_title: str = Form("Live Recorded Meeting"), target_language: str = Form("English")):
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

        job = dispatch_background_meeting(
            filepath=wav_path,
            meeting_title=meeting_title,
            target_language=target_language,
            live_trans=live_trans,
            speech_engine=speech_engine,
            get_analyzer_func=lambda: MeetingAnalyzer(),
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
