import os
import sys
import json
import uuid
import datetime
from fastapi import FastAPI, Form, HTTPException
import uvicorn

# Add python subfolder to sys.path to access audio_recorder & speech engines
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)
PYTHON_DIR = os.path.join(PARENT_DIR, "python")
sys.path.append(PYTHON_DIR)
sys.path.append(PARENT_DIR)

from audio_recorder import DualAudioRecorder
from local_speech_engine import LocalSpeechEngine
from meeting_analyzer import MeetingAnalyzer

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
    m_id = int(mic_id) if mic_id and mic_id.isdigit() else None
    s_id = int(speaker_id) if speaker_id and speaker_id.isdigit() else None
    return recorder.start_recording(mic_id=m_id, speaker_id=s_id)

@app.post("/pause")
def pause_recording():
    return recorder.pause_recording()

@app.get("/status")
def get_status():
    return recorder.get_status()

@app.post("/stop")
def stop_recording(meeting_title: str = Form("Live Recorded Meeting"), target_language: str = Form("English")):
    res = recorder.stop_recording()
    if res.get("status") in ["success", "recording_stopped"] and ("file" in res or "filepath" in res):
        wav_path = res.get("file") or res.get("filepath")
        
        # Transcribe actual spoken audio using SpeechRecognition
        trans_res = speech_engine.transcribe_audio(wav_path)
        transcript_text = trans_res.get("text", "")
        segments = trans_res.get("segments", [])

        if not transcript_text or len(transcript_text.strip()) == 0:
            transcript_text = f"Audio recorded for session '{meeting_title}'. Ensure microphone or speaker audio is active."
            segments = [{"start": "00:00", "end": "End", "speaker": "Participant", "text": transcript_text}]

        analyzer = MeetingAnalyzer()
        analysis = analyzer.analyze_meeting(transcript_text, meeting_title=meeting_title, target_language=target_language)

        return {
            "status": "success",
            "file_path": wav_path,
            "filename": os.path.basename(wav_path),
            "transcript": transcript_text,
            "segments": segments,
            "summary": analysis.get("summary", ""),
            "items_discussed": analysis.get("items_discussed", []),
            "tasks": analysis.get("tasks", [])
        }
    else:
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to stop recording"))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="error")
