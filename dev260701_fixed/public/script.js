/* ═══════════════════════════════════════════════
   FACT BOMBER — script.js  (서버 프록시 버전)
═══════════════════════════════════════════════ */

'use strict';

// ── DOM refs ────────────────────────────────────────────────
const introPhoto      = document.getElementById('intro-photo');
const introText       = document.getElementById('intro-text');
const app             = document.getElementById('app');
const categoryScreen  = document.getElementById('category-screen');
const chatScreen      = document.getElementById('chat-screen');
const chatMessages    = document.getElementById('chat-messages');
const chatBadge       = document.getElementById('chat-category-badge');
const userInput       = document.getElementById('user-input');
const sendBtn         = document.getElementById('send-btn');
const resetBtn        = document.getElementById('reset-btn');
const catBtns         = document.querySelectorAll('.cat-btn');
const introSkip       = document.getElementById('intro-skip');

// ── State ────────────────────────────────────────────────────
let selectedCat  = '';
let chatHistory  = [];   // { role, content }[]
let isWaiting    = false;
let introTimers  = [];

// ══════════════════════════════════════════════════════════════
//  INTRO SEQUENCE
// ══════════════════════════════════════════════════════════════
function launchApp() {
  introTimers.forEach(t => clearTimeout(t));
  introPhoto.classList.add('hidden');
  introText.classList.add('hidden');
  introSkip.classList.add('hidden');
  app.classList.remove('hidden');
}

// ── Skip Listener ──────────────────────────────────────────
introSkip.addEventListener('click', launchApp);

function runIntro() {
  // Phase 1: Photo — 7s animation, then fade and switch
  const t1 = setTimeout(() => {
    introPhoto.classList.add('fade-out');
    const t2 = setTimeout(() => {
      introPhoto.classList.add('hidden');
      showTagline();
    }, 1200);
    introTimers.push(t2);
  }, 4000);
  introTimers.push(t1);
}

function showTagline() {
  introText.classList.remove('hidden');
  // Tagline animation is 4s
  const t3 = setTimeout(() => {
    introText.classList.add('fade-out');
    const t4 = setTimeout(() => {
      introText.classList.add('hidden');
      launchApp();
    }, 1200);
    introTimers.push(t4);
  }, 2000);
  introTimers.push(t3);
}

// ══════════════════════════════════════════════════════════════
//  CATEGORY SELECTION
// ══════════════════════════════════════════════════════════════
catBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    selectedCat = btn.dataset.cat;
    openChat(selectedCat);
  });
});

function openChat(category) {
  categoryScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  chatBadge.textContent = category;
  chatHistory = [];
  chatMessages.innerHTML = '';

  // Bot opens with "자세히 말해봐." (화면에만 보여주고 히스토리엔 안 넣음)
  appendBotMessage('자세히 말해봐.');

  // 상태를 완전히 전송 가능 모드로 리셋 (isWaiting = false)
  setInputState(true);
  setTimeout(() => userInput.focus(), 100);
}

// ══════════════════════════════════════════════════════════════
//  SEND MESSAGE
// ══════════════════════════════════════════════════════════════
sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

// Auto-resize textarea
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
});

async function handleSend() {
  const text = userInput.value.trim();
  if (!text || isWaiting) return;

  appendUserMessage(text);
  chatHistory.push({ role: 'user', content: text });
  userInput.value = '';
  userInput.style.height = 'auto';
  setInputState(false);

  const typingEl = appendTyping();

  try {
    const reply = await callServer(chatHistory);
    typingEl.remove();
    appendBotMessage(reply);
    chatHistory.push({ role: 'assistant', content: reply });
  } catch (err) {
    typingEl.remove();
    appendBotMessage(`⚠ 오류: ${err.message}`);
  } finally {
    setInputState(true);
    userInput.focus();
  }
}

function setInputState(enabled) {
  isWaiting          = !enabled;
  userInput.disabled = !enabled;
  sendBtn.disabled   = !enabled;
}

// ══════════════════════════════════════════════════════════════
//  SERVER API CALL  →  /api/chat
// ══════════════════════════════════════════════════════════════
async function callServer(history) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history, category: selectedCat })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.reply;
}

// ══════════════════════════════════════════════════════════════
//  MESSAGE RENDERERS
// ══════════════════════════════════════════════════════════════
function appendBotMessage(text) {
  const row = document.createElement('div');
  row.className = 'msg-row bot';
  row.innerHTML = `
    <div class="msg-avatar">FB</div>
    <div class="msg-bubble">${escHtml(text)}</div>
  `;
  chatMessages.appendChild(row);
  scrollBottom();
}

function appendUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'msg-row user';
  row.innerHTML = `
    <div class="msg-bubble">${escHtml(text)}</div>
    <div class="msg-avatar">나</div>
  `;
  chatMessages.appendChild(row);
  scrollBottom();
}

function appendTyping() {
  const row = document.createElement('div');
  row.className = 'msg-row bot';
  row.innerHTML = `
    <div class="msg-avatar">FB</div>
    <div class="typing-bubble">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;
  chatMessages.appendChild(row);
  scrollBottom();
  return row;
}

function scrollBottom() {
  chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ══════════════════════════════════════════════════════════════
//  RESET
// ══════════════════════════════════════════════════════════════
resetBtn.addEventListener('click', () => {
  chatScreen.classList.add('hidden');
  chatMessages.innerHTML = '';
  chatHistory = [];
  selectedCat = '';
  userInput.value = '';
  userInput.style.height = 'auto';
  setInputState(false);
  categoryScreen.classList.remove('hidden');
});

// ══════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════
runIntro();
