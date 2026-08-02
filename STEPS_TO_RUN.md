# 🟢 TaskPulse AI (Node.js/Express) - Steps to Run

Follow these step-by-step instructions to set up and run the Node.js/Express version of **TaskPulse AI**.

---

## 📋 Prerequisites
- **Node.js 18+** installed on your system.
- **npm** (Node Package Manager).
- **Python 3.10+** (required for Windows WASAPI soundcard audio recording helper).

---

## 🚀 Step-by-Step Setup Guide

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/projectdeveloperyogesh/tm-node.git
cd tm-node
```

### 2️⃣ Install Node.js Dependencies
```bash
npm install
```

### 3️⃣ Configure Environment Variables (Optional for Gemini AI)
Create a `.env` file in the root directory or configure your API key inside the UI Settings tab:
```env
PORT=3000
GEMINI_API_KEY=your_google_gemini_api_key_here
```

### 4️⃣ Start the Node.js Express Server
- **Production Mode**:
  ```bash
  npm start
  ```
- **Development Mode (with auto-reload)**:
  ```bash
  npm run dev
  ```

---

## 🌐 Accessing the Application
Open your web browser and navigate to:
👉 **[http://127.0.0.1:3000](http://127.0.0.1:3000)**

---

## 🎯 Main Application Features
1. **💻 Desktop Dual Audio Mode**: Record both your Microphone and System Speaker Audio (Zoom, Teams, Meet, YouTube) using Windows WASAPI soundcards.
2. **🌐 Web Browser Mode**: Record directly using HTML5 WebAudio.
3. **📁 Media File Uploader**: Upload `.mp3`, `.wav`, `.mp4`, or `.webm` files for transcription and note generation.
4. **📊 Summary & Insights**: Executive summaries, topics discussed, and full timestamped transcripts in English, Hindi, Hinglish, Spanish, French, or German.
5. **📋 Kanban Action Task Board**: Filter action items by status (*To Do*, *In Progress*, *Done*) and priority (*High*, *Medium*, *Low*).
