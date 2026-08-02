# 🟢 TaskPulse AI (Node.js/Express) - Steps to Run on Any System

Follow these step-by-step instructions to set up and run the Node.js/Express version of **TaskPulse AI** on any computer.

---

## 📋 Prerequisites
- **Node.js 18+** ([nodejs.org](https://nodejs.org/)).
- **Python 3.10+** ([python.org](https://www.python.org/)) (required for Windows WASAPI soundcard audio recording helper).

---

## 🚀 Step-by-Step Setup Guide

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/projectdeveloperyogesh/tm-node.git
cd tm-node
```

### 2️⃣ Install Dependencies
- **Node.js dependencies**:
  ```bash
  npm install
  ```
- **Python WASAPI Audio Helper dependencies**:
  ```bash
  pip install -r python-requirements.txt
  ```

### 3️⃣ Configure Environment Variables (Optional)
Create a `.env` file or configure your Gemini API Key in the UI Settings tab:
```env
PORT=3000
GEMINI_API_KEY=your_google_gemini_api_key_here
```

### 4️⃣ Start the Express Server
```bash
npm start
```

---

## 🌐 Accessing the Application
Open your web browser and navigate to:
👉 **[http://127.0.0.1:3000](http://127.0.0.1:3000)**

---

## 🔧 Troubleshooting on New Systems:
- **No Soundcards Listed**: Grant desktop microphone permissions in Windows Settings (*Settings > Privacy & Security > Microphone*).
- **Python Audio Helper Notice**: Ensure `pip install -r python-requirements.txt` was executed so `pyaudiowpatch` and `SpeechRecognition` are installed.
