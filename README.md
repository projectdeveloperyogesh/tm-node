# TaskPulse AI - Dual Audio Meeting Recorder & Action Task Extractor (Node.js/Express)

TaskPulse AI is a full-stack Node.js & Express application for meeting session recording, speech-to-text transcription, executive meeting summary generation, and Kanban action task extraction powered by `@google/generative-ai` and WASAPI Dual Audio capture.

## 📦 How to Install Packages & Run

### 1. Clone Repository & Install Node Packages
```bash
git clone https://github.com/projectdeveloperyogesh/tm-node.git
cd tm-node

npm install
```

### 2. Install Python Audio Helper Packages
```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r python-requirements.txt
```

### 3. Start Server
```bash
npm start
```
Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.
See [STEPS_TO_RUN.md](STEPS_TO_RUN.md) for full guide.
