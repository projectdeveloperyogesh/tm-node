import re
import sys
import json
import uuid
import datetime

class MeetingAnalyzer:
    def __init__(self, api_key=None):
        self.api_key = api_key

    def analyze_meeting(self, transcript_text, meeting_title="Meeting Recording", target_language="English"):
        """
        Analyzes meeting transcript text and generates:
        1. Executive Summary
        2. List of Items & Topics Discussed
        3. Extracted Action Tasks
        In the requested target language (English, Hindi, Hinglish, Spanish, French, German, etc.).
        """
        if not transcript_text or len(transcript_text.strip()) == 0:
            return self._empty_analysis()

        # If Gemini API key is present, attempt LLM analysis
        if self.api_key:
            try:
                import google.generativeai as genai
                genai.configure(api_key=self.api_key)
                model = genai.GenerativeModel('gemini-1.5-flash')
                
                prompt = f"""
                Analyze the following meeting transcript and extract structured meeting intelligence.
                
                CRITICAL LANGUAGE INSTRUCTION:
                You MUST write ALL summary paragraphs, items discussed, topic titles, details, task titles, descriptions, and subtasks in {target_language}.
                - If target_language is 'Hindi', write in natural Hindi using Devanagari script.
                - If target_language is 'Hinglish', write in natural Hinglish (Roman script Hindi mixed with English).
                - If target_language is 'English', write in clear, professional English.
                - Otherwise, translate and write in {target_language}.

                Return ONLY a JSON object with this exact schema:
                {{
                    "summary": "Executive summary paragraph written in {target_language}...",
                    "items_discussed": [
                        {{
                            "topic": "Topic Title in {target_language}",
                            "details": "Details discussed, points brought up, and key decisions in {target_language}.",
                            "category": "Decision | Discussion | Agenda Item | Update"
                        }}
                    ],
                    "tasks": [
                        {{
                            "title": "Clear action task title in {target_language}",
                            "description": "Detailed task description in {target_language}",
                            "assignee": "Assignee name or Unassigned",
                            "priority": "High | Medium | Low",
                            "category": "Technical | Follow-up | Decision | Research | Documentation",
                            "due_date": "YYYY-MM-DD or Next Week",
                            "subtasks": ["Subtask 1 in {target_language}", "Subtask 2 in {target_language}"]
                        }}
                    ]
                }}

                Transcript:
                {transcript_text}
                """
                
                response = model.generate_content(prompt)
                response_text = response.text.strip()
                
                # Clean JSON code block if wrapped in markdown ```json ... ```
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0].strip()
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0].strip()

                parsed = json.loads(response_text)
                return self._enrich_analysis_output(parsed)
            except Exception as e:
                print(f"Gemini API analysis failed, falling back to local NLP engine: {e}")

        # Local Smart NLP Heuristic Engine
        return self._local_nlp_analysis(transcript_text, meeting_title, target_language=target_language)

    def _local_nlp_analysis(self, transcript_text, meeting_title, target_language="English"):
        """100% Offline NLP Heuristic Meeting Analysis Engine with full Hindi & Hinglish support."""
        sentences = [s.strip() for s in re.split(r'[.!?]+', transcript_text) if len(s.strip()) > 3]

        if target_language == "Hindi":
            summary = f"यह बैठक सत्र '{meeting_title}' के संबंध में मुख्य परियोजना चर्चाओं और टीम निर्णयों को कवर करता है।"
            if len(sentences) > 0:
                highlight_sentences = sentences[:min(3, len(sentences))]
                summary += " प्रमुख बिंदु: " + ". ".join(highlight_sentences) + "।"
        elif target_language == "Hinglish":
            summary = f"Yeh meeting session '{meeting_title}' ke regarding key project discussions and team action items ko cover karta hai."
            if len(sentences) > 0:
                highlight_sentences = sentences[:min(3, len(sentences))]
                summary += " Key highlights: " + ". ".join(highlight_sentences) + "."
        else:
            summary = f"This meeting session covers key project discussions regarding {meeting_title.lower()}."
            if len(sentences) > 0:
                highlight_sentences = sentences[:min(3, len(sentences))]
                summary += " Key highlights include: " + ". ".join(highlight_sentences) + "."

        # 2. List of Items Discussed
        items_discussed = []
        
        # Categorize topics by keyword scanning
        topic_keywords = {
            "Architecture & Design": ["architecture", "design", "system", "database", "api", "ui", "ux", "code"],
            "Project Timeline & Milestones": ["timeline", "deadline", "schedule", "release", "sprint", "milestone", "date"],
            "Action Items & Tasks": ["task", "assign", "do", "fix", "implement", "create", "build", "review"],
            "Budget & Resources": ["budget", "cost", "resource", "team", "hire", "license"],
            "General Discussion": []
        }

        categorized_sentences = {k: [] for k in topic_keywords.keys()}

        for s in sentences:
            s_lower = s.lower()
            matched = False
            for category, keywords in topic_keywords.items():
                if any(kw in s_lower for kw in keywords):
                    categorized_sentences[category].append(s)
                    matched = True
                    break
            if not matched:
                categorized_sentences["General Discussion"].append(s)

        for cat, s_list in categorized_sentences.items():
            if s_list:
                if target_language == "Hindi":
                    topic_name = "मुख्य चर्चा बिंदु" if cat == "General Discussion" else f"विषय: {cat}"
                elif target_language == "Hinglish":
                    topic_name = "Main Discussion" if cat == "General Discussion" else f"Topic: {cat}"
                else:
                    topic_name = cat

                items_discussed.append({
                    "topic": topic_name,
                    "details": " • " + "\n • ".join(s_list[:4]),
                    "category": "Discussion" if cat != "Action Items & Tasks" else "Decision"
                })

        if not items_discussed:
            items_discussed.append({
                "topic": "मुख्य एजेंडा" if target_language == "Hindi" else ("Main Agenda" if target_language == "Hinglish" else "Meeting Overview"),
                "details": transcript_text[:300] + "...",
                "category": "Discussion"
            })

        # 3. Action Task Extraction
        tasks = []
        action_verbs = ["create", "build", "fix", "implement", "update", "send", "review", "schedule", "test", "deploy", "setup", "prepare", "check", "organize", "call", "email", "complete", "need", "must", "should"]
        
        for s in sentences:
            s_lower = s.lower()
            if any(verb in s_lower for verb in action_verbs):
                priority = "Medium"
                if any(w in s_lower for w in ["urgent", "asap", "high", "critical", "immediately"]):
                    priority = "High"
                elif any(w in s_lower for w in ["low", "whenever", "eventually", "optional"]):
                    priority = "Low"

                assignee = "Unassigned"
                name_match = re.search(r'\b(john|alice|bob|alex|sarah|david|mike|emily|chris|team|developer)\b', s_lower)
                if name_match:
                    assignee = name_match.group(1).capitalize()

                due_date = "This Week"
                if "tomorrow" in s_lower:
                    due_date = (datetime.date.today() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
                elif "friday" in s_lower:
                    due_date = "This Friday"
                elif "next week" in s_lower:
                    due_date = "Next Week"

                category = "Follow-up"
                if any(w in s_lower for w in ["api", "code", "bug", "build", "database"]):
                    category = "Technical"

                tasks.append({
                    "id": str(uuid.uuid4())[:8],
                    "title": (f"कार्य: {s[:50]}..." if target_language == "Hindi" else f"{s[:60]}..."),
                    "description": f"चर्चा से निकाला गया कार्य: '{s}'" if target_language == "Hindi" else f"Extracted from discussion: '{s}'",
                    "assignee": assignee,
                    "priority": priority,
                    "category": category,
                    "due_date": due_date,
                    "status": "todo",
                    "subtasks": [
                        {"id": f"sub_1", "title": "कार्य समीक्षा करें" if target_language == "Hindi" else "Review follow-up requirements", "completed": False}
                    ]
                })

        if not tasks:
            if target_language == "Hindi":
                tasks.append({
                    "id": str(uuid.uuid4())[:8],
                    "title": f"कार्यवाही बिंदु: {meeting_title} की समीक्षा और फॉलो-अप",
                    "description": f"बैठक के बाद {meeting_title} पर आवश्यक कदम उठाएं।",
                    "assignee": "Unassigned",
                    "priority": "Medium",
                    "category": "Follow-up",
                    "due_date": "Next Week",
                    "status": "todo",
                    "subtasks": [
                        {"id": "sub_def_1", "title": "कार्यों की समीक्षा करें", "completed": False}
                    ]
                })
            elif target_language == "Hinglish":
                tasks.append({
                    "id": str(uuid.uuid4())[:8],
                    "title": f"Action Item: {meeting_title} ka review aur follow-up",
                    "description": f"Meeting ke baad {meeting_title} par necessary steps lein.",
                    "assignee": "Unassigned",
                    "priority": "Medium",
                    "category": "Follow-up",
                    "due_date": "Next Week",
                    "status": "todo",
                    "subtasks": [
                        {"id": "sub_def_1", "title": "Tasks review karein", "completed": False}
                    ]
                })
            else:
                tasks.append({
                    "id": str(uuid.uuid4())[:8],
                    "title": f"Action Item: Review and follow-up on {meeting_title}",
                    "description": f"Perform required follow-up steps for {meeting_title}.",
                    "assignee": "Unassigned",
                    "priority": "Medium",
                    "category": "Follow-up",
                    "due_date": "Next Week",
                    "status": "todo",
                    "subtasks": [
                        {"id": "sub_def_1", "title": "Review action items", "completed": False}
                    ]
                })

        return {
            "summary": summary,
            "items_discussed": items_discussed,
            "tasks": tasks
        }

    def _enrich_analysis_output(self, raw_json):
        """Ensure standardized IDs and status fields on tasks output."""
        tasks = []
        for task in raw_json.get("tasks", []):
            subtasks = []
            for st in task.get("subtasks", []):
                if isinstance(st, str):
                    subtasks.append({"id": str(uuid.uuid4())[:6], "title": st, "completed": False})
                elif isinstance(st, dict):
                    subtasks.append({
                        "id": st.get("id", str(uuid.uuid4())[:6]),
                        "title": st.get("title", "Subtask"),
                        "completed": st.get("completed", False)
                    })

            tasks.append({
                "id": task.get("id", str(uuid.uuid4())[:8]),
                "title": task.get("title", "Action Task"),
                "description": task.get("description", ""),
                "assignee": task.get("assignee", "Unassigned"),
                "priority": task.get("priority", "Medium"),
                "category": task.get("category", "Follow-up"),
                "due_date": task.get("due_date", "Pending"),
                "status": task.get("status", "todo"),
                "subtasks": subtasks
            })

        return {
            "summary": raw_json.get("summary", "Meeting Summary"),
            "items_discussed": raw_json.get("items_discussed", []),
            "tasks": tasks
        }

    def _empty_analysis(self):
        return {
            "summary": "No audio/transcript content available for summary.",
            "items_discussed": [],
            "tasks": []
        }
