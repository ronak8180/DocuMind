document.addEventListener('DOMContentLoaded', () => {
    // UI Selectors
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadForm = document.getElementById('upload-form');
    const uploadBtn = document.getElementById('upload-btn');
    const uploadStatus = document.getElementById('upload-status');
    const fileListContainer = document.getElementById('file-list');

    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const chatHistory = document.getElementById('chat-history');
    const clearChatBtn = document.getElementById('clear-chat');

    const chatUploadPlus = document.getElementById('chat-upload-plus');
    const chatFileInput = document.getElementById('chat-file-input');

    const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
    const chatViewport = document.getElementById('chat-viewport');

    const historyList = document.getElementById('history-list');
    const newChatBtn = document.getElementById('new-chat-btn');

    let isTyping = false;
    let currentSessionId = null;

    // --- Initial Load ---
    // --- Initial Load ---
    async function init() {
        try {
            // Load session list first
            await fetchSessions();

            // Create or load session
            if (!currentSessionId) {
                await createNewChat();
            } else {
                await fetchFiles();
            }

        } catch (err) {
            console.error('Initialization failed', err);
        }
    }
    init();

    async function fetchFiles() {
        try {
            const url = currentSessionId ? `/files?session_id=${currentSessionId}` : '/files';
            const res = await fetch(url);
            const data = await res.json();
            if (res.ok) renderFileList(data.files);
        } catch (err) {
            console.error('Failed to fetch files', err);
        }
    }

    // --- Session Management ---
    async function fetchSessions() {
        try {
            const res = await fetch('/sessions');
            const data = await res.json();
            if (res.ok) {
                renderHistoryList(data.sessions);
                // If there are sessions and we don't have one active, pick the first
                if (data.sessions.length > 0 && !currentSessionId) {
                    await loadSession(data.sessions[0].id);
                }
            }
        } catch (err) {
            console.error('Failed to fetch sessions', err);
        }
    }

    async function createNewChat() {
        try {
            const res = await fetch('/sessions', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                currentSessionId = data.id;
                chatHistory.innerHTML = '';
                renderFileList([]); // New chat has no files
                appendSystemMessage('Started a new conversation.');
                await fetchSessions(); // Refresh list
            }
        } catch (err) {
            console.error('Failed to create session', err);
        }
    }

    async function loadSession(id) {
        if (isTyping) return;
        try {
            const res = await fetch(`/sessions/${id}`);
            const data = await res.json();
            if (res.ok) {
                currentSessionId = id;
                chatHistory.innerHTML = '';
                data.messages.forEach(msg => {
                    appendMessage(msg.role, msg.content, false);
                });
                renderFileList(data.files || []);
                scrollToBottom();
                renderHistoryList(null);
            }
        } catch (err) {
            console.error('Failed to load session', err);
        }
    }

    async function deleteSession(id, e) {
        e.stopPropagation();
        if (!confirm('Delete this chat history?')) return;
        try {
            const res = await fetch(`/sessions/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (currentSessionId === id) await createNewChat();
                else await fetchSessions();
            }
        } catch (err) {
            console.error('Failed to delete session', err);
        }
    }

    function renderHistoryList(sessions) {
        if (sessions) {
            if (sessions.length === 0) {
                historyList.innerHTML = '<div class="empty-state">No history yet</div>';
                return;
            }
            historyList.innerHTML = sessions.map(s => `
                <div class="history-item ${s.id === currentSessionId ? 'active' : ''}" data-id="${s.id}">
                    <i class="fa-regular fa-comment"></i>
                    <span title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</span>
                    <i class="fa-solid fa-trash-can delete-hist" data-id="${s.id}"></i>
                </div>
            `).join('');

            // Listeners
            historyList.querySelectorAll('.history-item').forEach(item => {
                item.addEventListener('click', () => loadSession(item.dataset.id));
                item.querySelector('.delete-hist').addEventListener('click', (e) => deleteSession(item.dataset.id, e));
            });
        } else {
            // Just update active class
            historyList.querySelectorAll('.history-item').forEach(item => {
                item.classList.toggle('active', item.dataset.id === currentSessionId);
            });
        }
    }

    newChatBtn.addEventListener('click', createNewChat);

    // --- Drag & Drop Setup ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFilesFromInput(files);
    });

    fileInput.addEventListener('change', (e) => handleFilesFromInput(e.target.files));

    function handleFilesFromInput(files) {
        if (files && files.length > 0) {
            uploadBtn.disabled = false;
            uploadStatus.innerHTML = `<span style="color: var(--clr-primary)">${files.length} file(s) selected</span>`;
        }
    }

    // --- Upload Handlers ---
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(uploadForm);
        await performUpload(formData);
    });

    chatUploadPlus.addEventListener('click', () => chatFileInput.click());
    chatFileInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const formData = new FormData();
            for (const file of e.target.files) {
                formData.append('files', file);
            }
            await performUpload(formData);
            chatFileInput.value = '';
        }
    });

    async function performUpload(formData) {
        if (currentSessionId) {
            formData.append('session_id', currentSessionId);
        }
        setUploadState(true);
        uploadStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Indexing...';

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (response.ok) {
                uploadStatus.innerHTML = '<i class="fa-solid fa-check"></i> Indexed Successfully';
                if (data.files) {
                    renderFileList(data.files);
                    appendSystemMessage(`Successfully processed ${data.files.length} documents.`);
                }
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (err) {
            uploadStatus.innerHTML = `<span style="color: #ef4444">Error: ${err.message}</span>`;
        } finally {
            setUploadState(false);
        }
    }

    function setUploadState(loading) {
        uploadBtn.disabled = loading;
        const spinner = uploadBtn.querySelector('.btn-spinner');
        if (loading) {
            spinner.style.display = 'block';
            uploadBtn.querySelector('span').style.opacity = '0';
        } else {
            spinner.style.display = 'none';
            uploadBtn.querySelector('span').style.opacity = '1';
        }
    }

    function renderFileList(files) {
        console.log('DEBUG: Rendering file list:', files);
        if (!files || files.length === 0) {
            fileListContainer.innerHTML = '<div class="empty-state">No files uploaded yet</div>';
            return;
        }
        fileListContainer.innerHTML = files.map(file => {
            const safeName = escapeHtml(file);
            return `
                <div class="file-row">
                    <i class="${getFileIcon(file)}"></i>
                    <span class="file-name" title="${safeName}">${safeName}</span>
                    <button class="file-delete-btn" data-filename="${safeName}" title="Delete file">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
        }).join('');

        // Add delete listeners
        const deleteButtons = fileListContainer.querySelectorAll('.file-delete-btn');
        console.log(`DEBUG: Attaching listeners to ${deleteButtons.length} delete buttons`);
        deleteButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const filename = btn.getAttribute('data-filename');
                console.log('DEBUG: Delete clicked for:', filename);
                if (confirm(`Are you sure you want to delete "${filename}"?`)) {
                    await deleteFile(filename);
                }
            });
        });
    }

    async function deleteFile(filename) {
        try {
            const response = await fetch('/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, session_id: currentSessionId })
            });
            const data = await response.json();
            if (response.ok) {
                // Refresh the file list for the current session
                await fetchFiles();
                appendSystemMessage(`File "${filename}" removed from this chat.`);
            } else {
                alert('Error deleting file: ' + data.error);
            }
        } catch (err) {
            alert('Network error while deleting file.');
        }
    }

    // --- Chat Logic ---
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = userInput.value.trim();
        if (!query || isTyping) return;

        appendMessage('user', query);
        userInput.value = '';
        userInput.style.height = 'auto';
        sendBtn.disabled = true;

        const typingEl = showTypingIndicator();

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, session_id: currentSessionId })
            });
            const data = await response.json();

            typingEl.remove();

            if (response.ok) {
                await appendAIAnyway(data.answer);
                fetchSessions(); // Refresh titles in sidebar
            } else {
                appendMessage('ai', 'Error: ' + (data.error || 'Could not reach advisor.'));
            }
        } catch (err) {
            typingEl.remove();
            appendMessage('ai', 'Network error. Check server status.');
        }
    });

    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 200) + 'px';
        sendBtn.disabled = userInput.value.trim() === '';
    });

    clearChatBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the current chat history?')) {
            createNewChat();
        }
    });

    function appendMessage(role, text, shouldScroll = true) {
        const msgGroup = document.createElement('div');
        msgGroup.className = `msg-group ${role}`;

        const avatarClass = role === 'user' ? 'user-av' : 'ai-av';
        const iconClass = role === 'user' ? 'fa-user' : 'fa-robot';

        msgGroup.innerHTML = `
            <div class="msg-avatar ${avatarClass}"><i class="fa-solid ${iconClass}"></i></div>
            <div class="msg-content">
                ${role === 'user' ? `<p>${escapeHtml(text)}</p>` : marked.parse(text)}
            </div>
        `;

        chatHistory.appendChild(msgGroup);
        if (shouldScroll) scrollToBottom();
    }

    async function appendAIAnyway(text) {
        const msgGroup = document.createElement('div');
        msgGroup.className = 'msg-group ai';
        msgGroup.innerHTML = `
            <div class="msg-avatar ai-av"><i class="fa-solid fa-robot"></i></div>
            <div class="msg-content"></div>
        `;
        chatHistory.appendChild(msgGroup);
        const contentDiv = msgGroup.querySelector('.msg-content');

        // Typing animation effect
        isTyping = true;
        let displayedText = "";
        const fullText = text || "No response received.";
        const words = fullText.split(" ");

        for (let i = 0; i < words.length; i++) {
            displayedText += words[i] + " ";
            contentDiv.innerHTML = marked.parse(displayedText);
            scrollToBottom();
            await new Promise(r => setTimeout(r, 30)); // Slightly faster typing for large screens
        }
        scrollToBottom(); // Final scroll to ensure everything is visible
        isTyping = false;
    }

    function showTypingIndicator() {
        const typingEl = document.createElement('div');
        typingEl.className = 'msg-group ai';
        typingEl.innerHTML = `
            <div class="msg-avatar ai-av"><i class="fa-solid fa-robot"></i></div>
            <div class="typing"><span></span><span></span><span></span></div>
        `;
        chatHistory.appendChild(typingEl);
        scrollToBottom();
        return typingEl;
    }

    function appendSystemMessage(text) {
        const msg = document.createElement('div');
        msg.className = 'msg-group system';
        msg.innerHTML = `<div class="msg-content" style="text-align: center; color: var(--clr-text-dim); font-size: 0.8rem; background: none; border: none;">${text}</div>`;
        chatHistory.appendChild(msg);
        scrollToBottom();
    }

    // --- Scrolling Logic ---
    function scrollToBottom() {
        // Use scrollBy to move to the very bottom
        chatViewport.scrollTop = chatViewport.scrollHeight;

        // Alternative for some browsers
        requestAnimationFrame(() => {
            chatViewport.scrollTop = chatViewport.scrollHeight;
        });
    }

    scrollBottomBtn.addEventListener('click', scrollToBottom);

    chatViewport.addEventListener('scroll', () => {
        const isBottom = chatViewport.scrollHeight - chatViewport.scrollTop <= chatViewport.clientHeight + 100;
        if (isBottom) {
            scrollBottomBtn.classList.remove('visible');
        } else {
            scrollBottomBtn.classList.add('visible');
        }
    });

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        if (['pdf'].includes(ext)) return 'fa-solid fa-file-pdf';
        if (['doc', 'docx'].includes(ext)) return 'fa-solid fa-file-word';
        if (['xlsx', 'xls'].includes(ext)) return 'fa-solid fa-file-excel';
        if (['txt'].includes(ext)) return 'fa-solid fa-file-lines';
        return 'fa-solid fa-file';
    }
});
