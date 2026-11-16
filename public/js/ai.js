import { api } from './api.js';
import { icons } from './icons.js';
import { toast } from './ui.js';
import { esc } from './utils.js';

const SUGGESTIONS = [
  'Bagaimana NMI saya 30 hari terakhir?',
  'Berapa total lot dan nasabah saya?',
  'Reward apa yang bisa saya claim?',
  'Ringkas progres leads saya',
];

let mounted = false;

export function mountAiAssistant(user) {
  if (mounted) return;
  mounted = true;

  const root = document.createElement('div');
  root.className = 'ai-root';
  root.innerHTML = `
    <button class="ai-fab" id="ai-fab" title="Tanya Entry AI">
      <span class="ai-fab-ico">${icons.sparkle}</span>
      <span class="ai-fab-pulse"></span>
    </button>

    <section class="ai-panel" id="ai-panel" aria-hidden="true">
      <header class="ai-head">
        <div class="ai-head-l">
          <span class="ai-avatar">${icons.sparkle}</span>
          <div>
            <strong>Entry AI</strong>
            <span>Asisten dashboard Anda</span>
          </div>
        </div>
        <div class="ai-head-r">
          <button class="icon-btn" id="ai-clear" title="Hapus riwayat">${icons.trash}</button>
          <button class="icon-btn" id="ai-close" title="Tutup">${icons.close}</button>
        </div>
      </header>

      <div class="ai-body" id="ai-body"></div>

      <div class="ai-suggest" id="ai-suggest">
        ${SUGGESTIONS.map((s) => `<button class="ai-chip">${esc(s)}</button>`).join('')}
      </div>

      <form class="ai-form" id="ai-form">
        <textarea id="ai-input" rows="1" placeholder="Tanya apa saja tentang data Anda…"></textarea>
        <button type="submit" class="ai-send" id="ai-send" title="Kirim">${icons.arrowUp}</button>
      </form>
    </section>`;
  document.body.appendChild(root);

  const fab = root.querySelector('#ai-fab');
  const panel = root.querySelector('#ai-panel');
  const body = root.querySelector('#ai-body');
  const form = root.querySelector('#ai-form');
  const input = root.querySelector('#ai-input');
  const sendBtn = root.querySelector('#ai-send');
  let busy = false;

  function bubble(role, text) {
    const el = document.createElement('div');
    el.className = `ai-msg ai-${role}`;
    el.innerHTML = `<div class="ai-bubble">${format(text)}</div>`;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  function format(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\n)\s*[*-]\s+/g, '$1• ')
      .replace(/\n/g, '<br />');
  }

  function typing() {
    const el = document.createElement('div');
    el.className = 'ai-msg ai-assistant';
    el.innerHTML = '<div class="ai-bubble ai-typing"><i></i><i></i><i></i></div>';
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  async function loadHistory() {
    body.innerHTML = '';
    try {
      const rows = await api.get('/ai/history');
      if (!rows.length) {
        bubble('assistant', `Halo ${user.name.split(' ')[0]}! Saya Entry AI. Tanyakan soal NMI, lot, nasabah, leads, appointment, atau reward Anda.`);
        return;
      }
      rows.forEach((m) => bubble(m.role, m.content));
    } catch {
      bubble('assistant', 'Gagal memuat riwayat. Silakan mulai bertanya.');
    }
  }

  async function send(text) {
    const message = String(text || '').trim();
    if (!message || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';
    bubble('user', message);
    const t = typing();
    try {
      const { answer } = await api.post('/ai/chat', { message });
      t.remove();
      bubble('assistant', answer);
    } catch (e) {
      t.remove();
      bubble('assistant', `Maaf, terjadi kendala: ${e.message}`);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  function open() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    fab.classList.add('hidden');
    if (!body.childElementCount) loadHistory();
    setTimeout(() => input.focus(), 220);
  }

  function close() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    fab.classList.remove('hidden');
  }

  fab.addEventListener('click', open);
  root.querySelector('#ai-close').addEventListener('click', close);
  root.querySelector('#ai-clear').addEventListener('click', async () => {
    try {
      await api.del('/ai/history');
      body.innerHTML = '';
      bubble('assistant', 'Riwayat dibersihkan. Ada yang bisa saya bantu?');
      toast('Riwayat AI dihapus', 'success');
    } catch (e) { toast(e.message, 'error'); }
  });

  root.querySelectorAll('.ai-chip').forEach((b) => {
    b.addEventListener('click', () => send(b.textContent));
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input.value);
    }
  });
}
