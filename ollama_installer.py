import os
import sys
import shutil
import urllib.request
import subprocess
import requests

OLLAMA_URL = "http://localhost:11434"
OLLAMA_INSTALLER_URL = "https://ollama.com/download/OllamaSetup.exe"

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

def ensure_ollama_model(model_name="llama3.2", host=OLLAMA_URL):
    models = get_installed_models(host)
    if any(model_name in m for m in models):
        return {"status": "ready", "message": f"Model '{model_name}' is already installed and ready."}
    
    try:
        print(f"[Ollama Auto-Setup] Pulling model '{model_name}'...")
        subprocess.Popen(["ollama", "pull", model_name])
        return {"status": "pulling", "message": f"Model '{model_name}' download started in background."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def auto_setup_ollama(model_name="llama3.2"):
    """
    Checks if Ollama is running, starts it if installed, or downloads and installs Ollama automatically on Windows.
    """
    if is_ollama_running():
        model_res = ensure_ollama_model(model_name)
        return {
            "status": "active",
            "message": "Ollama service is running.",
            "model_status": model_res
        }

    if is_ollama_installed():
        try:
            ollama_cmd = shutil.which("ollama") or os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe")
            subprocess.Popen([ollama_cmd, "app"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return {
                "status": "launched",
                "message": "Ollama service launched. Please wait a few seconds while models load."
            }
        except Exception as e:
            return {"status": "error", "message": f"Failed to launch Ollama: {e}"}

    # Download & Install Ollama on Windows
    try:
        temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scratch")
        os.makedirs(temp_dir, exist_ok=True)
        installer_path = os.path.join(temp_dir, "OllamaSetup.exe")

        if not os.path.exists(installer_path):
            print("[Ollama Auto-Setup] Downloading OllamaSetup.exe...")
            urllib.request.urlretrieve(OLLAMA_INSTALLER_URL, installer_path)

        print("[Ollama Auto-Setup] Launching OllamaSetup.exe...")
        subprocess.Popen([installer_path])
        return {
            "status": "installing",
            "message": "Ollama installer downloaded and launched! Please click 'Install' on the setup window."
        }
    except Exception as e:
        return {"status": "error", "message": f"Auto-installation error: {e}"}
