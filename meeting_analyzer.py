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
            transcript_text = f"Audio recorded for meeting session '{meeting_title}'."

        # If Gemini API key is present, attempt LLM analysis
        if self.api_key:
            try:
                import google.generativeai as genai
                genai.configure(api_key=self.api_key)
                
                models_to_try = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro']
                response_text = None

                prompt = f"""
                Analyze the following meeting transcript and extract structured meeting intelligence.
                
                CRITICAL LANGUAGE INSTRUCTION:
                You MUST write ALL summary paragraphs, items discussed, topic titles, details, task titles, descriptions, and subtasks in {target_language}.
                - If target_language is 'Hindi', write in natural Hindi using Devanagari script.
                - If target_language is 'Hinglish', write in natural Hinglish (Roman script Hindi mixed with English).
                - If target_language is 'English', write in clear, professional English.
                - Otherwise, translate and write in {target_language}.

                TASK EXTRACTION INSTRUCTION:
                You MUST extract AT LEAST 3 to 6 comprehensive, actionable tasks from the meeting transcript covering different aspects (Technical Implementation, Follow-up Review, Documentation, Testing/QA, Timeline Updates). Do NOT return only 1 task.

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
                            "title": "Action Task 1 (Primary Objective) in {target_language}",
                            "description": "Detailed task description in {target_language}",
                            "assignee": "Assignee name or Unassigned",
                            "priority": "High | Medium | Low",
                            "category": "Technical | Follow-up | Decision | Research | Documentation",
                            "due_date": "YYYY-MM-DD or Next Week",
                            "subtasks": ["Subtask 1", "Subtask 2"]
                        }},
                        {{
                            "title": "Action Task 2 (Review & Follow-up) in {target_language}",
                            "description": "Detailed task description in {target_language}",
                            "assignee": "Assignee name or Unassigned",
                            "priority": "High | Medium | Low",
                            "category": "Follow-up | Technical | Research",
                            "due_date": "YYYY-MM-DD or Next Week",
                            "subtasks": ["Subtask 1", "Subtask 2"]
                        }},
                        {{
                            "title": "Action Task 3 (Documentation & Testing) in {target_language}",
                            "description": "Detailed task description in {target_language}",
                            "assignee": "Assignee name or Unassigned",
                            "priority": "High | Medium | Low",
                            "category": "Documentation | Decision | Research",
                            "due_date": "YYYY-MM-DD or Next Week",
                            "subtasks": ["Subtask 1", "Subtask 2"]
                        }}
                    ]
                }}

                Transcript:
                {transcript_text}
                """

                for m_name in models_to_try:
                    try:
                        model = genai.GenerativeModel(m_name)
                        response = model.generate_content(prompt)
                        if response and response.text:
                            response_text = response.text.strip()
                            break
                    except Exception as m_err:
                        print(f"Model {m_name} notice: {m_err}")

                if response_text:
                    # Extract JSON object using regex
                    json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                    if json_match:
                        response_text = json_match.group(0)

                    parsed = json.loads(response_text)
                    return self._enrich_analysis_output(parsed, meeting_title, target_language)
            except Exception as e:
                print(f"Gemini API analysis notice, falling back to local NLP engine: {e}")

        # Local Smart NLP Heuristic Engine
        return self._local_nlp_analysis(transcript_text, meeting_title, target_language=target_language)

    def _local_nlp_analysis(self, transcript_text, meeting_title, target_language="English"):
        """100% Offline NLP Heuristic Meeting Analysis Engine with multi-task generation & full Hindi/Hinglish support."""
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

        # 3. Multi-Action Task Extraction
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

        # Ensure AT LEAST 3 to 4 structured action items are generated
        if len(tasks) < 3:
            if target_language == "Hindi":
                default_tasks = [
                    {
                        "title": f"मुख्य कार्य: {meeting_title} का क्रियान्वयन",
                        "description": f"बैठक सत्र '{meeting_title}' में तय किए गए मुख्य तकनीकी बिंदुओं को पूरा करें।",
                        "priority": "High", "category": "Technical", "due_date": "This Week",
                        "subtasks": [{"id": "st1", "title": "आवश्यक संसाधनों की समीक्षा करें", "completed": False}]
                    },
                    {
                        "title": f"फॉलो-अप कार्य: टीम सिंक और प्रगति समीक्षा",
                        "description": f"{meeting_title} के बाद शेयर किए गए फीडबैक और अपडेट पर टीम से चर्चा करें।",
                        "priority": "Medium", "category": "Follow-up", "due_date": "Next Week",
                        "subtasks": [{"id": "st2", "title": "समीक्षा बैठक आयोजित करें", "completed": False}]
                    },
                    {
                        "title": f"दस्तावेज़ीकरण: {meeting_title} का सारांश और नोट्स अपडेट",
                        "description": "टीम रिपॉजिटरी और प्रोजेक्ट बोर्ड में बैठक के मुख्य बिंदुओं को रिकॉर्ड करें।",
                        "priority": "Low", "category": "Documentation", "due_date": "Next Week",
                        "subtasks": [{"id": "st3", "title": "नोट्स आर्काइव करें", "completed": False}]
                    }
                ]
            elif target_language == "Hinglish":
                default_tasks = [
                    {
                        "title": f"Primary Action: {meeting_title} ka implementation",
                        "description": f"Meeting '{meeting_title}' mein discuss kiye gaye main tasks complete karein.",
                        "priority": "High", "category": "Technical", "due_date": "This Week",
                        "subtasks": [{"id": "st1", "title": "Requirements check karein", "completed": False}]
                    },
                    {
                        "title": f"Follow-up: {meeting_title} team review",
                        "description": f"{meeting_title} ke action items aur deliverables team ke saath verify karein.",
                        "priority": "Medium", "category": "Follow-up", "due_date": "Next Week",
                        "subtasks": [{"id": "st2", "title": "Follow-up sync organize karein", "completed": False}]
                    },
                    {
                        "title": f"Documentation: {meeting_title} notes update",
                        "description": "Project board par meeting outcomes aur action tasks log karein.",
                        "priority": "Low", "category": "Documentation", "due_date": "Next Week",
                        "subtasks": [{"id": "st3", "title": "Task board update karein", "completed": False}]
                    }
                ]
            else:
                default_tasks = [
                    {
                        "title": f"Primary Task: Complete core deliverables for {meeting_title}",
                        "description": f"Implement main action items and technical objectives discussed during {meeting_title}.",
                        "priority": "High", "category": "Technical", "due_date": "This Week",
                        "subtasks": [{"id": "st1", "title": "Review core requirements", "completed": False}]
                    },
                    {
                        "title": f"Follow-up: Team alignment and progress review for {meeting_title}",
                        "description": f"Coordinate with team members on key decisions made in {meeting_title}.",
                        "priority": "Medium", "category": "Follow-up", "due_date": "Next Week",
                        "subtasks": [{"id": "st2", "title": "Schedule progress follow-up sync", "completed": False}]
                    },
                    {
                        "title": f"Documentation: Update project board with {meeting_title} outcomes",
                        "description": "Log meeting decisions, deadlines, and assigned responsibilities into the team repository.",
                        "priority": "Low", "category": "Documentation", "due_date": "Next Week",
                        "subtasks": [{"id": "st3", "title": "Archive meeting notes and tasks", "completed": False}]
                    }
                ]

            for dt in default_tasks:
                if not any(t["title"] == dt["title"] for t in tasks):
                    tasks.append({
                        "id": str(uuid.uuid4())[:8],
                        "title": dt["title"],
                        "description": dt["description"],
                        "assignee": "Unassigned",
                        "priority": dt["priority"],
                        "category": dt["category"],
                        "due_date": dt["due_date"],
                        "status": "todo",
                        "subtasks": dt["subtasks"]
                    })

        return {
            "summary": summary,
            "items_discussed": items_discussed,
            "tasks": tasks
        }

    def _enrich_analysis_output(self, raw_json, meeting_title="Meeting", target_language="English"):
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

        items_discussed = raw_json.get("items_discussed", [])
        if not items_discussed:
            items_discussed = [{
                "topic": "Main Discussion Topics" if target_language == "English" else ("मुख्य चर्चा बिंदु" if target_language == "Hindi" else "Main Discussion"),
                "details": f" • Key points discussed during {meeting_title}.",
                "category": "Discussion"
            }]

        if not tasks:
            tasks = [{
                "id": str(uuid.uuid4())[:8],
                "title": f"Action Item: Follow-up on {meeting_title}",
                "description": f"Complete required follow-up items for {meeting_title}.",
                "assignee": "Unassigned",
                "priority": "Medium",
                "category": "Follow-up",
                "due_date": "Next Week",
                "status": "todo",
                "subtasks": [
                    {"id": "sub_def_1", "title": "Review action items", "completed": False}
                ]
            }]

        return {
            "summary": raw_json.get("summary") or f"This meeting session covers key project discussions regarding {meeting_title}.",
            "items_discussed": items_discussed,
            "tasks": tasks
        }

    def _empty_analysis(self):
        return {
            "summary": "No audio/transcript content available for summary.",
            "items_discussed": [],
            "tasks": []
        }
