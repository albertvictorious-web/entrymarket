import { api } from '../api.js';
import { icons } from '../icons.js';
import { areaChart } from '../ui.js';
import {
  fmtUSD, fmtCompact, fmtNum, timeAgo, initials, esc, LEAD_STATUS,
} from '../utils.js';

const RANGES = [
  { id: 'today', label: 'Hari ini' },
  { id: '7d', label: '7 hari' },
  { id: '30d', label: '30 hari' },
  { id: '90d', label: '90 hari' },
];

export async function renderDashboard(root, ctx) {
  const state = { range: '30d' };

  root.innerHTML = `<div class="page" id="dash-page">
    <div class="skeleton" style="height:280px;border-radius:26px;margin-bottom:18px"></div>
    <div class="grid grid-4" style="margin-bottom:18px">
      ${'<div class="skeleton" style="height:120px;border-radius:20px"></div>'.repeat(4)}
    </div>
  </div>`;

  const page = root.querySelector('#dash-page');

  async function load() {
    const [data, quotes, leads] = await Promise.all([
      api.get(`/dashboard/overview?range=${state.range}`),
      api.get('/market/quotes?symbols=XAUUSD,EURUSD,GBPUSD,USDJPY').catch(() => ({ quotes: [] })),
      api.get('/leads').catch(() => []),
    ]);
    paint(data, quotes.quotes || [], leads);
  }

  function paint(d, quotes, leads) {
    const isAdmin = d.me.role === 'admin';
    const trend = d.trend.map((t) => ({
      value: t.nmi,
      label: new Date(t.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
    }));
    const topLeads = leads.filter((l) => l.status !== 'lost').slice(0, 5);
    const maxNmi = Math.max(...d.leaderboard.map((l) => l.nmi), 1);

    page.innerHTML = `
      <section class="hero">
        <div class="hero-top">
          <div>
            <div class="hero-eyebrow"><span class="pulse"></span> Live Dashboard · ${RANGES.find((r) => r.id === state.range).label}</div>
            <h1>Halo, ${esc(d.me.name.split(' ')[0])} 👋</h1>
            <p class="hero-sub">${isAdmin
              ? `Ringkasan performa ${d.totalMarketers} marketing Entry Market`
              : `Peringkat Anda saat ini <b style="color:#fff">#${d.myRank || '-'}</b> dari ${d.totalMarketers} marketing`}</p>
          </div>
          <div class="seg" style="background:rgba(255,255,255,.08)">
            ${RANGES.map((r) => `<button data-range="${r.id}" class="${state.range === r.id ? 'active' : ''}" style="${state.range === r.id ? '' : 'color:rgba(255,255,255,.6)'}">${r.label}</button>`).join('')}
          </div>
        </div>

        <div class="hero-nmi">
          <div>
            <div class="label">Net Margin In (NMI)</div>
            <div class="value"><span class="cur">$</span>${Number(d.myStats.nmi).toLocaleString('en-US')}</div>
          </div>
          <span class="chip ${d.myStats.nmi >= 0 ? 'up' : 'down'}">
            ${d.myStats.nmi >= 0 ? icons.arrowUp : icons.arrowDown}
            ${fmtCompact(d.myStats.marginIn)} in · ${fmtCompact(d.myStats.marginOut)} out
          </span>
        </div>

        <div class="hero-grid">
          <div class="hero-cell"><div class="k">Margin In</div><div class="v">${fmtUSD(d.myStats.marginIn)}</div></div>
          <div class="hero-cell"><div class="k">Margin Out</div><div class="v">${fmtUSD(d.myStats.marginOut)}</div></div>
          <div class="hero-cell"><div class="k">Total Lot</div><div class="v">${fmtNum(d.myStats.lots)}<small>lot</small></div></div>
          <div class="hero-cell"><div class="k">Total Nasabah</div><div class="v">${d.myStats.clients}<small>nasabah</small></div></div>
        </div>

        <div class="hero-actions">
          <button class="btn btn-primary" data-go="nmi">${icons.plus} Catat NMI</button>
          <button class="btn btn-glass" data-go="appointments">${icons.calendar} Buat Appointment</button>
          <button class="btn btn-glass" data-go="leads">${icons.leads} Lihat Leads</button>
        </div>
      </section>

      <div class="grid grid-4" style="margin-bottom:18px">
        ${statCard('Total NMI Tim', fmtUSD(d.totals.nmi), `${d.totalMarketers} marketing aktif`, 'chart', 'var(--brand)', 'var(--brand-soft)')}
        ${statCard('Total Lot Tim', fmtNum(d.totals.lots), 'akumulasi valid lot', 'target', 'var(--blue)', 'var(--blue-soft)')}
        ${statCard('Leads Aktif', String(d.leadsCount), `${topLeads.filter((l) => l.status === 'closing').length} siap closing`, 'leads', 'var(--amber)', 'var(--amber-soft)')}
        ${statCard('Appointment', String(d.apptCount), 'jadwal mendatang', 'calendar', 'var(--green)', 'var(--green-soft)')}
      </div>

      <div class="grid grid-main" style="margin-bottom:18px">
        <div class="card dark">
          <div class="card-head">
            <div>
              <h3>Pergerakan NMI</h3>
              <div class="hint">Net margin in harian · ${RANGES.find((r) => r.id === state.range).label}</div>
            </div>
            <span class="chip up" style="font-size:11px">${icons.chart} ${fmtCompact(d.totals.nmi)}</span>
          </div>
          ${areaChart(trend, { height: 168, color: '#b93fa6', id: 'nmi' })}
        </div>

        <div class="card">
          <div class="card-head">
            <h3>Leaderboard NMI</h3>
            <button class="btn btn-sm btn-ghost" data-go="leaderboard">Semua</button>
          </div>
          <div>
            ${d.leaderboard.slice(0, 6).map((l) => `
              <div class="lb-row ${l.marketingId === d.me.id ? 'me' : ''}">
                <div class="lb-rank ${l.rank <= 3 ? 'g' + l.rank : ''}">${l.rank}</div>
                <div class="avatar sm">${initials(l.name)}</div>
                <div class="lb-main">
                  <div class="top">
                    <strong>${esc(l.name)}</strong>
                    <span class="amt">${fmtCompact(l.nmi)}</span>
                  </div>
                  <div class="lb-bar"><i style="width:${Math.max(3, (l.nmi / maxNmi) * 100)}%"></i></div>
                </div>
              </div>`).join('') || '<div class="empty">Belum ada data</div>'}
          </div>
        </div>
      </div>

      <div class="card dark" style="margin-bottom:18px">
        <div class="card-head">
          <div>
            <h3>Harga Pasar</h3>
            <div class="hint">Realtime via Twelve Data</div>
          </div>
          <span class="chip" style="font-size:11px"><span class="live-dot"></span> Live</span>
        </div>
        <div class="ticker">
          ${quotes.map((q) => `
            <div class="tick">
              <div class="sym">${esc(q.short)} <span class="live-dot" style="opacity:${q.isOpen ? 1 : 0.25}"></span></div>
              <div class="px">${q.price ? q.price.toLocaleString('en-US', { minimumFractionDigits: q.price < 10 ? 4 : 2, maximumFractionDigits: q.price < 10 ? 4 : 2 }) : '—'}</div>
              <div class="ch ${q.percent >= 0 ? 'up' : 'down'}">${q.percent >= 0 ? '+' : ''}${q.percent.toFixed(2)}%</div>
            </div>`).join('') || '<div class="empty" style="color:rgba(255,255,255,.4)">Memuat harga…</div>'}
        </div>
      </div>

      <div class="grid grid-main">
        <div class="card">
          <div class="card-head">
            <h3>Leads Terbaru</h3>
            <button class="btn btn-sm btn-ghost" data-go="leads">Kelola</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Nasabah</th><th>Sumber</th><th>Status</th><th class="num">Potensi</th></tr></thead>
              <tbody>
                ${topLeads.map((l) => `
                  <tr>
                    <td><div class="cell-user"><div class="avatar sm">${initials(l.clientName)}</div>
                      <div><strong>${esc(l.clientName)}</strong><span>${esc(l.marketingName)}</span></div></div></td>
                    <td>${esc(l.source)}</td>
                    <td><span class="badge ${LEAD_STATUS[l.status].cls}">${LEAD_STATUS[l.status].label}</span></td>
                    <td class="num">${fmtUSD(l.potential)}</td>
                  </tr>`).join('') || '<tr><td colspan="4"><div class="empty">Belum ada leads</div></td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>Pengumuman</h3>
            <button class="btn btn-sm btn-ghost" data-go="announcements">Semua</button>
          </div>
          ${d.announcements.map((a) => `
            <div style="padding:12px 0;border-bottom:1px solid var(--line)">
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
                <span class="badge ${a.category === 'reward' ? 'brand' : a.category === 'event' ? 'blue' : 'gray'}">${a.category}</span>
                <span style="font-size:11px;color:var(--text-3)">${timeAgo(a.createdAt)}</span>
              </div>
              <strong style="font-size:13px;display:block;margin-bottom:3px">${esc(a.title)}</strong>
              <p style="margin:0;font-size:12px;color:var(--text-2);line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(a.body)}</p>
            </div>`).join('') || '<div class="empty">Belum ada pengumuman</div>'}
        </div>
      </div>
    `;

    page.querySelectorAll('[data-range]').forEach((b) => {
      b.addEventListener('click', () => { state.range = b.dataset.range; load(); });
    });
    page.querySelectorAll('[data-go]').forEach((b) => {
      b.addEventListener('click', () => ctx.navigate(b.dataset.go));
    });
  }

  await load();
}

function statCard(k, v, d, ico, color, bg) {
  return `<div class="stat">
    <div class="ico" style="background:${bg};color:${color}">${icons[ico]}</div>
    <div class="k">${k}</div>
    <div class="v">${v}</div>
    <div class="d">${d}</div>
  </div>`;
}
