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
  editingCharId: null,
  viewingCharacterId: null,
  settingsCharId: null,
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
    provider: 'anthropic',     // 'anthropic' | 'openai' | 'google' | 'groq' | 'custom'
    baseUrl: '',               // only used for 'custom'
    apiKey: '',
    model: 'claude-sonnet-4-6',
    minimaxApiKey: '',
    minimaxVoiceModel: 'speech-2.8-turbo',
    userName: 'You',
    memoryNote: '',
    notificationsEnabled: true,
  },
  wallet: {
    balance: 120,
    cards: [],
    activeCardId: '',
    characterBalances: {},
    transactions: [],
  },
  wallpaper: null,             // CSS background value
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
  google: {
    label: 'Google AI Studio (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    format: 'openai',
    auth: 'bearer',
    defaultModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
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
  minimaxApiKey: '',
  minimaxVoiceModel: 'speech-2.8-turbo',
  userName: 'You',
  memoryNote: '',
  notificationsEnabled: true,
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

const HIDDEN_REALISM_PROMPTS = [
  'This is a natural one-to-one phone conversation.',
  'Stay fully in character unless the user explicitly asks a meta question about the app, model, or system.',
  'Write like a real text message: concise by default, natural phrasing, contractions, and normal human rhythm.',
  'Avoid assistant tone, customer-support language, excessive reassurance, and essay-like replies.',
  'Use plain chat formatting unless the user explicitly asks for something different.',
  'Maintain continuity with the relationship, scenario, world facts, and prior conversation.',
  'If an image is attached, respond only to what is reasonably visible and be honest about uncertainty.',
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

function parseLineList(raw) {
  if (Array.isArray(raw)) {
    return raw.map(line => String(line).trim()).filter(Boolean);
  }
  return String(raw || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
}

function stringifyLineList(lines) {
  return parseLineList(lines).join('\n');
}

function normalizeCharacter(raw = {}) {
  const rawTemperature = raw.temperature;
  const temperature = rawTemperature === '' || rawTemperature === null || rawTemperature === undefined
    ? ''
    : Math.max(0, Math.min(2, Number(rawTemperature) || 0));
  const autoMessageIntervalMinutes = Math.max(0, Number(raw.autoMessageIntervalMinutes) || 0);
  const historyMessageCount = Math.max(1, Math.min(50, Number(raw.historyMessageCount) || 12));
  const minimaxVoiceSpeed = Math.max(0.5, Math.min(2, Number(raw.minimaxVoiceSpeed) || 1));
  const autoVoiceChance = Math.max(0, Math.min(100, Number(raw.autoVoiceChance) || 20));
  return {
    id: raw.id || uuid(),
    avatar: raw.avatar || '🤖',
    name: raw.name || 'Untitled',
    description: raw.description || '',
    nickname: raw.nickname || '',
    relationship: raw.relationship || '',
    tags: parseTagList(raw.tags),
    modelOverride: raw.modelOverride || '',
    temperature,
    scenario: raw.scenario || '',
    systemPrompt: raw.systemPrompt || '',
    privateNotes: raw.privateNotes || '',
    autoMessageEnabled: raw.autoMessageEnabled === true,
    autoMessageIntervalMinutes,
    lastAutoMessageAt: Number(raw.lastAutoMessageAt) || 0,
    openingLines: parseLineList(raw.openingLines),
    historyMessageCount,
    mountedWorldBookCategories: parseTagList(raw.mountedWorldBookCategories),
    minimaxVoiceId: raw.minimaxVoiceId || '',
    minimaxVoiceSpeed,
    minimaxLanguage: raw.minimaxLanguage || 'auto',
    autoVoiceEnabled: raw.autoVoiceEnabled === true,
    autoVoiceChance,
    closeness: Math.max(0, Math.min(100, Number(raw.closeness) || 50)),
    mood: raw.mood || '',
    availability: ['available', 'busy', 'offline'].includes(raw.availability) ? raw.availability : 'available',
    anniversaryDate: raw.anniversaryDate || '',
    recurringCheckInDays: Math.max(0, Number(raw.recurringCheckInDays) || 0),
    scheduledMomentTitle: raw.scheduledMomentTitle || '',
    scheduledMomentAt: raw.scheduledMomentAt || '',
    profileNote: raw.profileNote || '',
  };
}

function normalizeWorldBookEntry(raw = {}) {
  return {
    id: raw.id || uuid(),
    title: raw.title || 'New Entry',
    content: raw.content || '',
    category: raw.category || '',
    keywords: parseTagList(raw.keywords),
    priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 50,
    scope: raw.scope === 'always' ? 'always' : 'conditional',
    enabled: raw.enabled !== false,
  };
}

function normalizeMessageAttachment(raw = {}) {
  const type = raw.type === 'audio' ? 'audio' : 'image';
  const audioUrl = raw.audioUrl || raw.audio_url || raw.url || '';
  return {
    id: raw.id || uuid(),
    type,
    url: audioUrl,
    audioUrl,
    mimeType: raw.mimeType || (type === 'audio' ? 'audio/mpeg' : 'image/jpeg'),
    name: raw.name || (type === 'audio' ? 'audio' : 'image'),
    spokenLanguage: raw.spokenLanguage || raw.spoken_language || '',
    translationEn: raw.translationEn || raw.translation_en || '',
    translationRevealed: raw.translationRevealed === true,
    translationStatus: raw.translationStatus || raw.translation_status || (type === 'audio' ? 'hidden' : ''),
    displayStyle: raw.displayStyle || '',
    sourceText: raw.sourceText || raw.source_text || '',
  };
}

function getCharacterVoiceLanguageLabel(char) {
  const raw = String(char?.minimaxLanguage || '').trim();
  if (!raw || raw.toLowerCase() === 'auto') return 'Japanese';
  return raw;
}

function cleanVoiceTranslationText(text) {
  return String(text || '')
    .trim()
    .replace(/^["“”'`]+|["“”'`]+$/g, '')
    .trim();
}

function containsCJKText(text) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(String(text || ''));
}

function normalizeConversationMessage(raw = {}) {
  return {
    id: raw.id || uuid(),
    role: raw.role === 'assistant' ? 'assistant' : 'user',
    content: raw.content || '',
    ts: raw.ts || Date.now(),
    read: raw.read === true,
    favorite: raw.favorite === true,
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
    cardId: tx.cardId || '',
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

  document.querySelectorAll('.wallet-card').forEach(cardEl => {
    cardEl.classList.toggle('is-active', cardEl.dataset.cardId === state.wallet.activeCardId);
  });
  renderWalletCardDots(state.wallet.cards.length, getWalletActiveCardIndex());
  renderWalletDetailPanels();
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

function escJs(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

function showPushNotification({ title, body = '', charId = '', avatar = '💬' }) {
  if (!state.settings.notificationsEnabled) return;
  const container = document.getElementById('notificationContainer');
  if (!container) return;

  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'push-notification';
  item.innerHTML = `
    <div class="push-notification-app">Messages</div>
    <div class="push-notification-main">
      ${avatarMarkup(avatar, 'push-notification-avatar', '💬')}
      <div class="push-notification-copy">
        <div class="push-notification-title">${escHtml(title)}</div>
        <div class="push-notification-body">${escHtml(body || 'New message')}</div>
      </div>
    </div>
  `;
  item.onclick = () => {
    container.removeChild(item);
    goHome();
    setTimeout(() => {
      openApp('messages');
      if (charId) {
        setTimeout(() => openLINEChat(charId), 120);
      }
    }, 120);
  };

  container.appendChild(item);
  requestAnimationFrame(() => item.classList.add('show'));
  setTimeout(() => {
    item.classList.remove('show');
    setTimeout(() => item.remove(), 220);
  }, 4200);
}

function formatRelativeTime(ts) {
  if (!ts) return 'No activity yet';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatCalendarDate(value) {
  if (!value) return 'Not set';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function getCharacterLastSeen(charId) {
  return lastMsg(charId)?.ts || 0;
}

function getAvailabilityLabel(value) {
  const map = {
    available: 'Available',
    busy: 'Busy',
    offline: 'Offline',
  };
  return map[value] || 'Available';
}

function getFavoriteMessages() {
  return state.characters.flatMap(char => {
    const messages = state.conversations[char.id] || [];
    return messages
      .filter(msg => msg.favorite)
      .map(msg => ({ ...msg, charId: char.id, charName: char.name, charAvatar: char.avatar }));
  }).sort((a, b) => b.ts - a.ts);
}

function toggleFavoriteMessage(charId, msgId) {
  const messages = state.conversations[charId] || [];
  const message = messages.find(entry => entry.id === msgId);
  if (!message) return;
  message.favorite = !message.favorite;
  saveState();
  renderLINEMessages();
  if (state.currentApp === 'memory') renderMemoryViewer();
  showToast(message.favorite ? 'Saved to favorites' : 'Removed from favorites');
}

function getMessageCountByRole(charId, role) {
  return (state.conversations[charId] || []).filter(msg => msg.role === role).length;
}

function getCharacterImageGallery(charId) {
  const char = state.characters.find(entry => entry.id === charId);
  const chatImages = (state.conversations[charId] || []).flatMap(msg =>
    (msg.attachments || [])
      .filter(att => att.type === 'image' && att.url)
      .map(att => ({ url: att.url, ts: msg.ts, source: 'Chat' }))
  );
  const voomImages = state.voomPosts
    .filter(post => (post.authorId === charId || (char && post.authorName === char.name)) && post.image)
    .map(post => ({ url: post.image, ts: post.ts, source: 'VOOM' }));
  return [...chatImages, ...voomImages].sort((a, b) => b.ts - a.ts);
}

function getCharacterUpcomingEvents(char) {
  const events = [];
  if (char.anniversaryDate) {
    events.push({ label: 'Anniversary', value: formatCalendarDate(char.anniversaryDate) });
  }
  if (char.scheduledMomentTitle || char.scheduledMomentAt) {
    events.push({
      label: char.scheduledMomentTitle || 'Scheduled moment',
      value: char.scheduledMomentAt ? formatCalendarDate(char.scheduledMomentAt) : 'No date set',
    });
  }
  if (char.recurringCheckInDays > 0) {
    events.push({ label: 'Recurring check-in', value: `Every ${char.recurringCheckInDays} day${char.recurringCheckInDays === 1 ? '' : 's'}` });
  }
  return events;
}

function openMemoryViewer() {
  goHome();
  setTimeout(() => openApp('memory'), 120);
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
  document.getElementById('statusTime').textContent =
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
  if (name === 'memory') renderMemoryViewer();
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
    const unreadCount = getUnreadAssistantCount(char.id);
    const preview = last ? getConversationPreviewText(last) : 'Tap to chat';
    const timeStr = last ? formatShortTime(last.ts) : '';
    return `
      <div class="line-conv-item" onclick="openLINEChat('${char.id}')">
        ${avatarMarkup(char.avatar, 'line-conv-avatar')}
        <div class="line-conv-info">
          <div class="line-conv-top">
            <span class="line-conv-name">${escHtml(char.name)}</span>
            <span class="line-conv-time ${unreadCount ? 'has-unread' : ''}">${escHtml(timeStr)}</span>
          </div>
          <div class="line-conv-bottom">
            <div class="line-conv-preview ${unreadCount ? 'has-unread' : ''}">${escHtml(preview)}</div>
            ${unreadCount ? `<span class="line-conv-badge">${unreadCount}</span>` : ''}
          </div>
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

function getConversationPreviewText(message) {
  if (!message) return '';
  if (message.content) {
    return `${message.role === 'user' ? 'You: ' : ''}${message.content.slice(0, 50)}`;
  }
  const audioAttachment = (message.attachments || []).find(att => att.type === 'audio');
  if (audioAttachment) return `${message.role === 'user' ? 'You: ' : ''}Voice message`;
  if ((message.attachments || []).some(att => att.type === 'image')) {
    return `${message.role === 'user' ? 'You: ' : ''}Photo`;
  }
  return 'Message';
}

function getUnreadAssistantCount(charId) {
  const msgs = state.conversations[charId] || [];
  return msgs.filter(msg => msg.role === 'assistant' && !msg.read).length;
}

function markAssistantMessagesRead(charId) {
  const msgs = state.conversations[charId] || [];
  let changed = false;
  msgs.forEach(msg => {
    if (msg.role === 'assistant' && !msg.read) {
      msg.read = true;
      changed = true;
    }
  });
  if (changed) saveState();
}

// ============================================================
// LINE — Chat View
// ============================================================

function openLINEChat(charId) {
  const char = state.characters.find(c => c.id === charId);
  if (!char) return;
  const normalized = normalizeCharacter(char);

  state.activeChat = charId;
  state.pendingLineAttachments = [];
  markAssistantMessagesRead(charId);

  document.getElementById('lineChatName').textContent = normalized.name;
  document.getElementById('lineChatSub').textContent = normalized.description ? `📍 ${normalized.description}` : '📍 Mobile';

  const chat = document.getElementById('lineChat');
  const home = document.getElementById('lineHome');
  chat.classList.add('open');
  home.classList.add('hidden');

  renderLINEMessages();
  renderLineAttachmentPreview();
  updateLineVoiceNoteButton();
  updateLineRetryButton();
  maybeSendCharacterOpeningLines(charId);
  setTimeout(() => document.getElementById('lineInput').focus(), 350);
}

function closeLINEChat(silent = false) {
  state.activeChat = null;
  state.pendingLineAttachments = [];
  closeLineChatMenu();
  document.getElementById('lineChat').classList.remove('open');
  document.getElementById('lineHome').classList.remove('hidden');
  const input = document.getElementById('lineInput');
  input.value = '';
  input.style.height = 'auto';
  renderLineAttachmentPreview();
  updateLineSendBtn();
  updateLineRetryButton();
  if (!silent) renderLINEConvList();
}

function openCharDetailFromChat() {
  if (state.activeChat) openEditCharSheet(state.activeChat);
}

function openLineChatMenu() {
  if (!state.activeChat) return;
  document.getElementById('lineChatMenuModal')?.classList.add('open');
}

function closeLineChatMenu(event) {
  if (event && event.target !== document.getElementById('lineChatMenuModal')) return;
  document.getElementById('lineChatMenuModal')?.classList.remove('open');
}

function openCharacterSettingsFromMenu() {
  const charId = state.activeChat;
  closeLineChatMenu();
  if (!charId) return;
  setTimeout(() => openCharacterSettings(charId), 120);
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
    updateLineRetryButton();
    return;
  }

  let html = '';
  msgs.forEach((msg, i) => {
    html += renderLINEMessageHtml(msg, msgs[i - 1], char, i, msgs.length, state.activeChat);
  });

  area.innerHTML = html;
  scrollLineMessagesToBottom();
  updateLineRetryButton();
}

function renderLINEMessageHtml(msg, prevMsg, char, index, total, charId) {
  const isSent = msg.role === 'user';
  const timeStr = formatMsgTime(msg.ts);
  const showAvatar = !isSent && (!prevMsg || prevMsg.role === 'user');
  let html = '';

  if (isDifferentDay(prevMsg?.ts, msg.ts)) {
    html += `<div class="line-date-sep">${escHtml(formatDateSep(msg.ts))}</div>`;
  }

  if (isSent) {
    const isRead = index < total - 1 || msg.read;
    html += `
      <div class="line-msg-row sent" data-message-id="${escHtml(msg.id)}">
        <div class="line-msg-meta">
          <button class="line-favorite-btn ${msg.favorite ? 'is-active' : ''}" type="button" aria-label="Save message" onclick="toggleFavoriteMessage('${charId}', '${msg.id}')">★</button>
          ${isRead ? '<span class="line-read">Read</span>' : ''}
          <span class="line-time">${escHtml(timeStr)}</span>
        </div>
        <div class="line-bubble-wrap">
          <div class="line-bubble sent">${renderMessageInner(msg, charId)}</div>
        </div>
      </div>`;
    return html;
  }

  html += `
    <div class="line-msg-row received" data-message-id="${escHtml(msg.id)}">
      ${showAvatar
        ? avatarMarkup(char?.avatar, 'line-msg-avatar')
        : `<div class="line-msg-avatar-spacer"></div>`}
      <div class="line-bubble-wrap">
        <div class="line-bubble received">${renderMessageInner(msg, charId)}</div>
        <div class="line-msg-meta">
          <button class="line-favorite-btn ${msg.favorite ? 'is-active' : ''}" type="button" aria-label="Save message" onclick="toggleFavoriteMessage('${charId}', '${msg.id}')">★</button>
          <span class="line-time">${escHtml(timeStr)}</span>
        </div>
      </div>
    </div>`;
  return html;
}

function scrollLineMessagesToBottom() {
  const area = document.getElementById('lineMessagesArea');
  if (!area) return;
  area.scrollTop = area.scrollHeight;
}

function appendLINEMessageToDOM(charId, msg, prevMsg) {
  const area = document.getElementById('lineMessagesArea');
  if (!area) return;

  const char = state.characters.find(c => c.id === charId);
  const isEmptyState = area.querySelector('.line-chat-empty-avatar');
  if (isEmptyState) {
    area.innerHTML = '';
  }

  const messages = state.conversations[charId] || [];
  const html = renderLINEMessageHtml(msg, prevMsg, char, messages.length - 1, messages.length, charId);
  area.insertAdjacentHTML('beforeend', html);
  scrollLineMessagesToBottom();
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

function splitAssistantReplyIntoMessages(content) {
  const raw = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [''];

  const paragraphChunks = raw
    .split(/\n{2,}/)
    .map(chunk => chunk.trim())
    .filter(Boolean);

  const chunks = paragraphChunks.length ? paragraphChunks : [raw];
  const normalized = [];

  chunks.forEach(chunk => {
    // If the model returns several short single-line texts, keep them as separate bubbles.
    const lines = chunk
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length > 1) {
      normalized.push(...lines);
      return;
    }

    const candidateParts = (chunk.match(/[^.!?…]+[.!?…]+["')\]]*|[^.!?…]+$/g) || [chunk])
      .map(sentence => sentence.trim())
      .filter(Boolean);

    const shortChatLike = candidateParts.length > 1
      && candidateParts.length <= 8
      && candidateParts.every(part => part.length <= 120);

    if (shortChatLike) {
      normalized.push(...candidateParts);
      return;
    }

    normalized.push(chunk);
  });

  return normalized.length ? normalized : [raw];
}

function appendAssistantReplyMessages(charId, content, { read = false } = {}) {
  if (!state.conversations[charId]) {
    state.conversations[charId] = [];
  }

  const parts = splitAssistantReplyIntoMessages(content);
  const baseTs = Date.now();
  const created = parts.map((part, index) => {
    const msg = normalizeConversationMessage({
      role: 'assistant',
      content: part,
      ts: baseTs + index,
      read,
    });
    state.conversations[charId].push(msg);
    return msg;
  });

  saveState();
  return created;
}

function appendSingleAssistantMessage(charId, content, { read = false, attachments = [] } = {}) {
  if (!state.conversations[charId]) {
    state.conversations[charId] = [];
  }
  const msg = normalizeConversationMessage({
    role: 'assistant',
    content,
    ts: Date.now(),
    read,
    attachments,
  });
  state.conversations[charId].push(msg);
  saveState();
  return msg;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function getAssistantChunkDelay(part) {
  const text = String(part || '').trim();
  if (!text) return 520;
  const base = 420 + Math.min(text.length * 16, 680);
  return Math.max(520, Math.min(1100, base));
}

async function deliverAssistantReply(charId, content, { read = false, staged = false } = {}) {
  const parts = splitAssistantReplyIntoMessages(content);
  if (!parts.length) return [];
  const liveChatOpen = state.currentApp === 'messages' && state.activeChat === charId;

  if (!staged || parts.length === 1) {
    return appendAssistantReplyMessages(charId, content, { read });
  }

  if (!state.conversations[charId]) {
    state.conversations[charId] = [];
  }

  const created = [];
  for (let index = 0; index < parts.length; index += 1) {
    if (index > 0) {
      if (liveChatOpen) {
        showTypingIndicator();
        await nextFrame();
        await nextFrame();
      }
      await wait(getAssistantChunkDelay(parts[index]));
      if (liveChatOpen) {
        removeTypingIndicator();
        await nextFrame();
      }
    }

    const prevMsg = state.conversations[charId][state.conversations[charId].length - 1] || null;
    const msg = normalizeConversationMessage({
      role: 'assistant',
      content: parts[index],
      ts: Date.now() + index,
      read,
    });
    state.conversations[charId].push(msg);
    created.push(msg);
    saveState();
    if (liveChatOpen) {
      appendLINEMessageToDOM(charId, msg, prevMsg);
      await nextFrame();
    }
  }

  if (liveChatOpen) {
    removeTypingIndicator();
    renderLINEMessages();
    await nextFrame();
  }

  return created;
}

function renderVoiceTranslationContainerId(msgId, attachmentId) {
  return `voice-translation-${msgId}-${attachmentId}`;
}

function renderVoiceTranslationHtml(att) {
  if (!att.translationRevealed || !att.translationEn) return '';
  const language = escHtml(att.spokenLanguage || 'Japanese');
  return `
    <div class="line-msg-translation-strip">
      <div class="line-msg-translation-label">Translated from ${language}</div>
      <div class="line-msg-translation-text">${escHtml(att.translationEn)}</div>
    </div>
  `;
}

function revealVoiceTranslation(charId, msgId, attachmentId) {
  const messages = state.conversations[charId] || [];
  const msg = messages.find(entry => entry.id === msgId);
  const attachment = msg?.attachments?.find(entry => entry.id === attachmentId);
  if (!attachment || attachment.translationRevealed || !attachment.translationEn) return;

  attachment.translationRevealed = true;
  attachment.translationStatus = 'revealed';
  saveState();

  const container = document.getElementById(renderVoiceTranslationContainerId(msgId, attachmentId));
  if (container) {
    container.innerHTML = renderVoiceTranslationHtml(attachment);
    container.classList.remove('is-hidden');
  }
}

function renderMessageInner(msg, charId) {
  const attachments = msg.attachments || [];
  const images = attachments
    .filter(att => att.type === 'image' && att.url)
    .map(att => `<img class="line-msg-image" src="${escHtml(att.url)}" alt="${escHtml(att.name || 'Photo')}">`)
    .join('');
  const audio = attachments
    .filter(att => att.type === 'audio' && att.url)
    .map(att => `
      <div class="line-msg-audio-card">
        <div class="line-msg-audio-label">${escHtml(att.name || 'Voice message')}${att.spokenLanguage ? ` • ${escHtml(att.spokenLanguage)}` : ''}</div>
        <audio
          class="line-msg-audio"
          controls
          preload="metadata"
          src="${escHtml(att.url)}"
          onplay="revealVoiceTranslation('${escJs(charId)}', '${escJs(msg.id)}', '${escJs(att.id)}')"></audio>
        <div
          class="line-msg-translation-slot ${att.translationRevealed ? '' : 'is-hidden'}"
          id="${escHtml(renderVoiceTranslationContainerId(msg.id, att.id))}">${renderVoiceTranslationHtml(att)}</div>
      </div>`)
    .join('');
  const hasVoiceNoteCard = attachments.some(att => att.type === 'audio' && att.displayStyle === 'voice-note');
  const text = msg.content && !hasVoiceNoteCard ? `<div class="line-msg-text">${escHtml(msg.content)}</div>` : '';
  return `${images}${audio}${text}`;
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
  if (document.getElementById('typingRow')) return;
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
  scrollLineMessagesToBottom();
}

function removeTypingIndicator() {
  document.getElementById('typingRow')?.remove();
}

// ============================================================
// Send Message + API
// ============================================================

let isSending = false;
let proactiveMessageInFlight = false;
let proactiveMessageTimer = null;

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
  updateLineVoiceNoteButton();
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
    const shouldStage = state.currentApp === 'messages' && state.activeChat;
    await deliverCharacterResponse(state.activeChat, reply, { read: true, staged: shouldStage });
    if (state.currentApp !== 'messages') {
      const char = state.characters.find(entry => entry.id === state.activeChat);
      const preview = splitAssistantReplyIntoMessages(reply)[0] || reply;
      showPushNotification({
        title: char?.name || 'New message',
        body: preview || 'Sent you a message',
        charId: state.activeChat,
        avatar: char?.avatar || '💬',
      });
    }
  } catch (err) {
    removeTypingIndicator();
    await showApiError(err);
  }

  isSending = false;
  updateLineSendBtn();
  updateLineVoiceNoteButton();
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

function updateLineVoiceNoteButton() {
  const btn = document.getElementById('lineVoiceNoteBtn');
  if (!btn) return;
  const char = state.characters.find(entry => entry.id === state.activeChat);
  const configured = !!normalizeCharacter(char || {}).minimaxVoiceId;
  btn.disabled = !state.activeChat || isSending;
  btn.classList.toggle('is-disabled', btn.disabled);
  btn.classList.toggle('is-unconfigured', !configured && !!state.activeChat);
}

function getRetryContext(charId) {
  const messages = state.conversations[charId] || [];
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex === -1) return null;
  return {
    lastUserIndex,
    trailingAssistantMessages: messages.slice(lastUserIndex + 1),
  };
}

function updateLineRetryButton() {
  const btn = document.getElementById('lineRetryBtn');
  if (!btn) return;
  const retryContext = state.activeChat ? getRetryContext(state.activeChat) : null;
  btn.disabled = !state.activeChat || isSending;
  btn.classList.toggle('is-disabled', btn.disabled);
  btn.classList.toggle('is-unconfigured', !retryContext && !!state.activeChat);
}

async function retryLastResponse() {
  if (!state.activeChat || isSending) return;
  showToast('Regenerating...');
  const retryContext = getRetryContext(state.activeChat);
  if (!retryContext) {
    showToast('Send a message first');
    return;
  }

  if (!state.settings.apiKey) {
    showToast('Add your API key in Settings first');
    closeLINEChat(true);
    goHome();
    setTimeout(() => openApp('settings'), 400);
    return;
  }

  const messages = state.conversations[state.activeChat] || [];
  const removedMessages = messages.splice(retryContext.lastUserIndex + 1);
  saveState();
  renderLINEMessages();

  isSending = true;
  updateLineSendBtn();
  updateLineVoiceNoteButton();
  updateLineRetryButton();
  showTypingIndicator();

  try {
    const reply = await callAPI(state.activeChat);
    removeTypingIndicator();
    markLastUserMsgRead();
    const shouldStage = state.currentApp === 'messages' && state.activeChat;
    await deliverCharacterResponse(state.activeChat, reply, { read: true, staged: shouldStage });
    showToast('Response regenerated');
  } catch (err) {
    removeTypingIndicator();
    if (removedMessages.length) {
      state.conversations[state.activeChat].push(...removedMessages);
      saveState();
      renderLINEMessages();
    }
    await showApiError(err);
  } finally {
    isSending = false;
    updateLineSendBtn();
    updateLineVoiceNoteButton();
    updateLineRetryButton();
  }
}

async function maybeSendCharacterOpeningLines(charId) {
  const char = state.characters.find(entry => entry.id === charId);
  const normalized = normalizeCharacter(char || {});
  if (!normalized.openingLines.length) return;
  if ((state.conversations[charId] || []).length > 0) return;
  await wait(180);
  if (state.activeChat !== charId) return;
  await deliverAssistantReply(charId, normalized.openingLines.join('\n'), {
    read: true,
    staged: true,
  });
  renderLINEConvList();
}

function hexToBase64(hex) {
  const normalized = String(hex || '').replace(/\s+/g, '');
  if (!normalized) return '';
  const chunks = [];
  for (let i = 0; i < normalized.length; i += 2) {
    chunks.push(String.fromCharCode(parseInt(normalized.slice(i, i + 2), 16)));
  }
  return btoa(chunks.join(''));
}

async function callProviderWithMessages(char, systemPrompt, messages, temperature = null) {
  const { apiKey } = state.settings;
  const model = char?.modelOverride?.trim() || state.settings.model;
  const provDef = getProviderConfig();
  const baseUrl = provDef.baseUrl;

  if (provDef.format === 'anthropic') {
    return callAnthropic(baseUrl, apiKey, model, systemPrompt, messages, provDef, temperature);
  }
  return callOpenAICompat(baseUrl, apiKey, model, systemPrompt, messages, provDef, temperature);
}

async function translateEnglishTextForVoice(charId, englishText, char) {
  const targetLanguage = getCharacterVoiceLanguageLabel(char);
  const canonicalEnglish = cleanVoiceTranslationText(englishText);
  if (!canonicalEnglish) return { spokenText: '', spokenLanguage: targetLanguage };
  if (targetLanguage.toLowerCase() === 'english') {
    return { spokenText: canonicalEnglish, spokenLanguage: 'English' };
  }

  const translationSystemPrompt = [
    'You are a translation engine for short chat voice notes.',
    `Translate the user text into natural, conversational ${targetLanguage}.`,
    'Preserve the meaning, tone, intimacy, and brevity of the original.',
    `Your entire response must be only the translated ${targetLanguage} text.`,
    'Do not answer in English.',
    'Do not explain, label, transliterate, romanize, quote, or add notes.',
  ].join('\n');

  const translated = await callProviderWithMessages(char, translationSystemPrompt, [
    normalizeConversationMessage({
      role: 'user',
      content: `Translate this into natural spoken ${targetLanguage}:\n\n${canonicalEnglish}`,
      ts: Date.now(),
      read: true,
    }),
  ], 0.2);

  const cleanedTranslation = cleanVoiceTranslationText(translated) || canonicalEnglish;
  if (targetLanguage.toLowerCase() === 'japanese' && !containsCJKText(cleanedTranslation)) {
    throw new Error('Voice translation did not return Japanese text.');
  }

  return {
    spokenText: cleanedTranslation,
    spokenLanguage: targetLanguage,
  };
}

async function createCharacterVoiceNoteAttachment(charId, englishText, char) {
  const canonicalEnglish = cleanVoiceTranslationText(englishText);
  const { spokenText, spokenLanguage } = await translateEnglishTextForVoice(charId, canonicalEnglish, char);
  const attachment = await generateMiniMaxVoiceAttachment(spokenText, char, {
    spokenLanguage,
    translationEn: canonicalEnglish,
    sourceText: spokenText,
    displayStyle: 'voice-note',
    translationRevealed: false,
    translationStatus: 'hidden',
  });
  return attachment;
}

async function generateMiniMaxVoiceAttachment(text, char, options = {}) {
  const apiKey = state.settings.minimaxApiKey?.trim();
  if (!apiKey) throw new Error('Add your MiniMax API key in Studio first.');
  if (!char?.minimaxVoiceId) throw new Error('Set a MiniMax voice ID for this character first.');

  const resp = await fetch('https://api.minimax.io/v1/t2a_v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: state.settings.minimaxVoiceModel || 'speech-2.8-turbo',
      text,
      stream: false,
      language_boost: options.spokenLanguage || getCharacterVoiceLanguageLabel(char),
      output_format: 'hex',
      voice_setting: {
        voice_id: char.minimaxVoiceId,
        speed: char.minimaxVoiceSpeed || 1,
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
    }),
  });

  const payload = await resp.json();
  if (!resp.ok || payload?.base_resp?.status_code) {
    throw new Error(payload?.base_resp?.status_msg || `MiniMax TTS failed (${resp.status})`);
  }

  const hexAudio = payload?.data?.audio || '';
  if (!hexAudio) throw new Error('MiniMax did not return audio data.');

  return normalizeMessageAttachment({
    type: 'audio',
    url: `data:audio/mpeg;base64,${hexToBase64(hexAudio)}`,
    mimeType: 'audio/mpeg',
    name: `${char.name} voice note`,
    spokenLanguage: options.spokenLanguage || '',
    translationEn: options.translationEn || '',
    translationRevealed: options.translationRevealed === true,
    translationStatus: options.translationStatus || 'hidden',
    displayStyle: options.displayStyle || 'voice-note',
    sourceText: options.sourceText || text,
  });
}

async function requestCharacterVoiceNote() {
  if (!state.activeChat || isSending) return;
  const rawChar = state.characters.find(entry => entry.id === state.activeChat);
  const char = normalizeCharacter(rawChar || {});
  if (!char.minimaxVoiceId) {
    showToast('Set a MiniMax voice ID in Character Settings first');
    return;
  }

  if (!state.settings.minimaxApiKey?.trim()) {
    showToast('Add your MiniMax API key in Studio first');
    openApp('settings');
    return;
  }

  isSending = true;
  updateLineSendBtn();
  updateLineVoiceNoteButton();
  showTypingIndicator();
  showToast('Generating voice note...');

  try {
    const reply = await callAPI(state.activeChat, { mode: 'voice_note' });
    const voiceAttachment = await createCharacterVoiceNoteAttachment(state.activeChat, reply, char);
    removeTypingIndicator();
    appendSingleAssistantMessage(state.activeChat, reply, { read: true, attachments: [voiceAttachment] });
    renderLINEMessages();
    renderLINEConvList();
    showToast('Voice note generated');
  } catch (err) {
    removeTypingIndicator();
    await showApiError(err);
  } finally {
    isSending = false;
    updateLineSendBtn();
    updateLineVoiceNoteButton();
  }
}

function shouldGenerateCharacterVoiceNote(char, text) {
  if (!char?.minimaxVoiceId) return false;
  if (!char.autoVoiceEnabled) return false;
  if (!state.settings.minimaxApiKey?.trim()) return false;

  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  if (trimmed.length > 260) return false;
  if (splitAssistantReplyIntoMessages(trimmed).length > 1) return false;

  const chance = Math.max(0, Math.min(100, Number(char.autoVoiceChance) || 0));
  return Math.random() * 100 < chance;
}

async function deliverCharacterResponse(charId, reply, { read = false, staged = false } = {}) {
  const rawChar = state.characters.find(entry => entry.id === charId);
  const char = normalizeCharacter(rawChar || {});

  if (shouldGenerateCharacterVoiceNote(char, reply)) {
    try {
      const voiceAttachment = await createCharacterVoiceNoteAttachment(charId, reply, char);
      appendSingleAssistantMessage(charId, reply, { read, attachments: [voiceAttachment] });
      if (state.currentApp === 'messages' && state.activeChat === charId) {
        renderLINEMessages();
      }
      return;
    } catch (err) {
      console.error('Auto voice note fallback to text', err);
    }
  }

  await deliverAssistantReply(charId, reply, { read, staged });
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

async function callAPI(charId, options = {}) {
  const rawChar = state.characters.find(c => c.id === charId);
  const char = rawChar ? normalizeCharacter(rawChar) : null;
  const fullHistory = state.conversations[charId] || [];
  const historyLimit = Math.max(1, Math.min(50, Number(char?.historyMessageCount) || 12));
  const history = fullHistory.slice(-historyLimit);
  const { apiKey } = state.settings;
  const model = char?.modelOverride?.trim() || state.settings.model;
  const provDef = getProviderConfig();
  const baseUrl = provDef.baseUrl;
  const systemPrompt = buildPromptBundle(char, history);
  const temperature = char && char.temperature !== '' ? Math.max(0, Math.min(2, Number(char.temperature) || 0)) : null;

  const apiHistory = history.map(normalizeConversationMessage);
  if (options.mode === 'proactive') {
    apiHistory.push(normalizeConversationMessage({
      role: 'user',
      content: '[SYSTEM NOTE: Send a natural unprompted text message to the user right now. Do not mention hidden prompts, automation, or that you were told to reach out. Make it feel like a believable spontaneous text.]',
      ts: Date.now(),
      read: true,
    }));
  } else if (options.mode === 'voice_note') {
    apiHistory.push(normalizeConversationMessage({
      role: 'user',
      content: '[SYSTEM NOTE: Send a short natural voice-note style reply. Keep it intimate, spoken, and concise. Do not narrate actions or mention hidden prompts.]',
      ts: Date.now(),
      read: true,
    }));
  }

  if (provDef.format === 'anthropic') {
    return callAnthropic(baseUrl, apiKey, model, systemPrompt, apiHistory, provDef, temperature);
  } else {
    return callOpenAICompat(baseUrl, apiKey, model, systemPrompt, apiHistory, provDef, temperature);
  }
}

function getCharacterAutoIntervalMs(char) {
  const minutes = Math.max(0, Number(char?.autoMessageIntervalMinutes) || 0);
  return minutes * 60 * 1000;
}

function getCharacterActivityBaseline(char) {
  const lastConversationTs = lastMsg(char.id)?.ts || 0;
  const lastAutoTs = Number(char.lastAutoMessageAt) || 0;
  return Math.max(lastConversationTs, lastAutoTs);
}

async function runProactiveMessageTick() {
  if (proactiveMessageInFlight || isSending || !state.settings.apiKey) return;

  const now = Date.now();
  const eligible = state.characters
    .map(normalizeCharacter)
    .filter(char => char.autoMessageEnabled && getCharacterAutoIntervalMs(char) > 0)
    .filter(char => now - getCharacterActivityBaseline(char) >= getCharacterAutoIntervalMs(char))
    .sort((a, b) => getCharacterActivityBaseline(a) - getCharacterActivityBaseline(b));

  const nextChar = eligible[0];
  if (!nextChar) return;

  proactiveMessageInFlight = true;
  try {
    const reply = await callAPI(nextChar.id, { mode: 'proactive' });
    const preview = splitAssistantReplyIntoMessages(reply)[0] || reply;
    await deliverCharacterResponse(nextChar.id, reply, {
      read: state.currentApp === 'messages' && state.activeChat === nextChar.id,
      staged: state.currentApp === 'messages' && state.activeChat === nextChar.id,
    });
    const liveChar = state.characters.find(char => char.id === nextChar.id);
    if (liveChar) liveChar.lastAutoMessageAt = Date.now();
    saveState();
    showPushNotification({
      title: nextChar.name,
      body: preview || 'Sent you a message',
      charId: nextChar.id,
      avatar: nextChar.avatar || '💬',
    });
    if (state.currentApp === 'messages') {
      renderLINEConvList();
      if (state.activeChat === nextChar.id) renderLINEMessages();
    }
  } catch (err) {
    console.error('runProactiveMessageTick failed', err);
    const liveChar = state.characters.find(char => char.id === nextChar.id);
    if (liveChar) {
      liveChar.lastAutoMessageAt = Date.now();
      saveState();
    }
  } finally {
    proactiveMessageInFlight = false;
  }
}

function startProactiveMessageScheduler() {
  if (proactiveMessageTimer) clearInterval(proactiveMessageTimer);
  proactiveMessageTimer = setInterval(runProactiveMessageTick, 15000);
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
  const mountedCategories = new Set((char?.mountedWorldBookCategories || []).map(category => category.toLowerCase()));

  return state.worldBook
    .map(normalizeWorldBookEntry)
    .filter(entry => entry.enabled && entry.content.trim())
    .filter(entry => !mountedCategories.size || mountedCategories.has(String(entry.category || '').toLowerCase()))
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
  const hiddenRealismBlock = [
    '# Hidden Runtime Rules',
    ...HIDDEN_REALISM_PROMPTS,
  ].join('\n');

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
    hiddenRealismBlock,
    personaBlock,
    personaIdentity,
    worldBlock,
    characterBlock,
    chatContext,
  ].filter(Boolean).join('\n\n---\n\n') || 'You are a helpful assistant.';
}

async function callAnthropic(baseUrl, apiKey, model, system, messages, provDef = PROVIDERS.anthropic, temperature = null) {
  const url = joinUrl(baseUrl, provDef.chatPath || '/v1/messages', provDef.chatPath || '/v1/messages');
  const body = {
    model,
    max_tokens: 1024,
    system,
    messages: messages.map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: buildAnthropicMessageContent(message),
    })),
  };
  if (temperature !== null) body.temperature = temperature;
  const resp = await requestJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(provDef.auth || 'x-api-key', apiKey),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  }, provDef);
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e?.error?.message || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.content?.[0]?.text || '';
}

async function callOpenAICompat(baseUrl, apiKey, model, system, messages, provDef = PROVIDERS.openai, temperature = null) {
  const url = joinUrl(baseUrl, provDef.chatPath || '/chat/completions', provDef.chatPath || '/chat/completions');
  const openAIMessages = [
    { role: 'system', content: system },
    ...messages.map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: buildOpenAIMessageContent(message),
    })),
  ];
  const body = { model, max_tokens: 1024, messages: openAIMessages };
  if (temperature !== null) body.temperature = temperature;
  const resp = await requestJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(provDef.auth || 'bearer', apiKey),
    },
    body: JSON.stringify(body),
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
  const minimaxKeyEl = document.getElementById('settingsMiniMaxApiKey');
  if (minimaxKeyEl) minimaxKeyEl.value = s.minimaxApiKey || '';
  const minimaxModelEl = document.getElementById('settingsMiniMaxVoiceModel');
  if (minimaxModelEl) minimaxModelEl.value = s.minimaxVoiceModel || 'speech-2.8-turbo';
  document.getElementById('settingsUserName').value = s.userName || '';
  const notificationsEl = document.getElementById('settingsNotificationsEnabled');
  if (notificationsEl) notificationsEl.checked = s.notificationsEnabled !== false;
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

  if (state.settings.provider === 'custom') {
    const customModel = state.settings.model || '';
    select.innerHTML = customModel
      ? `<option value="${escHtml(customModel)}">${escHtml(customModel)}</option>`
      : '';
    if (customModel) select.value = customModel;
    return;
  }

  select.innerHTML = models.map(m => `<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('');
  const selectedModel = models.includes(state.settings.model) ? state.settings.model : (models[0] || '');
  state.settings.model = selectedModel;
  if (selectedModel) select.value = selectedModel;
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
  const googleGroup = document.getElementById('googleProviderGroup');
  if (googleGroup) googleGroup.style.display = provider === 'google' ? '' : 'none';
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

  if (provider !== 'custom') {
    const providerModels = PROVIDERS[provider]?.defaultModels || [];
    if (!providerModels.includes(state.settings.model)) {
      state.settings.model = providerModels[0] || '';
    }
  }

  renderModelSelect();

  if (doSave) saveSettings();
}

function saveSettings() {
  state.settings.provider  = document.getElementById('settingsProvider')?.value || state.settings.provider;
  state.settings.baseUrl   = document.getElementById('settingsBaseUrl')?.value?.trim() || '';
  state.settings.apiKey    = document.getElementById('settingsApiKey')?.value?.trim() || '';
  state.settings.minimaxApiKey = document.getElementById('settingsMiniMaxApiKey')?.value?.trim() || '';
  state.settings.minimaxVoiceModel = document.getElementById('settingsMiniMaxVoiceModel')?.value || 'speech-2.8-turbo';
  state.settings.model     = state.settings.provider === 'custom'
    ? (document.getElementById('settingsCustomModel')?.value?.trim() || state.settings.model)
    : (document.getElementById('settingsModel')?.value || state.settings.model);
  state.settings.userName  = document.getElementById('settingsUserName')?.value?.trim() || '';
  state.settings.memoryNote = document.getElementById('settingsMemoryNote')?.value?.trim() || '';
  state.settings.notificationsEnabled = document.getElementById('settingsNotificationsEnabled')?.checked !== false;
  saveState();
}

function saveSettingsAndConfirm() {
  saveSettings();
  showToast('Studio settings saved');
}

function ensureWalletCharacterBalance(charId) {
  if (!state.wallet.characterBalances[charId]) {
    state.wallet.characterBalances[charId] = 0;
  }
}

function formatCurrency(amount) {
  return `$${(Number(amount) || 0).toFixed(2)}`;
}

function renderWalletDetailPanels() {
  const activeCard = state.wallet.cards.find(card => card.id === state.wallet.activeCardId) || state.wallet.cards[0] || null;
  const detail = document.getElementById('walletCardDetail');
  if (detail) {
    if (!activeCard) {
      detail.innerHTML = '<div class="wallet-detail-empty">Add a card to see card details.</div>';
    } else {
      const sentTotal = state.wallet.transactions
        .filter(tx => tx.cardId === activeCard.id && tx.type === 'transfer')
        .reduce((sum, tx) => sum + tx.amount, 0);
      const fundTotal = state.wallet.transactions
        .filter(tx => tx.cardId === activeCard.id && tx.type === 'fund')
        .reduce((sum, tx) => sum + tx.amount, 0);
      detail.innerHTML = `
        <div class="wallet-detail-grid">
          <div><span>Selected Card</span><strong>${escHtml(activeCard.label)}</strong></div>
          <div><span>Network</span><strong>${escHtml(activeCard.network)}</strong></div>
          <div><span>Card Balance</span><strong>${formatCurrency(activeCard.balance)}</strong></div>
          <div><span>Total Added</span><strong>${formatCurrency(fundTotal)}</strong></div>
          <div><span>Total Sent</span><strong>${formatCurrency(sentTotal)}</strong></div>
          <div><span>Ending In</span><strong>•••• ${escHtml(activeCard.last4)}</strong></div>
        </div>
      `;
    }
  }

  const txList = document.getElementById('walletTransactionList');
  if (txList) {
    const transactions = activeCard
      ? state.wallet.transactions.filter(tx => !tx.cardId || tx.cardId === activeCard.id)
      : state.wallet.transactions;
    txList.innerHTML = transactions.length
      ? transactions.slice(0, 10).map(tx => {
        const char = state.characters.find(entry => entry.id === tx.charId);
        const label = tx.type === 'transfer'
          ? `Sent to ${char?.name || 'character'}`
          : 'Added funds';
        return `
          <div class="wallet-transaction-row">
            <div>
              <strong>${escHtml(label)}</strong>
              <div>${escHtml(tx.note || '')} • ${escHtml(formatShortTime(tx.ts))}</div>
            </div>
            <span class="${tx.type === 'transfer' ? 'wallet-transaction-out' : 'wallet-transaction-in'}">${tx.type === 'transfer' ? '-' : '+'}${formatCurrency(tx.amount)}</span>
          </div>
        `;
      }).join('')
      : '<div class="wallet-detail-empty">No transactions yet.</div>';
  }
}

function renderMemoryViewer() {
  const root = document.getElementById('memoryViewerContent');
  if (!root) return;

  const favorites = getFavoriteMessages();
  const totalMessages = Object.values(state.conversations).reduce((sum, messages) => sum + messages.length, 0);
  const memoryCards = state.characters.map(rawChar => {
    const char = normalizeCharacter(rawChar);
    const messages = state.conversations[char.id] || [];
    const galleryCount = getCharacterImageGallery(char.id).length;
    const upcoming = getCharacterUpcomingEvents(char);
    return `
      <div class="memory-character-card">
        <div class="memory-character-head">
          ${avatarMarkup(char.avatar, 'memory-character-avatar')}
          <div>
            <div class="memory-character-name">${escHtml(char.name)}</div>
            <div class="memory-character-sub">${escHtml(char.relationship || 'No relationship set')} • ${escHtml(getAvailabilityLabel(char.availability))}</div>
          </div>
        </div>
        <div class="memory-character-stats">
          <div><span>Messages</span><strong>${messages.length}</strong></div>
          <div><span>Closeness</span><strong>${char.closeness}/100</strong></div>
          <div><span>Images</span><strong>${galleryCount}</strong></div>
        </div>
        <div class="memory-character-copy">
          <div><span>Last seen</span><strong>${escHtml(formatRelativeTime(getCharacterLastSeen(char.id)))}</strong></div>
          <div><span>Mood</span><strong>${escHtml(char.mood || 'Not set')}</strong></div>
          ${upcoming[0] ? `<div><span>Next event</span><strong>${escHtml(`${upcoming[0].label} • ${upcoming[0].value}`)}</strong></div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <div class="memory-summary-grid">
      <div class="memory-summary-card"><span>Favorites</span><strong>${favorites.length}</strong></div>
      <div class="memory-summary-card"><span>Total Messages</span><strong>${totalMessages}</strong></div>
      <div class="memory-summary-card"><span>World Entries</span><strong>${state.worldBook.length}</strong></div>
    </div>

    <div class="settings-section-label">Saved Messages</div>
    <div class="memory-section-card">
      ${favorites.length ? favorites.map(msg => `
        <button class="memory-favorite-row" type="button" onclick="openMemoryFavorite('${msg.charId}', '${msg.id}')">
          ${avatarMarkup(msg.charAvatar, 'memory-favorite-avatar')}
          <div class="memory-favorite-copy">
            <div class="memory-favorite-head">
              <strong>${escHtml(msg.charName)}</strong>
              <span>${escHtml(formatShortTime(msg.ts))}</span>
            </div>
            <div class="memory-favorite-body">${escHtml(msg.content || getConversationPreviewText(msg) || 'Saved message')}</div>
          </div>
        </button>
      `).join('') : '<div class="memory-empty">Star messages in chat to save them here.</div>'}
    </div>

    <div class="settings-section-label">Character Memory</div>
    <div class="memory-character-grid">
      ${memoryCards || '<div class="memory-empty">Add a character to begin tracking chat memory.</div>'}
    </div>

    <div class="settings-section-label">World Context</div>
    <div class="memory-section-card">
      ${state.worldBook.length ? state.worldBook.map(rawEntry => {
        const entry = normalizeWorldBookEntry(rawEntry);
        return `
          <div class="memory-world-row">
            <div>
              <strong>${escHtml(entry.title)}</strong>
              <div>${escHtml(entry.category || 'General')} • ${escHtml(entry.scope === 'always' ? 'Always On' : 'Conditional')}</div>
            </div>
            <span>${entry.enabled ? 'Active' : 'Off'}</span>
          </div>
        `;
      }).join('') : '<div class="memory-empty">World Book entries will show up here.</div>'}
    </div>
  `;
}

function openMemoryFavorite(charId, msgId) {
  goHome();
  setTimeout(() => {
    openApp('messages');
    setTimeout(() => {
      openLINEChat(charId);
      requestAnimationFrame(() => {
        const target = document.querySelector(`[data-message-id="${CSS.escape(msgId)}"]`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target?.classList.add('memory-jump-highlight');
        setTimeout(() => target?.classList.remove('memory-jump-highlight'), 1800);
      });
    }, 120);
  }, 120);
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
  renderWalletDetailPanels();
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
  state.wallet.transactions.unshift({ id: uuid(), type: 'fund', cardId, amount, ts: Date.now(), note: `Added funds to ${card.label}` });
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
  state.wallet.transactions.unshift({ id: uuid(), type: 'transfer', cardId, amount, charId, ts: Date.now(), note: `Sent from ${card.label}` });
  document.getElementById('walletTransferAmount').value = '';
  saveState();
  renderWallet();
  showToast('Money sent');
}

function renderPersona() {
  const builtInRulesEl = document.getElementById('personaBuiltInRealism');
  if (builtInRulesEl) {
    builtInRulesEl.value = HIDDEN_REALISM_PROMPTS.map(rule => `- ${rule}`).join('\n');
  }
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
  state.viewingCharacterId = null;
  state.settingsCharId = null;

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
    <div class="contact-item" onclick="openCharacterProfile('${char.id}')">
      ${avatarMarkup(char.avatar, 'contact-avatar')}
      <div class="contact-info">
        <div class="contact-name">${escHtml(char.name)}</div>
        <div class="contact-desc">${escHtml(char.description || 'No description')}</div>
        <div class="contact-tags">
          <span class="contact-tag">${char.relationship || (char.systemPrompt ? 'Prompt ready' : 'Needs prompt')}</span>
          <span class="contact-tag muted">${lastMsg(char.id) ? 'Active chat' : 'No chat yet'}</span>
          ${char.tags?.length ? `<span class="contact-tag muted">${escHtml(char.tags.slice(0, 2).join(' • '))}</span>` : ''}
          ${char.autoMessageEnabled && char.autoMessageIntervalMinutes ? `<span class="contact-tag muted">Auto • ${escHtml(String(char.autoMessageIntervalMinutes))}m</span>` : ''}
          ${char.temperature !== '' ? `<span class="contact-tag muted">Temp ${escHtml(String(char.temperature))}</span>` : ''}
          ${char.modelOverride ? `<span class="contact-tag muted">${escHtml(char.modelOverride)}</span>` : ''}
        </div>
      </div>
      <div class="contact-actions">
        <button class="contact-chat-btn"
          onclick="event.stopPropagation();chatFromContacts('${char.id}')">Chat</button>
        <button class="contact-settings-btn"
          onclick="event.stopPropagation();openCharacterSettings('${char.id}')">Settings</button>
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

function openCharacterProfile(charId) {
  state.viewingCharacterId = charId;
  document.getElementById('characterProfileModal')?.classList.add('open');
  renderCharacterProfile();
}

function closeCharacterProfile(event) {
  if (event && event.target !== document.getElementById('characterProfileModal')) return;
  document.getElementById('characterProfileModal')?.classList.remove('open');
  state.viewingCharacterId = null;
}

function renderCharacterProfile() {
  const root = document.getElementById('characterProfileContent');
  const char = state.characters.find(entry => entry.id === state.viewingCharacterId);
  if (!root || !char) return;
  const normalized = normalizeCharacter(char);
  const gallery = getCharacterImageGallery(normalized.id);
  const events = getCharacterUpcomingEvents(normalized);
  const sentCount = getMessageCountByRole(normalized.id, 'user');
  const receivedCount = getMessageCountByRole(normalized.id, 'assistant');

  root.innerHTML = `
    <div class="character-profile-hero">
      ${avatarMarkup(normalized.avatar, 'character-profile-avatar')}
      <div>
        <div class="character-profile-name">${escHtml(normalized.name)}</div>
        <div class="character-profile-sub">${escHtml(normalized.relationship || 'No relationship set')} • ${escHtml(getAvailabilityLabel(normalized.availability))}</div>
      </div>
    </div>

    <div class="character-profile-stats">
      <div><span>Closeness</span><strong>${normalized.closeness}/100</strong></div>
      <div><span>Your messages</span><strong>${sentCount}</strong></div>
      <div><span>Their messages</span><strong>${receivedCount}</strong></div>
    </div>

    <div class="character-profile-section">
      <div class="character-profile-section-title">Relationship Details</div>
      <div class="character-profile-copy-grid">
        <div><span>Mood</span><strong>${escHtml(normalized.mood || 'Not set')}</strong></div>
        <div><span>Last seen</span><strong>${escHtml(formatRelativeTime(getCharacterLastSeen(normalized.id)))}</strong></div>
        <div><span>History Window</span><strong>${normalized.historyMessageCount} msgs</strong></div>
        <div><span>World Book</span><strong>${escHtml(normalized.mountedWorldBookCategories.length ? normalized.mountedWorldBookCategories.join(', ') : 'All')}</strong></div>
        <div><span>Voice</span><strong>${escHtml(normalized.minimaxVoiceId || 'Not set')}</strong></div>
        ${events.map(event => `<div><span>${escHtml(event.label)}</span><strong>${escHtml(event.value)}</strong></div>`).join('')}
      </div>
    </div>

    <div class="character-profile-section">
      <div class="character-profile-section-title">Profile Note</div>
      <div class="character-profile-note">${escHtml(normalized.profileNote || normalized.privateNotes || 'No notes saved for this character yet.')}</div>
    </div>

    <div class="character-profile-section">
      <div class="character-profile-section-title">Photo Gallery</div>
      ${gallery.length ? `<div class="character-profile-gallery">${gallery.slice(0, 8).map(image => `<img src="${escHtml(image.url)}" alt="${escHtml(normalized.name)} photo">`).join('')}</div>` : '<div class="character-profile-note">No photos shared with this character yet.</div>'}
    </div>

    <div class="character-profile-actions">
      <button class="btn btn-secondary" type="button" onclick="chatFromProfile('${normalized.id}')">Open Chat</button>
      <button class="btn btn-secondary" type="button" onclick="openCharacterSettings('${normalized.id}')">Character Settings</button>
      <button class="btn btn-primary" type="button" onclick="editCharacterFromProfile('${normalized.id}')">Edit Character</button>
    </div>
  `;
}

function chatFromProfile(charId) {
  closeCharacterProfile();
  chatFromContacts(charId);
}

function editCharacterFromProfile(charId) {
  closeCharacterProfile();
  setTimeout(() => openEditCharSheet(charId), 120);
}

function openCharacterSettings(charId = state.viewingCharacterId || state.activeChat) {
  const rawChar = state.characters.find(entry => entry.id === charId);
  if (!rawChar) return;
  const char = normalizeCharacter(rawChar);
  if (state.viewingCharacterId === charId) {
    closeCharacterProfile();
  }
  state.settingsCharId = charId;
  document.getElementById('charSettingsName').textContent = `${char.name} Settings`;
  document.getElementById('charSettingsOpeningLines').value = stringifyLineList(char.openingLines);
  document.getElementById('charSettingsHistoryMessageCount').value = char.historyMessageCount;
  document.getElementById('charSettingsWorldBookCategories').value = stringifyTagList(char.mountedWorldBookCategories);
  document.getElementById('charSettingsMiniMaxVoiceId').value = char.minimaxVoiceId || '';
  document.getElementById('charSettingsAutoVoiceEnabled').checked = char.autoVoiceEnabled === true;
  document.getElementById('charSettingsAutoVoiceChance').value = char.autoVoiceChance || 20;
  document.getElementById('charSettingsMiniMaxVoiceSpeed').value = char.minimaxVoiceSpeed || 1;
  document.getElementById('charSettingsMiniMaxLanguage').value = char.minimaxLanguage || 'auto';
  updateCharacterVoiceSpeedLabel(char.minimaxVoiceSpeed || 1);
  document.getElementById('characterSettingsModal').classList.add('open');
}

function closeCharacterSettings(event) {
  if (event && event.target !== document.getElementById('characterSettingsModal')) return;
  document.getElementById('characterSettingsModal')?.classList.remove('open');
  state.settingsCharId = null;
}

function updateCharacterVoiceSpeedLabel(value) {
  const label = document.getElementById('charSettingsMiniMaxVoiceSpeedLabel');
  if (!label) return;
  label.textContent = `${Number(value || 1).toFixed(1)}x`;
}

function saveCharacterSettings() {
  const char = state.characters.find(entry => entry.id === state.settingsCharId);
  if (!char) return;
  Object.assign(char, normalizeCharacter({
    ...char,
    openingLines: parseLineList(document.getElementById('charSettingsOpeningLines')?.value || ''),
    historyMessageCount: Math.max(1, Math.min(50, Number(document.getElementById('charSettingsHistoryMessageCount')?.value || 12))),
    mountedWorldBookCategories: parseTagList(document.getElementById('charSettingsWorldBookCategories')?.value || ''),
    minimaxVoiceId: document.getElementById('charSettingsMiniMaxVoiceId')?.value?.trim() || '',
    autoVoiceEnabled: document.getElementById('charSettingsAutoVoiceEnabled')?.checked === true,
    autoVoiceChance: Math.max(0, Math.min(100, Number(document.getElementById('charSettingsAutoVoiceChance')?.value || 20))),
    minimaxVoiceSpeed: Math.max(0.5, Math.min(2, Number(document.getElementById('charSettingsMiniMaxVoiceSpeed')?.value || 1))),
    minimaxLanguage: document.getElementById('charSettingsMiniMaxLanguage')?.value || 'auto',
  }));
  saveState();
  renderContactsList();
  if (state.currentApp === 'messages') {
    renderLINEConvList();
    if (state.activeChat === char.id) updateLineVoiceNoteButton();
  }
  if (state.viewingCharacterId === char.id) renderCharacterProfile();
  closeCharacterSettings();
  showToast('Character settings saved');
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
  document.getElementById('charTemperature').value = '';
  document.getElementById('charAutoMessageEnabled').checked = false;
  document.getElementById('charAutoMessageInterval').value = '';
  document.getElementById('charCloseness').value = 50;
  document.getElementById('charMood').value = '';
  document.getElementById('charAvailability').value = 'available';
  document.getElementById('charAnniversaryDate').value = '';
  document.getElementById('charRecurringCheckInDays').value = '';
  document.getElementById('charScheduledMomentTitle').value = '';
  document.getElementById('charScheduledMomentAt').value = '';
  document.getElementById('charScenario').value = '';
  document.getElementById('charSystem').value = '';
  document.getElementById('charProfileNote').value = '';
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
  document.getElementById('charTemperature').value = char.temperature === '' ? '' : char.temperature;
  document.getElementById('charAutoMessageEnabled').checked = char.autoMessageEnabled === true;
  document.getElementById('charAutoMessageInterval').value = char.autoMessageIntervalMinutes || '';
  document.getElementById('charCloseness').value = char.closeness;
  document.getElementById('charMood').value = char.mood || '';
  document.getElementById('charAvailability').value = char.availability || 'available';
  document.getElementById('charAnniversaryDate').value = char.anniversaryDate || '';
  document.getElementById('charRecurringCheckInDays').value = char.recurringCheckInDays || '';
  document.getElementById('charScheduledMomentTitle').value = char.scheduledMomentTitle || '';
  document.getElementById('charScheduledMomentAt').value = char.scheduledMomentAt || '';
  document.getElementById('charScenario').value = char.scenario || '';
  document.getElementById('charSystem').value = char.systemPrompt || '';
  document.getElementById('charProfileNote').value = char.profileNote || '';
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
  const temperatureRaw = document.getElementById('charTemperature').value.trim();
  const temperature = temperatureRaw === '' ? '' : Math.max(0, Math.min(2, Number(temperatureRaw) || 0));
  const autoMessageEnabled = document.getElementById('charAutoMessageEnabled').checked;
  const autoMessageIntervalMinutes = Math.max(0, Number(document.getElementById('charAutoMessageInterval').value || 0));
  const closeness = Math.max(0, Math.min(100, Number(document.getElementById('charCloseness').value || 50)));
  const mood = document.getElementById('charMood').value.trim();
  const availability = document.getElementById('charAvailability').value || 'available';
  const anniversaryDate = document.getElementById('charAnniversaryDate').value || '';
  const recurringCheckInDays = Math.max(0, Number(document.getElementById('charRecurringCheckInDays').value || 0));
  const scheduledMomentTitle = document.getElementById('charScheduledMomentTitle').value.trim();
  const scheduledMomentAt = document.getElementById('charScheduledMomentAt').value || '';
  const scenario = document.getElementById('charScenario').value.trim();
  const systemPrompt = document.getElementById('charSystem').value.trim();
  const profileNote = document.getElementById('charProfileNote').value.trim();
  const privateNotes = document.getElementById('charPrivateNotes').value.trim();
  const existingChar = state.editingCharId ? state.characters.find(c => c.id === state.editingCharId) : null;

  if (!name) { showToast('Please enter a name'); return; }
  if (autoMessageEnabled && autoMessageIntervalMinutes <= 0) {
    showToast('Set an interval for unprompted messages');
    return;
  }

  const payload = normalizeCharacter({
    id: state.editingCharId || undefined,
    avatar,
    name,
    description,
    nickname,
    relationship,
    tags,
    modelOverride,
    temperature,
    autoMessageEnabled,
    autoMessageIntervalMinutes,
    lastAutoMessageAt: existingChar?.lastAutoMessageAt || 0,
    openingLines: existingChar?.openingLines || [],
    historyMessageCount: existingChar?.historyMessageCount || 12,
    mountedWorldBookCategories: existingChar?.mountedWorldBookCategories || [],
    minimaxVoiceId: existingChar?.minimaxVoiceId || '',
    minimaxVoiceSpeed: existingChar?.minimaxVoiceSpeed || 1,
    minimaxLanguage: existingChar?.minimaxLanguage || 'auto',
    closeness,
    mood,
    availability,
    anniversaryDate,
    recurringCheckInDays,
    scheduledMomentTitle,
    scheduledMomentAt,
    scenario,
    systemPrompt,
    profileNote,
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
  if (state.currentApp === 'memory') renderMemoryViewer();
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
  if (state.viewingCharacterId === state.editingCharId) closeCharacterProfile();
  renderContactsList();
  if (state.currentApp === 'messages') renderLINEConvList();
  if (state.currentApp === 'wallet') renderWallet();
  if (state.currentApp === 'memory') renderMemoryViewer();
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
          value="${escHtml(entry.category || '')}"
          placeholder="Category: lore, people, places"
          oninput="updateWBCategory('${entry.id}', this.value)"
        >
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
  if (state.currentApp === 'memory') renderMemoryViewer();
  setTimeout(() => {
    const inputs = document.querySelectorAll('.worldbook-entry-title-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
}

function updateWBTitle(id, val) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) {
    e.title = val;
    saveState();
    if (state.currentApp === 'memory') renderMemoryViewer();
  }
}

function updateWBContent(id, val) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) {
    e.content = val;
    saveState();
    if (state.currentApp === 'memory') renderMemoryViewer();
  }
}

function updateWBKeywords(id, val) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) {
    e.keywords = parseTagList(val);
    saveState();
    if (state.currentApp === 'memory') renderMemoryViewer();
  }
}

function updateWBCategory(id, val) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) {
    e.category = val.trim();
    saveState();
    if (state.currentApp === 'memory') renderMemoryViewer();
  }
}

function updateWBScope(id, val) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) {
    e.scope = val === 'always' ? 'always' : 'conditional';
    saveState();
    if (state.currentApp === 'memory') renderMemoryViewer();
  }
}

function updateWBPriority(id, val) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) {
    e.priority = Math.max(0, Math.min(100, Number(val) || 0));
    saveState();
    if (state.currentApp === 'memory') renderMemoryViewer();
  }
}

function updateWBEnabled(id, checked) {
  const e = state.worldBook.find(x => x.id === id);
  if (e) {
    e.enabled = Boolean(checked);
    saveState();
    if (state.currentApp === 'memory') renderMemoryViewer();
  }
}

function deleteWBEntry(id) {
  state.worldBook = state.worldBook.filter(x => x.id !== id);
  saveState();
  renderWorldBook();
  if (state.currentApp === 'memory') renderMemoryViewer();
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
  startProactiveMessageScheduler();
}

document.addEventListener('DOMContentLoaded', init);
