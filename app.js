/* ============================================================
   iPhone Chatbot Simulator — App Logic
   ============================================================ */

'use strict';

// ============================================================
// State
// ============================================================

const state = {
  activeTab: 'messages',
  activeChat: null,          // character id currently open, or null
  characters: [],            // array of character objects
  conversations: {},         // { charId: [{role, content, ts}] }
  worldBook: [],             // array of { id, title, content }
  settings: {
    apiKey: '',
    model: 'claude-sonnet-4-6',
    userName: 'You',
  },
  editingCharId: null,       // id of character being edited in modal
};

// ============================================================
// Persistence
// ============================================================

function saveState() {
  try {
    localStorage.setItem('mumu_state', JSON.stringify({
      characters: state.characters,
      conversations: state.conversations,
      worldBook: state.worldBook,
      settings: state.settings,
    }));
  } catch (e) {
    console.warn('Failed to save state', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem('mumu_state');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.characters)    state.characters    = saved.characters;
    if (saved.conversations) state.conversations = saved.conversations;
    if (saved.worldBook)     state.worldBook     = saved.worldBook;
    if (saved.settings)      Object.assign(state.settings, saved.settings);
  } catch (e) {
    console.warn('Failed to load state', e);
  }
}

// ============================================================
// Utilities
// ============================================================

function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 80) + 'px';
}

// ============================================================
// Status Bar Clock
// ============================================================

function updateClock() {
  const now = new Date();
  document.getElementById('statusTime').textContent =
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// Tab Navigation
// ============================================================

function switchTab(tab) {
  if (state.activeTab === tab) return;

  // Deactivate old tab item
  document.getElementById('tab-' + state.activeTab)?.classList.remove('active');
  document.getElementById('view-' + state.activeTab)?.classList.remove('active');

  state.activeTab = tab;

  document.getElementById('tab-' + tab).classList.add('active');
  const view = document.getElementById('view-' + tab);
  view.classList.add('active');

  // Refresh relevant section
  if (tab === 'messages') renderConversationList();
  if (tab === 'contacts') renderContactsList();
  if (tab === 'worldbook') renderWorldBook();
  if (tab === 'settings') renderSettings();
}

// ============================================================
// MESSAGES — Conversation List
// ============================================================

function renderConversationList(filter = '') {
  const container = document.getElementById('conversationList');
  const chars = state.characters.filter(c =>
    !filter || c.name.toLowerCase().includes(filter.toLowerCase())
  );

  if (chars.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <div class="empty-state-title">No conversations yet</div>
        <div class="empty-state-subtitle">
          Add a character in <strong>Contacts</strong>, then start chatting.
        </div>
      </div>`;
    return;
  }

  // Sort by last message timestamp descending
  const sorted = [...chars].sort((a, b) => {
    const aMsg = lastMsg(a.id);
    const bMsg = lastMsg(b.id);
    return (bMsg?.ts || 0) - (aMsg?.ts || 0);
  });

  container.innerHTML = sorted.map(char => {
    const last = lastMsg(char.id);
    const preview = last
      ? (last.role === 'user' ? 'You: ' : '') + last.content.slice(0, 60)
      : 'No messages yet';
    const timeStr = last ? formatTime(last.ts) : '';
    return `
      <div class="conv-item" onclick="openChat('${char.id}')">
        <div class="conv-avatar">${char.avatar || '🤖'}</div>
        <div class="conv-info">
          <div class="conv-header">
            <span class="conv-name">${escHtml(char.name)}</span>
            <span class="conv-time">${timeStr}</span>
          </div>
          <div class="conv-preview">${escHtml(preview)}</div>
        </div>
      </div>`;
  }).join('');
}

function lastMsg(charId) {
  const msgs = state.conversations[charId];
  return msgs && msgs.length ? msgs[msgs.length - 1] : null;
}

function filterConversations(val) {
  renderConversationList(val);
}

// ============================================================
// MESSAGES — Chat View
// ============================================================

function openChat(charId) {
  const char = state.characters.find(c => c.id === charId);
  if (!char) return;

  state.activeChat = charId;

  // Update chat header
  document.getElementById('chatNavAvatar').textContent = char.avatar || '🤖';
  document.getElementById('chatNavName').textContent = char.name;

  // Show chat view
  const chatView = document.getElementById('chatView');
  chatView.classList.add('open');

  // Render messages
  renderMessages();

  // Focus input
  setTimeout(() => {
    document.getElementById('chatInput').focus();
  }, 300);
}

function closeChat() {
  state.activeChat = null;
  document.getElementById('chatView').classList.remove('open');
  document.getElementById('chatInput').value = '';
  document.getElementById('chatInput').style.height = 'auto';
  updateSendBtn();
  renderConversationList();
}

function renderMessages() {
  const area = document.getElementById('messagesArea');
  const msgs = state.conversations[state.activeChat] || [];
  const char = state.characters.find(c => c.id === state.activeChat);

  if (msgs.length === 0) {
    area.innerHTML = `
      <div class="empty-state" style="margin-top:40px;">
        <div class="empty-state-icon">${char?.avatar || '🤖'}</div>
        <div class="empty-state-title">Say hello to ${escHtml(char?.name || 'your character')}</div>
        <div class="empty-state-subtitle">This is the beginning of your conversation.</div>
      </div>`;
    return;
  }

  let html = '';
  msgs.forEach((msg, i) => {
    const isUser = msg.role === 'user';
    const showAvatar = !isUser && (i === 0 || msgs[i - 1]?.role === 'user');

    // Date separator
    if (i === 0 || isDifferentDay(msgs[i - 1]?.ts, msg.ts)) {
      html += `<div class="msg-date-separator">${formatDateSep(msg.ts)}</div>`;
    }

    html += `
      <div class="message-row ${isUser ? 'user-row' : ''}">
        ${!isUser ? (showAvatar
          ? `<div class="msg-avatar-small">${char?.avatar || '🤖'}</div>`
          : `<div class="msg-avatar-spacer"></div>`)
        : ''}
        <div class="bubble ${isUser ? 'user' : 'bot'}">${escHtml(msg.content)}</div>
      </div>`;
  });

  area.innerHTML = html;
  area.scrollTop = area.scrollHeight;
}

function isDifferentDay(ts1, ts2) {
  if (!ts1 || !ts2) return false;
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  return d1.toDateString() !== d2.toDateString();
}

function formatDateSep(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function appendMessage(role, content) {
  if (!state.conversations[state.activeChat]) {
    state.conversations[state.activeChat] = [];
  }
  state.conversations[state.activeChat].push({ role, content, ts: Date.now() });
  saveState();
}

function showTypingIndicator() {
  const area = document.getElementById('messagesArea');
  const char = state.characters.find(c => c.id === state.activeChat);

  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.id = 'typingIndicator';
  el.innerHTML = `
    <div class="msg-avatar-small">${char?.avatar || '🤖'}</div>
    <div class="typing-bubble">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
  area.appendChild(el);
  area.scrollTop = area.scrollHeight;
}

function removeTypingIndicator() {
  document.getElementById('typingIndicator')?.remove();
}

// ============================================================
// MESSAGES — Send + Claude API
// ============================================================

let isSending = false;

async function sendMessage() {
  if (isSending) return;

  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  if (!state.settings.apiKey) {
    showToast('Add your API key in Settings first');
    switchTab('settings');
    return;
  }

  isSending = true;
  input.value = '';
  input.style.height = 'auto';
  updateSendBtn();

  // Append user message
  appendMessage('user', text);
  renderMessages();

  // Typing indicator
  showTypingIndicator();
  document.getElementById('messagesArea').scrollTop = 99999;

  try {
    const reply = await callClaude(state.activeChat);
    removeTypingIndicator();
    appendMessage('assistant', reply);
    renderMessages();
  } catch (err) {
    removeTypingIndicator();
    const msg = err.message || 'Something went wrong';
    showToast('Error: ' + msg.slice(0, 60));
    console.error('Claude API error:', err);
  }

  isSending = false;
  updateSendBtn();
}

async function callClaude(charId) {
  const char = state.characters.find(c => c.id === charId);
  const history = state.conversations[charId] || [];

  // Build system prompt: World Book + character persona
  const worldBookText = state.worldBook
    .filter(e => e.content.trim())
    .map(e => `[${e.title || 'World Info'}]\n${e.content}`)
    .join('\n\n');

  let systemParts = [];
  if (worldBookText) systemParts.push('# World Book\n' + worldBookText);
  if (char?.systemPrompt) systemParts.push('# Character\n' + char.systemPrompt);
  if (!systemParts.length) systemParts.push('You are a helpful assistant.');

  const systemPrompt = systemParts.join('\n\n---\n\n');

  // Messages: only role + content for API
  const apiMessages = history.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const body = {
    model: state.settings.model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: apiMessages,
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': state.settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `HTTP ${resp.status}`);
  }

  const data = await resp.json();
  return data.content?.[0]?.text || '';
}

function handleInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function updateSendBtn() {
  const input = document.getElementById('chatInput');
  const btn = document.getElementById('sendBtn');
  btn.disabled = !input.value.trim() || isSending;
}

// ============================================================
// Character Modal (Add / Edit)
// ============================================================

function openAddCharSheet() {
  state.editingCharId = null;
  document.getElementById('charModalTitle').textContent = 'New Character';
  document.getElementById('charAvatar').value = '';
  document.getElementById('charName').value = '';
  document.getElementById('charDesc').value = '';
  document.getElementById('charSystem').value = '';
  document.getElementById('charDeleteBtn').style.display = 'none';
  document.getElementById('charModal').classList.add('open');
}

function openEditCharSheet(charId) {
  const char = state.characters.find(c => c.id === charId);
  if (!char) return;
  state.editingCharId = charId;
  document.getElementById('charModalTitle').textContent = 'Edit Character';
  document.getElementById('charAvatar').value = char.avatar || '';
  document.getElementById('charName').value = char.name || '';
  document.getElementById('charDesc').value = char.description || '';
  document.getElementById('charSystem').value = char.systemPrompt || '';
  document.getElementById('charDeleteBtn').style.display = '';
  document.getElementById('charModal').classList.add('open');
}

function openCharDetailFromChat() {
  if (state.activeChat) openEditCharSheet(state.activeChat);
}

function openNewChatSheet() {
  if (state.characters.length === 0) {
    showToast('Add characters in Contacts first');
    switchTab('contacts');
  } else {
    switchTab('contacts');
  }
}

function closeCharModal(event) {
  if (event && event.target !== document.getElementById('charModal')) return;
  document.getElementById('charModal').classList.remove('open');
}

function saveCharacter() {
  const avatar = document.getElementById('charAvatar').value.trim() || '🤖';
  const name = document.getElementById('charName').value.trim();
  const description = document.getElementById('charDesc').value.trim();
  const systemPrompt = document.getElementById('charSystem').value.trim();

  if (!name) {
    showToast('Please enter a name');
    return;
  }

  if (state.editingCharId) {
    const char = state.characters.find(c => c.id === state.editingCharId);
    if (char) {
      char.avatar = avatar;
      char.name = name;
      char.description = description;
      char.systemPrompt = systemPrompt;
    }
  } else {
    const newChar = { id: uuid(), avatar, name, description, systemPrompt };
    state.characters.push(newChar);
  }

  saveState();
  document.getElementById('charModal').classList.remove('open');
  renderContactsList();
  renderConversationList();
  showToast(state.editingCharId ? 'Character updated' : 'Character added');
}

function deleteCharacter() {
  if (!state.editingCharId) return;
  if (!confirm('Delete this character and their entire chat history?')) return;

  state.characters = state.characters.filter(c => c.id !== state.editingCharId);
  delete state.conversations[state.editingCharId];

  saveState();
  document.getElementById('charModal').classList.remove('open');

  if (state.activeChat === state.editingCharId) closeChat();
  renderContactsList();
  renderConversationList();
  showToast('Character deleted');
}

// ============================================================
// CONTACTS — Character List
// ============================================================

function renderContactsList(filter = '') {
  const container = document.getElementById('contactsList');
  const chars = state.characters.filter(c =>
    !filter || c.name.toLowerCase().includes(filter.toLowerCase())
  );

  if (chars.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-title">No characters yet</div>
        <div class="empty-state-subtitle">Tap + to create your first AI character persona.</div>
      </div>`;
    return;
  }

  container.innerHTML = chars.map(char => `
    <div class="contact-item" onclick="openEditCharSheet('${char.id}')">
      <div class="contact-avatar">${char.avatar || '🤖'}</div>
      <div class="contact-info">
        <div class="contact-name">${escHtml(char.name)}</div>
        <div class="contact-desc">${escHtml(char.description || char.systemPrompt?.slice(0, 60) || 'No description')}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button style="background:none;border:none;color:var(--ios-blue);font-size:20px;cursor:pointer;padding:4px 8px;"
          onclick="event.stopPropagation();startChatWithChar('${char.id}')">💬</button>
        <span class="contact-chevron">›</span>
      </div>
    </div>`).join('');
}

function startChatWithChar(charId) {
  switchTab('messages');
  openChat(charId);
}

function filterContacts(val) {
  renderContactsList(val);
}

// ============================================================
// WORLD BOOK
// ============================================================

function renderWorldBook() {
  const container = document.getElementById('worldbookList');

  if (state.worldBook.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🌍</div>
        <div class="empty-state-title">World Book is empty</div>
        <div class="empty-state-subtitle">Add global prompts that will be included in every conversation.</div>
      </div>`;
    return;
  }

  container.innerHTML = state.worldBook.map((entry, i) => `
    <div class="worldbook-entry" id="wbe-${entry.id}">
      <div class="worldbook-entry-header">
        <input
          class="worldbook-entry-title-input"
          value="${escHtml(entry.title)}"
          placeholder="Entry title..."
          oninput="updateWBTitle('${entry.id}', this.value)"
        >
        <button class="worldbook-delete-btn" onclick="deleteWBEntry('${entry.id}')">🗑</button>
      </div>
      <div class="worldbook-entry-body">
        <textarea
          class="worldbook-entry-textarea"
          placeholder="Enter world lore, rules, or context that applies globally..."
          oninput="updateWBContent('${entry.id}', this.value)"
        >${escHtml(entry.content)}</textarea>
      </div>
    </div>`).join('');
}

function addWorldBookEntry() {
  state.worldBook.push({ id: uuid(), title: 'New Entry', content: '' });
  saveState();
  renderWorldBook();
  // Focus last entry title
  setTimeout(() => {
    const inputs = document.querySelectorAll('.worldbook-entry-title-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
}

function updateWBTitle(id, val) {
  const entry = state.worldBook.find(e => e.id === id);
  if (entry) { entry.title = val; saveState(); }
}

function updateWBContent(id, val) {
  const entry = state.worldBook.find(e => e.id === id);
  if (entry) { entry.content = val; saveState(); }
}

function deleteWBEntry(id) {
  state.worldBook = state.worldBook.filter(e => e.id !== id);
  saveState();
  renderWorldBook();
}

// ============================================================
// SETTINGS
// ============================================================

function renderSettings() {
  document.getElementById('settingsApiKey').value = state.settings.apiKey || '';
  document.getElementById('settingsModel').value = state.settings.model || 'claude-sonnet-4-6';
  document.getElementById('settingsUserName').value = state.settings.userName || '';
}

function saveApiKey() {
  state.settings.apiKey = document.getElementById('settingsApiKey').value.trim();
  saveState();
}

function saveModel() {
  state.settings.model = document.getElementById('settingsModel').value;
  saveState();
}

function saveUserName() {
  state.settings.userName = document.getElementById('settingsUserName').value.trim();
  saveState();
}

function clearAllChats() {
  if (!confirm('Clear all chat history? This cannot be undone.')) return;
  state.conversations = {};
  saveState();
  showToast('Chat history cleared');
  if (state.activeChat) closeChat();
  renderConversationList();
}

// ============================================================
// XSS-safe HTML escaping
// ============================================================

function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
// Seed demo character if first run
// ============================================================

function seedIfEmpty() {
  if (state.characters.length === 0) {
    state.characters.push({
      id: uuid(),
      avatar: '🌸',
      name: 'Aria',
      description: 'A friendly and curious AI companion',
      systemPrompt:
        'You are Aria, a warm, witty, and thoughtful AI companion. ' +
        'You speak in a friendly, conversational tone and love exploring ideas. ' +
        'Keep responses concise and natural, like a real text conversation.',
    });
    saveState();
  }
}

// ============================================================
// Boot
// ============================================================

function init() {
  loadState();
  seedIfEmpty();

  // Initial render
  renderConversationList();
  renderSettings();

  // Clock
  updateClock();
  setInterval(updateClock, 30000);
}

document.addEventListener('DOMContentLoaded', init);
