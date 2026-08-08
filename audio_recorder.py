import os
import sys
import time
import wave
import io
import threading
import numpy as np
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import speech_recognition as sr

try:
    import pyaudiowpatch as pyaudio
    HAS_PYAUDIOWPATCH = True
    HAS_PYAUDIO = True
except Exception:
    try:
        import pyaudio
        HAS_PYAUDIOWPATCH = False
        HAS_PYAUDIO = True
    except Exception:
        HAS_PYAUDIOWPATCH = False
        HAS_PYAUDIO = False


def resample_pcm(pcm_bytes, orig_rate, target_rate=16000, channels=1):
    """
    Fast, accurate linear interpolation to resample PCM audio bytes
    and convert multi-channel (stereo) to mono 16-bit signed integer format.
    """
    if not pcm_bytes:
        return b""
    
    samples = np.frombuffer(pcm_bytes, dtype=np.int16)
    if len(samples) == 0:
        return b""
    
    # Convert stereo/multi-channel to mono
    if channels > 1:
        # Take mean across channels
        num_frames = len(samples) // channels
        samples = samples[:num_frames * channels].reshape(-1, channels)
        samples = samples.mean(axis=1).astype(np.int16)
    
    if orig_rate == target_rate:
        return samples.tobytes()
    
    duration = len(samples) / float(orig_rate)
    target_len = int(round(duration * target_rate))
    if target_len <= 0:
        return b""
    
    old_indices = np.linspace(0, len(samples) - 1, num=len(samples))
    new_indices = np.linspace(0, len(samples) - 1, num=target_len)
    resampled_samples = np.interp(new_indices, old_indices, samples).astype(np.int16)
    return resampled_samples.tobytes()


class DualAudioRecorder:
    def __init__(self, output_dir="recordings"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

        self.is_recording = False
        self.is_paused = False
        self.start_time = None
        self.pause_time = None
        self.total_paused_duration = 0

        self.mic_device_index = None
        self.speaker_device_index = None

        self.mic_frames = []
        self.speaker_frames = []

        self.mic_level = 0.0
        self.speaker_level = 0.0
        self.is_mic_muted = False
        self.is_speaker_muted = False

        self.mic_live_chunks = []
        self.spk_live_chunks = []

        self.mic_accum_pcm = b""
        self.spk_accum_pcm = b""
        self.mic_accum_rate = 44100
        self.mic_accum_ch = 1
        self.spk_accum_rate = 48000
        self.spk_accum_ch = 2

        self.pa = None
        self.mic_thread = None
        self.spk_thread = None
        self.transcribe_thread = None
        self.executor = ThreadPoolExecutor(max_workers=3)
        
        self.live_transcript = []
        self.recognizer = sr.Recognizer()
        self.current_filename = None

    def get_audio_devices(self):
        """Enumerate microphones and native WASAPI loopback speaker output devices."""
        mic_devices = []
        speaker_devices = []

        if not HAS_PYAUDIO:
            return {
                "microphones": [{"id": 0, "name": "Default System Microphone", "is_default": True}],
                "speakers": [{"id": 1, "name": "Default System Speaker Loopback", "is_default": True}]
            }

        try:
            p = pyaudio.PyAudio()
            try:
                default_input_idx = p.get_default_input_device_info()["index"]
            except Exception:
                default_input_idx = None

            try:
                default_output_idx = p.get_default_output_device_info()["index"]
            except Exception:
                default_output_idx = None

            # Enumerate Microphones
            for i in range(p.get_device_count()):
                try:
                    dev = p.get_device_info_by_index(i)
                    if dev["maxInputChannels"] > 0 and not dev.get("isLoopbackDevice", False):
                        mic_devices.append({
                            "id": i,
                            "name": f"{dev['name']}",
                            "is_default": i == default_input_idx
                        })
                except Exception:
                    pass

            # Enumerate Native WASAPI Loopback Speakers
            if HAS_PYAUDIOWPATCH:
                try:
                    for dev in p.get_loopback_device_info_generator():
                        speaker_devices.append({
                            "id": dev["index"],
                            "name": f"[System Speaker] {dev['name']}",
                            "is_default": dev.get("isDefaultLoopbackDevice", False)
                        })
                except Exception:
                    pass

            p.terminate()
        except Exception as e:
            print(f"Audio device enumeration notice: {e}")

        if not mic_devices:
            mic_devices.append({"id": 0, "name": "Default System Microphone", "is_default": True})
        if not speaker_devices:
            speaker_devices.append({"id": 1, "name": "Default System Speaker Loopback", "is_default": True})

        return {
            "microphones": mic_devices,
            "speakers": speaker_devices
        }

    def start_recording(self, mic_id=None, speaker_id=None):
        if self.is_recording:
            try:
                self.stop_recording()
            except Exception:
                pass

        self.mic_frames = []
        self.speaker_frames = []
        self.mic_live_chunks = []
        self.spk_live_chunks = []
        self.mic_accum_pcm = b""
        self.spk_accum_pcm = b""
        self.live_transcript = []
        self.mic_level = 0.0
        self.speaker_level = 0.0
        self.total_paused_duration = 0
        self.is_paused = False
        self.is_mic_muted = False
        self.is_speaker_muted = False

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.current_filename = os.path.join(self.output_dir, f"meeting_{timestamp}.wav")

        try:
            devices = self.get_audio_devices()

            # Resolve Microphone device
            if mic_id is not None and str(mic_id).isdigit():
                self.mic_device_index = int(mic_id)
            else:
                default_mics = [m["id"] for m in devices.get("microphones", []) if m.get("is_default")]
                self.mic_device_index = default_mics[0] if default_mics else (devices["microphones"][0]["id"] if devices.get("microphones") else None)

            # Resolve Speaker WASAPI Loopback device
            selected_spk_id = int(speaker_id) if (speaker_id is not None and str(speaker_id).isdigit()) else None
            target_spk_index = None

            try:
                p = pyaudio.PyAudio() if HAS_PYAUDIO else None
                self.pa = p
            except Exception as p_err:
                print(f"PyAudio init notice: {p_err}")
                self.pa = None

            if self.pa and HAS_PYAUDIOWPATCH:
                try:
                    loopbacks = list(self.pa.get_loopback_device_info_generator())
                    if selected_spk_id is not None:
                        # Direct loopback match
                        for lb in loopbacks:
                            if lb["index"] == selected_spk_id:
                                target_spk_index = lb["index"]
                                break
                        # Match by name if output device ID was selected
                        if target_spk_index is None:
                            try:
                                spk_info = self.pa.get_device_info_by_index(selected_spk_id)
                                spk_name = spk_info.get("name", "").lower()
                                for lb in loopbacks:
                                    if any(part in lb.get("name", "").lower() for part in spk_name.split()[:2]):
                                        target_spk_index = lb["index"]
                                        break
                            except Exception:
                                pass
                    if target_spk_index is None and loopbacks:
                        target_spk_index = loopbacks[0]["index"]
                except Exception as e:
                    print(f"Error resolving WASAPI loopback: {e}")

            if target_spk_index is None and selected_spk_id is not None:
                target_spk_index = selected_spk_id

            self.speaker_device_index = target_spk_index

            self.is_recording = True
            self.start_time = time.time()

            # Launch independent worker threads
            self.mic_thread = threading.Thread(target=self._mic_worker, daemon=True)
            self.spk_thread = threading.Thread(target=self._speaker_worker, daemon=True)
            self.transcribe_thread = threading.Thread(target=self._live_transcribe_worker, daemon=True)

            self.mic_thread.start()
            self.spk_thread.start()
            self.transcribe_thread.start()
        except Exception as global_start_err:
            print(f"Audio recorder start error: {global_start_err}")
            self.is_recording = True
            self.start_time = time.time()

        return {
            "status": "recording_started",
            "filename": self.current_filename,
            "mic_device": self.mic_device_index,
            "speaker_device": self.speaker_device_index
        }

    def _mic_worker(self):
        """Dedicated thread for Microphone audio capture with multi-sample rate & channel fallback."""
        if self.mic_device_index is None or self.pa is None:
            return

        # Candidate mic indices to try: requested mic_device_index -> default input device -> index 0
        mic_candidates = []
        if self.mic_device_index is not None:
            mic_candidates.append(self.mic_device_index)
        try:
            def_idx = self.pa.get_default_input_device_info().get("index")
            if def_idx is not None and def_idx not in mic_candidates:
                mic_candidates.append(def_idx)
        except Exception:
            pass
        if 0 not in mic_candidates:
            mic_candidates.append(0)

        stream = None
        rate = 44100
        channels = 1
        chunk = 1024
        active_mic_idx = None

        for mic_idx in mic_candidates:
            try:
                info = self.pa.get_device_info_by_index(mic_idx)
                dev_rate = int(info.get("defaultSampleRate", 44100))
                dev_ch = info.get("maxInputChannels", 1)
            except Exception:
                dev_rate = 44100
                dev_ch = 1

            rate_candidates = [dev_rate, 48000, 44100, 16000]
            channel_candidates = [min(2, dev_ch) if dev_ch > 0 else 1, 1, 2]

            for r in rate_candidates:
                for c in channel_candidates:
                    try:
                        stream = self.pa.open(
                            format=pyaudio.paInt16,
                            channels=c,
                            rate=r,
                            input=True,
                            input_device_index=mic_idx,
                            frames_per_buffer=chunk
                        )
                        rate = r
                        channels = c
                        active_mic_idx = mic_idx
                        break
                    except Exception:
                        stream = None
                if stream is not None:
                    break
            if stream is not None:
                break

        if stream is None:
            print(f"Mic worker notice: Could not open stream for mic devices {mic_candidates}")
            return

        print(f"Mic stream active on device {active_mic_idx} (rate={rate}, ch={channels})")

        while self.is_recording:
            if self.is_paused:
                time.sleep(0.1)
                continue

            try:
                data = stream.read(chunk, exception_on_overflow=False)
                if data:
                    if self.is_mic_muted:
                        silent_data = b'\x00' * len(data)
                        self.mic_frames.append((silent_data, rate, channels))
                        self.mic_level = 0.0
                    else:
                        self.mic_frames.append((data, rate, channels))
                        self.mic_live_chunks.append((data, rate, channels))
                        
                        # Standardized RMS dB decibel calculation (-60 dB to 0 dB -> 0% to 100%)
                        samples = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
                        if len(samples) > 0:
                            rms = float(np.sqrt(np.mean(samples**2)))
                            if rms > 1e-5:
                                db = 20.0 * np.log10(max(rms, 1e-5))
                                lvl = (db + 60.0) / 60.0 * 100.0
                                self.mic_level = float(np.clip(lvl, 0.0, 100.0))
                            else:
                                self.mic_level = 0.0
                        else:
                            self.mic_level = 0.0
            except Exception:
                pass

        try:
            stream.stop_stream()
            stream.close()
        except Exception:
            pass

    def _speaker_worker(self):
        """Dedicated thread for WASAPI Loopback Speaker audio capture with multi-sample rate fallback."""
        if self.speaker_device_index is None or self.pa is None:
            print("Speaker worker: No speaker device index set")
            return

        stream = None
        rate = 48000
        channels = 2
        chunk = 1024

        try:
            info = self.pa.get_device_info_by_index(self.speaker_device_index)
            dev_rate = int(info.get("defaultSampleRate", 48000))
            dev_ch = info.get("maxInputChannels", 2)
        except Exception:
            dev_rate = 48000
            dev_ch = 2

        rate_candidates = [dev_rate, 48000, 44100, 96000]
        channel_candidates = [dev_ch if dev_ch > 0 else 2, 2, 1]

        for r in rate_candidates:
            for c in channel_candidates:
                try:
                    stream = self.pa.open(
                        format=pyaudio.paInt16,
                        channels=c,
                        rate=r,
                        input=True,
                        input_device_index=self.speaker_device_index,
                        frames_per_buffer=chunk
                    )
                    rate = r
                    channels = c
                    break
                except Exception:
                    stream = None
            if stream is not None:
                break

        if stream is None:
            print(f"Speaker worker notice: Could not open stream for speaker device {self.speaker_device_index}")
            return

        print(f"Speaker WASAPI loopback stream active on device {self.speaker_device_index} (rate={rate}, ch={channels})")

        while self.is_recording:
            if self.is_paused:
                time.sleep(0.1)
                continue

            try:
                data = stream.read(chunk, exception_on_overflow=False)
                if data:
                    if self.is_speaker_muted:
                        silent_data = b'\x00' * len(data)
                        self.speaker_frames.append((silent_data, rate, channels))
                        self.spk_live_chunks.append((data, rate, channels))
                        self.speaker_level = 0.0
                    else:
                        self.speaker_frames.append((data, rate, channels))
                        self.spk_live_chunks.append((data, rate, channels))

                        # Standardized RMS dB decibel calculation (-60 dB to 0 dB -> 0% to 100%)
                        samples = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
                        if len(samples) > 0:
                            rms = float(np.sqrt(np.mean(samples**2)))
                            if rms > 1e-5:
                                db = 20.0 * np.log10(max(rms, 1e-5))
                                lvl = (db + 60.0) / 60.0 * 100.0
                                self.speaker_level = float(np.clip(lvl, 0.0, 100.0))
                            else:
                                self.speaker_level = 0.0
                        else:
                            self.speaker_level = 0.0
            except Exception:
                pass

        try:
            stream.stop_stream()
            stream.close()
        except Exception:
            pass

    def _live_transcribe_worker(self):
        """Non-blocking live speech recognition thread using async ThreadPoolExecutor."""
        while self.is_recording:
            time.sleep(0.3)
            if self.is_paused or not self.is_recording:
                continue

            elapsed_sec = int(time.time() - self.start_time - self.total_paused_duration)
            time_str = f"{elapsed_sec // 60:02d}:{elapsed_sec % 60:02d}"

            # Drain Microphone live chunks
            if len(self.mic_live_chunks) > 0:
                chunks = list(self.mic_live_chunks)
                self.mic_live_chunks = []
                for data, rate, ch in chunks:
                    self.mic_accum_rate = rate
                    self.mic_accum_ch = ch
                    self.mic_accum_pcm += data

            # Drain Speaker live chunks
            if len(self.spk_live_chunks) > 0:
                chunks = list(self.spk_live_chunks)
                self.spk_live_chunks = []
                for data, rate, ch in chunks:
                    self.spk_accum_rate = rate
                    self.spk_accum_ch = ch
                    self.spk_accum_pcm += data

            # Dispatch Mic audio buffer when we have ~2.5 seconds of audio
            min_mic_bytes = int(self.mic_accum_rate * self.mic_accum_ch * 2 * 2.2)
            if len(self.mic_accum_pcm) >= min_mic_bytes:
                pcm = self.mic_accum_pcm
                rate = self.mic_accum_rate
                ch = self.mic_accum_ch
                self.mic_accum_pcm = b""
                self.executor.submit(self._async_transcribe, pcm, rate, ch, "🎤 You (Microphone)", time_str)

            # Dispatch Speaker audio buffer when we have ~2.5 seconds of audio
            min_spk_bytes = int(self.spk_accum_rate * self.spk_accum_ch * 2 * 2.2)
            if len(self.spk_accum_pcm) >= min_spk_bytes:
                pcm = self.spk_accum_pcm
                rate = self.spk_accum_rate
                ch = self.spk_accum_ch
                self.spk_accum_pcm = b""
                self.executor.submit(self._async_transcribe, pcm, rate, ch, "🔊 Meeting Participant", time_str)

    def _async_transcribe(self, pcm_bytes, rate, channels, speaker_label, time_str):
        """Asynchronously converts PCM to 16kHz mono WAV buffer and recognizes speech via Google Web API."""
        try:
            pcm_16k = resample_pcm(pcm_bytes, rate, target_rate=16000, channels=channels)
            if len(pcm_16k) < 16000 * 2 * 1.2:  # Require at least 1.2 seconds of speech
                return

            wav_buf = io.BytesIO()
            with wave.open(wav_buf, 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(pcm_16k)
            
            wav_buf.seek(0)

            with sr.AudioFile(wav_buf) as source:
                audio = self.recognizer.record(source)
                try:
                    text = self.recognizer.recognize_google(audio)
                    if text and text.strip():
                        # Prevent duplicate trailing text entries
                        if not self.live_transcript or self.live_transcript[-1]["text"] != text.strip():
                            self.live_transcript.append({
                                "time": time_str,
                                "speaker": speaker_label,
                                "text": text.strip()
                            })
                            if len(self.live_transcript) > 60:
                                self.live_transcript.pop(0)
                except sr.UnknownValueError:
                    pass
                except sr.RequestError as req_err:
                    print(f"Speech API Request error: {req_err}")
        except Exception as e:
            print(f"Async transcribe error: {e}")

    def pause_recording(self):
        if not self.is_recording:
            return {"status": "not_recording"}
        if self.is_paused:
            if self.pause_time:
                self.total_paused_duration += (time.time() - self.pause_time)
            self.is_paused = False
            return {"status": "resumed"}
        else:
            self.pause_time = time.time()
            self.is_paused = True
            return {"status": "paused"}

    def stop_recording(self):
        if not self.is_recording:
            return {"status": "not_recording", "filepath": None}

        self.is_recording = False
        self.is_paused = False

        if self.mic_thread: self.mic_thread.join(timeout=1.5)
        if self.spk_thread: self.spk_thread.join(timeout=1.5)
        if self.transcribe_thread: self.transcribe_thread.join(timeout=1.5)

        filepath = self.current_filename
        target_rate = 16000

        # Resample Microphone PCM audio to 16kHz Mono
        mic_raw_pcm = b"".join([c[0] for c in self.mic_frames])
        mic_rate = self.mic_frames[0][1] if len(self.mic_frames) > 0 else 44100
        mic_ch = self.mic_frames[0][2] if len(self.mic_frames) > 0 else 1
        mic_16k_pcm = resample_pcm(mic_raw_pcm, mic_rate, target_rate=target_rate, channels=mic_ch)
        mic_arr = np.frombuffer(mic_16k_pcm, dtype=np.int16) if mic_16k_pcm else np.array([], dtype=np.int16)

        # Resample Speaker PCM audio to 16kHz Mono
        spk_raw_pcm = b"".join([c[0] for c in self.speaker_frames])
        spk_rate = self.speaker_frames[0][1] if len(self.speaker_frames) > 0 else 48000
        spk_ch = self.speaker_frames[0][2] if len(self.speaker_frames) > 0 else 2
        spk_16k_pcm = resample_pcm(spk_raw_pcm, spk_rate, target_rate=target_rate, channels=spk_ch)
        spk_arr = np.frombuffer(spk_16k_pcm, dtype=np.int16) if spk_16k_pcm else np.array([], dtype=np.int16)

        # Mix Mic and Speaker arrays sample-by-sample
        if len(mic_arr) > 0 and len(spk_arr) > 0:
            max_len = max(len(mic_arr), len(spk_arr))
            mixed = np.zeros(max_len, dtype=np.int32)
            mixed[:len(mic_arr)] += mic_arr.astype(np.int32)
            mixed[:len(spk_arr)] += spk_arr.astype(np.int32)
            mixed_audio = np.clip(mixed, -32768, 32767).astype(np.int16)
        elif len(mic_arr) > 0:
            mixed_audio = mic_arr
        elif len(spk_arr) > 0:
            mixed_audio = spk_arr
        else:
            mixed_audio = np.zeros(16000 * 2, dtype=np.int16)

        with wave.open(filepath, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(target_rate)
            wf.writeframes(mixed_audio.tobytes())

        if self.pa:
            try:
                self.pa.terminate()
            except Exception:
                pass
            self.pa = None

        return {
            "status": "recording_stopped",
            "filepath": filepath,
            "filename": os.path.basename(filepath),
            "live_transcript": list(self.live_transcript)
        }

    def toggle_mute(self, target, state=None):
        if target == "mic":
            self.is_mic_muted = not self.is_mic_muted if state is None else bool(state)
            return {"status": "success", "target": "mic", "is_muted": self.is_mic_muted}
        elif target == "speaker":
            self.is_speaker_muted = not self.is_speaker_muted if state is None else bool(state)
            return {"status": "success", "target": "speaker", "is_muted": self.is_speaker_muted}
        return {"status": "error", "message": "Invalid mute target"}

    def get_status(self):
        elapsed = 0
        if self.is_recording and self.start_time:
            if self.is_paused:
                elapsed = self.pause_time - self.start_time - self.total_paused_duration
            else:
                elapsed = time.time() - self.start_time - self.total_paused_duration

        return {
            "is_recording": self.is_recording,
            "is_paused": self.is_paused,
            "is_mic_muted": self.is_mic_muted,
            "is_speaker_muted": self.is_speaker_muted,
            "elapsed_seconds": max(0, int(elapsed)),
            "mic_level": self.mic_level if self.is_recording and not self.is_paused and not self.is_mic_muted else 0.0,
            "speaker_level": self.speaker_level if self.is_recording and not self.is_paused and not self.is_speaker_muted else 0.0,
            "live_transcript": self.live_transcript,
            "current_filename": os.path.basename(self.current_filename) if self.current_filename else None
        }
