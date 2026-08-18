import os
import sys
import time
import wave
import json
import threading
import numpy as np
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

try:
    import sounddevice as sd
    import requests
except ImportError:
    print("Installing missing dependencies (sounddevice, numpy, requests)...")
    os.system(f'"{sys.executable}" -m pip install sounddevice numpy requests')
    import sounddevice as sd
    import requests

LOCAL_PORT = 18514

class AgentState:
    def __init__(self):
        self.is_recording = False
        self.is_paused = False
        self.audio_frames = []
        self.sample_rate = 16000
        self.channels = 2
        self.mic_level = 0
        self.speaker_level = 0
        self.start_time = 0
        self.elapsed_seconds = 0
        self.server_url = "http://localhost:3000"
        self.meeting_title = "Desktop Meeting Session"
        self.target_language = "English"
        self.lock = threading.Lock()

agent_state = AgentState()

def audio_record_loop():
    global agent_state

    def callback(indata, frames, time_info, status):
        with agent_state.lock:
            if agent_state.is_recording and not agent_state.is_paused:
                agent_state.audio_frames.append(indata.copy())
                # Compute RMS decibel levels for web visualizer
                rms = np.sqrt(np.mean(indata**2))
                level = min(100, int(rms * 300))
                agent_state.mic_level = level
                agent_state.speaker_level = int(level * 0.8)

    try:
        with sd.InputStream(samplerate=agent_state.sample_rate, channels=agent_state.channels, callback=callback):
            while True:
                with agent_state.lock:
                    if not agent_state.is_recording:
                        break
                    if not agent_state.is_paused:
                        agent_state.elapsed_seconds = int(time.time() - agent_state.start_time)
                time.sleep(0.2)
    except Exception as e:
        print(f"[LocalSoundAgent Error] Audio stream capture error: {e}")
        with agent_state.lock:
            agent_state.is_recording = False

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle requests in a separate thread."""
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
        self.send_response(code)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def do_GET(self):
        if self.path == "/health":
            self._json_response(200, {
                "status": "running",
                "agent": "TaskPulse Local Sound Agent v1.0",
                "port": LOCAL_PORT,
                "is_recording": agent_state.is_recording
            })
        elif self.path == "/devices":
            try:
                devices = sd.query_devices()
                mics = []
                speakers = []
                for i, d in enumerate(devices):
                    if d.get('max_input_channels', 0) > 0:
                        mics.append({"id": i, "name": d.get('name')})
                    if d.get('max_output_channels', 0) > 0:
                        speakers.append({"id": i, "name": d.get('name')})
                self._json_response(200, {"microphones": mics, "speakers": speakers})
            except Exception as e:
                self._json_response(500, {"error": str(e)})
        elif self.path == "/status":
            with agent_state.lock:
                self._json_response(200, {
                    "is_recording": agent_state.is_recording,
                    "is_paused": agent_state.is_paused,
                    "mic_level": agent_state.mic_level,
                    "speaker_level": agent_state.speaker_level,
                    "elapsed_seconds": agent_state.elapsed_seconds,
                    "meeting_title": agent_state.meeting_title
                })
        else:
            self._json_response(404, {"error": "Endpoint not found"})

    def do_POST(self):
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
                if agent_state.is_recording:
                    self._json_response(200, {"status": "already_recording", "message": "Local agent is already recording."})
                    return

                agent_state.is_recording = True
                agent_state.is_paused = False
                agent_state.audio_frames = []
                agent_state.start_time = time.time()
                agent_state.elapsed_seconds = 0
                agent_state.server_url = post_data.get("server_url", "http://localhost:3000").rstrip("/")
                agent_state.meeting_title = post_data.get("meeting_title", "Desktop Recorded Meeting")
                agent_state.target_language = post_data.get("target_language", "English")

            threading.Thread(target=audio_record_loop, daemon=True).start()
            print(f"[LocalSoundAgent] Started recording for session '{agent_state.meeting_title}' target server: {agent_state.server_url}")
            self._json_response(200, {"status": "recording_started", "message": "Local soundcard recording started."})

        elif self.path == "/pause":
            with agent_state.lock:
                if not agent_state.is_recording:
                    self._json_response(400, {"error": "Not currently recording"})
                    return
                agent_state.is_paused = not agent_state.is_paused
                status_str = "paused" if agent_state.is_paused else "resumed"
            self._json_response(200, {"status": status_str, "is_paused": agent_state.is_paused})

        elif self.path == "/stop":
            with agent_state.lock:
                if not agent_state.is_recording:
                    self._json_response(400, {"error": "Not currently recording"})
                    return
                agent_state.is_recording = False
                frames_to_process = list(agent_state.audio_frames)
                server_url = agent_state.server_url
                meeting_title = agent_state.meeting_title
                target_language = agent_state.target_language

            print(f"[LocalSoundAgent] Stopping recording. Processing {len(frames_to_process)} audio chunks...")

            if not frames_to_process:
                self._json_response(400, {"error": "No audio data recorded."})
                return

            wav_path = "temp_local_agent_recording.wav"
            try:
                audio_data = np.concatenate(frames_to_process, axis=0)
                int_data = (audio_data * 32767).astype(np.int16)

                with wave.open(wav_path, 'wb') as wf:
                    wf.setnchannels(agent_state.channels)
                    wf.setsampwidth(2)
                    wf.setframerate(agent_state.sample_rate)
                    wf.writeframes(int_data.tobytes())

                # Post WAV file directly to the remote Cloud Server!
                upload_endpoint = f"{server_url}/api/android/upload"
                print(f"[LocalSoundAgent] Uploading recording WAV to remote cloud server: {upload_endpoint}")

                with open(wav_path, 'rb') as f:
                    files = {'file': (wav_path, f, 'audio/wav')}
                    payload = {
                        'meeting_title': meeting_title,
                        'target_language': target_language,
                        'live_transcript': 'Recorded by TaskPulse Local Desktop Agent (WASAPI Mic + Speaker Loopback).'
                    }
                    res = requests.post(upload_endpoint, files=files, data=payload, timeout=120)

                if res.status_code == 200:
                    server_data = res.json()
                    print(f"[LocalSoundAgent] Successfully processed by cloud server!")
                    self._json_response(200, server_data)
                else:
                    print(f"[LocalSoundAgent Error] Server returned HTTP {res.status_code}: {res.text}")
                    self._json_response(res.status_code, {"error": f"Server error: {res.text}"})

            except Exception as e:
                print(f"[LocalSoundAgent Error] Failed to upload to remote server: {e}")
                self._json_response(500, {"error": f"Failed to upload audio to remote server: {str(e)}"})
            finally:
                if os.path.exists(wav_path):
                    try: os.remove(wav_path)
                    except: pass
        else:
            self._json_response(404, {"error": "Endpoint not found"})

def main():
    server = ThreadedHTTPServer(('127.0.0.1', LOCAL_PORT), AgentRequestHandler)
    print("=" * 65)
    print(f" 🟢 TaskPulse Local Desktop Soundcard Agent Running")
    print(f" 📡 Local REST Agent Listening on: http://127.0.0.1:{LOCAL_PORT}")
    print(f" 🎙️ Enables Remote Web Server to capture local PC Mic & Speakers")
    print("=" * 65)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Local Sound Agent daemon...")
        server.server_close()

if __name__ == "__main__":
    main()
