import os
import sys
import shutil
import urllib.request
import subprocess
import threading
import time
import requests

import json

OLLAMA_URL = "http://localhost:11434"
OLLAMA_INSTALLER_URL = "https://ollama.com/download/OllamaSetup.exe"
STATUS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scratch", "ollama_status.json")

OLLAMA_PROGRESS = {
    "status": "idle", # idle | downloading | installing | launching | pulling | ready | error
    "percent": 0,
    "message": "Ready to install or start Ollama."
}

def get_ollama_progress():
    try:
        if os.path.exists(STATUS_FILE):
            with open(STATUS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return OLLAMA_PROGRESS

def set_progress(status, percent, message):
    data = {
        "status": status,
        "percent": percent,
        "message": message,
        "timestamp": time.time()
    }
    OLLAMA_PROGRESS.update(data)
    
    base = os.path.dirname(os.path.abspath(__file__))
    target_paths = [
        os.path.join(base, "scratch", "ollama_status.json"),
        os.path.join(os.path.dirname(base), "node", "scratch", "ollama_status.json")
    ]
    
    for status_file in target_paths:
        try:
            os.makedirs(os.path.dirname(status_file), exist_ok=True)
            with open(status_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass

def is_ollama_running(host=OLLAMA_URL):
    try:
        res = requests.get(f"{host}/api/tags", timeout=3)
        return res.status_code == 200
    except Exception:
        return False

def is_ollama_installed():
    if shutil.which("ollama"):
        return True
    local_app_path = os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe")
    return os.path.exists(local_app_path)

def get_installed_models(host=OLLAMA_URL):
    try:
        res = requests.get(f"{host}/api/tags", timeout=3)
        if res.status_code == 200:
            models = res.json().get("models", [])
            return [m.get("name", "") for m in models]
    except Exception:
        pass
    return []

def _download_progress_hook(count, block_size, total_size):
    if total_size > 0:
        pct = int((count * block_size / total_size) * 100)
        pct = min(100, max(0, pct))
        set_progress("downloading", pct, f"Downloading OllamaSetup.exe ({pct}%)...")

def _bg_pull_model(model_name="llama3.2"):
    try:
        set_progress("pulling", 10, f"Pulling AI model '{model_name}' into Ollama...")
        proc = subprocess.Popen(["ollama", "pull", model_name], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        while True:
            line = proc.stdout.readline()
            if not line and proc.poll() is not None:
                break
            if "%" in line:
                import re
                m = re.search(r'(\d+)%', line)
                if m:
                    pct = int(m.group(1))
                    set_progress("pulling", pct, f"Downloading model '{model_name}' ({pct}%)...")
        
        set_progress("ready", 100, f"✅ Ollama and '{model_name}' model are 100% installed and ready!")
    except Exception as e:
        set_progress("error", 0, f"Error downloading model '{model_name}': {e}")

def run_setup_standalone(model_name="llama3.2"):
    set_progress("downloading", 5, "Initializing Ollama auto-setup...")
    try:
        if is_ollama_running():
            models = get_installed_models()
            if any(model_name in m for m in models):
                set_progress("ready", 100, f"✅ Ollama & '{model_name}' are active and ready!")
                return
            _bg_pull_model(model_name)
            return

        if is_ollama_installed():
            set_progress("launching", 40, "Launching Ollama background service...")
            ollama_cmd = shutil.which("ollama") or os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe")
            subprocess.Popen([ollama_cmd, "app"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            for _ in range(15):
                time.sleep(1)
                if is_ollama_running():
                    _bg_pull_model(model_name)
                    return
            
            _bg_pull_model(model_name)
            return

        # Download & Install Ollama on Windows
        temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scratch")
        os.makedirs(temp_dir, exist_ok=True)
        installer_path = os.path.join(temp_dir, "OllamaSetup.exe")

        if not os.path.exists(installer_path):
            set_progress("downloading", 5, "Downloading OllamaSetup.exe from ollama.com...")
            urllib.request.urlretrieve(OLLAMA_INSTALLER_URL, installer_path, _download_progress_hook)

        set_progress("installing", 80, "Launching OllamaSetup.exe! Please complete Windows setup wizard.")
        subprocess.Popen([installer_path])
        
        for _ in range(30):
            time.sleep(2)
            if is_ollama_installed() or is_ollama_running():
                set_progress("ready", 90, "Ollama installed! Launching service...")
                if not is_ollama_running():
                    ollama_cmd = shutil.which("ollama") or os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe")
                    subprocess.Popen([ollama_cmd, "app"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                _bg_pull_model(model_name)
                return

        set_progress("installing", 90, "Ollama installer running. Click 'Install' on setup window.")
    except Exception as e:
        set_progress("error", 0, f"Setup error: {e}")

def auto_setup_ollama(model_name="llama3.2"):
    """
    Checks if Ollama is running, starts it if installed, or downloads and installs Ollama automatically on Windows with real-time progress.
    """
    thread = threading.Thread(target=run_setup_standalone, args=(model_name,), daemon=False)
    thread.start()
    return {"status": "started", "message": "Ollama auto-setup initiated."}
