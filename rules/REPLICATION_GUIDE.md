# 🚀 TaskPulse AI - Universal App Replication Master Blueprint

This master guide provides exact instructions for AI coding assistants and developers to generate 1-to-1 identical copies of the TaskPulse AI application suite across **Node.js**, **Python FastAPI**, and **Native Android**.

---

## 📚 Architectural Specification Rules

Refer to the individual platform rule files for exact code structures:

1. 🟢 **Node.js Web App Specification**: [`rules/NODE_APP_RULE.md`](NODE_APP_RULE.md)
2. 🐍 **Python FastAPI App Specification**: [`rules/PYTHON_APP_RULE.md`](PYTHON_APP_RULE.md)
3. 📱 **Android Native App Specification**: [`rules/ANDROID_APP_RULE.md`](ANDROID_APP_RULE.md)

---

## ⚡ Master System Invariants (Must Be Upheld Across All Platforms)

1. **Non-Blocking Immediate Response Contract**:
   - Stopping a recording or uploading a media file MUST release the UI state in `< 50ms`.
   - All transcription and LLM/NLP analysis MUST execute asynchronously in background worker threads.

2. **100% Guaranteed Meeting Persistence**:
   - If AI LLM providers or speech engines fail, fallback summaries and action tasks MUST be generated locally so NO recorded meeting session is ever lost.

3. **Unicode Safety & Windows Compatibility**:
   - Never use raw unicode emojis (`✅`) in backend status messages or JSON APIs. Use clean ASCII text strings (`"Meeting processing completed & saved!"`).

4. **UI Design System**:
   - Dark Slate palette (`#0b0f19` background, `#151c2e` translucent cards, `#3b82f6` accent blue).
   - Real-time decibel volume gauges (`0% - 100%`).
   - Dedicated Jobs Monitor drawer/tab with percentage progress bars (`0% - 100%`).
   - Automatic focus on newly saved meetings upon job completion.

---

## 🛠️ Replication Command Cheat Sheet

### 🟢 Recreating Node.js App:
```bash
git clone https://github.com/projectdeveloperyogesh/tm-node.git
cd tm-node
npm install
node server.js
```

### 🐍 Recreating Python FastAPI App:
```bash
git clone https://github.com/projectdeveloperyogesh/tm-python.git
cd tm-python
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### 📱 Recreating Standalone Android App:
```bash
git clone https://github.com/projectdeveloperyogesh/tm-android.git
cd tm-android
gradle assembleDebug
```
