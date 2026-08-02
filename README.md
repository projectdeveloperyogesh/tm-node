# TaskPulse AI - Dual Audio Meeting Recorder & Action Task Extractor (Node.js/Express)

TaskPulse AI is a full-stack Node.js & Express application for meeting session recording, speech-to-text transcription, executive meeting summary generation, and Kanban action task extraction powered by `@google/generative-ai` and WASAPI Dual Audio capture.

## Features
- **Express REST Server**: Clean endpoints for meetings, task board, media upload, and settings.
- **Dual Audio Capture**: Record Microphone and System Audio loopback.
- **Multi-language Support**: English, Hindi, Hinglish, Spanish, French, and German.
- **Kanban Task Board**: Manage extracted action items seamlessly.

## Running Locally
```bash
# 1. Install dependencies
npm install

# 2. Run Express server
npm start
```
Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.
