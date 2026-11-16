import { api } from '../api.js';
import { icons } from '../icons.js';
import { fmtUSD, fmtNum, fmtDate, initials, esc } from '../utils.js';

const RANGES = [
  { id: '7d', label: '7 hari' },
  { id: '30d', label: '30 hari' },
  { id: '90d', label: '90 hari' },
];

export async function renderLeaderboard(root, ctx) {
  const state = { range: '30d' };
  root.innerHTML = `<div class="page">
    <div class="card dark" style="margin-bottom:18px">
      <div class="card-head">
        <div><h3>NMI Leaderboard</h3><div class="hint">Peringkat berdasarkan Net Margin In seluruh marketing</div></div>
        <div class="seg" style="background:rgba(255,255,255,.08)" id="lb-range">
          ${RANGES.map((r) => `<button data-range="${r.id}" class="${state.range === r.id ? 'active' : ''}" style="${state.range === r.id ? '' : 'color:rgba(255,255,255,.6)'}">${r.label}</button>`).join('')}
        </div>
      </div>
      <div id="podium"></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Klasemen Lengkap</h3><span class="hint" id="lb-count"></span></div>
      <div id="lb-table"></div>
    </div>
  </div>`;

  const page = root.querySelector('.page');

  async function load() {
    const list = await api.get(`/leaderboard?range=${state.range}`);
    const max = Math.max(...list.map((l) => l.nmi), 1);
    const top3 = list.slice(0, 3);
    const order = [1, 0, 2];

    page.querySelector('#podium').innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;align-items:end">
      ${order.map((i) => {
        const l = top3[i];
        if (!l) return '<div></div>';
        const h = i === 0 ? 118 : i === 1 ? 92 : 76;
        const medal = ['🥇', '🥈', '🥉'][i];
        return `<div style="text-align:center">
          <div style="font-size:22px;margin-bottom:6px">${medal}</div>
          <div class="avatar" style="margin:0 auto 8px;width:${i === 0 ? 52 : 42}px;height:${i === 0 ? 52 : 42}px;flex-basis:auto;font-size:${i === 0 ? 17 : 14}px">${initials(l.name)}</div>
          <div style="font-size:12.5px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.name)}</div>
          <div style="font-size:11.5px;color:rgba(255,255,255,.5);margin-bottom:8px">${fmtUSD(l.nmi)}</div>
          <div style="height:${h}px;border-radius:12px 12px 0 0;background:linear-gradient(180deg,rgba(152,39,136,.55),rgba(152,39,136,.08));border:1px solid rgba(255,255,255,.1);border-bottom:none;display:flex;align-items:flex-start;justify-content:center;padding-top:10px">
            <span style="font-size:11px;font-weight:800;color:rgba(255,255,255,.7)">#${l.rank}</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;

    page.querySelector('#lb-count').textContent = `${list.length} marketing`;
    page.querySelector('#lb-table').innerHTML = `<div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Marketing</th><th class="num">Margin In</th><th class="num">Margin Out</th><th class="num">NMI</th><th class="num">Lot</th><th class="num">Nasabah</th><th>Bergabung</th></tr></thead>
        <tbody>
          ${list.map((l) => `
            <tr style="${l.marketingId === ctx.user.id ? 'background:var(--brand-soft)' : ''}">
              <td><div class="lb-rank ${l.rank <= 3 ? 'g' + l.rank : ''}">${l.rank}</div></td>
              <td><div class="cell-user"><div class="avatar sm">${initials(l.name)}</div>
                <div><strong>${esc(l.name)}${l.marketingId === ctx.user.id ? ' <span class="badge brand" style="margin-left:4px">Anda</span>' : ''}</strong>
                <span>${fmtUSD(l.nmi)} dari ${fmtNum(l.lots)} lot</span></div></div></td>
              <td class="num" style="color:var(--green)">${fmtUSD(l.marginIn)}</td>
              <td class="num" style="color:var(--red)">${fmtUSD(l.marginOut)}</td>
              <td class="num" style="font-weight:800">${fmtUSD(l.nmi)}</td>
              <td class="num">${fmtNum(l.lots)}</td>
              <td class="num">${l.clients}</td>
              <td style="color:var(--text-3);font-size:12.5px">${fmtDate(l.joinedAt)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  page.querySelectorAll('#lb-range button').forEach((b) => {
    b.addEventListener('click', () => {
      state.range = b.dataset.range;
      page.querySelectorAll('#lb-range button').forEach((x) => x.classList.toggle('active', x === b));
      load();
    });
  });

  await load();
}
