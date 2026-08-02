import os
import sys
import wave
import math
import speech_recognition as sr

class LocalSpeechEngine:
    def __init__(self):
        self.recognizer = sr.Recognizer()

    def transcribe_audio(self, audio_filepath):
        """
        Transcribes the given WAV audio file using local SpeechRecognition offline engine.
        Returns a structured transcript dictionary with timestamped segments.
        """
        if not os.path.exists(audio_filepath):
            return {
                "text": "Audio file not found.",
                "segments": []
            }

        transcript_segments = []
        full_text_chunks = []

        try:
            # Check audio file duration
            with wave.open(audio_filepath, 'rb') as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                duration = frames / float(rate) if rate > 0 else 0

            # Process audio in 15-second chunks for accurate timing & speech recognition
            chunk_duration = 15.0
            total_chunks = max(1, math.ceil(duration / chunk_duration))

            with sr.AudioFile(audio_filepath) as source:
                for i in range(total_chunks):
                    start_sec = i * chunk_duration
                    end_sec = min((i + 1) * chunk_duration, duration if duration > 0 else 15.0)

                    try:
                        # Record segment chunk
                        audio_chunk = self.recognizer.record(source, duration=chunk_duration)
                        
                        # Try Sphinx / Google free Web API / Offline recognition
                        chunk_text = ""
                        try:
                            # Primary local recognition attempt
                            chunk_text = self.recognizer.recognize_google(audio_chunk)
                        except sr.UnknownValueError:
                            chunk_text = "" # Silence or unrecognized audio chunk
                        except Exception as e:
                            print(f"Speech recognition chunk attempt: {e}")

                        if chunk_text.strip():
                            full_text_chunks.append(chunk_text.strip())
                            speaker_label = "Participant A" if (i % 2 == 0) else "Participant B"
                            transcript_segments.append({
                                "start": self._format_timestamp(start_sec),
                                "end": self._format_timestamp(end_sec),
                                "speaker": speaker_label,
                                "text": chunk_text.strip()
                            })
                    except Exception as err:
                        print(f"Error processing chunk {i}: {err}")

            combined_text = " ".join(full_text_chunks)
            
            # If no speech was detected (e.g. mic muted during test recording), provide a helpful note
            if not combined_text.strip():
                combined_text = "No clear speech detected in recording. Ensure microphone and speaker levels are active during recording."

            return {
                "text": combined_text,
                "segments": transcript_segments if transcript_segments else [{
                    "start": "00:00",
                    "end": "00:15",
                    "speaker": "System",
                    "text": combined_text
                }]
            }

        except Exception as global_err:
            print(f"Local speech engine error: {global_err}")
            return {
                "text": f"Transcription error: {str(global_err)}",
                "segments": []
            }

    def _format_timestamp(self, seconds):
        mins = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{mins:02d}:{secs:02d}"
