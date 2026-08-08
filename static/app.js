/* ==========================================================================
   TaskPulse AI - Single Page Application JavaScript Controller
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --- Application State ---
    let state = {
        activeTab: 'recorderTab',
        isRecording: false,
        isPaused: false,
        timerInterval: null,
        statusPollInterval: null,
        meetings: [],
        tasks: [],
        currentMeetingId: null,
        selectedFile: null
    };

    // --- DOM Elements ---
    const tabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    // Recorder Elements
    const micSelect = document.getElementById('micSelect');
    const speakerSelect = document.getElementById('speakerSelect');
    const meetingTitleInput = document.getElementById('meetingTitleInput');
    const recorderLanguageSelect = document.getElementById('recorderLanguageSelect');
    const startRecordBtn = document.getElementById('startRecordBtn');
    const pauseRecordBtn = document.getElementById('pauseRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const recordingTimer = document.getElementById('recordingTimer');
    const timerStatusLabel = document.getElementById('timerStatusLabel');
    const recordingStatusPill = document.getElementById('recordingStatusPill');

    const micLevelBar = document.getElementById('micLevelBar');
    const micLevelVal = document.getElementById('micLevelVal');
    const speakerLevelBar = document.getElementById('speakerLevelBar');
    const speakerLevelVal = document.getElementById('speakerLevelVal');
    const waveformCanvas = document.getElementById('waveformCanvas');

    // Uploader Elements
    const dropzone = document.getElementById('dropzone');
    const mediaFileInput = document.getElementById('mediaFileInput');
    const selectedFileCard = document.getElementById('selectedFileCard');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const clearFileBtn = document.getElementById('clearFileBtn');
    const uploadTitleInput = document.getElementById('uploadTitleInput');
    const uploadLanguageSelect = document.getElementById('uploadLanguageSelect');
    const processUploadBtn = document.getElementById('processUploadBtn');
    const uploadProgress = document.getElementById('uploadProgress');

    // Insights Elements
    const meetingSessionSelect = document.getElementById('meetingSessionSelect');
    const insightsLanguageSelect = document.getElementById('insightsLanguageSelect');
    const reanalyzeBtn = document.getElementById('reanalyzeBtn');
    const summaryLangBadge = document.getElementById('summaryLangBadge');
    const summaryContent = document.getElementById('summaryContent');
    const itemsDiscussedContainer = document.getElementById('itemsDiscussedContainer');
    const meetingAudioPlayer = document.getElementById('meetingAudioPlayer');
    const transcriptContainer = document.getElementById('transcriptContainer');
    const transcriptSearchInput = document.getElementById('transcriptSearchInput');

    // Task Board Elements
    const totalTasksCount = document.getElementById('totalTasksCount');
    const todoTaskList = document.getElementById('todoTaskList');
    const progressTaskList = document.getElementById('progressTaskList');
    const completedTaskList = document.getElementById('completedTaskList');
    const todoCount = document.getElementById('todoCount');
    const progressCount = document.getElementById('progressCount');
    const completedCount = document.getElementById('completedCount');
    const taskSearchInput = document.getElementById('taskSearchInput');
    const priorityFilter = document.getElementById('priorityFilter');
    const statusFilter = document.getElementById('statusFilter');
    const openNewTaskBtn = document.getElementById('openNewTaskBtn');
    const exportBtn = document.getElementById('exportBtn');
    const exportMenu = document.getElementById('exportMenu');

    // History Elements
    const historyListContainer = document.getElementById('historyListContainer');

    // Modals
    const taskModal = document.getElementById('taskModal');
    const taskForm = document.getElementById('taskForm');
    const closeTaskModalBtn = document.getElementById('closeTaskModalBtn');
    const cancelTaskModalBtn = document.getElementById('cancelTaskModalBtn');
    const settingsModal = document.getElementById('settingsModal');
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');

    // --- Initialization ---
    init();

    async function init() {
        setupTabNavigation();
        try { await loadAudioDevices(); } catch(e) { console.warn('loadAudioDevices notice:', e); }
        try { await loadMeetings(); } catch(e) { console.warn('loadMeetings notice:', e); }
        try { await loadTasks(); } catch(e) { console.warn('loadTasks notice:', e); }
        try { await loadSettings(); } catch(e) { console.warn('loadSettings notice:', e); }
        setupRecorderEvents();
        setupUploaderEvents();
        setupTaskBoardEvents();
        setupInsightsEvents();
        setupModalEvents();
        setupJobsEvents();
        setupAiLogsEvents();
        initCanvasWaveform();
        loadAiLogs();
    }

    // --- Navigation Tabs ---
    function activateTab(tabName) {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        const tabBtn = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
        const tabContent = document.getElementById(tabName);

        if (tabBtn) tabBtn.classList.add('active');
        if (tabContent) tabContent.classList.add('active');
        state.activeTab = tabName;
        if (tabName === 'aiLogsTab') {
            loadAiLogs();
        }
        lucide.createIcons();
    }

    function setupTabNavigation() {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');
                activateTab(targetTab);
            });
        });
    }

    // --- Audio Device Selectors ---
    async function loadAudioDevices() {
        try {
            const res = await fetch('/api/devices');
            const data = await res.json();

            micSelect.innerHTML = '';
            speakerSelect.innerHTML = '';

            if (data.microphones && data.microphones.length > 0) {
                data.microphones.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.name;
                    if (m.is_default) opt.selected = true;
                    micSelect.appendChild(opt);
                });
            } else {
                micSelect.innerHTML = '<option value="">Default Microphone</option>';
            }

            if (data.speakers && data.speakers.length > 0) {
                data.speakers.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = s.name;
                    if (s.is_default) opt.selected = true;
                    speakerSelect.appendChild(opt);
                });
            } else {
                speakerSelect.innerHTML = '<option value="">Default System Audio (WASAPI Loopback)</option>';
            }
        } catch (e) {
            console.error('Error loading audio devices:', e);
        }
    }

    // --- Pure JavaScript 16kHz PCM WAV Audio Encoder (Hardware Adaptive & Zero Dependencies) ---
    class WebWavEncoder {
        constructor() {
            this.audioCtx = null;
            this.stream = null;
            this.processor = null;
            this.pcmSamples = [];
            this.inputSampleRate = 44100;
            this.targetSampleRate = 16000;
            this.isRecording = false;
        }

        async start(onVolumeUpdate) {
            this.pcmSamples = [];
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Default to native hardware sample rate to prevent NotSupportedError on soundcards
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.inputSampleRate = this.audioCtx.sampleRate || 44100;

            const source = this.audioCtx.createMediaStreamSource(this.stream);
            
            this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
            const analyser = this.audioCtx.createAnalyser();
            analyser.fftSize = 256;

            source.connect(analyser);
            source.connect(this.processor);
            this.processor.connect(this.audioCtx.destination);

            this.processor.onaudioprocess = (e) => {
                if (!this.isRecording) return;
                const inputData = e.inputBuffer.getChannelData(0);
                this.pcmSamples.push(new Float32Array(inputData));

                if (onVolumeUpdate) {
                    let sum = 0;
                    for (let i = 0; i < inputData.length; i++) {
                        sum += inputData[i] * inputData[i];
                    }
                    const rms = Math.sqrt(sum / inputData.length);
                    const level = Math.min(100, Math.round(rms * 250));
                    onVolumeUpdate(level);
                }
            };

            this.isRecording = true;
        }

        stop() {
            this.isRecording = false;
            if (this.processor) {
                try { this.processor.disconnect(); } catch(e){}
                this.processor = null;
            }
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            if (this.audioCtx) {
                try { this.audioCtx.close(); } catch(e){}
                this.audioCtx = null;
            }

            let totalSamples = 0;
            for (let chunk of this.pcmSamples) totalSamples += chunk.length;
            const merged = new Float32Array(totalSamples);
            let offset = 0;
            for (let chunk of this.pcmSamples) {
                merged.set(chunk, offset);
                offset += chunk.length;
            }

            const resampled = this.resampleBuffer(merged, this.inputSampleRate, this.targetSampleRate);
            return this.encodeWAV(resampled, this.targetSampleRate);
        }

        resampleBuffer(buffer, inRate, outRate) {
            if (inRate === outRate || !buffer || buffer.length === 0) return buffer;
            const ratio = inRate / outRate;
            const newLength = Math.round(buffer.length / ratio);
            const result = new Float32Array(newLength);
            for (let i = 0; i < newLength; i++) {
                const originIndex = i * ratio;
                const indexFloor = Math.floor(originIndex);
                const indexCeil = Math.min(buffer.length - 1, Math.ceil(originIndex));
                const factor = originIndex - indexFloor;
                result[i] = buffer[indexFloor] * (1 - factor) + buffer[indexCeil] * factor;
            }
            return result;
        }

        encodeWAV(samples, sampleRate) {
            const buffer = new ArrayBuffer(44 + samples.length * 2);
            const view = new DataView(buffer);

            this.writeString(view, 0, 'RIFF');
            view.setUint32(4, 36 + samples.length * 2, true);
            this.writeString(view, 8, 'WAVE');
            this.writeString(view, 12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            this.writeString(view, 36, 'data');
            view.setUint32(40, samples.length * 2, true);

            let index = 44;
            for (let i = 0; i < samples.length; i++) {
                const s = Math.max(-1, Math.min(1, samples[i]));
                view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                index += 2;
            }

            return new Blob([view], { type: 'audio/wav' });
        }

        writeString(view, offset, string) {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        }
    }

    let webWavEncoder = null;
    let webTimerInterval = null;
    let webSecondsElapsed = 0;
    let webSpeechRecognizer = null;
    let webLiveTranscriptText = "";

    async function startWebBrowserRecording() {
        webSecondsElapsed = 0;
        webLiveTranscriptText = "";
        webWavEncoder = new WebWavEncoder();
        
        await webWavEncoder.start((level) => {
            micLevelBar.style.width = `${level}%`;
            micLevelVal.textContent = `${level}%`;
            speakerLevelBar.style.width = `${Math.round(level * 0.7)}%`;
            speakerLevelVal.textContent = `${Math.round(level * 0.7)}%`;
            updateWaveform(level, level * 0.7);
        });

        state.isRecording = true;
        state.isPaused = false;

        // Initialize Web Speech Recognition API if available in browser
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRec) {
            try {
                webSpeechRecognizer = new SpeechRec();
                webSpeechRecognizer.continuous = true;
                webSpeechRecognizer.interimResults = true;
                webSpeechRecognizer.lang = 'en-US';

                webSpeechRecognizer.onresult = (event) => {
                    let interim = '';
                    let final = '';
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            final += event.results[i][0].transcript + ' ';
                        } else {
                            interim += event.results[i][0].transcript;
                        }
                    }

                    if (final.trim()) {
                        webLiveTranscriptText += final + ' ';
                        if (liveTranscriptContainer) {
                            const timeStr = String(Math.floor(webSecondsElapsed / 60)).padStart(2, '0') + ':' + String(webSecondsElapsed % 60).padStart(2, '0');
                            const div = document.createElement('div');
                            div.className = 'transcript-line';
                            div.innerHTML = `<span class="speaker" style="color: var(--accent-cyan);">[${timeStr}] Live Speaker:</span> ${escapeHtml(final.trim())}`;
                            liveTranscriptContainer.appendChild(div);
                            liveTranscriptContainer.scrollTop = liveTranscriptContainer.scrollHeight;
                        }
                    }
                };

                webSpeechRecognizer.onerror = (e) => {
                    console.warn('Web Speech Recognition notice:', e.error);
                };

                webSpeechRecognizer.onend = () => {
                    if (state.isRecording && webSpeechRecognizer) {
                        try { webSpeechRecognizer.start(); } catch (err) {}
                    }
                };

                webSpeechRecognizer.start();
            } catch (recErr) {
                console.warn('Could not start web speech recognizer:', recErr);
            }
        }

        webTimerInterval = setInterval(() => {
            if (state.isRecording && !state.isPaused) {
                webSecondsElapsed++;
                const hrs = String(Math.floor(webSecondsElapsed / 3600)).padStart(2, '0');
                const mins = String(Math.floor((webSecondsElapsed % 3600) / 60)).padStart(2, '0');
                const scs = String(webSecondsElapsed % 60).padStart(2, '0');
                recordingTimer.textContent = `${hrs}:${mins}:${scs}`;
            }
        }, 1000);

        return { status: "web_recording_started" };
    }

    async function stopWebBrowserRecording(title, targetLanguage) {
        if (webTimerInterval) {
            clearInterval(webTimerInterval);
            webTimerInterval = null;
        }

        if (webSpeechRecognizer) {
            try { webSpeechRecognizer.stop(); } catch (e) {}
            webSpeechRecognizer = null;
        }

        if (!webWavEncoder) {
            throw new Error("Web recording session was not active.");
        }

        const audioBlob = webWavEncoder.stop();
        webWavEncoder = null;

        if (audioBlob.size < 100) {
            throw new Error("No clear audio was recorded in browser. Please check microphone permission.");
        }

        const formData = new FormData();
        formData.append('file', audioBlob, 'live_web_recording.wav');
        formData.append('meeting_title', title);
        formData.append('target_language', targetLanguage);
        if (webLiveTranscriptText.trim()) {
            formData.append('live_transcript', webLiveTranscriptText.trim());
        }

        const res = await fetch('/api/record/stop_web', {
            method: 'POST',
            body: formData
        });
        return await res.json();
    }

    // --- Live Recording ---
    function setupRecorderEvents() {
        const engineSelect = document.getElementById('recordingEngineSelect');
        const deviceSelectorsContainer = document.querySelector('.device-selectors');
        const muteMicBtn = document.getElementById('muteMicBtn');
        const muteSpeakerBtn = document.getElementById('muteSpeakerBtn');

        if (engineSelect && deviceSelectorsContainer) {
            const toggleDeviceSelectors = () => {
                if (engineSelect.value === 'desktop') {
                    deviceSelectorsContainer.style.display = 'grid';
                } else {
                    deviceSelectorsContainer.style.display = 'none';
                }
            };
            engineSelect.addEventListener('change', toggleDeviceSelectors);
            toggleDeviceSelectors();
        }

        startRecordBtn.addEventListener('click', async () => {
            const engine = engineSelect ? engineSelect.value : 'desktop';

            if (engine === 'web') {
                try {
                    await startWebBrowserRecording();
                    startRecordBtn.disabled = true;
                    pauseRecordBtn.disabled = false;
                    stopRecordBtn.disabled = false;
                    timerStatusLabel.textContent = 'Recording Live (Browser Mode)';
                    recordingStatusPill.textContent = 'Recording';
                } catch (e) {
                    alert('Browser recording error: ' + (e.message || e));
                }
            } else {
                const formData = new FormData();
                formData.append('mic_id', micSelect.value || '');
                formData.append('speaker_id', speakerSelect.value || '');

                try {
                    const res = await fetch('/api/record/start', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();

                    if (data.status === 'recording_started' || data.status === 'already_recording') {
                        state.isRecording = true;
                        state.isPaused = false;
                        state.isMicMuted = false;
                        state.isSpeakerMuted = false;

                        if (muteMicBtn) {
                            muteMicBtn.innerHTML = '<i data-lucide="mic"></i> Mic On';
                            muteMicBtn.classList.remove('btn-danger');
                            muteMicBtn.classList.add('btn-secondary');
                        }
                        if (muteSpeakerBtn) {
                            muteSpeakerBtn.innerHTML = '<i data-lucide="volume-2"></i> Speaker On';
                            muteSpeakerBtn.classList.remove('btn-danger');
                            muteSpeakerBtn.classList.add('btn-secondary');
                        }

                        startRecordBtn.disabled = true;
                        pauseRecordBtn.disabled = false;
                        stopRecordBtn.disabled = false;
                        timerStatusLabel.textContent = 'Recording Live';
                        recordingStatusPill.textContent = 'Recording';

                        startStatusPolling();
                        lucide.createIcons();
                    } else {
                        console.warn('Desktop WASAPI audio bridge unavailable on this system. Falling back to Browser Recording mode...');
                        if (engineSelect) engineSelect.value = 'web';
                        await startWebBrowserRecording();
                        startRecordBtn.disabled = true;
                        pauseRecordBtn.disabled = false;
                        stopRecordBtn.disabled = false;
                        timerStatusLabel.textContent = 'Browser Recording Live';
                        recordingStatusPill.textContent = 'Recording (Web)';
                        alert('🎙️ Desktop soundcard bridge unavailable on this system. Automatically switched to Browser Microphone & Tab Audio recording!');
                    }
                } catch (e) {
                    console.warn('Desktop WASAPI audio bridge error. Falling back to Browser Recording mode...', e);
                    if (engineSelect) engineSelect.value = 'web';
                    try {
                        await startWebBrowserRecording();
                        startRecordBtn.disabled = true;
                        pauseRecordBtn.disabled = false;
                        stopRecordBtn.disabled = false;
                        timerStatusLabel.textContent = 'Browser Recording Live';
                        recordingStatusPill.textContent = 'Recording (Web)';
                        alert('🎙️ Desktop soundcard bridge unavailable on this system. Automatically switched to Browser Microphone & Tab Audio recording!');
                    } catch (err) {
                        alert('Failed to start recording: ' + (err.message || err));
                    }
                }
            }
        });

        pauseRecordBtn.addEventListener('click', async () => {
            const engine = engineSelect ? engineSelect.value : 'desktop';
            if (engine === 'web') {
                state.isPaused = !state.isPaused;
                if (state.isPaused) {
                    pauseRecordBtn.innerHTML = '<i data-lucide="play"></i> Resume';
                    timerStatusLabel.textContent = 'Recording Paused';
                    recordingStatusPill.textContent = 'Paused';
                } else {
                    pauseRecordBtn.innerHTML = '<i data-lucide="pause"></i> Pause';
                    timerStatusLabel.textContent = 'Recording Live';
                    recordingStatusPill.textContent = 'Recording';
                }
                lucide.createIcons();
                return;
            }

            try {
                const res = await fetch('/api/record/pause', { method: 'POST' });
                const data = await res.json();

                if (data.status === 'paused') {
                    state.isPaused = true;
                    pauseRecordBtn.innerHTML = '<i data-lucide="play"></i> Resume';
                    timerStatusLabel.textContent = 'Recording Paused';
                    recordingStatusPill.textContent = 'Paused';
                } else if (data.status === 'resumed') {
                    state.isPaused = false;
                    pauseRecordBtn.innerHTML = '<i data-lucide="pause"></i> Pause';
                    timerStatusLabel.textContent = 'Recording Live';
                    recordingStatusPill.textContent = 'Recording';
                }
                lucide.createIcons();
            } catch (e) {
                console.error(e);
            }
        });

        if (muteMicBtn) {
            muteMicBtn.addEventListener('click', async () => {
                state.isMicMuted = !state.isMicMuted;
                if (state.isMicMuted) {
                    muteMicBtn.innerHTML = '<i data-lucide="mic-off"></i> Mic Muted';
                    muteMicBtn.classList.remove('btn-secondary');
                    muteMicBtn.classList.add('btn-danger');
                } else {
                    muteMicBtn.innerHTML = '<i data-lucide="mic"></i> Mic On';
                    muteMicBtn.classList.remove('btn-danger');
                    muteMicBtn.classList.add('btn-secondary');
                }
                
                try {
                    const formData = new FormData();
                    formData.append('target', 'mic');
                    await fetch('/api/record/mute', { method: 'POST', body: formData });
                } catch (e) {
                    console.error(e);
                }
                lucide.createIcons();
            });
        }

        if (muteSpeakerBtn) {
            muteSpeakerBtn.addEventListener('click', async () => {
                state.isSpeakerMuted = !state.isSpeakerMuted;
                if (state.isSpeakerMuted) {
                    muteSpeakerBtn.innerHTML = '<i data-lucide="volume-x"></i> Speaker Muted';
                    muteSpeakerBtn.classList.remove('btn-secondary');
                    muteSpeakerBtn.classList.add('btn-danger');
                } else {
                    muteSpeakerBtn.innerHTML = '<i data-lucide="volume-2"></i> Speaker On';
                    muteSpeakerBtn.classList.remove('btn-danger');
                    muteSpeakerBtn.classList.add('btn-secondary');
                }

                try {
                    const formData = new FormData();
                    formData.append('target', 'speaker');
                    await fetch('/api/record/mute', { method: 'POST', body: formData });
                } catch (e) {
                    console.error(e);
                }
                lucide.createIcons();
            });
        }

        stopRecordBtn.addEventListener('click', async () => {
            if (!state.isRecording) {
                alert('No active recording session is currently running. Please click "Start Recording" first.');
                return;
            }

            const title = meetingTitleInput.value.trim() || 'Live Recorded Meeting';
            const lang = recorderLanguageSelect ? recorderLanguageSelect.value : 'English';
            const engine = engineSelect ? engineSelect.value : 'desktop';

            stopRecordBtn.disabled = true;
            timerStatusLabel.textContent = 'Transcribing & Processing...';

            try {
                let data = null;
                if (engine === 'web') {
                    if (!webWavEncoder) {
                        alert('Browser live recording stream was not initialized. Please click "Start Recording" first.');
                        startRecordBtn.disabled = false;
                        stopRecordBtn.disabled = true;
                        timerStatusLabel.textContent = 'Standby';
                        state.isRecording = false;
                        return;
                    }
                    data = await stopWebBrowserRecording(title, lang);
                } else {
                    const formData = new FormData();
                    formData.append('meeting_title', title);
                    formData.append('target_language', lang);

                    const res = await fetch('/api/record/stop', {
                        method: 'POST',
                        body: formData
                    });
                    data = await res.json();
                }

                state.isRecording = false;
                state.isPaused = false;
                stopStatusPolling();

                startRecordBtn.disabled = false;
                pauseRecordBtn.disabled = true;
                pauseRecordBtn.innerHTML = '<i data-lucide="pause"></i> Pause';
                recordingTimer.textContent = '00:00:00';
                timerStatusLabel.textContent = 'Standby';
                recordingStatusPill.textContent = 'Ready';
                micLevelBar.style.width = '0%';
                speakerLevelBar.style.width = '0%';
                micLevelVal.textContent = '0%';
                speakerLevelVal.textContent = '0%';

                if (data && (data.status === 'success' || data.status === 'background_processing')) {
                    if (data.status === 'background_processing') {
                        const bgJobsModal = document.getElementById('bgJobsModal');
                        if (bgJobsModal) bgJobsModal.classList.remove('hidden');
                        startJobsPolling();
                    } else if (data.meeting) {
                        state.currentMeetingId = data.meeting.id;
                        await loadMeetings();
                        await loadTasks();
                        switchMeetingSession(data.meeting.id);
                        activateTab('insightsTab');
                    }
                } else if (data && data.detail) {
                    if (data.detail.includes('ECONNRESET') || data.detail.includes('reset') || data.detail.includes('timed out')) {
                        const bgJobsModal = document.getElementById('bgJobsModal');
                        if (bgJobsModal) bgJobsModal.classList.remove('hidden');
                        startJobsPolling();
                    } else {
                        alert('Error processing recording: ' + data.detail);
                        startRecordBtn.disabled = false;
                    }
                }
            } catch (e) {
                const errStr = (e.message || String(e)).toLowerCase();
                if (errStr.includes('econnreset') || errStr.includes('reset') || errStr.includes('failed to fetch') || errStr.includes('networkerror')) {
                    const bgJobsModal = document.getElementById('bgJobsModal');
                    if (bgJobsModal) bgJobsModal.classList.remove('hidden');
                    startJobsPolling();
                } else {
                    alert('Error processing recording: ' + (e.message || e));
                    startRecordBtn.disabled = false;
                    stopRecordBtn.disabled = false;
                    timerStatusLabel.textContent = 'Standby';
                }
            }
            lucide.createIcons();
        });
    }

    function startStatusPolling() {
        if (state.statusPollInterval) clearInterval(state.statusPollInterval);

        state.statusPollInterval = setInterval(async () => {
            if (!state.isRecording) return;

            try {
                const res = await fetch('/api/record/status');
                const data = await res.json();

                // Format time
                const secs = data.elapsed_seconds || 0;
                const hrs = String(Math.floor(secs / 3600)).padStart(2, '0');
                const mins = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
                const scs = String(secs % 60).padStart(2, '0');
                recordingTimer.textContent = `${hrs}:${mins}:${scs}`;

                // Update sound meters with auto-scaling for float / integer values
                const rawMic = data.mic_level || 0;
                const rawSpk = data.speaker_level || 0;

                let micLvl = 0;
                if (rawMic > 0) {
                    micLvl = rawMic <= 1.0 ? Math.min(100, Math.max(2, Math.round(rawMic * 1000))) : Math.min(100, Math.round(rawMic));
                }

                let spkLvl = 0;
                if (rawSpk > 0) {
                    spkLvl = rawSpk <= 1.0 ? Math.min(100, Math.max(2, Math.round(rawSpk * 1000))) : Math.min(100, Math.round(rawSpk));
                }

                micLevelBar.style.width = `${micLvl}%`;
                micLevelVal.textContent = `${micLvl}%`;

                speakerLevelBar.style.width = `${spkLvl}%`;
                speakerLevelVal.textContent = `${spkLvl}%`;

                updateWaveform(micLvl, spkLvl);

                // Update Live Transcript Stream
                if (data.live_transcript && data.live_transcript.length > 0) {
                    const feed = document.getElementById('liveTranscriptFeed');
                    if (feed) {
                        feed.innerHTML = '';
                        data.live_transcript.forEach(item => {
                            const line = document.createElement('div');
                            const isYou = item.speaker.includes('You') || item.speaker.includes('Microphone');
                            line.className = `live-transcript-line ${isYou ? 'speaker-you' : 'speaker-participant'}`;
                            line.innerHTML = `<span class="live-time-stamp">[${item.time}]</span> <span class="live-speaker-name">${escapeHtml(item.speaker)}:</span> ${escapeHtml(item.text)}`;
                            feed.appendChild(line);
                        });
                        feed.scrollTop = feed.scrollHeight;
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }, 200);
    }

    function stopStatusPolling() {
        if (state.statusPollInterval) {
            clearInterval(state.statusPollInterval);
            state.statusPollInterval = null;
        }
    }

    // --- Waveform Canvas ---
    let waveformPoints = [];
    function initCanvasWaveform() {
        if (!waveformCanvas) return;
        const ctx = waveformCanvas.getContext('2d');
        waveformCanvas.width = waveformCanvas.parentElement.clientWidth;
        waveformCanvas.height = waveformCanvas.parentElement.clientHeight;

        for (let i = 0; i < 50; i++) {
            waveformPoints.push(5);
        }
        drawWaveform();
    }

    function updateWaveform(micVal, speakerVal) {
        const val = Math.max(10, Math.max(micVal, speakerVal) * 0.9);
        waveformPoints.push(val);
        if (waveformPoints.length > 60) waveformPoints.shift();
        drawWaveform();
    }

    function drawWaveform() {
        if (!waveformCanvas) return;
        const ctx = waveformCanvas.getContext('2d');
        const w = waveformCanvas.width;
        const h = waveformCanvas.height;

        ctx.clearRect(0, 0, w, h);

        const barWidth = w / waveformPoints.length;

        for (let i = 0; i < waveformPoints.length; i++) {
            const val = waveformPoints[i];
            const barHeight = (val / 100) * (h * 0.8);
            const x = i * barWidth;
            const y = (h - barHeight) / 2;

            const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
            gradient.addColorStop(0, '#38bdf8');
            gradient.addColorStop(1, '#c084fc');

            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth - 2, barHeight);
        }
    }

    // --- Media Uploader ---
    function setupUploaderEvents() {
        dropzone.addEventListener('click', () => mediaFileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#38bdf8';
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = 'rgba(56, 189, 248, 0.4)';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'rgba(56, 189, 248, 0.4)';
            if (e.dataTransfer.files.length > 0) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        mediaFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });

        clearFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            state.selectedFile = null;
            selectedFileCard.classList.add('hidden');
            dropzone.classList.remove('hidden');
            processUploadBtn.disabled = true;
        });

        processUploadBtn.addEventListener('click', async () => {
            if (!state.selectedFile) return;

            const title = uploadTitleInput.value.trim() || state.selectedFile.name;
            const lang = uploadLanguageSelect ? uploadLanguageSelect.value : 'English';
            const formData = new FormData();
            formData.append('file', state.selectedFile);
            formData.append('meeting_title', title);
            formData.append('target_language', lang);

            processUploadBtn.disabled = true;
            uploadProgress.classList.remove('hidden');

            try {
                const res = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();

                uploadProgress.classList.add('hidden');
                processUploadBtn.disabled = false;

                if (data && (data.status === 'success' || data.status === 'background_processing')) {
                    state.selectedFile = null;
                    selectedFileCard.classList.add('hidden');
                    dropzone.classList.remove('hidden');
                    uploadTitleInput.value = '';

                    const bgJobsModal = document.getElementById('bgJobsModal');
                    if (bgJobsModal) bgJobsModal.classList.remove('hidden');
                    startJobsPolling();

                    if (data.meeting) {
                        state.currentMeetingId = data.meeting.id;
                        await loadMeetings();
                        await loadTasks();
                        switchMeetingSession(data.meeting.id);
                        activateTab('insightsTab');
                    }
                } else {
                    alert('Upload error: ' + (data.detail || 'Failed to process file'));
                }
            } catch (e) {
                alert('File processing error: ' + e);
                uploadProgress.classList.add('hidden');
                processUploadBtn.disabled = false;
            }
        });
    }

    function handleFileSelect(file) {
        state.selectedFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

        dropzone.classList.add('hidden');
        selectedFileCard.classList.remove('hidden');
        processUploadBtn.disabled = false;
    }

    // --- Meetings & Insights ---
    async function loadMeetings(selectLatest = false) {
        try {
            const res = await fetch('/api/meetings');
            state.meetings = await res.json();

            meetingSessionSelect.innerHTML = '';
            historyListContainer.innerHTML = '';

            if (state.meetings.length === 0) {
                meetingSessionSelect.innerHTML = '<option value="">No meetings recorded yet</option>';
                summaryContent.textContent = 'Record a live meeting or upload a media file to view insights.';
                itemsDiscussedContainer.innerHTML = '<p class="empty-state">No items discussed extracted yet.</p>';
                transcriptContainer.innerHTML = '<p class="empty-state">Transcript will appear here.</p>';
                historyListContainer.innerHTML = '<p class="empty-state">No saved meetings found.</p>';
                return;
            }

            state.meetings.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = `${m.title} (${m.created_at})`;
                meetingSessionSelect.appendChild(opt);
            });

            if (selectLatest || !state.currentMeetingId || !state.meetings.some(m => m.id === state.currentMeetingId)) {
                state.currentMeetingId = state.meetings[0].id;
            }
            switchMeetingSession(state.currentMeetingId);
            renderHistoryList();
        } catch (e) {
            console.error('Error loading meetings:', e);
        }
    }

    function setupInsightsEvents() {
        meetingSessionSelect.addEventListener('change', (e) => {
            switchMeetingSession(e.target.value);
        });

        if (reanalyzeBtn) {
            reanalyzeBtn.addEventListener('click', async () => {
                if (!state.currentMeetingId) {
                    alert('Please select a meeting session first.');
                    return;
                }
                const lang = insightsLanguageSelect ? insightsLanguageSelect.value : 'English';
                reanalyzeBtn.disabled = true;
                reanalyzeBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Translating...';

                try {
                    const res = await fetch(`/api/meetings/${state.currentMeetingId}/reanalyze`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ language: lang })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        await loadMeetings();
                        await loadTasks();
                        switchMeetingSession(state.currentMeetingId);
                    } else {
                        alert('Translation failed: ' + (data.detail || 'Error'));
                    }
                } catch (e) {
                    alert('Error during translation: ' + e);
                } finally {
                    reanalyzeBtn.disabled = false;
                    reanalyzeBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Translate / Regenerate';
                    lucide.createIcons();
                }
            });
        }

        transcriptSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const segments = document.querySelectorAll('.transcript-segment');
            segments.forEach(seg => {
                const text = seg.textContent.toLowerCase();
                seg.style.display = text.includes(query) ? 'block' : 'none';
            });
        });

        const deleteAllMeetingsBtn = document.getElementById('deleteAllMeetingsBtn');
        if (deleteAllMeetingsBtn) {
            deleteAllMeetingsBtn.addEventListener('click', async () => {
                if (confirm('⚠️ Are you sure you want to DELETE ALL meeting sessions, transcripts, audio recordings, and extracted action tasks?\n\nThis action CANNOT be undone!')) {
                    try {
                        const res = await fetch('/api/meetings_all', { method: 'DELETE' });
                        const data = await res.json();
                        alert(data.message || 'All meetings deleted.');
                        state.currentMeetingId = null;
                        await loadMeetings();
                        await loadTasks();
                    } catch (e) {
                        alert('Error deleting all meetings: ' + e);
                    }
                }
            });
        }

        // Copy Handlers
        const copySummaryBtn = document.getElementById('copySummaryBtn');
        const copyInsightsTasksBtn = document.getElementById('copyInsightsTasksBtn');
        const copyTranscriptBtn = document.getElementById('copyTranscriptBtn');
        const copyAllInsightsBtn = document.getElementById('copyAllInsightsBtn');

        if (copySummaryBtn) {
            copySummaryBtn.addEventListener('click', () => {
                const meeting = state.meetings.find(m => m.id === state.currentMeetingId);
                const text = meeting ? meeting.summary : (summaryContent ? summaryContent.innerText : '');
                copyToClipboard(text, 'Executive Summary copied to clipboard!');
            });
        }

        if (copyInsightsTasksBtn) {
            copyInsightsTasksBtn.addEventListener('click', () => {
                const meetingTasks = state.tasks.filter(t => t.meeting_id === state.currentMeetingId);
                if (meetingTasks.length === 0) {
                    alert('No action tasks available to copy.');
                    return;
                }
                const formattedTasks = meetingTasks.map((t, idx) => {
                    let taskStr = `${idx + 1}. [${t.priority || 'Medium'}] ${t.title}\n   Description: ${t.description || 'N/A'}\n   Assignee: ${t.assignee || 'Unassigned'} | Due: ${t.due_date || 'N/A'}`;
                    if (t.subtasks && t.subtasks.length > 0) {
                        taskStr += '\n   Subtasks:\n' + t.subtasks.map(st => `     - [${st.completed ? 'X' : ' '}] ${st.title}`).join('\n');
                    }
                    return taskStr;
                }).join('\n\n');
                copyToClipboard(formattedTasks, 'Extracted Action Tasks copied to clipboard!');
            });
        }

        if (copyTranscriptBtn) {
            copyTranscriptBtn.addEventListener('click', () => {
                const meeting = state.meetings.find(m => m.id === state.currentMeetingId);
                let text = '';
                if (meeting && meeting.transcript) {
                    text = meeting.transcript;
                } else if (transcriptContainer) {
                    text = transcriptContainer.innerText;
                }
                copyToClipboard(text, 'Full Meeting Transcript copied to clipboard!');
            });
        }

        if (copyAllInsightsBtn) {
            copyAllInsightsBtn.addEventListener('click', () => {
                const meeting = state.meetings.find(m => m.id === state.currentMeetingId);
                if (!meeting) {
                    alert('Please select a meeting session first.');
                    return;
                }
                const meetingTasks = state.tasks.filter(t => t.meeting_id === state.currentMeetingId);
                let fullReport = `=========================================\nMEETING REPORT: ${meeting.title || 'Live Session'}\nDate: ${new Date(meeting.timestamp * 1000).toLocaleString()}\nLanguage: ${meeting.language || 'English'}\n=========================================\n\n--- EXECUTIVE SUMMARY ---\n${meeting.summary || 'N/A'}\n\n`;

                fullReport += `--- ITEMS & TOPICS DISCUSSED ---\n`;
                if (meeting.items_discussed && meeting.items_discussed.length > 0) {
                    meeting.items_discussed.forEach(item => {
                        fullReport += `• ${item.topic}: ${item.details}\n`;
                    });
                } else {
                    fullReport += `No specific topics extracted.\n`;
                }

                fullReport += `\n--- EXTRACTED ACTION TASKS (${meetingTasks.length}) ---\n`;
                if (meetingTasks.length > 0) {
                    meetingTasks.forEach((t, idx) => {
                        fullReport += `${idx + 1}. [${t.priority || 'Medium'}] ${t.title}\n   Description: ${t.description || 'N/A'}\n   Assignee: ${t.assignee || 'Unassigned'} | Due: ${t.due_date || 'N/A'}\n`;
                    });
                } else {
                    fullReport += `No action tasks extracted.\n`;
                }

                fullReport += `\n--- FULL TRANSCRIPT ---\n${meeting.transcript || 'No transcript available.'}\n`;
                copyToClipboard(fullReport, 'Full Session Intelligence copied to clipboard!');
            });
        }

        const copyInsightsReportBtn = document.getElementById('copyInsightsReportBtn');
        if (copyInsightsReportBtn) {
            copyInsightsReportBtn.addEventListener('click', () => {
                const txt = document.getElementById('insightsFormattedReportText').value;
                copyToClipboard(txt, 'Formatted AI Chat Assistant Description copied to clipboard!');
            });
        }

        const copyInsightsPromptBtn = document.getElementById('copyInsightsPromptBtn');
        if (copyInsightsPromptBtn) {
            copyInsightsPromptBtn.addEventListener('click', () => {
                const txt = document.getElementById('insightsPromptText').value;
                copyToClipboard(txt, 'AI Chat Prompt Payload copied to clipboard!');
            });
        }

        const copyInsightsCurlBtn = document.getElementById('copyInsightsCurlBtn');
        if (copyInsightsCurlBtn) {
            copyInsightsCurlBtn.addEventListener('click', () => {
                const txt = document.getElementById('insightsCurlText').value;
                copyToClipboard(txt, 'Executable cURL Command copied to clipboard!');
            });
        }

        const copyInsightsRawResponseBtn = document.getElementById('copyInsightsRawResponseBtn');
        if (copyInsightsRawResponseBtn) {
            copyInsightsRawResponseBtn.addEventListener('click', () => {
                const txt = document.getElementById('insightsRawResponseText').value;
                copyToClipboard(txt, 'Decoded Raw AI Response Payload copied to clipboard!');
            });
        }
    }

    function copyToClipboard(text, successMsg) {
        if (!text || text.trim() === '') {
            alert('Nothing to copy!');
            return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                alert(`✅ ${successMsg || 'Copied to clipboard!'}`);
            }).catch(() => {
                fallbackCopyText(text, successMsg);
            });
        } else {
            fallbackCopyText(text, successMsg);
        }
    }

    function fallbackCopyText(text, successMsg) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            alert(`✅ ${successMsg || 'Copied to clipboard!'}`);
        } catch (err) {
            alert('Failed to copy text.');
        }
        document.body.removeChild(textarea);
    }

    function switchMeetingSession(meetingId) {
        state.currentMeetingId = meetingId;
        if (meetingSessionSelect) {
            meetingSessionSelect.value = meetingId;
        }
        const meeting = state.meetings.find(m => m.id === meetingId);

        if (!meeting) return;

        if (insightsLanguageSelect) {
            insightsLanguageSelect.value = meeting.language || 'English';
        }
        if (summaryLangBadge) {
            summaryLangBadge.textContent = 'Language: ' + (meeting.language || 'English');
        }

        // Executive Summary
        if (summaryContent) {
            if (meeting.summary) {
                const formattedSummary = escapeHtml(meeting.summary).replace(/\n/g, '<br>');
                summaryContent.innerHTML = formattedSummary;
            } else {
                summaryContent.innerHTML = '<em>Summary not available for this session.</em>';
            }
        }

        // Items Discussed
        if (itemsDiscussedContainer) {
            itemsDiscussedContainer.innerHTML = '';
            if (meeting.items_discussed && meeting.items_discussed.length > 0) {
                meeting.items_discussed.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'item-topic-card';
                    const formattedDetails = escapeHtml(item.details || '').replace(/\n/g, '<br>');
                    card.innerHTML = `
                        <div class="item-topic-title" style="font-weight: 600;"><i data-lucide="tag" style="width: 14px; height: 14px; margin-right: 6px; color: var(--accent-cyan);"></i> ${escapeHtml(item.topic || 'Discussion Topic')}</div>
                        <div class="item-topic-details margin-top-5">${formattedDetails}</div>
                    `;
                    itemsDiscussedContainer.appendChild(card);
                });
            } else {
                itemsDiscussedContainer.innerHTML = '<p class="empty-state">No discussion items extracted.</p>';
            }
        }

        // Action Items for selected meeting
        const meetingTasks = state.tasks.filter(t => t.meeting_id === meetingId);
        const insightsTasksContainer = document.getElementById('insightsTasksContainer');
        const insightsTaskCount = document.getElementById('insightsTaskCount');

        if (insightsTaskCount) insightsTaskCount.textContent = `${meetingTasks.length} Actions`;
        if (insightsTasksContainer) {
            insightsTasksContainer.innerHTML = '';
            if (meetingTasks.length > 0) {
                meetingTasks.forEach(t => {
                    const card = document.createElement('div');
                    card.className = 'item-topic-card';
                    const pClass = (t.priority || 'Medium').toLowerCase();
                    card.innerHTML = `
                        <div class="flex-between">
                            <div class="item-topic-title" style="font-weight: 600;"><i data-lucide="check-circle-2" style="color: var(--accent-cyan); width: 16px; height: 16px; display: inline-block; vertical-align: middle;"></i> ${escapeHtml(t.title)}</div>
                            <span class="badge badge-${pClass}">${escapeHtml(t.priority || 'Medium')}</span>
                        </div>
                        <div class="item-topic-details margin-top-5">${escapeHtml(t.description || '')}</div>
                        <div class="flex-between margin-top-10" style="font-size: 0.8rem; color: var(--text-muted);">
                            <span>👤 Assignee: <strong>${escapeHtml(t.assignee || 'Unassigned')}</strong></span>
                            <span>📅 Due: <strong>${escapeHtml(t.due_date || 'Pending')}</strong></span>
                        </div>
                    `;
                    insightsTasksContainer.appendChild(card);
                });
            } else {
                insightsTasksContainer.innerHTML = '<p class="empty-state">No action items extracted for this session.</p>';
            }
        }

        // Audio Player
        if (meetingAudioPlayer) {
            if (meeting.audio_url) {
                meetingAudioPlayer.src = meeting.audio_url;
            } else {
                meetingAudioPlayer.removeAttribute('src');
            }
        }

        // Transcript
        if (transcriptContainer) {
            transcriptContainer.innerHTML = '';
            if (meeting.segments && meeting.segments.length > 0) {
                meeting.segments.forEach(seg => {
                    const div = document.createElement('div');
                    div.className = 'transcript-segment';
                    div.innerHTML = `
                        <div class="segment-meta">
                            <span class="speaker-badge">${escapeHtml(seg.speaker || 'Speaker')}</span> • ${seg.start} - ${seg.end}
                        </div>
                        <div>${escapeHtml(seg.text || '')}</div>
                    `;
                    transcriptContainer.appendChild(div);
                });
            } else if (meeting.transcript) {
                transcriptContainer.innerHTML = `<div class="transcript-segment">${escapeHtml(meeting.transcript)}</div>`;
            } else {
                transcriptContainer.innerHTML = '<p class="empty-state">No transcript data.</p>';
            }
        }

        // AI Prompt Payload, cURL Command & Decoded Raw AI Response
        const insightsPromptText = document.getElementById('insightsPromptText');
        const insightsCurlText = document.getElementById('insightsCurlText');
        const insightsRawResponseText = document.getElementById('insightsRawResponseText');

        if (insightsPromptText) {
            insightsPromptText.value = meeting.prompt || `Analyze the following meeting transcript for '${meeting.title}':\n\n${meeting.transcript || 'No transcript text available.'}`;
        }

        if (insightsCurlText) {
            let curlStr = meeting.curl_command;
            if (!curlStr) {
                const payload = {
                    prompt: meeting.prompt || `Analyze the following meeting transcript for '${meeting.title}':\n\n${meeting.transcript || ''}`,
                    model: 'Gemini 3.6 Flash (High)'
                };
                curlStr = `curl -X POST "http://localhost:3005/api/v1/ai/chat" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(payload, null, 2)}'`;
            }
            insightsCurlText.value = curlStr;
        }

        if (insightsRawResponseText) {
            let rawStr = meeting.response_raw || '';
            if (!rawStr) {
                rawStr = JSON.stringify({
                    summary: meeting.summary,
                    items_discussed: meeting.items_discussed || [],
                    tasks: meetingTasks.map(t => ({
                        title: t.title,
                        description: t.description,
                        assignee: t.assignee,
                        priority: t.priority,
                        category: t.category,
                        due_date: t.due_date,
                        subtasks: t.subtasks || []
                    }))
                }, null, 2);
            }
            insightsRawResponseText.value = rawStr;
        }

        // Formatted AI Chat Assistant Description Report
        const insightsFormattedReportText = document.getElementById('insightsFormattedReportText');
        if (insightsFormattedReportText) {
            let chatReport = `🤖 AI CHAT ASSISTANT - MEETING INTELLIGENCE REPORT\n`;
            chatReport += `=========================================================\n`;
            chatReport += `📌 Meeting Title : ${meeting.title || 'Live Meeting Session'}\n`;
            chatReport += `📅 Date Recorded : ${meeting.created_at || 'Recent Session'}\n`;
            chatReport += `🗣️ Target Language: ${meeting.language || 'English'}\n`;
            chatReport += `=========================================================\n\n`;

            chatReport += `📝 EXECUTIVE SUMMARY:\n`;
            chatReport += `${meeting.summary || 'No summary generated for this session.'}\n\n`;

            chatReport += `💬 ITEMS & TOPICS DISCUSSED (${meeting.items_discussed ? meeting.items_discussed.length : 0}):\n`;
            if (meeting.items_discussed && meeting.items_discussed.length > 0) {
                meeting.items_discussed.forEach((item, idx) => {
                    chatReport += `${idx + 1}. [${item.category || 'Topic'}] ${item.topic || 'Discussion Point'}\n`;
                    chatReport += `   • Details: ${item.details || 'N/A'}\n\n`;
                });
            } else {
                chatReport += `• No specific discussion topics extracted.\n\n`;
            }

            chatReport += `✅ EXTRACTED ACTION TASKS & MILESTONES (${meetingTasks.length}):\n`;
            if (meetingTasks.length > 0) {
                meetingTasks.forEach((t, idx) => {
                    chatReport += `${idx + 1}. 🎯 ${t.title}\n`;
                    chatReport += `   • Priority  : [${(t.priority || 'Medium').toUpperCase()}]\n`;
                    chatReport += `   • Assignee  : ${t.assignee || 'Unassigned'}\n`;
                    chatReport += `   • Category  : ${t.category || 'Follow-up'}\n`;
                    chatReport += `   • Due Date  : ${t.due_date || 'Pending'}\n`;
                    if (t.description) chatReport += `   • Details   : ${t.description}\n`;
                    if (t.subtasks && t.subtasks.length > 0) {
                        chatReport += `   • Subtasks  :\n`;
                        t.subtasks.forEach(st => {
                            const titleStr = typeof st === 'string' ? st : (st.title || 'Subtask');
                            const isDone = typeof st === 'object' && st.completed ? '[x]' : '[ ]';
                            chatReport += `     ${isDone} ${titleStr}\n`;
                        });
                    }
                    chatReport += `\n`;
                });
            } else {
                chatReport += `• No action items extracted for this meeting session.\n\n`;
            }

            if (meeting.transcript) {
                chatReport += `---------------------------------------------------------\n`;
                chatReport += `🎙️ FULL TRANSCRIPT SNIPPET:\n`;
                chatReport += `${meeting.transcript}\n`;
            }

            insightsFormattedReportText.value = chatReport;
        }

        lucide.createIcons();
    }

    function renderHistoryList() {
        historyListContainer.innerHTML = '';
        state.meetings.forEach(m => {
            const card = document.createElement('div');
            card.className = 'glass-card history-item-card';
            card.innerHTML = `
                <div class="flex-between">
                    <div>
                        <h3>${escapeHtml(m.title)}</h3>
                        <span class="segment-meta">${m.created_at} • ${m.task_count || 0} Action Tasks</span>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline view-meeting-btn" data-id="${m.id}"><i data-lucide="eye"></i> View</button>
                        <button class="btn btn-sm btn-danger delete-meeting-btn" data-id="${m.id}"><i data-lucide="trash-2"></i></button>
                    </div>
                </div>
            `;
            historyListContainer.appendChild(card);
        });

        document.querySelectorAll('.view-meeting-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = btn.getAttribute('data-id');
                switchMeetingSession(id);
                document.querySelector('[data-tab="insightsTab"]').click();
            });
        });

        document.querySelectorAll('.delete-meeting-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = btn.getAttribute('data-id');
                if (confirm('Delete this meeting recording and its associated action tasks?')) {
                    await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
                    await loadMeetings();
                    await loadTasks();
                }
            });
        });
        lucide.createIcons();
    }

    // --- Task Board (Kanban) ---
    async function loadTasks() {
        try {
            const res = await fetch('/api/tasks');
            state.tasks = await res.json();
            totalTasksCount.textContent = `${state.tasks.length} Tasks`;
            renderTaskBoard();
        } catch (e) {
            console.error('Error loading tasks:', e);
        }
    }

    function setupTaskBoardEvents() {
        taskSearchInput.addEventListener('input', renderTaskBoard);
        priorityFilter.addEventListener('change', renderTaskBoard);
        statusFilter.addEventListener('change', renderTaskBoard);

        exportBtn.addEventListener('click', () => {
            exportMenu.classList.toggle('hidden');
        });

        document.getElementById('exportMdBtn').addEventListener('click', () => exportData('markdown'));
        document.getElementById('exportCsvBtn').addEventListener('click', () => exportData('csv'));
        document.getElementById('exportJsonBtn').addEventListener('click', () => exportData('json'));

        openNewTaskBtn.addEventListener('click', () => {
            document.getElementById('taskIdInput').value = '';
            document.getElementById('taskTitleInput').value = '';
            document.getElementById('taskDescInput').value = '';
            document.getElementById('taskAssigneeInput').value = 'Unassigned';
            document.getElementById('taskPriorityInput').value = 'Medium';
            document.getElementById('taskCategoryInput').value = 'Follow-up';
            document.getElementById('taskDueDateInput').value = 'Next Week';
            document.getElementById('modalTitle').textContent = 'Add Action Task';
            taskModal.classList.remove('hidden');
        });
    }

    function renderTaskBoard() {
        const searchQuery = taskSearchInput.value.toLowerCase();
        const priorityVal = priorityFilter.value;
        const statusVal = statusFilter.value;

        const filtered = state.tasks.filter(t => {
            const matchesSearch = t.title.toLowerCase().includes(searchQuery) || (t.description || '').toLowerCase().includes(searchQuery);
            const matchesPriority = priorityVal === 'all' || t.priority === priorityVal;
            const matchesStatus = statusVal === 'all' || t.status === statusVal;
            return matchesSearch && matchesPriority && matchesStatus;
        });

        todoTaskList.innerHTML = '';
        progressTaskList.innerHTML = '';
        completedTaskList.innerHTML = '';

        let todoCnt = 0, progCnt = 0, compCnt = 0;

        filtered.forEach(task => {
            const card = createTaskCard(task);
            if (task.status === 'in_progress') {
                progressTaskList.appendChild(card);
                progCnt++;
            } else if (task.status === 'completed') {
                completedTaskList.appendChild(card);
                compCnt++;
            } else {
                todoTaskList.appendChild(card);
                todoCnt++;
            }
        });

        todoCount.textContent = todoCnt;
        progressCount.textContent = progCnt;
        completedCount.textContent = compCnt;
        lucide.createIcons();
    }

    function createTaskCard(task) {
        const div = document.createElement('div');
        div.className = 'task-card';
        const pClass = (task.priority || 'Medium').toLowerCase();

        div.innerHTML = `
            <div class="task-badges">
                <span class="badge badge-${pClass}">${escapeHtml(task.priority || 'Medium')}</span>
                <span class="badge badge-category">${escapeHtml(task.category || 'Task')}</span>
            </div>
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="task-desc">${escapeHtml(task.description || '')}</div>
            <div class="task-footer">
                <span class="task-assignee"><i data-lucide="user"></i> ${escapeHtml(task.assignee || 'Unassigned')}</span>
                <span><i data-lucide="calendar"></i> ${escapeHtml(task.due_date || 'Pending')}</span>
            </div>
            <div class="flex-between margin-top-15">
                <select class="custom-select select-sm status-toggle-select" data-id="${task.id}">
                    <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>To Do</option>
                    <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>Completed</option>
                </select>
                <div>
                    <button class="icon-btn edit-task-btn" data-id="${task.id}"><i data-lucide="edit-3"></i></button>
                    <button class="icon-btn delete-task-btn" data-id="${task.id}"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
        `;

        // Event listeners
        const statusSelect = div.querySelector('.status-toggle-select');
        statusSelect.addEventListener('change', async (e) => {
            const newStatus = e.target.value;
            await fetch(`/api/tasks/${task.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            await loadTasks();
        });

        div.querySelector('.edit-task-btn').addEventListener('click', () => {
            document.getElementById('taskIdInput').value = task.id;
            document.getElementById('taskTitleInput').value = task.title;
            document.getElementById('taskDescInput').value = task.description || '';
            document.getElementById('taskAssigneeInput').value = task.assignee || 'Unassigned';
            document.getElementById('taskPriorityInput').value = task.priority || 'Medium';
            document.getElementById('taskCategoryInput').value = task.category || 'Follow-up';
            document.getElementById('taskDueDateInput').value = task.due_date || 'Next Week';
            document.getElementById('modalTitle').textContent = 'Edit Action Task';
            taskModal.classList.remove('hidden');
        });

        div.querySelector('.delete-task-btn').addEventListener('click', async () => {
            if (confirm('Delete this action task?')) {
                await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
                await loadTasks();
            }
        });

        return div;
    }

    // --- Modal Events ---
    function setupModalEvents() {
        closeTaskModalBtn.addEventListener('click', () => taskModal.classList.add('hidden'));
        cancelTaskModalBtn.addEventListener('click', () => taskModal.classList.add('hidden'));

        taskForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('taskIdInput').value;
            const payload = {
                title: document.getElementById('taskTitleInput').value,
                description: document.getElementById('taskDescInput').value,
                assignee: document.getElementById('taskAssigneeInput').value,
                priority: document.getElementById('taskPriorityInput').value,
                category: document.getElementById('taskCategoryInput').value,
                due_date: document.getElementById('taskDueDateInput').value
            };

            if (id) {
                await fetch(`/api/tasks/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                await fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            taskModal.classList.add('hidden');
            await loadTasks();
        });

        openSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
        closeSettingsModalBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

        const autoInstallOllamaBtn = document.getElementById('autoInstallOllamaBtn');
        const ollamaProgressContainer = document.getElementById('ollamaProgressContainer');
        const ollamaStatusBadge = document.getElementById('ollamaStatusBadge');
        const ollamaPercentText = document.getElementById('ollamaPercentText');
        const ollamaProgressFill = document.getElementById('ollamaProgressFill');
        const ollamaStatusMsg = document.getElementById('ollamaStatusMsg');

        let ollamaPollInterval = null;

        if (autoInstallOllamaBtn) {
            autoInstallOllamaBtn.addEventListener('click', async () => {
                autoInstallOllamaBtn.disabled = true;
                autoInstallOllamaBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Setting up...';
                if (ollamaProgressContainer) ollamaProgressContainer.classList.remove('hidden');

                try {
                    const formData = new FormData();
                    formData.append('model_name', 'llama3.2');
                    await fetch('/api/ollama/setup', { method: 'POST', body: formData });

                    if (ollamaPollInterval) clearInterval(ollamaPollInterval);
                    ollamaPollInterval = setInterval(async () => {
                        try {
                            const pRes = await fetch('/api/ollama/progress');
                            const pData = await pRes.json();

                            const pct = pData.percent || 0;
                            const st = pData.status || 'downloading';
                            const msg = pData.message || 'Processing setup...';

                            if (ollamaPercentText) ollamaPercentText.textContent = `${pct}%`;
                            if (ollamaProgressFill) ollamaProgressFill.style.width = `${pct}%`;
                            if (ollamaStatusMsg) ollamaStatusMsg.textContent = msg;

                            if (ollamaStatusBadge) {
                                if (st === 'ready') {
                                    ollamaStatusBadge.textContent = '✅ Ready';
                                    ollamaStatusBadge.className = 'badge badge-success';
                                    clearInterval(ollamaPollInterval);
                                    autoInstallOllamaBtn.disabled = false;
                                    autoInstallOllamaBtn.innerHTML = '<i data-lucide="check"></i> Ollama Active';
                                } else if (st === 'error') {
                                    ollamaStatusBadge.textContent = '❌ Setup Error';
                                    ollamaStatusBadge.className = 'badge badge-danger';
                                    clearInterval(ollamaPollInterval);
                                    autoInstallOllamaBtn.disabled = false;
                                    autoInstallOllamaBtn.innerHTML = '<i data-lucide="download-cloud"></i> Retry Auto-Install';
                                } else {
                                    ollamaStatusBadge.textContent = st.toUpperCase();
                                    ollamaStatusBadge.className = 'badge badge-primary';
                                }
                            }
                            lucide.createIcons();
                        } catch (err) {
                            console.error(err);
                        }
                    }, 1000);
                } catch (e) {
                    alert('Ollama auto-setup error: ' + e);
                    autoInstallOllamaBtn.disabled = false;
                    autoInstallOllamaBtn.innerHTML = '<i data-lucide="download-cloud"></i> Auto-Install / Start Ollama';
                }
            });
        }

        saveSettingsBtn.addEventListener('click', async () => {
            const provider = document.getElementById('aiProviderSelect').value;
            const geminiKey = document.getElementById('geminiApiKeyInput').value.trim();
            const groqKey = document.getElementById('groqApiKeyInput').value.trim();
            const openaiKey = document.getElementById('openaiApiKeyInput').value.trim();
            const ollamaHost = document.getElementById('ollamaHostInput').value.trim();

            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ai_provider: provider,
                    gemini_api_key: geminiKey,
                    groq_api_key: groqKey,
                    openai_api_key: openaiKey,
                    ollama_host: ollamaHost
                })
            });
            settingsModal.classList.add('hidden');
            alert('Settings & AI Provider preferences saved successfully!');
        });
    }

    async function loadSettings() {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.ai_provider) {
                const sel = document.getElementById('aiProviderSelect');
                if (sel) sel.value = data.ai_provider;
            }
            if (data.gemini_api_key) {
                const gInput = document.getElementById('geminiApiKeyInput');
                if (gInput) gInput.value = data.gemini_api_key;
            }
            if (data.groq_api_key) {
                const grInput = document.getElementById('groqApiKeyInput');
                if (grInput) grInput.value = data.groq_api_key;
            }
            if (data.openai_api_key) {
                const oInput = document.getElementById('openaiApiKeyInput');
                if (oInput) oInput.value = data.openai_api_key;
            }
            if (data.ollama_host) {
                const olInput = document.getElementById('ollamaHostInput');
                if (olInput) olInput.value = data.ollama_host;
            }
        } catch (e) {
            console.error(e);
        }
    }

    // --- Export Options ---
    function exportData(format) {
        exportMenu.classList.add('hidden');
        if (state.tasks.length === 0) {
            alert('No tasks to export.');
            return;
        }

        if (format === 'json') {
            downloadFile(JSON.stringify(state.tasks, null, 2), 'meeting_action_tasks.json', 'application/json');
        } else if (format === 'csv') {
            let csv = 'ID,Title,Assignee,Priority,Category,Status,DueDate\n';
            state.tasks.forEach(t => {
                csv += `"${t.id}","${escapeCsv(t.title)}","${escapeCsv(t.assignee)}","${t.priority}","${t.category}","${t.status}","${t.due_date}"\n`;
            });
            downloadFile(csv, 'meeting_action_tasks.csv', 'text/csv');
        } else if (format === 'markdown') {
            let md = '# Meeting Action Items & Tasks\n\n';
            state.tasks.forEach(t => {
                md += `### [${t.status.toUpperCase()}] ${t.title}\n`;
                md += `- **Assignee:** ${t.assignee}\n`;
                md += `- **Priority:** ${t.priority}\n`;
                md += `- **Category:** ${t.category}\n`;
                md += `- **Due Date:** ${t.due_date}\n`;
                md += `- **Description:** ${t.description || 'N/A'}\n\n`;
            });
            downloadFile(md, 'meeting_action_items.md', 'text/markdown');
        }
    }

    function downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // --- Background Processing Jobs Monitor ---
    function setupJobsEvents() {
        const openBgJobsBtn = document.getElementById('openBgJobsBtn');
        const bgJobsModal = document.getElementById('bgJobsModal');
        const closeBgJobsModalBtn = document.getElementById('closeBgJobsModalBtn');
        const closeBgJobsFooterBtn = document.getElementById('closeBgJobsFooterBtn');

        if (openBgJobsBtn && bgJobsModal) {
            openBgJobsBtn.addEventListener('click', () => {
                bgJobsModal.classList.remove('hidden');
                loadJobs();
            });
        }

        if (closeBgJobsModalBtn && bgJobsModal) {
            closeBgJobsModalBtn.addEventListener('click', () => bgJobsModal.classList.add('hidden'));
        }
        if (closeBgJobsFooterBtn && bgJobsModal) {
            closeBgJobsFooterBtn.addEventListener('click', () => bgJobsModal.classList.add('hidden'));
        }

        startJobsPolling();
    }

    function startJobsPolling() {
        if (state.jobsPollInterval) return;
        loadJobs();
        state.jobsPollInterval = setInterval(loadJobs, 1500);
    }

    async function loadJobs() {
        try {
            const res = await fetch('/api/jobs');
            const jobs = await res.json();

            const bgJobsBadge = document.getElementById('bgJobsBadge');
            const bgJobsListContainer = document.getElementById('bgJobsListContainer');

            const activeJobs = jobs.filter(j => j.stage !== 'completed' && j.stage !== 'error');
            
            if (bgJobsBadge) {
                bgJobsBadge.textContent = `${activeJobs.length} Running`;
                bgJobsBadge.style.background = activeJobs.length > 0 ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)';
                bgJobsBadge.style.color = activeJobs.length > 0 ? '#60a5fa' : '#94a3b8';
            }

            if (!state.processedJobIds) state.processedJobIds = new Set();

            let hasNewCompletion = false;
            let newlyCompletedMeetingId = null;

            jobs.forEach(j => {
                if (j.stage === 'completed' && !state.processedJobIds.has(j.id)) {
                    state.processedJobIds.add(j.id);
                    hasNewCompletion = true;
                    if (j.meeting_id) newlyCompletedMeetingId = j.meeting_id;
                }
            });

            if (hasNewCompletion || activeJobs.length > 0) {
                await loadAiLogs();
            }

            if (hasNewCompletion) {
                await loadMeetings(true);
                await loadTasks();
                if (newlyCompletedMeetingId) {
                    state.currentMeetingId = newlyCompletedMeetingId;
                    switchMeetingSession(newlyCompletedMeetingId);
                }
            }

            if (!bgJobsListContainer) return;

            if (jobs.length === 0) {
                bgJobsListContainer.innerHTML = '<p class="empty-state">No background processing tasks active.</p>';
                return;
            }

            bgJobsListContainer.innerHTML = '';
            jobs.forEach(j => {
                const card = document.createElement('div');
                card.className = 'item-topic-card';
                card.style.marginBottom = '10px';
                
                let badgeClass = 'badge-primary';
                if (j.stage === 'completed') badgeClass = 'badge-success';
                else if (j.stage === 'error') badgeClass = 'badge-danger';
                else if (j.stage === 'transcribing' || j.stage === 'analyzing') badgeClass = 'badge-category';

                card.innerHTML = `
                    <div class="flex-between">
                        <div style="font-weight: 600; color: #f8fafc;"><i data-lucide="cpu" style="width: 15px; height: 15px; vertical-align: middle; margin-right: 6px; color: var(--accent-cyan);"></i> ${escapeHtml(j.meeting_title || 'Session')}</div>
                        <span class="badge ${badgeClass}">${j.stage.toUpperCase()}</span>
                    </div>
                    <div class="margin-top-5 help-text" style="color: #cbd5e1; font-size: 0.85rem;">${escapeHtml(j.status_message || '')}</div>
                    <div class="progress-bar-track" style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px; overflow: hidden; margin-top: 8px;">
                        <div class="progress-bar-fill" style="width: ${j.progress || 0}%; height: 100%; background: linear-gradient(90deg, #38bdf8, #c084fc); transition: width 0.3s ease;"></div>
                    </div>
                `;
                bgJobsListContainer.appendChild(card);
            });
            lucide.createIcons();
        } catch (e) {
            console.error('loadJobs notice:', e);
        }
    }

    // --- AI Logs Audit Inspector ---
    let currentAiLogs = [];
    let aiLogsPollInterval = null;

    function setupAiLogsEvents() {
        const aiLogsTabBtn = document.querySelector('.nav-tab[data-tab="aiLogsTab"]');
        if (aiLogsTabBtn) {
            aiLogsTabBtn.addEventListener('click', () => {
                activateTab('aiLogsTab');
                loadAiLogs();
            });
        }

        // Auto-refresh logs every 2 seconds when AI Logs Audit tab is active
        if (aiLogsPollInterval) clearInterval(aiLogsPollInterval);
        aiLogsPollInterval = setInterval(() => {
            if (state.activeTab === 'aiLogsTab') {
                loadAiLogs();
            }
        }, 2000);

        const clearAiLogsBtn = document.getElementById('clearAiLogsBtn');
        if (clearAiLogsBtn) {
            clearAiLogsBtn.addEventListener('click', async () => {
                if (!confirm('Are you sure you want to clear all stored AI request & response logs?')) return;
                try {
                    await fetch('/api/ai/logs', { method: 'DELETE' });
                    loadAiLogs();
                } catch (e) {
                    alert('Failed to clear logs: ' + (e.message || e));
                }
            });
        }

        const aiLogsSearchInput = document.getElementById('aiLogsSearchInput');
        if (aiLogsSearchInput) {
            aiLogsSearchInput.addEventListener('input', () => {
                renderAiLogsTable(aiLogsSearchInput.value.trim().toLowerCase());
            });
        }

        const closeAiLogDetailModalBtn = document.getElementById('closeAiLogDetailModalBtn');
        const closeAiLogDetailFooterBtn = document.getElementById('closeAiLogDetailFooterBtn');
        const aiLogDetailModal = document.getElementById('aiLogDetailModal');

        if (closeAiLogDetailModalBtn && aiLogDetailModal) {
            closeAiLogDetailModalBtn.addEventListener('click', () => aiLogDetailModal.classList.add('hidden'));
        }
        if (closeAiLogDetailFooterBtn && aiLogDetailModal) {
            closeAiLogDetailFooterBtn.addEventListener('click', () => aiLogDetailModal.classList.add('hidden'));
        }

        const copyAiCurlBtn = document.getElementById('copyAiCurlBtn');
        if (copyAiCurlBtn) {
            copyAiCurlBtn.addEventListener('click', () => {
                const txt = document.getElementById('logModalCurlTextarea').value;
                navigator.clipboard.writeText(txt);
                alert('Copied executable cURL command to clipboard!');
            });
        }

        const copyAiPromptBtn = document.getElementById('copyAiPromptBtn');
        if (copyAiPromptBtn) {
            copyAiPromptBtn.addEventListener('click', () => {
                const txt = document.getElementById('logModalPromptTextarea').value;
                navigator.clipboard.writeText(txt);
                alert('Copied AI prompt to clipboard!');
            });
        }

        const copyAiResponseBtn = document.getElementById('copyAiResponseBtn');
        if (copyAiResponseBtn) {
            copyAiResponseBtn.addEventListener('click', () => {
                const txt = document.getElementById('logModalResponseTextarea').value;
                navigator.clipboard.writeText(txt);
                alert('Copied AI raw response to clipboard!');
            });
        }
    }

    async function loadAiLogs() {
        const tableBody = document.getElementById('aiLogsTableBody');
        if (!tableBody) return;
        try {
            const res = await fetch('/api/ai/logs');
            currentAiLogs = await res.json();
            renderAiLogsTable();
        } catch (e) {
            console.error('loadAiLogs error:', e);
        }
    }

    function renderAiLogsTable(filterQuery = '') {
        const tableBody = document.getElementById('aiLogsTableBody');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        const filtered = currentAiLogs.filter(log => {
            if (!filterQuery) return true;
            return (log.provider || '').toLowerCase().includes(filterQuery) ||
                   (log.meeting_title || '').toLowerCase().includes(filterQuery) ||
                   (log.endpoint || '').toLowerCase().includes(filterQuery) ||
                   (log.prompt || '').toLowerCase().includes(filterQuery);
        });

        if (filtered.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="empty-state" style="text-align: center; padding: 30px;">No AI request/response logs found. Run a meeting recording or analysis to view payload logs.</td></tr>`;
            return;
        }

        filtered.forEach(log => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            
            const badgeClass = log.status === 'success' ? 'badge-success' : 'badge-category';
            const latencyStr = log.duration_ms ? `${log.duration_ms} ms` : 'N/A';
            const endpointStr = log.endpoint || 'http://localhost:3005/api/v1/ai/chat';

            tr.innerHTML = `
                <td style="padding: 12px; font-size: 0.85rem; color: #cbd5e1; font-family: monospace;">${escapeHtml(log.timestamp || '')}</td>
                <td style="padding: 12px;"><span class="badge badge-primary"><i data-lucide="cpu" style="width: 13px; height: 13px; vertical-align: middle; margin-right: 4px;"></i> ${escapeHtml(log.provider || 'AI Engine')}</span></td>
                <td style="padding: 12px; font-size: 0.82rem; color: #38bdf8; font-family: monospace;">${escapeHtml(endpointStr)}</td>
                <td style="padding: 12px; font-weight: 600; color: #f8fafc;">${escapeHtml(log.meeting_title || 'Session')}</td>
                <td style="padding: 12px; font-size: 0.85rem; color: #cbd5e1; font-family: monospace;">${latencyStr}</td>
                <td style="padding: 12px;"><span class="badge ${badgeClass}">${escapeHtml(log.status || 'OK')}</span></td>
                <td style="padding: 12px; text-align: right;">
                    <button class="btn btn-secondary btn-xs view-log-payload-btn" data-id="${log.id}">
                        <i data-lucide="eye"></i> Inspect Prompt & cURL
                    </button>
                </td>
            `;

            const viewBtn = tr.querySelector('.view-log-payload-btn');
            if (viewBtn) {
                viewBtn.addEventListener('click', () => openAiLogModal(log));
            }

            tableBody.appendChild(tr);
        });

        lucide.createIcons();
    }

    function openAiLogModal(log) {
        const modal = document.getElementById('aiLogDetailModal');
        if (!modal) return;

        const endpoint = log.endpoint || 'http://localhost:3005/api/v1/ai/chat';
        const httpMethod = log.http_method || 'POST';

        document.getElementById('logModalProviderBadge').textContent = log.provider || 'AI Engine';
        document.getElementById('logModalTitleText').textContent = log.meeting_title || 'Meeting Session';
        document.getElementById('logModalMetaText').textContent = `${log.timestamp || ''} • ${log.duration_ms ? log.duration_ms + 'ms' : ''} • ${log.target_language || 'English'}`;

        document.getElementById('logModalMethodBadge').textContent = httpMethod;
        document.getElementById('logModalEndpointInput').value = endpoint;

        let curlCmd = log.curl_command;
        if (!curlCmd) {
            const payload = { prompt: log.prompt || '', model: 'Gemini 3.6 Flash (High)' };
            curlCmd = `curl -X ${httpMethod} "${endpoint}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(payload, null, 2)}'`;
        }
        document.getElementById('logModalCurlTextarea').value = curlCmd;

        document.getElementById('logModalPromptTextarea').value = log.prompt || 'No prompt payload available.';
        
        let replyDisplay = log.response_raw || '';
        if (!replyDisplay && log.parsed_output) {
            replyDisplay = JSON.stringify(log.parsed_output, null, 2);
        }
        document.getElementById('logModalResponseTextarea').value = replyDisplay || 'No response payload available.';

        modal.classList.remove('hidden');
        lucide.createIcons();
    }

    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escapeCsv(str) {
        return (str || '').replace(/"/g, '""');
    }
});
