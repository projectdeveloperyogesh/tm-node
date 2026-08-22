import os
import sys
import time
import wave
import json
import io
import threading
import numpy as np
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

# Add root node directory to sys.path to access audio_recorder
CLIENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CLIENT_DIR)
sys.path.append(PARENT_DIR)

try:
    import requests
    from audio_recorder import DualAudioRecorder
    HAS_RECORDER = True
except Exception as imp_err:
    print(f"[LocalSoundAgent Warning] DualAudioRecorder import notice: {imp_err}")
    HAS_RECORDER = False
    import requests

LOCAL_PORT = 18514

class AgentState:
    def __init__(self):
        self.is_recording = False
        self.is_paused = False
        self.recorder = DualAudioRecorder(output_dir=os.path.join(CLIENT_DIR, "temp_recordings")) if HAS_RECORDER else None
        self.server_url = "http://127.0.0.1:3000"
        self.meeting_title = "Desktop Recorded Meeting"
        self.target_language = "English"
        self.lock = threading.Lock()

agent_state = AgentState()

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class AgentRequestHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def _json_response(self, code, data):
        try:
            self.send_response(code)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode("utf-8"))
        except Exception as e:
            print(f"[LocalSoundAgent Error] Failed to write JSON response: {e}")

    def do_GET(self):
        try:
            if self.path == "/health":
                is_rec = agent_state.recorder.is_recording if agent_state.recorder else False
                self._json_response(200, {
                    "status": "running",
                    "agent": "TaskPulse Local Sound Agent v1.0",
                    "port": LOCAL_PORT,
                    "is_recording": is_rec
                })
            elif self.path == "/devices":
                if agent_state.recorder:
                    self._json_response(200, agent_state.recorder.get_audio_devices())
                else:
                    self._json_response(200, {"microphones": [], "speakers": []})
            elif self.path == "/status":
                if agent_state.recorder:
                    rec_status = agent_state.recorder.get_status()
                    rec_status["meeting_title"] = agent_state.meeting_title
                    self._json_response(200, rec_status)
                else:
                    self._json_response(200, {
                        "is_recording": False,
                        "is_paused": False,
                        "mic_level": 0,
                        "speaker_level": 0,
                        "elapsed_seconds": 0,
                        "live_transcript": []
                    })
            else:
                self._json_response(404, {"error": "Endpoint not found"})
        except Exception as err:
            print(f"[LocalSoundAgent Error] GET handler error: {err}")
            self._json_response(500, {"error": str(err)})

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = {}
            if content_length > 0:
                try:
                    body_bytes = self.rfile.read(content_length)
                    post_data = json.loads(body_bytes.decode('utf-8'))
                except Exception:
                    pass

            if self.path == "/start":
                with agent_state.lock:
                    if agent_state.recorder and agent_state.recorder.is_recording:
                        self._json_response(200, {"status": "already_recording", "message": "Local agent is already recording."})
                        return

                    s_url = post_data.get("server_url", "http://127.0.0.1:3000").rstrip("/")
                    if "localhost" in s_url:
                        s_url = s_url.replace("localhost", "127.0.0.1")
                    agent_state.server_url = s_url
                    agent_state.meeting_title = post_data.get("meeting_title", "Desktop Recorded Meeting")
                    agent_state.target_language = post_data.get("target_language", "English")

                    mic_id = post_data.get("mic_id")
                    speaker_id = post_data.get("speaker_id")

                if agent_state.recorder:
                    start_res = agent_state.recorder.start_recording(mic_id=mic_id, speaker_id=speaker_id)
                    print(f"[LocalSoundAgent] Started WASAPI soundcard capture (Mic + Speaker Loopback) for session '{agent_state.meeting_title}' target server: {agent_state.server_url}")
                    self._json_response(200, start_res)
                else:
                    self._json_response(500, {"error": "DualAudioRecorder unavailable on local PC."})

            elif self.path == "/pause":
                if agent_state.recorder and agent_state.recorder.is_recording:
                    if agent_state.recorder.is_paused:
                        res = agent_state.recorder.resume_recording()
                    else:
                        res = agent_state.recorder.pause_recording()
                    self._json_response(200, res)
                else:
                    self._json_response(400, {"error": "Not currently recording"})

            elif self.path == "/stop":
                if not agent_state.recorder or not agent_state.recorder.is_recording:
                    self._json_response(400, {"error": "Not currently recording"})
                    return

                with agent_state.lock:
                    server_url = agent_state.server_url
                    meeting_title = agent_state.meeting_title
                    target_language = agent_state.target_language
                    live_text = agent_state.recorder.get_full_transcript_text() if hasattr(agent_state.recorder, 'get_full_transcript_text') else ""

                print(f"[LocalSoundAgent] Stopping WASAPI recording. Compiling mic + speaker audio...")
                wav_path = None
                try:
                    stop_info = agent_state.recorder.stop_recording()
                    wav_path = stop_info.get("filename")
                except Exception as rec_err:
                    print(f"[LocalSoundAgent Error] stop_recording exception: {rec_err}")
                    self._json_response(500, {"error": f"Failed to finalize recording: {str(rec_err)}"})
                    return

                if not wav_path or not os.path.exists(wav_path):
                    self._json_response(400, {"error": "No audio file generated."})
                    return

                try:
                    upload_endpoint = f"{server_url}/api/android/upload"
                    print(f"[LocalSoundAgent] Uploading dual soundcard WAV ({os.path.getsize(wav_path)} bytes) to server: {upload_endpoint}")

                    with open(wav_path, 'rb') as f:
                        files = {'file': (os.path.basename(wav_path), f, 'audio/wav')}
                        payload = {
                            'meeting_title': meeting_title,
                            'target_language': target_language,
                            'live_transcript': live_text or 'Recorded by TaskPulse Local Desktop Agent (WASAPI Mic + Speaker Loopback).'
                        }
                        res = requests.post(upload_endpoint, files=files, data=payload, timeout=180)

                    if res.status_code == 200:
                        server_data = res.json()
                        print(f"[LocalSoundAgent] Successfully processed by server!")
                        self._json_response(200, server_data)
                    else:
                        # Fallback try /api/upload if /api/android/upload differs
                        try:
                            f.seek(0)
                            res2 = requests.post(f"{server_url}/api/upload", files=files, data=payload, timeout=180)
                            if res2.status_code == 200:
                                self._json_response(200, res2.json())
                                return
                        except Exception:
                            pass
                        print(f"[LocalSoundAgent Error] Server returned HTTP {res.status_code}: {res.text}")
                        self._json_response(res.status_code, {"error": f"Server error: {res.text}"})

                except Exception as e:
                    print(f"[LocalSoundAgent Error] Failed to upload to server: {e}")
                    self._json_response(500, {"error": f"Failed to upload audio to server: {str(e)}"})
                finally:
                    if wav_path and os.path.exists(wav_path):
                        try: os.remove(wav_path)
                        except: pass
            else:
                self._json_response(404, {"error": "Endpoint not found"})
        except Exception as fatal_err:
            print(f"[LocalSoundAgent Fatal] do_POST error: {fatal_err}")
            self._json_response(500, {"error": str(fatal_err)})

def main():
    server = ThreadedHTTPServer(('127.0.0.1', LOCAL_PORT), AgentRequestHandler)
    print("=" * 65)
    print(f" 🟢 TaskPulse Local Desktop Soundcard Agent Running")
    print(f" 📡 Local REST Agent Listening on: http://127.0.0.1:{LOCAL_PORT}")
    print(f" 🔊 WASAPI Speaker Loopback Capture ENABLED (Captures Zoom/Meet/Teams)")
    print(f" 🎙️ Microphone Array Capture ENABLED (Captures Your Voice)")
    print("=" * 65)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Local Sound Agent daemon...")
        server.server_close()

if __name__ == "__main__":
    main()
