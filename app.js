/* ============================================================
   iPhone Chatbot Simulator — App Logic v2
   ============================================================ */

'use strict';

// ============================================================
// State
// ============================================================

const state = {
  currentApp: null,            // 'messages' | 'contacts' | 'worldbook' | 'persona' | 'settings' | null
  activeChat: null,            // character id currently open in LINE chat
  lineTab: 'chats',
  characters: [],
  conversations: {},           // { charId: [{role, content, ts, read}] }
  worldBook: [],
  voomPosts: [],
  persona: {
    userAlias: 'You',
    coreVibe: 'Soft, intimate, and immersive',
    globalRules: 'Stay in character. Keep replies natural and emotionally coherent. Do not break immersion unless the user explicitly asks.',
    styleGuide: 'Write like a real chat message, not an essay. Prefer warmth, specificity, and momentum.',
    scenario: '',
    boundaries: '',
  },
  settings: {
    provider: 'anthropic',     // 'anthropic' | 'openai' | 'groq' | 'custom'
    baseUrl: '',               // only used for 'custom'
    apiKey: '',
    model: 'claude-sonnet-4-6',
    userName: 'You',
    memoryNote: '',
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

function trimTrailingSlash(str) {
  return (str || '').replace(/\/+$/, '');
}

function trimLeadingSlash(str) {
  return (str || '').replace(/^\/+/, '');
}

function splitAbsoluteUrl(raw) {
  try {
    const url = new URL(raw);
    return {
      origin: url.origin,
      path: trimTrailingSlash(url.pathname || ''),
      search: url.search || '',
    };
  } catch {
    return null;
  }
}

function deriveRootPath(basePath, targetPath) {
  const normalizedTarget = '/' + trimLeadingSlash(targetPath || '');
  const normalizedBase = trimTrailingSlash(basePath || '');

  if (!normalizedTarget || normalizedTarget === '/') return normalizedBase;
  if (normalizedBase.endsWith(normalizedTarget)) {
    const root = normalizedBase.slice(0, normalizedBase.length - normalizedTarget.length);
    return root || '';
  }
  if (normalizedTarget.startsWith('/v1/') && normalizedBase.endsWith('/v1')) {
    return normalizedBase;
  }
  return normalizedBase;
}

function joinUrl(base, path, relatedPath = '') {
  if (!path) return trimTrailingSlash(base);
  if (/^https?:\/\//i.test(path)) return path;

  const absoluteBase = splitAbsoluteUrl(base);
  const normalizedPath = '/' + trimLeadingSlash(path);
  const normalizedRelated = relatedPath ? '/' + trimLeadingSlash(relatedPath) : '';

  if (absoluteBase) {
    if (absoluteBase.path.endsWith(normalizedPath)) {
      return absoluteBase.origin + absoluteBase.path + absoluteBase.search;
    }

    const rootedPath = deriveRootPath(absoluteBase.path, normalizedRelated || normalizedPath);
    if (rootedPath.endsWith('/v1') && normalizedPath.startsWith('/v1/')) {
      return absoluteBase.origin + rootedPath + normalizedPath.slice(3) + absoluteBase.search;
    }
    if (rootedPath === normalizedPath) {
      return absoluteBase.origin + rootedPath + absoluteBase.search;
    }
    return absoluteBase.origin + trimTrailingSlash(rootedPath) + normalizedPath + absoluteBase.search;
  }

  const safeBase = trimTrailingSlash(base);
  if (!safeBase) return path;
  if (safeBase.endsWith(path)) return safeBase;
  if (safeBase.endsWith('/v1') && normalizedPath.startsWith('/v1/')) {
    return safeBase + normalizedPath.slice(3);
  }
  return safeBase + normalizedPath;
}

function getProviderConfig() {
  if (state.settings.provider !== 'custom') {
    return PROVIDERS[state.settings.provider] || PROVIDERS.anthropic;
  }

  return {
    label: 'Custom',
    baseUrl: trimTrailingSlash(state.settings.baseUrl || ''),
    chatPath: '/chat/completions',
    modelsPath: '/models',
    format: 'openai',
    auth: 'bearer',
    defaultModels: [],
  };
}

function buildAuthHeaders(authMode, apiKey) {
  if (!apiKey || authMode === 'none') return {};
  if (authMode === 'x-api-key') return { 'x-api-key': apiKey };
  return { 'Authorization': `Bearer ${apiKey}` };
}

async function requestJson(url, options, provDef) {
  return fetch(url, options);
}

// ============================================================
// Persistence
// ============================================================

function saveState() {
  try {
    localStorage.setItem('mumu_v2', JSON.stringify({
      characters: state.characters,
      conversations: state.conversations,
      worldBook: state.worldBook,
      voomPosts: state.voomPosts,
      persona: state.persona,
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
    if (s.voomPosts)     state.voomPosts     = s.voomPosts;
    if (s.persona)       Object.assign(state.persona, s.persona);
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
  if (name === 'persona') renderPersona();
  if (name === 'messages') renderLINEHome();
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

function renderLINEHome() {
  renderLINEHeader();
  renderLINEPanels();
}

function renderLINEHeader() {
  const titleMap = {
    chats: 'Chats',
    voom: 'VOOM',
    contacts: 'Friends',
    profile: 'Profile',
  };
  const titleEl = document.getElementById('lineListTitle');
  if (titleEl) titleEl.textContent = titleMap[state.lineTab] || 'Chats';

  const searchBar = document.getElementById('lineSearchBar');
  const searchInput = document.getElementById('lineSearchInput');
  if (searchBar) searchBar.style.display = state.lineTab === 'profile' ? 'none' : '';
  if (searchInput) {
    searchInput.placeholder = state.lineTab === 'contacts' ? 'Search friends' : state.lineTab === 'voom' ? 'Search posts' : 'Search';
    searchInput.value = '';
  }
}

function renderLINEPanels() {
  const panelMap = {
    chats: 'lineChatsPanel',
    voom: 'lineVoomPanel',
    contacts: 'lineContactsPanel',
    profile: 'lineProfilePanel',
  };
  ['chats', 'voom', 'contacts', 'profile'].forEach(tab => {
    document.getElementById(panelMap[tab])?.classList.toggle('line-panel-active', tab === state.lineTab);
    document.getElementById('lineTab' + tab.charAt(0).toUpperCase() + tab.slice(1))?.classList.toggle('active', tab === state.lineTab);
  });

  if (state.lineTab === 'chats') renderLINEConvList();
  if (state.lineTab === 'voom') renderVoomFeed();
  if (state.lineTab === 'contacts') renderLineContactsPane();
  if (state.lineTab === 'profile') renderLineProfilePane();
}

function setLineTab(tab) {
  state.lineTab = tab;
  renderLINEHome();
}

function openLinePrimaryAction() {
  if (state.lineTab === 'voom') {
    openVoomComposer();
    return;
  }
  if (state.lineTab === 'contacts') {
    openAddCharSheet();
    return;
  }
  openNewChatSheet();
}

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

function handleLineSearch(val) {
  if (state.lineTab === 'contacts') {
    renderLineContactsPane(val);
    return;
  }
  if (state.lineTab === 'voom') {
    renderVoomFeed(val);
    return;
  }
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
    await showApiError(err);
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

async function showApiError(err) {
  console.error('API error:', err);
  const msg = err?.message || '';
  let friendly;
  if (err instanceof TypeError || msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('networkerror')) {
    friendly = await diagnoseNetworkError();
  } else if (msg.includes('401') || msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('invalid x-api-key')) {
    friendly = 'Invalid API key. Double-check your key in Settings.';
  } else if (msg.includes('403')) {
    friendly = 'Access denied (403). Your key may not have permission for this model.';
  } else if (msg.includes('429')) {
    friendly = 'Rate limited — please wait a moment and try again.';
  } else {
    friendly = msg || 'Something went wrong. Check the browser console for details.';
  }
  alert(friendly);
}

async function diagnoseNetworkError() {
  if (location.protocol === 'file:') {
    return 'Network error — API calls are blocked when opening the file directly.\n\nThis app needs to be hosted on a web server like GitHub Pages, Netlify, or Vercel.';
  }

  if (navigator.onLine === false) {
    return 'You appear to be offline right now. Check your internet connection and try again.';
  }

  const { provider } = state.settings;
  const provDef = getProviderConfig();
  const testUrl = joinUrl(provDef.baseUrl, provDef.chatPath || '', provDef.chatPath || '');

  try {
    const resp = await fetch(testUrl, {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Method': 'POST',
      },
    });

    if (resp.ok) {
      return `Connection reached ${provDef.label}, so hosting is not the issue.\n\nThis page is already running from ${location.origin}. The remaining causes are usually:\n- a browser extension/privacy blocker\n- a bad custom base URL or path\n- the provider using a different auth/header format\n- provider/browser rejection before the real response is returned\n\nTry the official provider base URL, check Chat Path/Auth settings in Studio, and disable blockers for this site.`;
    }
  } catch (diagnosticErr) {
    console.warn('diagnoseNetworkError failed', diagnosticErr);
  }

  return `The request failed before ${provDef.label} returned a readable response.\n\nThis page is hosted at ${location.origin}, so it is not a GitHub Pages hosting problem. Check your browser privacy blockers, custom base URL, or provider-specific browser access limits.`;
}

async function callAPI(charId) {
  const char = state.characters.find(c => c.id === charId);
  const history = state.conversations[charId] || [];
  const { apiKey, model } = state.settings;
  const provDef = getProviderConfig();
  const baseUrl = provDef.baseUrl;

  // Build system prompt
  const worldText = state.worldBook
    .filter(e => e.content?.trim())
    .map(e => `[${e.title || 'World Info'}]\n${e.content}`)
    .join('\n\n');

  const parts = [];
  parts.push([
    '# Persona',
    state.persona.userAlias ? `User name: ${state.persona.userAlias}` : '',
    state.persona.coreVibe ? `Core vibe: ${state.persona.coreVibe}` : '',
    state.persona.globalRules ? `Global rules:\n${state.persona.globalRules}` : '',
    state.persona.styleGuide ? `Writing style:\n${state.persona.styleGuide}` : '',
    state.persona.scenario ? `Scenario:\n${state.persona.scenario}` : '',
    state.persona.boundaries ? `Boundaries:\n${state.persona.boundaries}` : '',
  ].filter(Boolean).join('\n\n'));
  if (worldText) parts.push('# World Book\n' + worldText);
  if (char?.systemPrompt) parts.push('# Character\n' + char.systemPrompt);
  if (state.settings.memoryNote?.trim()) parts.push('# Studio Note\n' + state.settings.memoryNote.trim());
  if (!parts.length) parts.push('You are a helpful assistant.');
  const systemPrompt = parts.join('\n\n---\n\n');

  // History for API (only role + content)
  const apiHistory = history.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  if (provDef.format === 'anthropic') {
    return callAnthropic(baseUrl, apiKey, model, systemPrompt, apiHistory, provDef);
  } else {
    return callOpenAICompat(baseUrl, apiKey, model, systemPrompt, apiHistory, provDef);
  }
}

async function callAnthropic(baseUrl, apiKey, model, system, messages, provDef = PROVIDERS.anthropic) {
  const url = joinUrl(baseUrl, provDef.chatPath || '/v1/messages', provDef.chatPath || '/v1/messages');
  const resp = await requestJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(provDef.auth || 'x-api-key', apiKey),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages }),
  }, provDef);
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e?.error?.message || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.content?.[0]?.text || '';
}

async function callOpenAICompat(baseUrl, apiKey, model, system, messages, provDef = PROVIDERS.openai) {
  const url = joinUrl(baseUrl, provDef.chatPath || '/chat/completions', provDef.chatPath || '/chat/completions');
  const openAIMessages = [
    { role: 'system', content: system },
    ...messages,
  ];
  const resp = await requestJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(provDef.auth || 'bearer', apiKey),
    },
    body: JSON.stringify({ model, max_tokens: 1024, messages: openAIMessages }),
  }, provDef);
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
  const { apiKey } = state.settings;
  if (!apiKey) { showToast('Enter your API key first'); return; }

  const provDef = getProviderConfig();
  const baseUrl = provDef.baseUrl;

  const statusEl = document.getElementById('fetchModelsStatus');
  if (statusEl) statusEl.textContent = '…';

  try {
    let models = [];
    if (provDef.format === 'anthropic') {
      const resp = await requestJson(joinUrl(baseUrl, provDef.modelsPath || '/v1/models', provDef.chatPath || '/v1/messages'), {
        method: 'GET',
        headers: {
          ...buildAuthHeaders(provDef.auth || 'x-api-key', apiKey),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      }, provDef);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      models = (data.data || []).map(m => m.id);
    } else {
      const resp = await requestJson(joinUrl(baseUrl, provDef.modelsPath || '/models', provDef.chatPath || '/chat/completions'), {
        method: 'GET',
        headers: buildAuthHeaders(provDef.auth || 'bearer', apiKey),
      }, provDef);
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
    await showApiError(err);
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
  const customModelEl = document.getElementById('settingsCustomModel');
  if (customModelEl) customModelEl.value = s.model || '';
  const memoryEl = document.getElementById('settingsMemoryNote');
  if (memoryEl) memoryEl.value = s.memoryNote || '';
  renderModelSelect();
  onProviderChange(false); // update URL row visibility
}

function renderModelSelect() {
  const select = document.getElementById('settingsModel');
  if (!select) return;
  const provDef = getProviderConfig();
  const models = provDef.defaultModels;

  // Keep existing options if they were fetched, just ensure current model is there
  const existing = Array.from(select.options).map(o => o.value);
  if (state.settings.provider === 'custom' && state.settings.model && !existing.includes(state.settings.model)) {
    select.innerHTML = `<option value="${escHtml(state.settings.model)}">${escHtml(state.settings.model)}</option>`;
  } else if (!existing.length || !existing.includes(state.settings.model)) {
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
  const customGroup = document.getElementById('customProviderGroup');
  if (customGroup) customGroup.style.display = provider === 'custom' ? '' : 'none';
  const customModelRow = document.getElementById('customModelRow');
  if (customModelRow) customModelRow.style.display = provider === 'custom' ? '' : 'none';

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
  state.settings.model     = state.settings.provider === 'custom'
    ? (document.getElementById('settingsCustomModel')?.value?.trim() || state.settings.model)
    : (document.getElementById('settingsModel')?.value || state.settings.model);
  state.settings.userName  = document.getElementById('settingsUserName')?.value?.trim() || '';
  state.settings.memoryNote = document.getElementById('settingsMemoryNote')?.value?.trim() || '';
  saveState();
}

function renderPersona() {
  document.getElementById('personaUserAlias').value = state.persona.userAlias || '';
  document.getElementById('personaCoreVibe').value = state.persona.coreVibe || '';
  document.getElementById('personaGlobalRules').value = state.persona.globalRules || '';
  document.getElementById('personaStyleGuide').value = state.persona.styleGuide || '';
  document.getElementById('personaScenario').value = state.persona.scenario || '';
  document.getElementById('personaBoundaries').value = state.persona.boundaries || '';
}

function savePersona() {
  state.persona.userAlias = document.getElementById('personaUserAlias')?.value?.trim() || '';
  state.persona.coreVibe = document.getElementById('personaCoreVibe')?.value?.trim() || '';
  state.persona.globalRules = document.getElementById('personaGlobalRules')?.value?.trim() || '';
  state.persona.styleGuide = document.getElementById('personaStyleGuide')?.value?.trim() || '';
  state.persona.scenario = document.getElementById('personaScenario')?.value?.trim() || '';
  state.persona.boundaries = document.getElementById('personaBoundaries')?.value?.trim() || '';
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
        <div class="contact-tags">
          <span class="contact-tag">${char.systemPrompt ? 'Prompt ready' : 'Needs prompt'}</span>
          <span class="contact-tag muted">${lastMsg(char.id) ? 'Active chat' : 'No chat yet'}</span>
        </div>
      </div>
      <div class="contact-actions">
        <button class="contact-chat-btn"
          onclick="event.stopPropagation();chatFromContacts('${char.id}')">Chat</button>
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

function renderLineContactsPane(filter = '') {
  const container = document.getElementById('lineContactsPane');
  if (!container) return;
  const chars = state.characters.filter(c => !filter || c.name.toLowerCase().includes(filter.toLowerCase()));
  if (!chars.length) {
    container.innerHTML = '<div class="line-empty-note">No friends yet. Add a character to bring the app to life.</div>';
    return;
  }

  container.innerHTML = chars.map(char => `
    <div class="line-conv-item" onclick="openLINEChat('${char.id}')">
      <div class="line-conv-avatar">${escHtml(char.avatar || '🤖')}</div>
      <div class="line-conv-info">
        <div class="line-conv-top">
          <span class="line-conv-name">${escHtml(char.name)}</span>
        </div>
        <div class="line-conv-preview">${escHtml(char.description || 'Tap to open chat')}</div>
      </div>
    </div>
  `).join('');
}

function renderLineProfilePane() {
  const container = document.getElementById('lineProfilePane');
  if (!container) return;
  const userName = state.persona.userAlias || state.settings.userName || 'You';
  container.innerHTML = `
    <div class="line-profile-card">
      <div class="line-profile-hero">
        <div class="line-profile-avatar">😊</div>
        <div>
          <div class="line-profile-name">${escHtml(userName)}</div>
          <div class="line-profile-sub">${escHtml(state.persona.coreVibe || 'Living inside a tiny green phone universe')}</div>
        </div>
      </div>
      <div class="line-profile-stats">
        <div class="line-profile-stat">
          <span>Friends</span>
          <strong>${state.characters.length}</strong>
        </div>
        <div class="line-profile-stat">
          <span>Posts</span>
          <strong>${state.voomPosts.filter(p => p.authorType === 'user').length}</strong>
        </div>
        <div class="line-profile-stat">
          <span>Chats</span>
          <strong>${Object.keys(state.conversations).filter(id => (state.conversations[id] || []).length).length}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderVoomFeed(filter = '') {
  const container = document.getElementById('lineVoomFeed');
  if (!container) return;
  const posts = [...state.voomPosts]
    .filter(post => {
      if (!filter) return true;
      const haystack = `${post.authorName} ${post.caption} ${(post.comments || []).map(c => c.text).join(' ')}`.toLowerCase();
      return haystack.includes(filter.toLowerCase());
    })
    .sort((a, b) => b.ts - a.ts);

  if (!posts.length) {
    container.innerHTML = '<div class="line-empty-note">No VOOM posts yet. Share a photo and let the characters react.</div>';
    return;
  }

  container.innerHTML = posts.map(post => `
    <div class="line-voom-card">
      <div class="line-voom-head">
        <div class="line-voom-avatar">${escHtml(post.avatar || '🙂')}</div>
        <div class="line-voom-meta">
          <div class="line-voom-name">${escHtml(post.authorName)}</div>
          <div class="line-voom-time">${escHtml(formatShortTime(post.ts))}</div>
        </div>
      </div>
      ${post.caption ? `<div class="line-voom-text">${escHtml(post.caption)}</div>` : ''}
      ${post.image ? `<img class="line-voom-image" src="${escHtml(post.image)}" alt="VOOM post image">` : ''}
      <div class="line-voom-actions">
        <span>${post.likes || 0} likes</span>
        <span>${(post.comments || []).length} comments</span>
      </div>
      ${(post.comments || []).length ? `
        <div class="line-voom-comments">
          ${post.comments.map(comment => `<div class="line-voom-comment"><b>${escHtml(comment.authorName)}:</b> ${escHtml(comment.text)}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
}

function openVoomComposer() {
  document.getElementById('voomCaption').value = '';
  document.getElementById('voomImageUrl').value = '';
  document.getElementById('voomImagePreview').innerHTML = 'No image selected';
  document.getElementById('voomImageInput').value = '';
  delete state.pendingVoomImage;
  document.getElementById('voomModal').classList.add('open');
}

function closeVoomComposer(event) {
  if (event && event.target !== document.getElementById('voomModal')) return;
  document.getElementById('voomModal').classList.remove('open');
}

function handleVoomImageChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.pendingVoomImage = reader.result;
    document.getElementById('voomImagePreview').innerHTML = `<img src="${escHtml(reader.result)}" alt="Preview">`;
  };
  reader.readAsDataURL(file);
}

function previewVoomImageUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) {
    delete state.pendingVoomImage;
    document.getElementById('voomImagePreview').innerHTML = 'No image selected';
    return;
  }
  state.pendingVoomImage = trimmed;
  document.getElementById('voomImagePreview').innerHTML = `<img src="${escHtml(trimmed)}" alt="Preview">`;
}

function buildAutoVoomComments() {
  return state.characters.slice(0, 3).map((char, index) => ({
    authorId: char.id,
    authorName: char.name,
    text: [
      'This is so cute, I had to stop scrolling.',
      'You look good here. I was hoping you would post today.',
      'Now I want the full story behind this photo.'
    ][index % 3],
  }));
}

function saveVoomPost() {
  const caption = document.getElementById('voomCaption').value.trim();
  const image = state.pendingVoomImage || document.getElementById('voomImageUrl').value.trim();
  if (!caption && !image) {
    showToast('Add a caption or image first');
    return;
  }

  state.voomPosts.push({
    id: uuid(),
    authorType: 'user',
    authorName: state.persona.userAlias || state.settings.userName || 'You',
    avatar: '😊',
    caption,
    image: image || '',
    likes: Math.max(state.characters.length, 1) + 1,
    comments: buildAutoVoomComments(),
    ts: Date.now(),
  });
  saveState();
  closeVoomComposer();
  state.lineTab = 'voom';
  renderLINEHome();
  showToast('Posted to VOOM');
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

  container.innerHTML = `
    <div class="worldbook-summary">
      <div class="worldbook-summary-card">
        <span class="worldbook-summary-label">Entries</span>
        <strong>${state.worldBook.length}</strong>
      </div>
      <div class="worldbook-summary-card">
        <span class="worldbook-summary-label">Prompt Layer</span>
        <strong>Global</strong>
      </div>
    </div>
  ` + state.worldBook.map(entry => `
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
  if (!state.voomPosts.length) {
    state.voomPosts.push({
      id: uuid(),
      authorType: 'assistant',
      authorName: 'Aria',
      avatar: '🌸',
      caption: 'The sky looked too soft tonight not to post.',
      image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
      likes: 12,
      comments: [
        { authorId: 'user', authorName: state.persona.userAlias || state.settings.userName || 'You', text: 'This feels like a movie frame.' }
      ],
      ts: Date.now() - 7200000,
    });
    saveState();
  }
  if (!state.persona.userAlias) state.persona.userAlias = state.settings.userName || 'You';
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
