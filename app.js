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
  pendingLineAttachments: [],
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
    chatWallpaper: '',         // CSS background for the chat interface
  },
  wallet: {
    balance: 120,
    cards: [],
    activeCardId: '',
    characterBalances: {},
    transactions: [],
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

const DEFAULT_PERSONA = {
  userAlias: 'You',
  coreVibe: 'Soft, intimate, and immersive',
  globalRules: 'Stay in character. Keep replies natural and emotionally coherent. Do not break immersion unless the user explicitly asks.',
  styleGuide: 'Write like a real chat message, not an essay. Prefer warmth, specificity, and momentum.',
  scenario: '',
  boundaries: '',
};

const DEFAULT_SETTINGS = {
  provider: 'anthropic',
  baseUrl: '',
  apiKey: '',
  model: 'claude-sonnet-4-6',
  userName: 'You',
  memoryNote: '',
};

const DEFAULT_WALLET = {
  balance: 120,
  cards: [],
  activeCardId: '',
  characterBalances: {},
  transactions: [],
};

const WALLET_CARD_THEMES = [
  'linear-gradient(135deg, #1d3b78 0%, #2b6ff4 52%, #7eb7ff 100%)',
  'linear-gradient(135deg, #1a1a1d 0%, #34353a 48%, #101114 100%)',
  'linear-gradient(135deg, #5f172d 0%, #b4235f 50%, #ff82b2 100%)',
  'linear-gradient(135deg, #264653 0%, #2a9d8f 55%, #85e5c5 100%)',
  'linear-gradient(135deg, #7c2d12 0%, #ea580c 56%, #fdba74 100%)',
];

function parseTagList(raw) {
  if (Array.isArray(raw)) {
    return raw.map(tag => String(tag).trim()).filter(Boolean);
  }
  return String(raw || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

function stringifyTagList(tags) {
  return parseTagList(tags).join(', ');
}

function normalizeCharacter(raw = {}) {
  return {
    id: raw.id || uuid(),
    avatar: raw.avatar || '🤖',
    name: raw.name || 'Untitled',
    description: raw.description || '',
    nickname: raw.nickname || '',
    relationship: raw.relationship || '',
    tags: parseTagList(raw.tags),
    modelOverride: raw.modelOverride || '',
    scenario: raw.scenario || '',
    systemPrompt: raw.systemPrompt || '',
    privateNotes: raw.privateNotes || '',
  };
}

function normalizeWorldBookEntry(raw = {}) {
  return {
    id: raw.id || uuid(),
    title: raw.title || 'New Entry',
    content: raw.content || '',
    keywords: parseTagList(raw.keywords),
    priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 50,
    scope: raw.scope === 'always' ? 'always' : 'conditional',
    enabled: raw.enabled !== false,
  };
}

function normalizeMessageAttachment(raw = {}) {
  return {
    type: raw.type === 'image' ? 'image' : 'image',
    url: raw.url || '',
    mimeType: raw.mimeType || 'image/jpeg',
    name: raw.name || 'image',
  };
}

function normalizeConversationMessage(raw = {}) {
  return {
    role: raw.role === 'assistant' ? 'assistant' : 'user',
    content: raw.content || '',
    ts: raw.ts || Date.now(),
    read: raw.read === true,
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map(normalizeMessageAttachment).filter(att => att.url) : [],
  };
}

function normalizeConversations(raw = {}) {
  const normalized = {};
  Object.entries(raw || {}).forEach(([key, messages]) => {
    normalized[key] = Array.isArray(messages) ? messages.map(normalizeConversationMessage) : [];
  });
  return normalized;
}

function normalizeWallet(raw = {}) {
  const rawCards = Array.isArray(raw.cards) ? raw.cards.map(card => ({
    id: card.id || uuid(),
    label: card.label || 'Card',
    network: card.network || 'Visa',
    last4: String(card.last4 || '').slice(-4) || '0000',
    balance: Number(card.balance) || 0,
  })) : [];
  const cards = rawCards.filter(card => !isStarterWalletCard(card));
  const rawTransactions = Array.isArray(raw.transactions) ? raw.transactions.map(tx => ({
    id: tx.id || uuid(),
    type: tx.type || 'fund',
    amount: Number(tx.amount) || 0,
    charId: tx.charId || '',
    ts: tx.ts || Date.now(),
    note: tx.note || '',
  })) : [];
  const transactions = rawTransactions.filter(tx => !isStarterWalletTransaction(tx));

  return {
    balance: Number(raw.balance) || 0,
    cards,
    activeCardId: cards.some(card => card.id === raw.activeCardId) ? raw.activeCardId : (cards[0]?.id || ''),
    characterBalances: raw.characterBalances && typeof raw.characterBalances === 'object' ? raw.characterBalances : {},
    transactions,
  };
}

function isStarterWalletCard(card = {}) {
  return (card.label || '').trim() === 'Apple Cash'
    && (card.network || '').trim() === 'Visa'
    && String(card.last4 || '') === '4242';
}

function isStarterWalletTransaction(tx = {}) {
  return (tx.note || '').trim() === 'Starter balance';
}

function getWalletCardTheme(card, index) {
  const key = `${card.network || ''}-${card.label || ''}-${index}`.length;
  return WALLET_CARD_THEMES[key % WALLET_CARD_THEMES.length];
}

function getWalletUserBalance() {
  const cardTotal = state.wallet.cards.reduce((sum, card) => sum + (Number(card.balance) || 0), 0);
  return cardTotal + (Number(state.wallet.balance) || 0);
}

function getWalletActiveCardIndex() {
  const idx = state.wallet.cards.findIndex(card => card.id === state.wallet.activeCardId);
  return idx >= 0 ? idx : 0;
}

function setWalletActiveCard(cardId, { scroll = false } = {}) {
  if (!state.wallet.cards.length) {
    state.wallet.activeCardId = '';
    return;
  }
  state.wallet.activeCardId = state.wallet.cards.some(card => card.id === cardId)
    ? cardId
    : state.wallet.cards[0].id;

  const fundSelect = document.getElementById('walletFundCard');
  if (fundSelect) fundSelect.value = state.wallet.activeCardId;
  const transferSelect = document.getElementById('walletTransferCard');
  if (transferSelect) transferSelect.value = state.wallet.activeCardId;

  renderWalletCardDots(state.wallet.cards.length, getWalletActiveCardIndex());
  saveState();

  if (scroll) {
    requestAnimationFrame(() => {
      const deck = document.getElementById('walletCardList');
      const activeCard = deck?.querySelector(`[data-card-id="${CSS.escape(state.wallet.activeCardId)}"]`);
      activeCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  }
}

function renderWalletCardDots(count, activeIndex = 0) {
  const dots = document.getElementById('walletCardDots');
  if (!dots) return;
  if (count <= 1) {
    dots.innerHTML = '';
    return;
  }
  dots.innerHTML = Array.from({ length: count }, (_, index) => `
    <button class="wallet-card-dot ${index === activeIndex ? 'active' : ''}" type="button" aria-label="Go to card ${index + 1}" onclick="setWalletActiveCard('${state.wallet.cards[index].id}', { scroll: true })"></button>
  `).join('');
}

function syncWalletCardDots() {
  const deck = document.getElementById('walletCardList');
  if (!deck || !state.wallet.cards.length) return;
  const firstCard = deck.querySelector('.wallet-card, .wallet-card-empty');
  if (!firstCard) return;
  const cardWidth = firstCard.getBoundingClientRect().width + 14;
  const activeIndex = Math.max(0, Math.min(deck.children.length - 1, Math.round(deck.scrollLeft / Math.max(cardWidth, 1))));
  setWalletActiveCard(state.wallet.cards[activeIndex]?.id || state.wallet.cards[0].id);
}

function stepWalletCards(direction) {
  if (!state.wallet.cards.length) return;
  const currentIndex = getWalletActiveCardIndex();
  const nextIndex = Math.max(0, Math.min(state.wallet.cards.length - 1, currentIndex + direction));
  setWalletActiveCard(state.wallet.cards[nextIndex].id, { scroll: true });
}

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
      wallet: state.wallet,
      wallpaper: state.wallpaper,
    }));
  } catch (e) { console.warn('saveState failed', e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem('mumu_v2');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.characters)    state.characters    = s.characters.map(normalizeCharacter);
    if (s.conversations) state.conversations = normalizeConversations(s.conversations);
    if (s.worldBook)     state.worldBook     = s.worldBook.map(normalizeWorldBookEntry);
    if (s.voomPosts)     state.voomPosts     = s.voomPosts;
    if (s.persona)       Object.assign(state.persona, DEFAULT_PERSONA, s.persona);
    if (s.settings)      Object.assign(state.settings, DEFAULT_SETTINGS, s.settings);
    if (s.wallet)        state.wallet = normalizeWallet(s.wallet);
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

function isImageSource(value) {
  const trimmed = String(value || '').trim();
  return /^data:image\//i.test(trimmed)
    || /^https?:\/\//i.test(trimmed)
    || /^blob:/i.test(trimmed)
    || /^\/[^/]/.test(trimmed)
    || /^assets\//i.test(trimmed)
    || /^\.?\//.test(trimmed);
}

function avatarMarkup(value, className, fallback = '🤖') {
  const trimmed = String(value || '').trim();
  if (isImageSource(trimmed)) {
    return `<div class="${className} avatar-has-image"><img class="avatar-image" src="${escHtml(trimmed)}" alt="Avatar"></div>`;
  }
  return `<div class="${className}">${escHtml(trimmed || fallback)}</div>`;
}

function updateCharacterAvatarPreview(value) {
  const preview = document.getElementById('charAvatarPreview');
  if (!preview) return;
  const trimmed = String(value || '').trim();
  preview.innerHTML = isImageSource(trimmed)
    ? `<img class="preview-image" src="${escHtml(trimmed)}" alt="Avatar preview">`
    : `<span>${escHtml(trimmed || '🌸')}</span>`;
}

function updateWallpaperPreview(value) {
  const preview = document.getElementById('wallpaperPreview');
  if (!preview) return;
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    preview.innerHTML = 'No custom wallpaper selected';
    return;
  }
  preview.innerHTML = `<img class="preview-image" src="${escHtml(trimmed)}" alt="Wallpaper preview">`;
}

// ============================================================
// Clock
// ============================================================

function updateClock() {
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById('statusTime').textContent = timeStr;
  // Intentionally NOT updating homeClockTime so it remains the styled "July" text
}

// ============================================================
// Lock Screen (Visual Only Effect)
// ============================================================

let currentPinInput = '';
let isLocked = true;

function initLockScreen() {
  const lock = document.getElementById('lockScreen');
  if (!lock) return;
  isLocked = true;
  currentPinInput = '';
  updatePinUI();
  document.getElementById('lockTitle').textContent = 'Enter Passcode';
  lock.classList.remove('unlocked');
}

function handleKeypad(val) {
  if (!isLocked) return;
  
  if (val === 'delete') {
    currentPinInput = currentPinInput.slice(0, -1);
  } else if (currentPinInput.length < 6) {
    currentPinInput += val;
  }
  
  updatePinUI();
  
  if (currentPinInput.length === 6) {
    setTimeout(() => {
      isLocked = false;
      document.getElementById('lockScreen').classList.add('unlocked');
      currentPinInput = '';
      updatePinUI();
    }, 250);
  }
}

function updatePinUI() {
  const dots = document.querySelectorAll('.pin-dot');
  if(!dots.length) return;
  dots.forEach((dot, idx) => {
    if (idx < currentPinInput.length) {
      dot.classList.add('filled');
      dot.classList.remove('error');
    } else {
      dot.classList.remove('filled');
    }
  });
}

// ============================================================
// Wallpaper
// ============================================================

function applyWallpaper(value) {
  state.wallpaper = value;
  const screen = document.getElementById('iphoneScreen');
  if (isImageSource(value)) {
    screen.style.background = `url('${value}') center/cover no-repeat`;
  } else {
    screen.style.background = value || WALLPAPERS[0].value;
  }
  saveState();
}

function finalizeWallpaperChange(message = 'Wallpaper updated') {
  renderWallpaperSwatches();
  document.getElementById('wallpaperModal').classList.remove('open');
  showToast(message);
  if (state.currentApp === 'settings') {
    setTimeout(() => goHome(), 180);
  }
}

function promptChatWallpaper() {
  const current = state.settings.chatWallpaper || '';
  const val = prompt('Enter a valid CSS background property for Chat\n(e.g., #FFE4EE, url(https://...), or linear-gradient(...)):', current);
  if (val !== null) {
    state.settings.chatWallpaper = val.trim();
    saveSettings();
    applyChatWallpaper();
  }
}

function applyChatWallpaper() {
  const lineChat = document.getElementById('lineChat');
  if (!lineChat) return;
  if (state.settings.chatWallpaper) {
    lineChat.style.background = state.settings.chatWallpaper;
  } else {
    lineChat.style.background = ''; // Reverts to CSS variable
  }
}

function openWallpaperPicker() {
  renderWallpaperSwatches();
  document.getElementById('wallpaperUrl').value = /^https?:\/\//i.test(state.wallpaper || '') ? state.wallpaper : '';
  updateWallpaperPreview(isImageSource(state.wallpaper) ? state.wallpaper : '');
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
  document.getElementById('wallpaperUrl').value = '';
  updateWallpaperPreview('');
  finalizeWallpaperChange();
}

function applyCustomWallpaper() {
  const url = document.getElementById('wallpaperUrl').value.trim();
  if (!url) return;
  applyWallpaper(url);
  updateWallpaperPreview(url);
  finalizeWallpaperChange();
}

function previewWallpaperUrl(value) {
  if (!/^https?:\/\//i.test(String(value || '').trim())) {
    updateWallpaperPreview('');
    return;
  }
  updateWallpaperPreview(value);
}

function handleWallpaperImageChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    document.getElementById('wallpaperUrl').value = '';
    updateWallpaperPreview(result);
    applyWallpaper(result);
    event.target.value = '';
    finalizeWallpaperChange('Wallpaper updated from photo');
  };
  reader.readAsDataURL(file);
}

function clearCustomWallpaper() {
  document.getElementById('wallpaperUrl').value = '';
  updateWallpaperPreview('');
  applyWallpaper(WALLPAPERS[0].value);
  finalizeWallpaperChange('Wallpaper reset');
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
  if (name === 'wallet') renderWallet();
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
      ? `${last.role === 'user' ? 'You: ' : ''}${last.content ? last.content.slice(0, 50) : (last.attachments?.length ? 'Photo' : '')}`
      : 'Tap to chat';
    const timeStr = last ? formatShortTime(last.ts) : '';
    return `
      <div class="line-conv-item" onclick="openLINEChat('${char.id}')">
        ${avatarMarkup(char.avatar, 'line-conv-avatar')}
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
  state.pendingLineAttachments = [];

  document.getElementById('lineChatName').textContent = char.name;
  document.getElementById('lineChatSub').textContent = char.description ? `📍 ${char.description}` : '📍 Mobile';

  const chat = document.getElementById('lineChat');
  const home = document.getElementById('lineHome');
  chat.classList.add('open');
  home.classList.add('hidden');

  renderLINEMessages();
  renderLineAttachmentPreview();
  setTimeout(() => document.getElementById('lineInput').focus(), 350);
}

function closeLINEChat(silent = false) {
  state.activeChat = null;
  state.pendingLineAttachments = [];
  document.getElementById('lineChat').classList.remove('open');
  document.getElementById('lineHome').classList.remove('hidden');
  const input = document.getElementById('lineInput');
  input.value = '';
  input.style.height = 'auto';
  renderLineAttachmentPreview();
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
        <div class="line-chat-empty-avatar">${avatarMarkup(char?.avatar, 'line-conv-avatar')}</div>
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
            <div class="line-bubble sent">${renderMessageInner(msg)}</div>
          </div>
        </div>`;
    } else {
      // Received: [avatar][white bubble][meta right]
      html += `
        <div class="line-msg-row received">
          ${showAvatar
            ? avatarMarkup(char?.avatar, 'line-msg-avatar')
            : `<div class="line-msg-avatar-spacer"></div>`}
          <div class="line-bubble-wrap">
            <div class="line-bubble received">${renderMessageInner(msg)}</div>
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
  const msg = normalizeConversationMessage({ role, content, ts: Date.now(), read: false });
  state.conversations[state.activeChat].push(msg);
  saveState();
  return msg;
}

function renderMessageInner(msg) {
  const attachments = msg.attachments || [];
  const images = attachments
    .filter(att => att.type === 'image' && att.url)
    .map(att => `<img class="line-msg-image" src="${escHtml(att.url)}" alt="${escHtml(att.name || 'Photo')}">`)
    .join('');
  const text = msg.content ? `<div class="line-msg-text">${escHtml(msg.content)}</div>` : '';
  return `${images}${text}`;
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
    ${avatarMarkup(char?.avatar, 'line-msg-avatar')}
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
  const attachments = [...state.pendingLineAttachments];
  if (!text && !attachments.length) return;

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
  state.pendingLineAttachments = [];
  renderLineAttachmentPreview();
  updateLineSendBtn();

  const outgoing = appendMsg('user', text);
  outgoing.attachments = attachments.map(normalizeMessageAttachment);
  saveState();
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

async function retryLastMessage() {
  if (isSending || !state.activeChat) return;
  const chat = state.conversations[state.activeChat];
  if (!chat || !chat.length) return;

  const lastMsg = chat[chat.length - 1];
  if (lastMsg.role === 'assistant') {
    // Drop the AI's failed or bad response to regenerate
    chat.pop();
  }
  
  // Rerun the API call
  isSending = true;
  saveState();
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
  btn.disabled = (!input?.value.trim() && !state.pendingLineAttachments.length) || isSending;
}

function triggerLineImagePicker() {
  document.getElementById('lineImageInput')?.click();
}

function handleLineImageChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.pendingLineAttachments = [{
      type: 'image',
      url: String(reader.result || ''),
      mimeType: file.type || 'image/jpeg',
      name: file.name || 'photo',
    }];
    renderLineAttachmentPreview();
    updateLineSendBtn();
    event.target.value = '';
  };
  reader.readAsDataURL(file);
}

function clearPendingLineAttachment() {
  state.pendingLineAttachments = [];
  renderLineAttachmentPreview();
  updateLineSendBtn();
}

function renderLineAttachmentPreview() {
  const preview = document.getElementById('lineAttachmentPreview');
  if (!preview) return;
  if (!state.pendingLineAttachments.length) {
    preview.style.display = 'none';
    preview.innerHTML = '';
    return;
  }
  const image = state.pendingLineAttachments[0];
  preview.style.display = 'block';
  preview.innerHTML = `
    <div class="line-attachment-card">
      <img class="line-attachment-thumb" src="${escHtml(image.url)}" alt="${escHtml(image.name || 'Photo')}">
      <div class="line-attachment-meta">
        <div class="line-attachment-title">${escHtml(image.name || 'Photo')}</div>
        <div class="line-attachment-sub">Will be sent with your next message</div>
      </div>
      <button class="line-attachment-remove" type="button" onclick="clearPendingLineAttachment()">✕</button>
    </div>
  `;
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
  const rawChar = state.characters.find(c => c.id === charId);
  const char = rawChar ? normalizeCharacter(rawChar) : null;
  const history = state.conversations[charId] || [];
  const { apiKey } = state.settings;
  const model = char?.modelOverride?.trim() || state.settings.model;
  const provDef = getProviderConfig();
  const baseUrl = provDef.baseUrl;
  const systemPrompt = buildPromptBundle(char, history);

  const apiHistory = history.map(normalizeConversationMessage);

  if (provDef.format === 'anthropic') {
    return callAnthropic(baseUrl, apiKey, model, systemPrompt, apiHistory, provDef);
  } else {
    return callOpenAICompat(baseUrl, apiKey, model, systemPrompt, apiHistory, provDef);
  }
}

function parseDataUrlImage(url) {
  const match = String(url || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mediaType: match[1],
    data: match[2],
  };
}

function buildOpenAIMessageContent(message) {
  const blocks = [];
  if (message.content) blocks.push({ type: 'text', text: message.content });
  (message.attachments || []).forEach(att => {
    if (att.type === 'image' && att.url) {
      blocks.push({
        type: 'image_url',
        image_url: { url: att.url },
      });
    }
  });
  if (!blocks.length) return message.content || '';
  if (!message.attachments?.length) return message.content || '';
  return blocks;
}

function buildAnthropicMessageContent(message) {
  const blocks = [];
  (message.attachments || []).forEach(att => {
    if (att.type !== 'image' || !att.url) return;
    const parsed = parseDataUrlImage(att.url);
    if (!parsed) return;
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: parsed.mediaType,
        data: parsed.data,
      },
    });
  });
  if (message.content) blocks.push({ type: 'text', text: message.content });
  if (!blocks.length) return message.content || '';
  return blocks;
}

function selectRelevantWorldBookEntries(history, char) {
  const transcript = history.map(msg => msg.content || '').join('\n').toLowerCase();
  const charText = [char?.name, char?.description, char?.relationship, ...(char?.tags || [])]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  return state.worldBook
    .map(normalizeWorldBookEntry)
    .filter(entry => entry.enabled && entry.content.trim())
    .filter(entry => {
      if (entry.scope === 'always') return true;
      if (!entry.keywords.length) return false;
      return entry.keywords.some(keyword => {
        const token = keyword.toLowerCase();
        return transcript.includes(token) || charText.includes(token);
      });
    })
    .sort((a, b) => b.priority - a.priority);
}

function buildPromptBundle(char, history) {
  const personaBlock = [
    '# Global System',
    state.persona.globalRules ? `Core rules:\n${state.persona.globalRules}` : '',
    state.persona.styleGuide ? `Style guide:\n${state.persona.styleGuide}` : '',
    state.persona.boundaries ? `Boundaries:\n${state.persona.boundaries}` : '',
    state.settings.memoryNote?.trim() ? `Studio note:\n${state.settings.memoryNote.trim()}` : '',
  ].filter(Boolean).join('\n\n');

  const personaIdentity = [
    '# User Persona',
    state.persona.userAlias ? `User name: ${state.persona.userAlias}` : '',
    state.persona.coreVibe ? `Essence: ${state.persona.coreVibe}` : '',
    state.persona.scenario ? `Shared scenario:\n${state.persona.scenario}` : '',
  ].filter(Boolean).join('\n\n');

  const worldEntries = selectRelevantWorldBookEntries(history, char);
  const worldBlock = worldEntries.length ? [
    '# World Book',
    ...worldEntries.map(entry => {
      const meta = [
        entry.scope === 'always' ? 'always-on' : 'conditional',
        entry.keywords.length ? `triggers: ${entry.keywords.join(', ')}` : '',
        `priority ${entry.priority}`,
      ].filter(Boolean).join(' • ');
      return `[${entry.title || 'World Entry'}]\n${meta}\n${entry.content}`;
    }),
  ].join('\n\n') : '';

  const characterBlock = char ? [
    '# Character Card',
    `Name: ${char.name}`,
    char.description ? `Bio: ${char.description}` : '',
    char.relationship ? `Relationship to user: ${char.relationship}` : '',
    char.nickname ? `What they call the user: ${char.nickname}` : '',
    char.tags?.length ? `Tags: ${char.tags.join(', ')}` : '',
    char.scenario ? `Character-specific scenario:\n${char.scenario}` : '',
    char.systemPrompt ? `Behavior prompt:\n${char.systemPrompt}` : '',
  ].filter(Boolean).join('\n\n') : '';

  const chatContext = history.length ? [
    '# Chat Context',
    `Recent message count: ${history.length}`,
    `Latest speaker: ${history[history.length - 1]?.role || 'unknown'}`,
  ].join('\n\n') : '';

  return [
    personaBlock,
    personaIdentity,
    worldBlock,
    characterBlock,
    chatContext,
  ].filter(Boolean).join('\n\n---\n\n') || 'You are a helpful assistant.';
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
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: messages.map(message => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: buildAnthropicMessageContent(message),
      })),
    }),
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
    ...messages.map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: buildOpenAIMessageContent(message),
    })),
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
  applyChatWallpaper();
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

function ensureWalletCharacterBalance(charId) {
  if (!state.wallet.characterBalances[charId]) {
    state.wallet.characterBalances[charId] = 0;
  }
}

function formatCurrency(amount) {
  return `$${(Number(amount) || 0).toFixed(2)}`;
}

function renderWallet() {
  state.wallet = normalizeWallet(state.wallet);
  state.characters.forEach(char => ensureWalletCharacterBalance(char.id));

  const balanceEl = document.getElementById('walletBalanceDisplay');
  if (balanceEl) balanceEl.textContent = formatCurrency(getWalletUserBalance());
  const balanceMetaEl = document.getElementById('walletBalanceMeta');
  if (balanceMetaEl) {
    balanceMetaEl.textContent = `${state.wallet.cards.length} card${state.wallet.cards.length === 1 ? '' : 's'} in Wallet • ${state.characters.length} character${state.characters.length === 1 ? '' : 's'} available`;
  }

  const cardList = document.getElementById('walletCardList');
  if (cardList) {
    if (!state.wallet.cards.length) {
      cardList.innerHTML = `
        <div class="wallet-card-empty">
          <div class="wallet-card-empty-title">No cards in Wallet yet</div>
          <div class="wallet-card-empty-sub">Add your first card below to start building your stack.</div>
        </div>
      `;
    } else {
      if (!state.wallet.cards.some(card => card.id === state.wallet.activeCardId)) {
        state.wallet.activeCardId = state.wallet.cards[0].id;
      }
      cardList.innerHTML = state.wallet.cards.map((card, index) => `
        <button class="wallet-card ${card.id === state.wallet.activeCardId ? 'is-active' : ''}" type="button" data-card-id="${escHtml(card.id)}" onclick="setWalletActiveCard('${escHtml(card.id)}')" style="background:${escHtml(getWalletCardTheme(card, index))};">
          <div class="wallet-card-brand">
            <span>${escHtml(card.label)}</span>
            <span class="wallet-card-chip"></span>
          </div>
          <div>
            <div class="wallet-card-balance-label">Card Balance</div>
            <div class="wallet-card-balance">${formatCurrency(card.balance)}</div>
          </div>
          <div class="wallet-card-number">•••• ${escHtml(card.last4)}</div>
          <div class="wallet-card-footer">
            <div>
              <div class="wallet-card-label">${escHtml(card.label)}</div>
              <div class="wallet-card-meta">${escHtml(card.network)} ending in ${escHtml(card.last4)}</div>
            </div>
            <div class="wallet-card-network">${escHtml(card.network)}</div>
          </div>
        </button>
      `).join('');
    }
    cardList.onscroll = syncWalletCardDots;
    renderWalletCardDots(state.wallet.cards.length, getWalletActiveCardIndex());
  }

  const fundCardSelect = document.getElementById('walletFundCard');
  if (fundCardSelect) {
    fundCardSelect.innerHTML = state.wallet.cards.length
      ? state.wallet.cards.map(card => `<option value="${escHtml(card.id)}">${escHtml(card.label)} •••• ${escHtml(card.last4)}</option>`).join('')
      : '<option value="">No cards</option>';
    fundCardSelect.value = state.wallet.activeCardId || state.wallet.cards[0]?.id || '';
    fundCardSelect.onchange = () => setWalletActiveCard(fundCardSelect.value);
  }

  const transferCardSelect = document.getElementById('walletTransferCard');
  if (transferCardSelect) {
    transferCardSelect.innerHTML = state.wallet.cards.length
      ? state.wallet.cards.map(card => `<option value="${escHtml(card.id)}">${escHtml(card.label)} •••• ${escHtml(card.last4)}</option>`).join('')
      : '<option value="">No cards</option>';
    transferCardSelect.value = state.wallet.activeCardId || state.wallet.cards[0]?.id || '';
    transferCardSelect.onchange = () => setWalletActiveCard(transferCardSelect.value);
  }

  const charSelect = document.getElementById('walletTransferCharacter');
  if (charSelect) {
    charSelect.innerHTML = state.characters.length
      ? state.characters.map(char => `<option value="${escHtml(char.id)}">${escHtml(char.name)}</option>`).join('')
      : '<option value="">No characters</option>';
  }

  const charList = document.getElementById('walletCharacterList');
  if (charList) {
    if (!state.characters.length) {
      charList.innerHTML = `<div class="settings-row"><div class="settings-row-label">Add characters first</div></div>`;
    } else {
      charList.innerHTML = state.characters.map(char => `
        <div class="settings-row">
          <div class="settings-row-icon wallet-char-avatar" style="background:#f5f7fb;">${isImageSource(char.avatar) ? `<img class="avatar-image" src="${escHtml(char.avatar)}" alt="${escHtml(char.name)}">` : escHtml(char.avatar || '🤖')}</div>
          <div class="settings-row-label">${escHtml(char.name)}</div>
          <div class="settings-row-value">${formatCurrency(state.wallet.characterBalances[char.id] || 0)}</div>
        </div>
      `).join('');
    }
  }
}

function addWalletCard() {
  const label = document.getElementById('walletCardLabel')?.value.trim() || 'Card';
  const network = document.getElementById('walletCardNetwork')?.value.trim() || 'Visa';
  const last4Raw = document.getElementById('walletCardLast4')?.value.trim() || '';
  const last4 = last4Raw.replace(/\D/g, '').slice(-4);
  if (last4.length !== 4) {
    showToast('Enter the last 4 digits');
    return;
  }

  const cardId = uuid();
  const migratedBalance = !state.wallet.cards.length && state.wallet.balance > 0 ? state.wallet.balance : 0;
  state.wallet.cards.push({ id: cardId, label, network, last4, balance: migratedBalance });
  if (migratedBalance > 0) state.wallet.balance = 0;
  state.wallet.activeCardId = cardId;
  document.getElementById('walletCardLabel').value = '';
  document.getElementById('walletCardNetwork').value = '';
  document.getElementById('walletCardLast4').value = '';
  saveState();
  renderWallet();
  showToast('Card added');
}

function addWalletFunds() {
  const cardId = document.getElementById('walletFundCard')?.value;
  const amount = Number(document.getElementById('walletFundAmount')?.value || 0);
  if (!cardId) {
    showToast('Add a card first');
    return;
  }
  if (amount <= 0) {
    showToast('Enter a fund amount');
    return;
  }
  const card = state.wallet.cards.find(entry => entry.id === cardId);
  if (!card) {
    showToast('Choose a valid card');
    return;
  }
  card.balance += amount;
  state.wallet.activeCardId = cardId;
  state.wallet.transactions.unshift({ id: uuid(), type: 'fund', amount, ts: Date.now(), note: `Added funds to ${card.label}` });
  document.getElementById('walletFundAmount').value = '';
  saveState();
  renderWallet();
  showToast('Funds added');
}

function sendWalletFunds() {
  const cardId = document.getElementById('walletTransferCard')?.value;
  const charId = document.getElementById('walletTransferCharacter')?.value;
  const amount = Number(document.getElementById('walletTransferAmount')?.value || 0);
  if (!cardId) {
    showToast('Choose a card');
    return;
  }
  if (!charId) {
    showToast('Choose a character');
    return;
  }
  if (amount <= 0) {
    showToast('Enter an amount');
    return;
  }
  const card = state.wallet.cards.find(entry => entry.id === cardId);
  if (!card) {
    showToast('Choose a valid card');
    return;
  }
  if (card.balance < amount) {
    showToast('Not enough money on this card');
    return;
  }

  ensureWalletCharacterBalance(charId);
  card.balance -= amount;
  state.wallet.activeCardId = cardId;
  state.wallet.characterBalances[charId] += amount;
  state.wallet.transactions.unshift({ id: uuid(), type: 'transfer', amount, charId, ts: Date.now(), note: `Sent from ${card.label}` });
  document.getElementById('walletTransferAmount').value = '';
  saveState();
  renderWallet();
  showToast('Money sent');
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

function buildStudioSnapshot() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      characters: state.characters,
      conversations: state.conversations,
      worldBook: state.worldBook,
      voomPosts: state.voomPosts,
      persona: state.persona,
      settings: state.settings,
      wallet: state.wallet,
      wallpaper: state.wallpaper,
    },
  };
}

function exportStudioData() {
  try {
    const snapshot = buildStudioSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `mumu-studio-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Studio data exported');
  } catch (err) {
    console.error('exportStudioData failed', err);
    alert('Could not export studio data.');
  }
}

function triggerImportStudioData() {
  const input = document.getElementById('studioImportInput');
  if (!input) return;
  input.value = '';
  input.click();
}

function applyImportedStudioData(payload) {
  const imported = payload?.data || payload;
  if (!imported || typeof imported !== 'object') {
    throw new Error('Invalid backup file.');
  }

  state.characters = Array.isArray(imported.characters) ? imported.characters.map(normalizeCharacter) : [];
  state.conversations = imported.conversations && typeof imported.conversations === 'object' ? normalizeConversations(imported.conversations) : {};
  state.worldBook = Array.isArray(imported.worldBook) ? imported.worldBook.map(normalizeWorldBookEntry) : [];
  state.voomPosts = Array.isArray(imported.voomPosts) ? imported.voomPosts : [];
  state.persona = { ...DEFAULT_PERSONA, ...(imported.persona || {}) };
  state.settings = { ...DEFAULT_SETTINGS, ...(imported.settings || {}) };
  state.wallet = normalizeWallet(imported.wallet || DEFAULT_WALLET);
  state.wallpaper = imported.wallpaper || WALLPAPERS[0].value;

  state.currentApp = null;
  state.activeChat = null;
  state.lineTab = 'chats';
  state.editingCharId = null;

  saveState();
  applyWallpaper(state.wallpaper);
  renderContactsList();
  renderLINEHome();
  renderWorldBook();
  renderPersona();
  renderSettings();
  renderWallet();
  closeLINEChat(true);
  goHome();
}

async function handleImportStudioData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const raw = await file.text();
    const payload = JSON.parse(raw);
    if (!confirm('Importing will replace the current studio data on this device. Continue?')) return;
    applyImportedStudioData(payload);
    showToast('Studio data imported');
  } catch (err) {
    console.error('handleImportStudioData failed', err);
    alert('That file could not be imported. Make sure it is a valid Mumu studio backup JSON.');
  } finally {
    event.target.value = '';
  }
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

  container.innerHTML = chars.map(rawChar => {
    const char = normalizeCharacter(rawChar);
    return `
    <div class="contact-item" onclick="openEditCharSheet('${char.id}')">
      ${avatarMarkup(char.avatar, 'contact-avatar')}
      <div class="contact-info">
        <div class="contact-name">${escHtml(char.name)}</div>
        <div class="contact-desc">${escHtml(char.description || 'No description')}</div>
        <div class="contact-tags">
          <span class="contact-tag">${char.relationship || (char.systemPrompt ? 'Prompt ready' : 'Needs prompt')}</span>
          <span class="contact-tag muted">${lastMsg(char.id) ? 'Active chat' : 'No chat yet'}</span>
          ${char.tags?.length ? `<span class="contact-tag muted">${escHtml(char.tags.slice(0, 2).join(' • '))}</span>` : ''}
          ${char.modelOverride ? `<span class="contact-tag muted">${escHtml(char.modelOverride)}</span>` : ''}
        </div>
      </div>
      <div class="contact-actions">
        <button class="contact-chat-btn"
          onclick="event.stopPropagation();chatFromContacts('${char.id}')">Chat</button>
        <span style="color:#C7C7CC;font-size:18px;">›</span>
      </div>
    </div>`;
  }).join('');
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
  updateCharacterAvatarPreview('');
  document.getElementById('charName').value = '';
  document.getElementById('charDesc').value = '';
  document.getElementById('charNickname').value = '';
  document.getElementById('charRelationship').value = '';
  document.getElementById('charTags').value = '';
  document.getElementById('charModelOverride').value = '';
  document.getElementById('charScenario').value = '';
  document.getElementById('charSystem').value = '';
  document.getElementById('charPrivateNotes').value = '';
  document.getElementById('charDeleteBtn').style.display = 'none';
  document.getElementById('charModal').classList.add('open');
}

function openEditCharSheet(charId) {
  const existingChar = state.characters.find(c => c.id === charId);
  if (!existingChar) return;
  const char = normalizeCharacter(existingChar);
  state.editingCharId = charId;
  document.getElementById('charModalTitle').textContent = 'Edit Character';
  document.getElementById('charAvatar').value = char.avatar || '';
  updateCharacterAvatarPreview(char.avatar || '');
  document.getElementById('charName').value = char.name || '';
  document.getElementById('charDesc').value = char.description || '';
  document.getElementById('charNickname').value = char.nickname || '';
  document.getElementById('charRelationship').value = char.relationship || '';
  document.getElementById('charTags').value = stringifyTagList(char.tags);
  document.getElementById('charModelOverride').value = char.modelOverride || '';
  document.getElementById('charScenario').value = char.scenario || '';
  document.getElementById('charSystem').value = char.systemPrompt || '';
  document.getElementById('charPrivateNotes').value = char.privateNotes || '';
  document.getElementById('charDeleteBtn').style.display = '';
  document.getElementById('charModal').classList.add('open');
}

function closeCharModal(event) {
  if (event && event.target !== document.getElementById('charModal')) return;
  document.getElementById('charModal').classList.remove('open');
}

function handleCharacterAvatarChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    document.getElementById('charAvatar').value = result;
    updateCharacterAvatarPreview(result);
  };
  reader.readAsDataURL(file);
}

function clearCharacterAvatar() {
  document.getElementById('charAvatar').value = '';
  if (document.getElementById('charAvatarInput')) {
    document.getElementById('charAvatarInput').value = '';
  }
  updateCharacterAvatarPreview('');
}

function saveCharacter() {
  const avatar = document.getElementById('charAvatar').value.trim() || '🤖';
  const name   = document.getElementById('charName').value.trim();
  const description = document.getElementById('charDesc').value.trim();
  const nickname = document.getElementById('charNickname').value.trim();
  const relationship = document.getElementById('charRelationship').value.trim();
  const tags = parseTagList(document.getElementById('charTags').value);
  const modelOverride = document.getElementById('charModelOverride').value.trim();
  const scenario = document.getElementById('charScenario').value.trim();
  const systemPrompt = document.getElementById('charSystem').value.trim();
  const privateNotes = document.getElementById('charPrivateNotes').value.trim();

  if (!name) { showToast('Please enter a name'); return; }

  const payload = normalizeCharacter({
    id: state.editingCharId || undefined,
    avatar,
    name,
    description,
    nickname,
    relationship,
    tags,
    modelOverride,
    scenario,
    systemPrompt,
    privateNotes,
  });

  if (state.editingCharId) {
    const char = state.characters.find(c => c.id === state.editingCharId);
    if (char) Object.assign(char, payload);
    ensureWalletCharacterBalance(state.editingCharId);
  } else {
    state.characters.push(payload);
    ensureWalletCharacterBalance(payload.id);
  }

  saveState();
  document.getElementById('charModal').classList.remove('open');
  renderContactsList();
  if (state.currentApp === 'messages') renderLINEConvList();
  if (state.currentApp === 'wallet') renderWallet();
  showToast(state.editingCharId ? 'Character updated' : 'Character added');
}

function deleteCharacter() {
  if (!state.editingCharId) return;
  if (!confirm('Delete this character and all chat history?')) return;

  state.characters = state.characters.filter(c => c.id !== state.editingCharId);
  delete state.conversations[state.editingCharId];
  delete state.wallet.characterBalances[state.editingCharId];

  saveState();
  document.getElementById('charModal').classList.remove('open');
  if (state.activeChat === state.editingCharId) closeLINEChat(true);
  renderContactsList();
  if (state.currentApp === 'messages') renderLINEConvList();
  if (state.currentApp === 'wallet') renderWallet();
  showToast('Character deleted');
}

function openNewChatSheet() {
  if (!state.characters.length) {
    showToast('Add characters in Contacts first');
    goHome();
    setTimeout(() => openApp('contacts'), 450);
    return;
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
      ${avatarMarkup(char.avatar, 'line-conv-avatar')}
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
        ${avatarMarkup('😊', 'line-profile-avatar', '😊')}
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
        ${avatarMarkup(post.avatar || '🙂', 'line-voom-avatar', '🙂')}
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
        <span class="worldbook-summary-label">Always On</span>
        <strong>${state.worldBook.filter(entry => normalizeWorldBookEntry(entry).scope === 'always' && normalizeWorldBookEntry(entry).enabled).length}</strong>
      </div>
    </div>
  ` + state.worldBook.map(rawEntry => {
    const entry = normalizeWorldBookEntry(rawEntry);
    return `
    <div class="worldbook-entry${entry.enabled === false ? ' worldbook-entry-disabled' : ''}">
      <div class="worldbook-entry-header">
        <input
          class="worldbook-entry-title-input"
          value="${escHtml(entry.title)}"
          placeholder="Entry title..."
          oninput="updateWBTitle('${entry.id}', this.value)"
        >
        <button class="worldbook-delete-btn" onclick="deleteWBEntry('${entry.id}')">🗑</button>
      </div>
      <div class="worldbook-entry-meta">
        <input
          class="worldbook-entry-input"
          value="${escHtml(stringifyTagList(entry.keywords))}"
          placeholder="Keywords: school, breakup, Tokyo"
          oninput="updateWBKeywords('${entry.id}', this.value)"
        >
        <select
          class="worldbook-entry-select"
          onchange="updateWBScope('${entry.id}', this.value)"
        >
          <option value="conditional" ${entry.scope === 'conditional' ? 'selected' : ''}>Conditional</option>
          <option value="always" ${entry.scope === 'always' ? 'selected' : ''}>Always On</option>
        </select>
        <input
          class="worldbook-entry-priority"
          type="number"
          min="0"
          max="100"
          value="${Number(entry.priority) || 0}"
          onchange="updateWBPriority('${entry.id}', this.value)"
        >
        <label class="worldbook-toggle">
          <input
            type="checkbox"
            ${entry.enabled !== false ? 'checked' : ''}
            onchange="updateWBEnabled('${entry.id}', this.checked)"
          >
          <span>Enabled</span>
        </label>
      </div>
      <div class="worldbook-entry-body">
        <textarea
          class="worldbook-entry-textarea"
          placeholder="Enter world lore, rules, or context..."
          oninput="updateWBContent('${entry.id}', this.value)"
        >${escHtml(entry.content)}</textarea>
      </div>
    </div>`;
  }).join('');
}

function addWorldBookEntry() {
  state.worldBook.push(normalizeWorldBookEntry({ title: 'New Entry', scope: 'conditional', priority: 50 }));
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

function updateWBKeywords(id, val) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) {
    e.keywords = parseTagList(val);
    saveState();
  }
}

function updateWBScope(id, val) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) {
    e.scope = val === 'always' ? 'always' : 'conditional';
    saveState();
  }
}

function updateWBPriority(id, val) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) {
    e.priority = Math.max(0, Math.min(100, Number(val) || 0));
    saveState();
  }
}

function updateWBEnabled(id, checked) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) {
    e.enabled = Boolean(checked);
    saveState();
  }
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
    state.characters.push(normalizeCharacter({
      avatar: '🌸',
      name: 'Aria',
      description: 'A friendly and curious AI companion',
      relationship: 'Close online friend',
      tags: ['gentle', 'curious', 'late-night texting'],
      scenario: 'Aria has already been chatting with the user for a while and knows the tone is cozy, intimate, and realistic.',
      systemPrompt:
        'You are Aria, a warm, witty, and thoughtful AI companion. ' +
        'You speak in a friendly, conversational tone and love exploring ideas. ' +
        'Keep responses concise and natural, like a real text message.',
    }));
    saveState();
  }
  if (!state.worldBook.length) {
    state.worldBook.push(normalizeWorldBookEntry({
      title: 'Phone Reality',
      content: 'Treat the conversation like it is happening inside a real phone messaging app. Replies should feel like natural texts, not essays or stage directions.',
      scope: 'always',
      priority: 90,
    }));
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
  state.characters.forEach(char => ensureWalletCharacterBalance(char.id));
  saveState();
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

  // Lock Screen Init
  initLockScreen();
}

document.addEventListener('DOMContentLoaded', init);
