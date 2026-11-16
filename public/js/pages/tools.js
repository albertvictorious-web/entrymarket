import { api } from '../api.js';
import { icons } from '../icons.js';
import { toast } from '../ui.js';
import { esc, fmtDate } from '../utils.js';

/* Sesi pasar dalam UTC. DST London/NY ditangani otomatis. */
const SESSIONS = [
  { id: 'sydney', name: 'Sydney', flag: '🇦🇺', open: 21, close: 6, tz: 'Australia/Sydney' },
  { id: 'tokyo', name: 'Tokyo', flag: '🇯🇵', open: 0, close: 9, tz: 'Asia/Tokyo' },
  { id: 'london', name: 'London', flag: '🇬🇧', open: 7, close: 16, tz: 'Europe/London' },
  { id: 'newyork', name: 'New York', flag: '🇺🇸', open: 12, close: 21, tz: 'America/New_York' },
];

const NEWS_FEEDS = [
  { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/businessNews' },
  { name: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { name: 'Investing', url: 'https://www.investing.com/rss/news_14.rss' },
  { name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
];

export async function renderTools(root, ctx) {
  root.innerHTML = `<div class="page">
    <div class="card dark" style="margin-bottom:18px">
      <div class="card-head">
        <div><h3>Harga Pasar</h3><div class="hint">Realtime · Twelve Data</div></div>
        <button class="btn btn-sm btn-glass" id="refresh-quotes" style="background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.14)">${icons.refresh} Refresh</button>
      </div>
      <div id="quotes-grid" class="grid grid-3"></div>
    </div>

    <div class="grid grid-main" style="margin-bottom:18px">
      <div class="card">
        <div class="card-head">
          <div><h3>Kalender Ekonomi</h3><div class="hint" id="cal-source">Memuat…</div></div>
          <div class="seg" id="cal-week">
            <button data-week="thisweek" class="active">Minggu ini</button>
            <button data-week="nextweek">Minggu depan</button>
          </div>
        </div>
        <div id="calendar-body"><div class="skeleton" style="height:200px"></div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div><h3>Jam Sesi Pasar</h3><div class="hint" id="session-clock"></div></div>
        </div>
        <div class="session-list" id="session-list"></div>
        <div style="margin-top:14px;padding:12px;border-radius:12px;background:var(--paper);font-size:12px;color:var(--text-2);line-height:1.6">
          ${icons.clock} Sesi aktif menandakan likuiditas tinggi. Overlap London–New York (19:00–21:00 WIB) biasanya paling volatil.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div><h3>Berita Pasar</h3><div class="hint">Agregasi sumber terpercaya</div></div>
        <button class="btn btn-sm btn-ghost" id="refresh-news">${icons.refresh} Muat ulang</button>
      </div>
      <div id="news-body"><div class="skeleton" style="height:160px"></div></div>
    </div>
  </div>`;

  const page = root.querySelector('.page');
  let calWeek = 'thisweek';

  /* ---------- Quotes ---------- */
  async function loadQuotes() {
    const box = page.querySelector('#quotes-grid');
    try {
      const { quotes } = await api.get('/market/quotes');
      box.innerHTML = quotes.map((q) => `
        <div style="padding:16px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-size:11.5px;font-weight:700;color:rgba(255,255,255,.5);letter-spacing:.06em">${esc(q.short)}</span>
            <span class="live-dot" style="opacity:${q.isOpen ? 1 : .25}"></span>
          </div>
          <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;color:#fff;font-variant-numeric:tabular-nums">
            ${q.price ? q.price.toLocaleString('en-US', { minimumFractionDigits: q.price < 10 ? 4 : 2, maximumFractionDigits: q.price < 10 ? 4 : 2 }) : '—'}
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11.5px">
            <span style="color:${q.percent >= 0 ? '#4ade80' : '#fb7185'};font-weight:700">${q.percent >= 0 ? '+' : ''}${q.percent.toFixed(2)}%</span>
            <span style="color:rgba(255,255,255,.35)">H ${q.high || '—'} · L ${q.low || '—'}</span>
          </div>
        </div>`).join('');
    } catch (e) {
      box.innerHTML = `<div class="empty" style="color:rgba(255,255,255,.4)">${esc(e.message)}</div>`;
    }
  }

  /* ---------- Calendar ---------- */
  async function loadCalendar() {
    const box = page.querySelector('#calendar-body');
    box.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    try {
      const { events, source } = await api.get(`/market/calendar?week=${calWeek}`);
      page.querySelector('#cal-source').textContent = source;
      const byDay = new Map();
      events.forEach((e) => {
        if (!byDay.has(e.date)) byDay.set(e.date, []);
        byDay.get(e.date).push(e);
      });
      box.innerHTML = [...byDay.entries()].map(([day, list]) => `
        <div class="cal-day">
          <h5>${fmtDate(day, { weekday: 'long' })}</h5>
          ${list.map((e) => `
            <div class="cal-ev">
              <span class="t">${e.time}</span>
              <span class="c"><span class="impact ${e.impact}"></span> ${esc(e.currency)}</span>
              <span class="e">${esc(e.event)}</span>
              <span class="vals">${e.actual ? `<b style="color:var(--text)">${esc(e.actual)}</b> · ` : ''}F ${esc(e.forecast || '—')} · P ${esc(e.previous || '—')}</span>
            </div>`).join('')}
        </div>`).join('') || '<div class="empty">Tidak ada event pada periode ini</div>';
    } catch (e) {
      box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }

  page.querySelectorAll('#cal-week button').forEach((b) => {
    b.addEventListener('click', () => {
      calWeek = b.dataset.week;
      page.querySelectorAll('#cal-week button').forEach((x) => x.classList.toggle('active', x === b));
      loadCalendar();
    });
  });

  /* ---------- Sessions ---------- */
  function renderSessions() {
    const now = new Date();
    const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
    page.querySelector('#session-clock').textContent =
      `Waktu server ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB`;

    page.querySelector('#session-list').innerHTML = SESSIONS.map((s) => {
      const isOpen = s.open < s.close
        ? utcH >= s.open && utcH < s.close
        : utcH >= s.open || utcH < s.close;
      const local = new Date(now.toLocaleString('en-US', { timeZone: s.tz }));
      const localTime = local.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const fmtH = (h) => `${String(h).padStart(2, '0')}:00`;
      return `<div class="session ${isOpen ? 'open' : ''}">
        <span class="flag">${s.flag}</span>
        <div class="info">
          <strong>${s.name}</strong>
          <span>${fmtH(s.open)}–${fmtH(s.close)} UTC · lokal ${localTime}</span>
        </div>
        <span class="state">${isOpen ? '● Open' : 'Closed'}</span>
      </div>`;
    }).join('');
  }

  /* ---------- News ---------- */
  async function loadNews() {
    const box = page.querySelector('#news-body');
    box.innerHTML = '<div class="skeleton" style="height:160px"></div>';
    try {
      const { items } = await api.get('/market/news');
      box.innerHTML = items.map((n) => `
        <div class="news-item">
          <div class="src">${esc(n.source)}</div>
          <div>
            <h4><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a></h4>
            ${n.summary ? `<p>${esc(n.summary)}</p>` : ''}
            <div class="when">${n.published ? fmtDate(n.published, { hour: '2-digit', minute: '2-digit' }) : ''}</div>
          </div>
        </div>`).join('') || '<div class="empty">Belum ada berita</div>';
    } catch (e) {
      box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }

  page.querySelector('#refresh-quotes').addEventListener('click', () => { loadQuotes(); toast('Harga diperbarui'); });
  page.querySelector('#refresh-news').addEventListener('click', loadNews);

  await Promise.all([loadQuotes(), loadCalendar(), loadNews()]);
  renderSessions();
  const timer = setInterval(renderSessions, 1000);
  ctx.onCleanup(() => clearInterval(timer));
}
