# 🟢 TaskPulse AI (Node.js/Express) - Steps to Run & Install Packages

Follow these step-by-step instructions to install both **Node.js** and **Python WASAPI audio helper packages** to run **TaskPulse AI** on any computer.

---

## 📋 Prerequisites
- **Node.js 18+** ([Download Node.js](https://nodejs.org/))
- **Python 3.10+** ([Download Python](https://www.python.org/)) (required for WASAPI Desktop soundcard recording helper)
- **Git** ([Download Git](https://git-scm.com/))

---

## 📦 Step-by-Step Installation Guide

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/projectdeveloperyogesh/tm-node.git
cd tm-node
```

### 2️⃣ Install Node.js Packages
```bash
npm install
```

### 3️⃣ Install Python WASAPI Audio Helper Packages
To enable Windows WASAPI Desktop Soundcard Recording (Microphone + System Speaker Audio):

- **Windows (Command Prompt / PowerShell)**:
  ```cmd
  python -m venv .venv
  .venv\Scripts\activate
  pip install -r python-requirements.txt
  ```
- **macOS / Linux**:
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r python-requirements.txt
  ```

---

## 🚀 Running the Node.js Application

### Start the Express Server
```bash
npm start
```

### Open in Browser
Open your web browser and navigate to:
👉 **[http://127.0.0.1:3000](http://127.0.0.1:3000)**

---

## 📦 Included Package Details

### Node.js Packages (`package.json`)
- `express` - Web Server framework
- `@google/generative-ai` - Google Gemini 1.5 Flash AI SDK
- `multer` - Audio & Media file uploader middleware
- `cors` & `dotenv` - Cross-origin resource sharing & environment configuration

### Python Audio Helper Packages (`python-requirements.txt`)
- `pyaudiowpatch` - Windows WASAPI System Audio Loopback recorder
- `SpeechRecognition` - Speech-to-Text audio converter
- `fastapi` & `uvicorn` - Audio bridge helper
- `python-multipart` - Form data parser for FastAPI bridge
- `numpy` & `requests` - PCM audio buffer processing
