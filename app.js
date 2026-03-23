/* ============================================================
   iPhone Chatbot Simulator — App Logic v2
   ============================================================ */

'use strict';

// ============================================================
// State
// ============================================================

const state = {
  currentApp: null,            // 'messages' | 'contacts' | 'worldbook' | 'settings' | null
  activeChat: null,            // character id currently open in LINE chat
  characters: [],
  conversations: {},           // { charId: [{role, content, ts, read}] }
  worldBook: [],
  settings: {
    provider: 'anthropic',     // 'anthropic' | 'openai' | 'groq' | 'custom'
    baseUrl: '',               // only used for 'custom'
    apiKey: '',
    model: 'claude-sonnet-4-6',
    userName: 'You',
  },
  wallpaper: null,             // CSS background value
  editingCharId: null,
};

// ============================================================
// Provider Definitions
// ============================================================

const PROVIDERS = {
  anthropic: {
    label: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com',
    chatPath: '/v1/messages',
    modelsPath: '/v1/models',
    format: 'anthropic',
    defaultModels: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    format: 'openai',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    format: 'openai',
    defaultModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  },
  custom: {
    label: 'Custom',
    baseUrl: '',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    format: 'openai',
    defaultModels: [],
  },
};

// ============================================================
// Wallpaper Presets
// ============================================================

const WALLPAPERS = [
  { label: 'Night',   value: 'linear-gradient(160deg, #1a1a3e 0%, #2d1b4e 40%, #1a2e4a 100%)' },
  { label: 'Pink',    value: 'linear-gradient(160deg, #f8b4c8 0%, #fce4ec 50%, #e8b4d0 100%)' },
  { label: 'Ocean',   value: 'linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)' },
  { label: 'Sunset',  value: 'linear-gradient(160deg, #f7971e 0%, #ffd200 50%, #f7971e 100%)' },
  { label: 'Forest',  value: 'linear-gradient(160deg, #134e5e 0%, #71b280 100%)' },
  { label: 'Sakura',  value: 'linear-gradient(160deg, #ffecd2 0%, #fcb69f 50%, #f8b4c8 100%)' },
];

// ============================================================
// Persistence
// ============================================================

function saveState() {
  try {
    localStorage.setItem('mumu_v2', JSON.stringify({
      characters: state.characters,
      conversations: state.conversations,
      worldBook: state.worldBook,
      settings: state.settings,
      wallpaper: state.wallpaper,
    }));
  } catch (e) { console.warn('saveState failed', e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem('mumu_v2');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.characters)    state.characters    = s.characters;
    if (s.conversations) state.conversations = s.conversations;
    if (s.worldBook)     state.worldBook     = s.worldBook;
    if (s.settings)      Object.assign(state.settings, s.settings);
    if (s.wallpaper)     state.wallpaper     = s.wallpaper;
  } catch (e) { console.warn('loadState failed', e); }
}

// ============================================================
// Utilities
// ============================================================

function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatShortTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatMsgTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateSep(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function isDifferentDay(ts1, ts2) {
  if (!ts1) return true;
  return new Date(ts1).toDateString() !== new Date(ts2).toDateString();
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 80) + 'px';
}

// ============================================================
// Clock
// ============================================================

function updateClock() {
  document.getElementById('statusTime').textContent =
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// Wallpaper
// ============================================================

function applyWallpaper(value) {
  state.wallpaper = value;
  const screen = document.getElementById('iphoneScreen');
  if (value && value.startsWith('http')) {
    screen.style.background = `url('${value}') center/cover no-repeat`;
  } else {
    screen.style.background = value || WALLPAPERS[0].value;
  }
  saveState();
}

function openWallpaperPicker() {
  renderWallpaperSwatches();
  document.getElementById('wallpaperModal').classList.add('open');
}

function closeWallpaperPicker(event) {
  if (event && event.target !== document.getElementById('wallpaperModal')) return;
  document.getElementById('wallpaperModal').classList.remove('open');
}

function renderWallpaperSwatches() {
  const container = document.getElementById('wallpaperSwatches');
  container.innerHTML = WALLPAPERS.map((w, i) => `
    <div
      class="wallpaper-swatch ${state.wallpaper === w.value ? 'selected' : ''}"
      style="background:${w.value};"
      onclick="selectWallpaper(${i})"
      title="${w.label}"
    ></div>
  `).join('');
}

function selectWallpaper(index) {
  applyWallpaper(WALLPAPERS[index].value);
  renderWallpaperSwatches();
  setTimeout(() => document.getElementById('wallpaperModal').classList.remove('open'), 400);
}

function applyCustomWallpaper() {
  const url = document.getElementById('wallpaperUrl').value.trim();
  if (!url) return;
  applyWallpaper(url);
  document.getElementById('wallpaperModal').classList.remove('open');
}

// ============================================================
// Home Screen Navigation
// ============================================================

function openApp(name) {
  if (state.currentApp) {
    const prev = document.getElementById('app-' + state.currentApp);
    if (prev) prev.classList.remove('open');
  }
  state.currentApp = name;
  const overlay = document.getElementById('app-' + name);
  if (!overlay) return;
  overlay.classList.add('open');

  // Refresh content
  if (name === 'messages') renderLINEConvList();
  if (name === 'contacts') renderContactsList();
  if (name === 'worldbook') renderWorldBook();
  if (name === 'settings') renderSettings();
}

function goHome() {
  if (!state.currentApp) return;
  const overlay = document.getElementById('app-' + state.currentApp);
  if (overlay) overlay.classList.remove('open');

  // Also close LINE chat if open
  closeLINEChat(true);
  state.currentApp = null;
}

// ============================================================
// LINE — Conversation List
// ============================================================

function renderLINEConvList(filter = '') {
  const container = document.getElementById('lineConvList');
  const chars = state.characters.filter(c =>
    !filter || c.name.toLowerCase().includes(filter.toLowerCase())
  );

  if (chars.length === 0) {
    container.innerHTML = `
      <div class="line-empty-state">
        <div class="line-empty-icon">💬</div>
        <div class="line-empty-title">No messages yet</div>
        <div class="line-empty-sub">Add a character in Contacts to start chatting.</div>
      </div>`;
    return;
  }

  const sorted = [...chars].sort((a, b) => {
    const aLast = lastMsg(a.id);
    const bLast = lastMsg(b.id);
    return (bLast?.ts || 0) - (aLast?.ts || 0);
  });

  container.innerHTML = sorted.map(char => {
    const last = lastMsg(char.id);
    const preview = last
      ? (last.role === 'user' ? 'You: ' : '') + last.content.slice(0, 50)
      : 'Tap to chat';
    const timeStr = last ? formatShortTime(last.ts) : '';
    return `
      <div class="line-conv-item" onclick="openLINEChat('${char.id}')">
        <div class="line-conv-avatar">${escHtml(char.avatar || '🤖')}</div>
        <div class="line-conv-info">
          <div class="line-conv-top">
            <span class="line-conv-name">${escHtml(char.name)}</span>
            <span class="line-conv-time">${escHtml(timeStr)}</span>
          </div>
          <div class="line-conv-preview">${escHtml(preview)}</div>
        </div>
      </div>`;
  }).join('');
}

function filterLineConvs(val) {
  renderLINEConvList(val);
}

function lastMsg(charId) {
  const msgs = state.conversations[charId];
  return msgs?.length ? msgs[msgs.length - 1] : null;
}

// ============================================================
// LINE — Chat View
// ============================================================

function openLINEChat(charId) {
  const char = state.characters.find(c => c.id === charId);
  if (!char) return;

  state.activeChat = charId;

  document.getElementById('lineChatName').textContent = char.name;
  document.getElementById('lineChatSub').textContent = char.description ? `📍 ${char.description}` : '📍 Mobile';

  const chat = document.getElementById('lineChat');
  const home = document.getElementById('lineHome');
  chat.classList.add('open');
  home.classList.add('hidden');

  renderLINEMessages();
  setTimeout(() => document.getElementById('lineInput').focus(), 350);
}

function closeLINEChat(silent = false) {
  state.activeChat = null;
  document.getElementById('lineChat').classList.remove('open');
  document.getElementById('lineHome').classList.remove('hidden');
  const input = document.getElementById('lineInput');
  input.value = '';
  input.style.height = 'auto';
  updateLineSendBtn();
  if (!silent) renderLINEConvList();
}

function openCharDetailFromChat() {
  if (state.activeChat) openEditCharSheet(state.activeChat);
}

function renderLINEMessages() {
  const area = document.getElementById('lineMessagesArea');
  const msgs = state.conversations[state.activeChat] || [];
  const char = state.characters.find(c => c.id === state.activeChat);

  if (msgs.length === 0) {
    area.innerHTML = `
      <div style="text-align:center;padding-top:40px;">
        <div style="font-size:48px;margin-bottom:10px;">${char?.avatar || '🤖'}</div>
        <div style="font-size:15px;color:rgba(0,0,0,0.5);">Start a conversation with <strong>${escHtml(char?.name || 'this character')}</strong></div>
      </div>`;
    return;
  }

  let html = '';
  msgs.forEach((msg, i) => {
    const isSent = msg.role === 'user';
    const prevMsg = msgs[i - 1];

    // Date separator
    if (isDifferentDay(prevMsg?.ts, msg.ts)) {
      html += `<div class="line-date-sep">${escHtml(formatDateSep(msg.ts))}</div>`;
    }

    const timeStr = formatMsgTime(msg.ts);
    const showAvatar = !isSent && (!prevMsg || prevMsg.role === 'user');

    if (isSent) {
      // Sent: [meta left][green bubble right]
      const isRead = i < msgs.length - 1 || msg.read;
      html += `
        <div class="line-msg-row sent">
          <div class="line-msg-meta">
            ${isRead ? '<span class="line-read">Read</span>' : ''}
            <span class="line-time">${escHtml(timeStr)}</span>
          </div>
          <div class="line-bubble-wrap">
            <div class="line-bubble sent">${escHtml(msg.content)}</div>
          </div>
        </div>`;
    } else {
      // Received: [avatar][white bubble][meta right]
      html += `
        <div class="line-msg-row received">
          ${showAvatar
            ? `<div class="line-msg-avatar">${escHtml(char?.avatar || '🤖')}</div>`
            : `<div class="line-msg-avatar-spacer"></div>`}
          <div class="line-bubble-wrap">
            <div class="line-bubble received">${escHtml(msg.content)}</div>
            <div class="line-msg-meta">
              <span class="line-time">${escHtml(timeStr)}</span>
            </div>
          </div>
        </div>`;
    }
  });

  area.innerHTML = html;
  area.scrollTop = area.scrollHeight;
}

function appendMsg(role, content) {
  if (!state.conversations[state.activeChat]) {
    state.conversations[state.activeChat] = [];
  }
  const msg = { role, content, ts: Date.now(), read: false };
  state.conversations[state.activeChat].push(msg);
  saveState();
  return msg;
}

function markLastUserMsgRead() {
  const msgs = state.conversations[state.activeChat];
  if (!msgs) return;
  // Find last user message and mark read
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      msgs[i].read = true;
      break;
    }
  }
  saveState();
}

function showTypingIndicator() {
  const area = document.getElementById('lineMessagesArea');
  const char = state.characters.find(c => c.id === state.activeChat);
  const el = document.createElement('div');
  el.id = 'typingRow';
  el.className = 'line-typing-row';
  el.innerHTML = `
    <div class="line-msg-avatar">${char?.avatar || '🤖'}</div>
    <div class="line-typing-bubble">
      <div class="line-typing-dot"></div>
      <div class="line-typing-dot"></div>
      <div class="line-typing-dot"></div>
    </div>`;
  area.appendChild(el);
  area.scrollTop = area.scrollHeight;
}

function removeTypingIndicator() {
  document.getElementById('typingRow')?.remove();
}

// ============================================================
// Send Message + API
// ============================================================

let isSending = false;

async function sendLineMessage() {
  if (isSending) return;

  const input = document.getElementById('lineInput');
  const text = input.value.trim();
  if (!text) return;

  if (!state.settings.apiKey) {
    showToast('Add your API key in Settings first');
    closeLINEChat(true);
    goHome();
    setTimeout(() => openApp('settings'), 400);
    return;
  }

  isSending = true;
  input.value = '';
  input.style.height = 'auto';
  updateLineSendBtn();

  appendMsg('user', text);
  renderLINEMessages();
  showTypingIndicator();
  document.getElementById('lineMessagesArea').scrollTop = 99999;

  try {
    const reply = await callAPI(state.activeChat);
    removeTypingIndicator();
    markLastUserMsgRead();
    appendMsg('assistant', reply);
    renderLINEMessages();
  } catch (err) {
    removeTypingIndicator();
    showApiError(err);
  }

  isSending = false;
  updateLineSendBtn();
}

function handleLineInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendLineMessage();
  }
}

function updateLineSendBtn() {
  const input = document.getElementById('lineInput');
  const btn = document.getElementById('lineSendBtn');
  btn.disabled = !input?.value.trim() || isSending;
}

// ============================================================
// Multi-Provider API Call
// ============================================================

function showApiError(err) {
  console.error('API error:', err);
  const msg = err?.message || '';
  let friendly;
  if (err instanceof TypeError || msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('networkerror')) {
    friendly = 'Network error — your browser is blocking the request.\n\nFix: open index.html via a local server instead of file://\n\nRun in terminal:\n  npx serve .\nor:\n  python3 -m http.server 8080';
  } else if (msg.includes('401') || msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('invalid x-api-key')) {
    friendly = 'Invalid API key. Check your key in Settings.';
  } else if (msg.includes('403')) {
    friendly = 'Access denied (403). Your API key may lack permission for this model.';
  } else if (msg.includes('429')) {
    friendly = 'Rate limited (429). Please wait a moment and try again.';
  } else {
    friendly = msg || 'Something went wrong. Check the console for details.';
  }
  alert(friendly);
}

async function callAPI(charId) {
  const char = state.characters.find(c => c.id === charId);
  const history = state.conversations[charId] || [];
  const { provider, apiKey, model } = state.settings;
  const provDef = PROVIDERS[provider] || PROVIDERS.anthropic;
  const baseUrl = provider === 'custom'
    ? (state.settings.baseUrl || '').replace(/\/$/, '')
    : provDef.baseUrl;

  // Build system prompt
  const worldText = state.worldBook
    .filter(e => e.content?.trim())
    .map(e => `[${e.title || 'World Info'}]\n${e.content}`)
    .join('\n\n');

  const parts = [];
  if (worldText) parts.push('# World Book\n' + worldText);
  if (char?.systemPrompt) parts.push('# Character\n' + char.systemPrompt);
  if (!parts.length) parts.push('You are a helpful assistant.');
  const systemPrompt = parts.join('\n\n---\n\n');

  // History for API (only role + content)
  const apiHistory = history.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  if (provDef.format === 'anthropic') {
    return callAnthropic(baseUrl, apiKey, model, systemPrompt, apiHistory);
  } else {
    return callOpenAICompat(baseUrl, apiKey, model, systemPrompt, apiHistory, provDef.chatPath);
  }
}

async function callAnthropic(baseUrl, apiKey, model, system, messages) {
  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e?.error?.message || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.content?.[0]?.text || '';
}

async function callOpenAICompat(baseUrl, apiKey, model, system, messages, chatPath) {
  const url = baseUrl + chatPath;
  const openAIMessages = [
    { role: 'system', content: system },
    ...messages,
  ];
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, max_tokens: 1024, messages: openAIMessages }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e?.error?.message || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ============================================================
// Fetch Models
// ============================================================

async function fetchModels() {
  const { provider, apiKey } = state.settings;
  if (!apiKey) { showToast('Enter your API key first'); return; }

  const provDef = PROVIDERS[provider] || PROVIDERS.anthropic;
  const baseUrl = provider === 'custom'
    ? (state.settings.baseUrl || '').replace(/\/$/, '')
    : provDef.baseUrl;

  const statusEl = document.getElementById('fetchModelsStatus');
  if (statusEl) statusEl.textContent = '…';

  try {
    let models = [];
    if (provDef.format === 'anthropic') {
      const resp = await fetch(`${baseUrl}/v1/models`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      models = (data.data || []).map(m => m.id);
    } else {
      const resp = await fetch(`${baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      models = (data.data || []).map(m => m.id).sort();
    }

    if (!models.length) throw new Error('No models returned');

    // Populate the model select
    const select = document.getElementById('settingsModel');
    select.innerHTML = models.map(m => `<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('');
    if (state.settings.model && models.includes(state.settings.model)) {
      select.value = state.settings.model;
    } else {
      state.settings.model = models[0];
      select.value = models[0];
      saveState();
    }

    if (statusEl) statusEl.textContent = `${models.length} models`;
    showToast(`Loaded ${models.length} models`);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Failed';
    showApiError(err);
  }
}

// ============================================================
// Settings
// ============================================================

function renderSettings() {
  const s = state.settings;
  const provEl = document.getElementById('settingsProvider');
  if (provEl) provEl.value = s.provider || 'anthropic';
  document.getElementById('settingsApiKey').value = s.apiKey || '';
  document.getElementById('settingsUserName').value = s.userName || '';
  renderModelSelect();
  onProviderChange(false); // update URL row visibility
}

function renderModelSelect() {
  const select = document.getElementById('settingsModel');
  if (!select) return;
  const provDef = PROVIDERS[state.settings.provider] || PROVIDERS.anthropic;
  const models = provDef.defaultModels;

  // Keep existing options if they were fetched, just ensure current model is there
  const existing = Array.from(select.options).map(o => o.value);
  if (!existing.length || !existing.includes(state.settings.model)) {
    select.innerHTML = models.map(m => `<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('');
  }
  if (state.settings.model) {
    if ([...select.options].some(o => o.value === state.settings.model)) {
      select.value = state.settings.model;
    }
  }
}

function onProviderChange(doSave = true) {
  const provEl = document.getElementById('settingsProvider');
  if (!provEl) return;
  const provider = provEl.value;
  state.settings.provider = provider;

  const rowBaseUrl = document.getElementById('rowBaseUrl');
  if (rowBaseUrl) rowBaseUrl.style.display = provider === 'custom' ? '' : 'none';

  const baseUrlInput = document.getElementById('settingsBaseUrl');
  if (baseUrlInput) {
    if (provider !== 'custom') {
      baseUrlInput.value = PROVIDERS[provider]?.baseUrl || '';
    } else {
      baseUrlInput.value = state.settings.baseUrl || '';
    }
  }

  // Reset model options to provider defaults
  renderModelSelect();

  if (doSave) saveSettings();
}

function saveSettings() {
  state.settings.provider  = document.getElementById('settingsProvider')?.value || state.settings.provider;
  state.settings.baseUrl   = document.getElementById('settingsBaseUrl')?.value?.trim() || '';
  state.settings.apiKey    = document.getElementById('settingsApiKey')?.value?.trim() || '';
  state.settings.model     = document.getElementById('settingsModel')?.value || state.settings.model;
  state.settings.userName  = document.getElementById('settingsUserName')?.value?.trim() || '';
  saveState();
}

function clearAllChats() {
  if (!confirm('Clear all chat history? This cannot be undone.')) return;
  state.conversations = {};
  saveState();
  showToast('Chat history cleared');
  if (state.activeChat) closeLINEChat(true);
  if (state.currentApp === 'messages') renderLINEConvList();
}

// ============================================================
// Contacts
// ============================================================

function renderContactsList(filter = '') {
  const container = document.getElementById('contactsList');
  if (!container) return;
  const chars = state.characters.filter(c =>
    !filter || c.name.toLowerCase().includes(filter.toLowerCase())
  );

  if (chars.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="background:white;">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-title">No characters yet</div>
        <div class="empty-state-sub">Tap + to create your first AI character.</div>
      </div>`;
    return;
  }

  container.innerHTML = chars.map(char => `
    <div class="contact-item" onclick="openEditCharSheet('${char.id}')">
      <div class="contact-avatar">${escHtml(char.avatar || '🤖')}</div>
      <div class="contact-info">
        <div class="contact-name">${escHtml(char.name)}</div>
        <div class="contact-desc">${escHtml(char.description || 'No description')}</div>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <button style="background:none;border:none;color:#06C755;font-size:20px;cursor:pointer;padding:6px;"
          onclick="event.stopPropagation();chatFromContacts('${char.id}')">💬</button>
        <span style="color:#C7C7CC;font-size:18px;">›</span>
      </div>
    </div>`).join('');
}

function chatFromContacts(charId) {
  goHome();
  setTimeout(() => {
    openApp('messages');
    setTimeout(() => openLINEChat(charId), 400);
  }, 400);
}

function filterContacts(val) {
  renderContactsList(val);
}

// ============================================================
// Character Modal
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

function closeCharModal(event) {
  if (event && event.target !== document.getElementById('charModal')) return;
  document.getElementById('charModal').classList.remove('open');
}

function saveCharacter() {
  const avatar = document.getElementById('charAvatar').value.trim() || '🤖';
  const name   = document.getElementById('charName').value.trim();
  const description = document.getElementById('charDesc').value.trim();
  const systemPrompt = document.getElementById('charSystem').value.trim();

  if (!name) { showToast('Please enter a name'); return; }

  if (state.editingCharId) {
    const char = state.characters.find(c => c.id === state.editingCharId);
    if (char) Object.assign(char, { avatar, name, description, systemPrompt });
  } else {
    state.characters.push({ id: uuid(), avatar, name, description, systemPrompt });
  }

  saveState();
  document.getElementById('charModal').classList.remove('open');
  renderContactsList();
  if (state.currentApp === 'messages') renderLINEConvList();
  showToast(state.editingCharId ? 'Character updated' : 'Character added');
}

function deleteCharacter() {
  if (!state.editingCharId) return;
  if (!confirm('Delete this character and all chat history?')) return;

  state.characters = state.characters.filter(c => c.id !== state.editingCharId);
  delete state.conversations[state.editingCharId];

  saveState();
  document.getElementById('charModal').classList.remove('open');
  if (state.activeChat === state.editingCharId) closeLINEChat(true);
  renderContactsList();
  if (state.currentApp === 'messages') renderLINEConvList();
  showToast('Character deleted');
}

function openNewChatSheet() {
  if (!state.characters.length) {
    showToast('Add characters in Contacts first');
    goHome();
    setTimeout(() => openApp('contacts'), 450);
  }
  // else: already on messages list, just show it
}

// ============================================================
// World Book
// ============================================================

function renderWorldBook() {
  const container = document.getElementById('worldbookList');
  if (!container) return;

  if (!state.worldBook.length) {
    container.innerHTML = `
      <div class="empty-state" style="background:transparent;">
        <div class="empty-state-icon">🌍</div>
        <div class="empty-state-title">World Book is empty</div>
        <div class="empty-state-sub">Global prompts included in every conversation.</div>
      </div>`;
    return;
  }

  container.innerHTML = state.worldBook.map(entry => `
    <div class="worldbook-entry">
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
          placeholder="Enter world lore, rules, or context..."
          oninput="updateWBContent('${entry.id}', this.value)"
        >${escHtml(entry.content)}</textarea>
      </div>
    </div>`).join('');
}

function addWorldBookEntry() {
  state.worldBook.push({ id: uuid(), title: 'New Entry', content: '' });
  saveState();
  renderWorldBook();
  setTimeout(() => {
    const inputs = document.querySelectorAll('.worldbook-entry-title-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
}

function updateWBTitle(id, val) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) { e.title = val; saveState(); }
}

function updateWBContent(id, val) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) { e.content = val; saveState(); }
}

function deleteWBEntry(id) {
  state.worldBook = state.worldBook.filter(x => x.id !== id);
  saveState();
  renderWorldBook();
}

// ============================================================
// Seed demo data
// ============================================================

function seedIfEmpty() {
  if (!state.characters.length) {
    state.characters.push({
      id: uuid(),
      avatar: '🌸',
      name: 'Aria',
      description: 'A friendly and curious AI companion',
      systemPrompt:
        'You are Aria, a warm, witty, and thoughtful AI companion. ' +
        'You speak in a friendly, conversational tone and love exploring ideas. ' +
        'Keep responses concise and natural, like a real text message.',
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

  // Apply wallpaper
  applyWallpaper(state.wallpaper || WALLPAPERS[0].value);

  // Show file:// warning in Settings if needed
  if (location.protocol === 'file:') {
    const el = document.getElementById('fileProtocolWarning');
    if (el) el.style.display = 'block';
  }

  // Clock
  updateClock();
  setInterval(updateClock, 30000);
}

document.addEventListener('DOMContentLoaded', init);
