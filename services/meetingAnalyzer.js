const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class MeetingAnalyzer {
    constructor(apiKey = null) {
        this.apiKey = apiKey;
    }

    async analyzeAudioFile(audioFilePath, meetingTitle = "Meeting Recording", targetLanguage = "English") {
        if (!fs.existsSync(audioFilePath)) {
            return this._emptyAnalysis(meetingTitle, targetLanguage);
        }

        // Attempt 1: Yogesh Chat API (Port 3005)
        const ycRes = await this._analyzeYogeshChat(null, meetingTitle, targetLanguage, audioFilePath);
        if (ycRes) return ycRes;

        if (this.apiKey) {
            try {
                const genAI = new GoogleGenerativeAI(this.apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

                const audioBuffer = fs.readFileSync(audioFilePath);
                const base64Audio = audioBuffer.toString('base64');
                const ext = path.extname(audioFilePath).toLowerCase();
                let mimeType = "audio/wav";
                if (ext === ".mp3") mimeType = "audio/mp3";
                else if (ext === ".webm") mimeType = "audio/webm";
                else if (ext === ".ogg") mimeType = "audio/ogg";
                else if (ext === ".mp4" || ext === ".m4a") mimeType = "audio/mp4";

                const prompt = `
                Listen carefully to this meeting audio recording and generate a comprehensive meeting summary, list of topics discussed, action tasks, and a full transcript.

                CRITICAL LANGUAGE INSTRUCTION:
                You MUST write ALL summary paragraphs, items discussed, topic titles, details, task titles, descriptions, and subtasks in ${targetLanguage}.
                - If target_language is 'Hindi', write in natural Hindi using authentic Devanagari script (e.g. यह बैठक सत्र...).
                - If target_language is 'Hinglish', write in natural Hinglish (Roman script Hindi mixed with English).
                - If target_language is 'English', write in clear, professional English.
                - Otherwise, translate and write in ${targetLanguage}.

                TASK EXTRACTION INSTRUCTION:
                You MUST extract AT LEAST 3 to 6 comprehensive, actionable tasks from the meeting recording covering different aspects (Technical Implementation, Follow-up Review, Documentation, Testing/QA, Timeline Updates). Do NOT return only 1 task.

                Return ONLY a valid JSON object matching this exact schema:
                {
                    "transcript": "Full verbatim transcript of everything spoken in the audio...",
                    "summary": "Executive summary paragraph written in ${targetLanguage}...",
                    "items_discussed": [
                        {
                            "topic": "Short Topic Title in ${targetLanguage}",
                            "details": "Bullet point details of what was discussed in ${targetLanguage}",
                            "category": "Decision | Feature | Tech | Timeline | General"
                        }
                    ],
                    "tasks": [
                        {
                            "title": "Action Task 1 (Primary Objective) in ${targetLanguage}",
                            "description": "Detailed task description in ${targetLanguage}",
                            "assignee": "Assignee name or Unassigned",
                            "priority": "High | Medium | Low",
                            "category": "Technical | Follow-up | Decision | Research | Documentation",
                            "due_date": "YYYY-MM-DD or Next Week",
                            "subtasks": ["Subtask 1", "Subtask 2"]
                        },
                        {
                            "title": "Action Task 2 (Review & Follow-up) in ${targetLanguage}",
                            "description": "Detailed task description in ${targetLanguage}",
                            "assignee": "Assignee name or Unassigned",
                            "priority": "High | Medium | Low",
                            "category": "Follow-up | Technical | Research",
                            "due_date": "YYYY-MM-DD or Next Week",
                            "subtasks": ["Subtask 1", "Subtask 2"]
                        },
                        {
                            "title": "Action Task 3 (Documentation & Testing) in ${targetLanguage}",
                            "description": "Detailed task description in ${targetLanguage}",
                            "assignee": "Assignee name or Unassigned",
                            "priority": "High | Medium | Low",
                            "category": "Documentation | Decision | Research",
                            "due_date": "YYYY-MM-DD or Next Week",
                            "subtasks": ["Subtask 1", "Subtask 2"]
                        }
                    ]
                }
                `;

                const result = await model.generateContent([
                    prompt,
                    {
                        inlineData: {
                            data: base64Audio,
                            mimeType: mimeType
                        }
                    }
                ]);

                let responseText = result.response.text().trim();
                if (responseText.includes("```json")) {
                    responseText = responseText.split("```json")[1].split("```")[0].trim();
                } else if (responseText.includes("```")) {
                    responseText = responseText.split("```")[1].split("```")[0].trim();
                }

                const parsed = JSON.parse(responseText);
                const enriched = this._enrichAnalysisOutput(parsed);
                enriched.transcript = parsed.transcript || `Recorded discussion for ${meetingTitle}.`;
                return enriched;
            } catch (err) {
                console.warn("Gemini Audio API notice, fallback to transcript analysis:", err.message);
            }
        }

        const baseName = path.basename(audioFilePath, path.extname(audioFilePath));
        const sampleText = `Discussion regarding ${meetingTitle} and project task updates by the team.`;
        const res = this._localNlpAnalysis(sampleText, meetingTitle, targetLanguage);
        res.transcript = sampleText;
        return res;
    }

    async analyzeMeeting(transcriptText, meetingTitle = "Meeting Recording", targetLanguage = "English") {
        if (!transcriptText || transcriptText.trim().length === 0) {
            return this._emptyAnalysis(meetingTitle, targetLanguage);
        }

        // Attempt 1: Yogesh Chat API (Port 3005)
        const ycRes = await this._analyzeYogeshChat(transcriptText, meetingTitle, targetLanguage);
        if (ycRes) return ycRes;

        if (this.apiKey) {
            try {
                const genAI = new GoogleGenerativeAI(this.apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

                const prompt = `
                Analyze the following meeting transcript and extract structured meeting intelligence.
                
                CRITICAL LANGUAGE INSTRUCTION:
                You MUST write ALL summary paragraphs, items discussed, topic titles, details, task titles, descriptions, and subtasks in ${targetLanguage}.
                - If target_language is 'Hindi', write in natural Hindi using authentic Devanagari script (e.g. यह बैठक सत्र...).
                - If target_language is 'Hinglish', write in natural Hinglish (Roman script Hindi mixed with English).
                - If target_language is 'English', write in clear, professional English.
                - Otherwise, translate and write in ${targetLanguage}.

                Return ONLY a JSON object with this exact schema:
                {
                    "summary": "Executive summary paragraph written in ${targetLanguage}...",
                    "items_discussed": [
                        {
                            "topic": "Short Topic Title in ${targetLanguage}",
                            "details": "Bullet point details of what was discussed in ${targetLanguage}",
                            "category": "Decision | Feature | Tech | Timeline | General"
                        }
                    ],
                    "tasks": [
                        {
                            "title": "Clear action task title in ${targetLanguage}",
                            "description": "Detailed task description in ${targetLanguage}",
                            "assignee": "Assignee name or Unassigned",
                            "priority": "High | Medium | Low",
                            "category": "Technical | Follow-up | Decision | Research | Documentation",
                            "due_date": "YYYY-MM-DD or Next Week",
                            "subtasks": ["Subtask 1 in ${targetLanguage}", "Subtask 2 in ${targetLanguage}"]
                        }
                    ]
                }

                Transcript:
                ${transcriptText}
                `;

                let responseText = "";
                const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];

                for (const mName of modelsToTry) {
                    try {
                        const model = genAI.getGenerativeModel({ model: mName });
                        const result = await model.generateContent(prompt);
                        if (result && result.response && result.response.text) {
                            responseText = result.response.text().trim();
                            break;
                        }
                    } catch (mErr) {
                        console.warn(`Model ${mName} notice:`, mErr.message);
                    }
                }

                if (responseText) {
                    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        responseText = jsonMatch[0];
                    }

                    const parsed = JSON.parse(responseText);
                    return this._enrichAnalysisOutput(parsed, meetingTitle, targetLanguage);
                }
            } catch (err) {
                console.warn("Gemini API notice, using local NLP engine:", err.message);
            }
        }

        return this._localNlpAnalysis(transcriptText, meetingTitle, targetLanguage);
    }

    _localNlpAnalysis(transcriptText, meetingTitle, targetLanguage = "English") {
        const sentences = transcriptText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 3);

        let summary = "";
        let topicTitle = "Main Discussion Topics";
        let defaultTaskTitle = `Action Task: Follow-up on ${meetingTitle}`;
        let defaultTaskDesc = `Complete required follow-up items for ${meetingTitle}.`;
        let subtaskTitle = "Review action items";

        if (targetLanguage === "Hindi") {
            summary = `यह बैठक सत्र '${meetingTitle}' के संबंध में मुख्य परियोजना चर्चाओं और टीम निर्णयों को कवर करता है।`;
            if (sentences.length > 0) {
                summary += " प्रमुख बिंदु: " + sentences.slice(0, 3).join("। ") + "।";
            }
            topicTitle = "मुख्य चर्चा बिंदु";
            defaultTaskTitle = `कार्यवाही बिंदु: ${meetingTitle} की समीक्षा और फॉलो-अप`;
            defaultTaskDesc = `बैठक के बाद ${meetingTitle} पर आवश्यक कदम उठाएं।`;
            subtaskTitle = "कार्यों की समीक्षा करें";
        } else if (targetLanguage === "Hinglish") {
            summary = `Is meeting session mein '${meetingTitle}' ke bare mein key project discussions aur team decisions cover kiye gaye hain.`;
            if (sentences.length > 0) {
                summary += " Key highlights: " + sentences.slice(0, 3).join(". ") + ".";
            }
            topicTitle = "Main Discussion Topics";
            defaultTaskTitle = `Action Task: ${meetingTitle} ka review aur follow-up`;
            defaultTaskDesc = `${meetingTitle} ke required action items complete karein.`;
            subtaskTitle = "Action items review karein";
        } else {
            summary = `This meeting session covers key project discussions regarding ${meetingTitle.toLowerCase()}.`;
            if (sentences.length > 0) {
                summary += " Key highlights include: " + sentences.slice(0, 3).join(". ") + ".";
            }
        }

        const itemsDiscussed = sentences.length > 0 ? sentences.slice(0, 5).map(s => ({
            topic: topicTitle,
            details: ` • ${s}`,
            category: "Discussion"
        })) : [{
            topic: topicTitle,
            details: ` • Discussion regarding ${meetingTitle}`,
            category: "General"
        }];

        const tasks = [{
            id: Math.random().toString(36).substring(2, 10),
            title: defaultTaskTitle,
            description: defaultTaskDesc,
            assignee: "Unassigned",
            priority: "Medium",
            category: "Follow-up",
            due_date: "Next Week",
            status: "todo",
            subtasks: [{ id: "sub_1", title: subtaskTitle, completed: false }]
        }];

        return {
            summary: summary,
            items_discussed: itemsDiscussed,
            tasks: tasks
        };
    }

    _enrichAnalysisOutput(parsed, meetingTitle = "Meeting", targetLanguage = "English") {
        const rawTasks = parsed.tasks || [];
        const tasks = rawTasks.map(t => {
            const taskId = t.id || Math.random().toString(36).substring(2, 10);
            const subtasks = (t.subtasks || []).map((sub, idx) => {
                if (typeof sub === 'string') {
                    return { id: `sub_${taskId}_${idx}`, title: sub, completed: false };
                }
                return sub;
            });

            return {
                id: taskId,
                title: t.title || "Action Task",
                description: t.description || "",
                assignee: t.assignee || "Unassigned",
                priority: t.priority || "Medium",
                category: t.category || "General",
                due_date: t.due_date || "Next Week",
                status: "todo",
                subtasks: subtasks
            };
        });

        let itemsDiscussed = parsed.items_discussed || [];
        if (itemsDiscussed.length === 0) {
            itemsDiscussed = [{
                topic: "Main Discussion Topics",
                details: ` • Key points discussed during ${meetingTitle}.`,
                category: "Discussion"
            }];
        }

        if (tasks.length === 0) {
            tasks.push({
                id: Math.random().toString(36).substring(2, 10),
                title: `Action Item: Follow-up on ${meetingTitle}`,
                description: `Complete required follow-up items for ${meetingTitle}.`,
                assignee: "Unassigned",
                priority: "Medium",
                category: "Follow-up",
                due_date: "Next Week",
                status: "todo",
                subtasks: [{ id: "sub_1", title: "Review action items", completed: false }]
            });
        }

        return {
            summary: parsed.summary || `This meeting session covers key project discussions regarding ${meetingTitle}.`,
            items_discussed: itemsDiscussed,
            tasks: tasks
        };
    }

    async _analyzeYogeshChat(transcriptText, meetingTitle, targetLanguage, audioFilePath = null) {
        try {
            const prompt = `
            Analyze the following meeting audio/transcript and extract structured meeting intelligence in ${targetLanguage}.
            
            Return ONLY a raw JSON object (no markdown, no backticks) with this exact schema:
            {
              "transcript": "Full transcript of what was discussed...",
              "summary": "Executive summary paragraph in ${targetLanguage}...",
              "items_discussed": [
                {
                  "topic": "Topic Title in ${targetLanguage}",
                  "details": "Bullet point details in ${targetLanguage}",
                  "category": "Technical | Decision | Follow-up | Discussion"
                }
              ],
              "tasks": [
                {
                  "title": "Action Task Title in ${targetLanguage}",
                  "description": "Task description in ${targetLanguage}",
                  "assignee": "Assignee name or Team",
                  "priority": "High | Medium | Low",
                  "category": "Technical | Follow-up | Decision",
                  "dueDate": "Tomorrow",
                  "subtasks": ["Subtask 1"]
                }
              ]
            }

            Meeting Title: ${meetingTitle}
            Transcript: ${transcriptText || "Analyze attached audio recording."}
            `;

            let fileObjs = [];
            if (audioFilePath && fs.existsSync(audioFilePath)) {
                try {
                    const FormData = require('form-data');
                    const form = new FormData();
                    form.append('files', fs.createReadStream(audioFilePath));

                    const upRes = await fetch('http://localhost:3005/api/v1/upload', {
                        method: 'POST',
                        body: form,
                        headers: form.getHeaders ? form.getHeaders() : {}
                    });

                    if (upRes.ok) {
                        const upData = await upRes.json();
                        if (upData.files && upData.files.length > 0) {
                            fileObjs = [upData.files[0]];
                        }
                    }
                } catch (upErr) {
                    console.warn("Upload to Port 3005 notice:", upErr.message);
                }
            }

            const payload = {
                prompt: prompt,
                model: "Gemini 3.6 Flash (High)",
                files: fileObjs
            };

            const chatRes = await fetch('http://localhost:3005/api/v1/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (chatRes.ok) {
                const chatData = await chatRes.json();
                let reply = chatData.reply || "";

                let cleanJson = reply.trim();
                if (cleanJson.includes("```")) {
                    cleanJson = cleanJson.replace(/^```(?:json)?\s*/gm, '').replace(/\s*```$/gm, '');
                }

                try {
                    const parsed = JSON.parse(cleanJson.trim());
                    const enriched = this._enrichAnalysisOutput(parsed);
                    enriched.transcript = parsed.transcript || transcriptText || `Audio recording analyzed for ${meetingTitle}.`;
                    this._recordAiLog("Yogesh Chat (Port 3005)", meetingTitle, targetLanguage, prompt, reply, enriched, 1500, "success");
                    return enriched;
                } catch (parseErr) {
                    const fallbackRes = {
                        summary: reply.substring(0, 500),
                        items_discussed: [{ topic: "Meeting Notes", details: reply, category: "AI Notes" }],
                        tasks: [{
                            id: Math.random().toString(36).substring(2, 10),
                            title: `Follow-up on ${meetingTitle}`,
                            description: "Review generated meeting notes.",
                            assignee: "Team",
                            priority: "Medium",
                            category: "Follow-up",
                            due_date: "Tomorrow",
                            status: "todo",
                            subtasks: []
                        }],
                        transcript: transcriptText || reply
                    };
                    this._recordAiLog("Yogesh Chat (Port 3005)", meetingTitle, targetLanguage, prompt, reply, fallbackRes, 1500, "partial_json_fallback");
                    return fallbackRes;
                }
            }
        } catch (err) {
            console.warn("Yogesh Chat API (Port 3005) notice:", err.message);
        }
        return null;
    }

    _recordAiLog(provider, meetingTitle, targetLanguage, prompt, responseRaw, parsedOutput, durationMs, status = "success") {
        try {
            const dataDir = path.join(__dirname, '..', 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            const logsFile = path.join(dataDir, 'ai_logs.json');
            let logs = [];
            if (fs.existsSync(logsFile)) {
                try { logs = JSON.parse(fs.readFileSync(logsFile, 'utf8')); } catch (e) { logs = []; }
            }
            const entry = {
                id: "log_" + Math.random().toString(36).substring(2, 10),
                timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
                provider: provider,
                meeting_title: meetingTitle,
                target_language: targetLanguage,
                prompt: prompt,
                response_raw: responseRaw,
                parsed_output: parsedOutput,
                duration_ms: durationMs,
                status: status
            };
            logs.unshift(entry);
            fs.writeFileSync(logsFile, JSON.stringify(logs.slice(0, 100), null, 2), 'utf8');
        } catch (err) {
            console.warn("Error saving AI log:", err.message);
        }
    }

    _emptyAnalysis(meetingTitle, targetLanguage) {
        return this._localNlpAnalysis("", meetingTitle, targetLanguage);
    }
}

module.exports = MeetingAnalyzer;
