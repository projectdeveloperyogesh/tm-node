import os
import sys
import time
import wave
import threading
import tkinter as tk
from tkinter import ttk, messagebox

try:
    import numpy as np
    import requests
    import sounddevice as sd
except ImportError:
    print("Installing missing dependencies: sounddevice, numpy, requests...")
    os.system(f'"{sys.executable}" -m pip install sounddevice numpy requests')
    import numpy as np
    import requests
    import sounddevice as sd

class TaskPulseDesktopClient:
    def __init__(self, root):
        self.root = root
        self.root.title("TaskPulse AI - Local Desktop Dual Audio Recorder")
        self.root.geometry("640x580")
        self.root.configure(bg="#0b0f19")
        self.root.resizable(False, False)

        self.is_recording = False
        self.audio_frames = []
        self.record_thread = None
        self.sample_rate = 16000
        self.channels = 2

        self.setup_ui()

    def setup_ui(self):
        style = ttk.Style()
        style.theme_use('clam')

        # Header
        header_frame = tk.Frame(self.root, bg="#101726", padx=15, pady=15)
        header_frame.pack(fill="x")

        title_lbl = tk.Label(
            header_frame, 
            text="🎙️ TaskPulse AI • Local Desktop Audio Client", 
            font=("Segoe UI", 14, "bold"), 
            fg="#38bdf8", 
            bg="#101726"
        )
        title_lbl.pack(anchor="w")

        sub_lbl = tk.Label(
            header_frame, 
            text="Captures local mic & Zoom/Teams speaker audio -> Sends to Cloud AI Server", 
            font=("Segoe UI", 9), 
            fg="#94a3b8", 
            bg="#101726"
        )
        sub_lbl.pack(anchor="w", pady=(2, 0))

        # Main Form Container
        main_frame = tk.Frame(self.root, bg="#0b0f19", padx=20, pady=15)
        main_frame.pack(fill="both", expand=True)

        # Server Host URL
        tk.Label(main_frame, text="🌐 Cloud Server Host URL:", font=("Segoe UI", 9, "bold"), fg="#e2e8f0", bg="#0b0f19").pack(anchor="w")
        self.server_url_ent = tk.Entry(main_frame, font=("Fira Code", 10), bg="#182238", fg="#ffffff", insertbackground="#38bdf8", bd=1, relief="solid")
        self.server_url_ent.insert(0, "http://localhost:3000")
        self.server_url_ent.pack(fill="x", pady=(4, 12), ipady=4)

        # Meeting Title
        tk.Label(main_frame, text="📌 Meeting Session Title:", font=("Segoe UI", 9, "bold"), fg="#e2e8f0", bg="#0b0f19").pack(anchor="w")
        self.title_ent = tk.Entry(main_frame, font=("Segoe UI", 10), bg="#182238", fg="#ffffff", insertbackground="#38bdf8", bd=1, relief="solid")
        self.title_ent.insert(0, "Desktop Meeting Session")
        self.title_ent.pack(fill="x", pady=(4, 12), ipady=4)

        # Language Selection
        tk.Label(main_frame, text="🗣️ Summary Target Language:", font=("Segoe UI", 9, "bold"), fg="#e2e8f0", bg="#0b0f19").pack(anchor="w")
        self.lang_cb = ttk.Combobox(main_frame, values=["English", "Hindi", "Hinglish", "Spanish", "French", "German"], state="readonly")
        self.lang_cb.set("English")
        self.lang_cb.pack(fill="x", pady=(4, 15))

        # Controls Row
        btn_frame = tk.Frame(main_frame, bg="#0b0f19")
        btn_frame.pack(fill="x", pady=10)

        self.btn_start = tk.Button(
            btn_frame, 
            text="▶ Start Recording (Mic + System Audio)", 
            font=("Segoe UI", 10, "bold"), 
            bg="#10b981", 
            fg="#ffffff", 
            activebackground="#059669", 
            activeforeground="#ffffff", 
            bd=0, 
            padx=12, 
            pady=8, 
            cursor="hand2",
            command=self.start_recording
        )
        self.btn_start.pack(side="left", expand=True, fill="x", padx=(0, 6))

        self.btn_stop = tk.Button(
            btn_frame, 
            text="⏹ Stop & Send to Cloud AI", 
            font=("Segoe UI", 10, "bold"), 
            bg="#ef4444", 
            fg="#ffffff", 
            activebackground="#dc2626", 
            activeforeground="#ffffff", 
            bd=0, 
            padx=12, 
            pady=8, 
            state="disabled",
            cursor="hand2",
            command=self.stop_recording
        )
        self.btn_stop.pack(side="right", expand=True, fill="x", padx=(6, 0))

        # Status Label
        self.status_lbl = tk.Label(main_frame, text="Status: Standby", font=("Segoe UI", 9, "italic"), fg="#38bdf8", bg="#0b0f19")
        self.status_lbl.pack(anchor="w", pady=(8, 4))

        # AI Result Log Output
        tk.Label(main_frame, text="📋 Returned AI Executive Summary & Action Tasks:", font=("Segoe UI", 9, "bold"), fg="#e2e8f0", bg="#0b0f19").pack(anchor="w")
        self.output_txt = tk.Text(main_frame, font=("Segoe UI", 9), bg="#101726", fg="#f1f5f9", height=8, bd=1, relief="solid")
        self.output_txt.pack(fill="both", expand=True, pady=(4, 0))

    def start_recording(self):
        if self.is_recording:
            return

        self.is_recording = True
        self.audio_frames = []
        self.btn_start.config(state="disabled")
        self.btn_stop.config(state="normal")
        self.status_lbl.config(text="Status: 🔴 Recording Live System Audio & Mic...", fg="#ef4444")
        self.output_txt.delete("1.0", tk.END)

        self.record_thread = threading.Thread(target=self._record_audio_loop, daemon=True)
        self.record_thread.start()

    def _record_audio_loop(self):
        def callback(indata, frames, time_info, status):
            if self.is_recording:
                self.audio_frames.append(indata.copy())

        try:
            # WASAPI Loopback / Default Dual Input Capture
            with sd.InputStream(samplerate=self.sample_rate, channels=self.channels, callback=callback):
                while self.is_recording:
                    sd.sleep(100)
        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror("Recording Error", f"Soundcard capture error: {e}"))
            self.root.after(0, self._reset_ui)

    def stop_recording(self):
        if not self.is_recording:
            return

        self.is_recording = False
        self.btn_stop.config(state="disabled")
        self.status_lbl.config(text="Status: ⏳ Processing Audio & Uploading to Cloud AI Server...", fg="#fbbf24")

        threading.Thread(target=self._upload_process_worker, daemon=True).start()

    def _upload_process_worker(self):
        if not self.audio_frames:
            self.root.after(0, lambda: messagebox.showwarning("Warning", "No audio recorded."))
            self.root.after(0, self._reset_ui)
            return

        wav_path = "temp_desktop_rec.wav"
        try:
            audio_data = np.concatenate(self.audio_frames, axis=0)
            int_data = (audio_data * 32767).astype(np.int16)

            with wave.open(wav_path, 'wb') as wf:
                wf.setnchannels(self.channels)
                wf.setsampwidth(2) # 16-bit
                wf.setframerate(self.sample_rate)
                wf.writeframes(int_data.tobytes())

            server_url = self.server_url_ent.get().strip().rstrip("/")
            upload_endpoint = f"{server_url}/api/android/upload"
            title = self.title_ent.get().strip() or "Desktop Recorded Session"
            lang = self.lang_cb.get()

            with open(wav_path, 'rb') as f:
                files = {'file': (wav_path, f, 'audio/wav')}
                data = {
                    'meeting_title': title,
                    'target_language': lang,
                    'live_transcript': 'Desktop dual soundcard meeting session recorded.'
                }

                resp = requests.post(upload_endpoint, files=files, data=data, timeout=120)

            if resp.status_code == 200:
                res_json = resp.json()
                meeting = res_json.get("meeting", {})
                tasks = res_json.get("tasks", [])

                summary = meeting.get("summary", "No summary generated.")
                task_str = "\n".join([f"• [{t.get('priority', 'Normal')}] {t.get('title')} ({t.get('assignee', 'Unassigned')})" for t in tasks])

                result_text = f"✅ SUCCESS! Meeting Saved on Cloud AI Server\n" \
                              f"=========================================\n" \
                              f"📌 Title: {meeting.get('title')}\n" \
                              f"📅 Date: {meeting.get('created_at')}\n\n" \
                              f"📝 EXECUTIVE SUMMARY:\n{summary}\n\n" \
                              f"✅ EXTRACTED ACTION TASKS ({len(tasks)}):\n{task_str or 'No tasks extracted.'}"

                self.root.after(0, lambda: self._show_result(result_text))
            else:
                err_msg = f"HTTP Error {resp.status_code}: {resp.text}"
                self.root.after(0, lambda: messagebox.showerror("Upload Error", err_msg))

        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror("Connection Error", f"Failed to connect to Cloud Server:\n{e}"))
        finally:
            if os.path.exists(wav_path):
                try: os.remove(wav_path)
                except: pass
            self.root.after(0, self._reset_ui)

    def _show_result(self, text):
        self.output_txt.delete("1.0", tk.END)
        self.output_txt.insert(tk.END, text)
        self.status_lbl.config(text="Status: ✅ Successfully Processed by Cloud AI Server!", fg="#10b981")

    def _reset_ui(self):
        self.is_recording = False
        self.btn_start.config(state="normal")
        self.btn_stop.config(state="disabled")

if __name__ == "__main__":
    root = tk.Tk()
    app = TaskPulseDesktopClient(root)
    root.mainloop()
