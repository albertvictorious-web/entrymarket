import { api } from '../api.js';
import { icons } from '../icons.js';
import { toast } from '../ui.js';
import { esc, fmtDate } from '../utils.js';

/* Sesi pasar dalam UTC. DST London/NY ditangani otomatis. */
const SESSIONS = [
  { id: 'sydney', name: 'Sydney', flag: '🇦🇺', open: 21, close: 6, tz: 'Australia/Sydney', city: 'Sydney', lat: -33.87, lng: 151.21 },
  { id: 'tokyo', name: 'Tokyo', flag: '🇯🇵', open: 0, close: 9, tz: 'Asia/Tokyo', city: 'Tokyo', lat: 35.68, lng: 139.69 },
  { id: 'london', name: 'London', flag: '🇬🇧', open: 7, close: 16, tz: 'Europe/London', city: 'London', lat: 51.51, lng: -0.13 },
  { id: 'newyork', name: 'New York', flag: '🇺🇸', open: 12, close: 21, tz: 'America/New_York', city: 'New York', lat: 40.71, lng: -74.01 },
];

const TABS = [
  { id: 'harga', label: 'Harga Pasar', icon: 'chart' },
  { id: 'kalender', label: 'Kalender Ekonomi', icon: 'calendar' },
  { id: 'sesi', label: 'Jam Sesi Pasar', icon: 'clock' },
  { id: 'berita', label: 'Berita Pasar', icon: 'news' },
];

const IMPACT_LABEL = { High: 'High Impact', Medium: 'Medium', Low: 'Low', Holiday: 'Holiday' };

function fmtPrice(v) {
  if (!v) return '—';
  const d = v < 10 ? 4 : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export async function renderTools(root, ctx) {
  let tab = 'harga';
  let calWeek = 'thisweek';
  let calDay = null;
  let calImpact = 'all';
  let newsCat = 'all';
  let quotes = [];

  root.innerHTML = `<div class="page">
    <div class="tools-tabs" id="tools-tabs">
      ${TABS.map((t) => `
        <button class="tools-tab${t.id === tab ? ' active' : ''}" data-tab="${t.id}">
          <span class="tt-ico">${icons[t.icon]}</span>
          <span>${t.label}</span>
        </button>`).join('')}
    </div>
    <div id="tools-body"></div>
  </div>`;

  const page = root.querySelector('.page');
  const body = page.querySelector('#tools-body');

  /* ================= TICKER ================= */
  function tickerHtml() {
    if (!quotes.length) return '';
    const row = quotes.map((q) => `
      <span class="tk-item">
        <span class="tk-sym">${esc(q.short)}</span>
        <span class="tk-px">${fmtPrice(q.price)}</span>
        <span class="tk-ch ${q.percent >= 0 ? 'up' : 'down'}">${q.percent >= 0 ? '▲' : '▼'} ${Math.abs(q.percent).toFixed(2)}%</span>
      </span>`).join('');
    return `<div class="ticker"><div class="ticker-track">${row}${row}</div></div>`;
  }

  /* ================= HARGA ================= */
  function renderHarga() {
    const groups = [
      { id: 'forex', label: 'Forex' },
      { id: 'commodity', label: 'Komoditas & Gold' },
      { id: 'crypto', label: 'Kripto' },
    ];
    body.innerHTML = `
      ${tickerHtml()}
      <div class="card dark" style="margin-bottom:18px">
        <div class="card-head">
          <div><h3>Harga Pasar</h3><div class="hint">Realtime · Twelve Data</div></div>
          <button class="btn btn-sm btn-glass" id="refresh-quotes" style="background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.14)">${icons.refresh} Refresh</button>
        </div>
        ${groups.map((g) => {
          const list = quotes.filter((q) => q.group === g.id);
          if (!list.length) return '';
          return `<div class="qgroup-label">${g.label}</div>
            <div class="grid grid-3" style="margin-bottom:16px">
              ${list.map((q) => `
                <div class="qcard">
                  <div class="qcard-top">
                    <span class="qcard-sym">${esc(q.short)}</span>
                    <span class="live-dot" style="opacity:${q.isOpen ? 1 : .25}"></span>
                  </div>
                  <div class="qcard-name">${esc(q.label)}</div>
                  <div class="qcard-px">${fmtPrice(q.price)}</div>
                  <div class="qcard-foot">
                    <span class="${q.percent >= 0 ? 'up' : 'down'}">${q.percent >= 0 ? '+' : ''}${q.percent.toFixed(2)}%</span>
                    <span class="qcard-hl">H ${fmtPrice(q.high)} · L ${fmtPrice(q.low)}</span>
                  </div>
                </div>`).join('')}
            </div>`;
        }).join('')}
      </div>`;
    body.querySelector('#refresh-quotes').addEventListener('click', async () => {
      await loadQuotes();
      renderHarga();
      toast('Harga diperbarui');
    });
  }

  async function loadQuotes() {
    try {
      const res = await api.get('/market/quotes');
      quotes = res.quotes || [];
    } catch {
      quotes = [];
    }
  }

  /* Isi cache simbol yang belum punya harga, satu per satu agar tidak kena limit. */
  async function warmQuotes() {
    for (let i = 0; i < 12; i += 1) {
      const missing = quotes.filter((q) => !q.price).length;
      if (!missing) return;
      try {
        const r = await api.get('/market/quotes/warm');
        if (!r.warmed) {
          await new Promise((res) => setTimeout(res, 8000));
          continue;
        }
      } catch {
        await new Promise((res) => setTimeout(res, 8000));
        continue;
      }
      await loadQuotes();
      if (tab === 'harga') renderHarga();
      await new Promise((res) => setTimeout(res, 7500));
    }
  }

  /* ================= KALENDER ================= */
  function renderKalender() {
    body.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div><h3>Kalender Ekonomi</h3><div class="hint" id="cal-source">Memuat…</div></div>
          <div class="seg" id="cal-week">
            <button data-week="thisweek" class="${calWeek === 'thisweek' ? 'active' : ''}">Minggu ini</button>
            <button data-week="nextweek" class="${calWeek === 'nextweek' ? 'active' : ''}">Minggu depan</button>
          </div>
        </div>
        <div class="cal-toolbar">
          <div class="cal-days" id="cal-days"></div>
          <div class="cal-impacts" id="cal-impacts">
            <button data-impact="all" class="${calImpact === 'all' ? 'active' : ''}">Semua</button>
            <button data-impact="high" class="${calImpact === 'high' ? 'active' : ''}"><i class="impact High"></i> High</button>
            <button data-impact="medium" class="${calImpact === 'medium' ? 'active' : ''}"><i class="impact Medium"></i> Medium</button>
            <button data-impact="low" class="${calImpact === 'low' ? 'active' : ''}"><i class="impact Low"></i> Low</button>
          </div>
        </div>
        <div id="calendar-body"><div class="skeleton" style="height:220px"></div></div>
      </div>`;

    body.querySelectorAll('#cal-week button').forEach((b) => {
      b.addEventListener('click', () => {
        calWeek = b.dataset.week;
        calDay = null;
        body.querySelectorAll('#cal-week button').forEach((x) => x.classList.toggle('active', x === b));
        loadCalendar();
      });
    });
    body.querySelectorAll('#cal-impacts button').forEach((b) => {
      b.addEventListener('click', () => {
        calImpact = b.dataset.impact;
        body.querySelectorAll('#cal-impacts button').forEach((x) => x.classList.toggle('active', x === b));
        loadCalendar();
      });
    });
    loadCalendar();
  }

  async function loadCalendar() {
    const box = body.querySelector('#calendar-body');
    const daysBox = body.querySelector('#cal-days');
    if (!box) return;
    box.innerHTML = '<div class="skeleton" style="height:220px"></div>';
    try {
      const qs = new URLSearchParams({ week: calWeek, impact: calImpact });
      if (calDay) qs.set('day', calDay);
      const data = await api.get(`/market/calendar?${qs}`);
      body.querySelector('#cal-source').textContent = data.source;
      calDay = data.day;

      daysBox.innerHTML = (data.days || []).map((d) => {
        const dt = new Date(`${d}T00:00:00`);
        const count = (data.all || []).filter((e) => e.date === d).length;
        return `<button class="cal-day-btn${d === calDay ? ' active' : ''}" data-day="${d}">
          <span class="cd-dow">${dt.toLocaleDateString('id-ID', { weekday: 'short' })}</span>
          <span class="cd-num">${dt.getDate()}</span>
          <span class="cd-mon">${dt.toLocaleDateString('id-ID', { month: 'short' })}</span>
          <span class="cd-count">${count}</span>
        </button>`;
      }).join('');

      daysBox.querySelectorAll('.cal-day-btn').forEach((b) => {
        b.addEventListener('click', () => {
          calDay = b.dataset.day;
          daysBox.querySelectorAll('.cal-day-btn').forEach((x) => x.classList.toggle('active', x === b));
          loadCalendar();
        });
      });

      const list = data.events || [];
      box.innerHTML = list.length ? `
        <div class="cal-head">
          <span>Waktu</span><span>Impact</span><span>Mata Uang</span><span>Event</span>
          <span class="ta-r">Actual</span><span class="ta-r">Forecast</span><span class="ta-r">Previous</span>
        </div>
        ${list.map((e) => `
          <div class="cal-row impact-${e.impact}">
            <span class="cr-time">${e.time}</span>
            <span class="cr-impact"><i class="impact ${e.impact}"></i><b>${IMPACT_LABEL[e.impact] || e.impact}</b></span>
            <span class="cr-cur">${esc(e.currency)}</span>
            <span class="cr-event">${esc(e.event)}</span>
            <span class="cr-val actual" data-l="Actual">${esc(e.actual || '—')}</span>
            <span class="cr-val forecast" data-l="Forecast">${esc(e.forecast || '—')}</span>
            <span class="cr-val" data-l="Previous">${esc(e.previous || '—')}</span>
          </div>`).join('')}
      ` : '<div class="empty">Tidak ada event pada filter ini</div>';
    } catch (e) {
      box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }

  /* ================= SESI ================= */
  function renderSesi() {
    body.innerHTML = `
      <div class="card" style="margin-bottom:18px">
        <div class="card-head">
          <div><h3>Jam Sesi Pasar</h3><div class="hint" id="session-clock"></div></div>
          <div class="seg" id="tz-toggle">
            <button data-tz="wib" class="active">WIB</button>
            <button data-tz="utc">UTC</button>
            <button data-tz="local">Lokal</button>
          </div>
        </div>
        <div class="session-map" id="session-map"></div>
        <div class="session-bars" id="session-bars"></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Detail Sesi</h3><div class="hint">Zona waktu & status realtime</div></div></div>
        <div class="session-list" id="session-list"></div>
        <div class="session-note">
          ${icons.clock} Sesi aktif menandakan likuiditas tinggi. Overlap London–New York biasanya paling volatil.
        </div>
      </div>`;

    let tzMode = 'wib';
    body.querySelectorAll('#tz-toggle button').forEach((b) => {
      b.addEventListener('click', () => {
        tzMode = b.dataset.tz;
        body.querySelectorAll('#tz-toggle button').forEach((x) => x.classList.toggle('active', x === b));
        paintSessions(tzMode);
      });
    });
    paintSessions(tzMode);
    const timer = setInterval(() => paintSessions(tzMode), 1000);
    ctx.onCleanup(() => clearInterval(timer));
  }

  function tzOffsetHours(mode) {
    if (mode === 'utc') return 0;
    if (mode === 'wib') return 7;
    return -new Date().getTimezoneOffset() / 60;
  }

  function paintSessions(mode) {
    const clockEl = body.querySelector('#session-clock');
    const mapEl = body.querySelector('#session-map');
    const barsEl = body.querySelector('#session-bars');
    const listEl = body.querySelector('#session-list');
    if (!clockEl) return;

    const now = new Date();
    const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const off = tzOffsetHours(mode);
    const tzLabel = mode === 'utc' ? 'UTC' : mode === 'wib' ? 'WIB' : 'Lokal';
    clockEl.textContent = `${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ${tzLabel}`;

    const isOpen = (s) => (s.open < s.close ? utcH >= s.open && utcH < s.close : utcH >= s.open || utcH < s.close);

    /* --- Peta dunia sederhana (equirectangular) --- */
    const px = (lng) => ((lng + 180) / 360) * 100;
    const py = (lat) => ((90 - lat) / 180) * 100;
    mapEl.innerHTML = `
      <img class="map-world" src="/img/world-map.svg" alt="Peta dunia" />
      <div class="map-grid"></div>
      ${SESSIONS.map((s) => `
        <div class="map-pin ${isOpen(s) ? 'open' : ''}" style="left:${px(s.lng)}%;top:${py(s.lat)}%">
          <span class="mp-ring"></span>
          <span class="mp-dot"></span>
          <span class="mp-label">${s.flag} ${s.city}</span>
        </div>`).join('')}
      <div class="map-legend">
        <span><i class="mp-dot open"></i> Sesi buka</span>
        <span><i class="mp-dot"></i> Tutup</span>
      </div>`;

    /* --- Bar waktu 24 jam --- */
    const hourMarks = Array.from({ length: 24 }, (_, i) => {
      const h = (i + off + 24) % 24;
      return `<span class="sb-mark">${String(Math.round(h)).padStart(2, '0')}</span>`;
    }).join('');

    barsEl.innerHTML = `
      <div class="sb-axis">${hourMarks}</div>
      ${SESSIONS.map((s) => {
        const start = ((s.open + off) % 24 + 24) % 24;
        const dur = ((s.close - s.open + 24) % 24) || 24;
        const segs = [];
        if (start + dur <= 24) {
          segs.push({ left: start, width: dur });
        } else {
          segs.push({ left: start, width: 24 - start });
          segs.push({ left: 0, width: start + dur - 24 });
        }
        return `<div class="sb-row">
          <span class="sb-name">${s.flag} ${s.name}</span>
          <div class="sb-track">
            ${segs.map((g) => `<span class="sb-fill ${isOpen(s) ? 'open' : ''}" style="left:${(g.left / 24) * 100}%;width:${(g.width / 24) * 100}%"></span>`).join('')}
            <span class="sb-now" style="left:${((utcH + off) % 24) / 24 * 100}%"></span>
          </div>
        </div>`;
      }).join('')}`;

    /* --- Daftar detail --- */
    listEl.innerHTML = SESSIONS.map((s) => {
      const open = isOpen(s);
      const localTime = new Date(now.toLocaleString('en-US', { timeZone: s.tz }))
        .toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const fmtH = (h) => `${String(h).padStart(2, '0')}:00`;
      const openLocal = ((s.open + off) % 24 + 24) % 24;
      const closeLocal = ((s.close + off) % 24 + 24) % 24;
      return `<div class="session ${open ? 'open' : ''}">
        <span class="flag">${s.flag}</span>
        <div class="info">
          <strong>${s.name}</strong>
          <span>${fmtH(openLocal)}–${fmtH(closeLocal)} ${tzLabel} · waktu lokal ${localTime}</span>
        </div>
        <span class="state">${open ? '● Open' : 'Closed'}</span>
      </div>`;
    }).join('');
  }

  /* ================= BERITA ================= */
  function renderBerita() {
    body.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div><h3>Berita Pasar</h3><div class="hint" id="news-hint">Agregasi sumber terpercaya</div></div>
          <button class="btn btn-sm btn-ghost" id="refresh-news">${icons.refresh} Muat ulang</button>
        </div>
        <div class="news-cats" id="news-cats"></div>
        <div id="news-body"><div class="skeleton" style="height:180px"></div></div>
      </div>`;
    body.querySelector('#refresh-news').addEventListener('click', () => loadNews());
    loadNews();
  }

  async function loadNews() {
    const box = body.querySelector('#news-body');
    const catsBox = body.querySelector('#news-cats');
    if (!box) return;
    box.innerHTML = '<div class="skeleton" style="height:180px"></div>';
    try {
      const data = await api.get(`/market/news?category=${newsCat}`);
      if (catsBox && data.categories) {
        catsBox.innerHTML = data.categories.map((c) => `
          <button class="news-cat${c.id === newsCat ? ' active' : ''}" data-cat="${c.id}">${c.label}</button>`).join('');
        catsBox.querySelectorAll('.news-cat').forEach((b) => {
          b.addEventListener('click', () => {
            newsCat = b.dataset.cat;
            loadNews();
          });
        });
      }
      body.querySelector('#news-hint').textContent = `${data.total || 0} berita · ${(data.sources || []).join(', ')}`;
      box.innerHTML = (data.items || []).map((n) => `
        <div class="news-item">
          <div class="src">${esc(n.source)}</div>
          <div>
            <h4><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a></h4>
            ${n.summary ? `<p>${esc(n.summary)}</p>` : ''}
            <div class="news-tags">
              ${(n.tags || []).map((t) => `<span class="news-tag">${esc(t)}</span>`).join('')}
              <span class="when">${n.published ? fmtDate(n.published, { hour: '2-digit', minute: '2-digit' }) : ''}</span>
            </div>
          </div>
        </div>`).join('') || '<div class="empty">Belum ada berita untuk kategori ini</div>';
    } catch (e) {
      box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }

  /* ================= ROUTER TAB ================= */
  function paint() {
    if (tab === 'harga') renderHarga();
    else if (tab === 'kalender') renderKalender();
    else if (tab === 'sesi') renderSesi();
    else renderBerita();
  }

  page.querySelectorAll('.tools-tab').forEach((b) => {
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      page.querySelectorAll('.tools-tab').forEach((x) => x.classList.toggle('active', x === tab));
      paint();
    });
  });

  await loadQuotes();
  paint();
  warmQuotes();
}
