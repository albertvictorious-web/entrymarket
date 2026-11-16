import { api } from '../api.js';
import { icons } from '../icons.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { fmtUSD, fmtIDR, fmtNum, fmtDate, esc } from '../utils.js';

export async function renderRewards(root, ctx) {
  const isAdmin = ctx.user.role === 'admin';

  root.innerHTML = `<div class="page">
    <div class="card dark" style="margin-bottom:18px">
      <div class="card-head">
        <div><h3>Program Reward</h3><div class="hint">Reward cash untuk closing & traveling untuk target NMI</div></div>
        <span class="chip" style="font-size:11px">${icons.gift} Periode 30 hari</span>
      </div>
      <div class="grid grid-2" id="travel-cards"></div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="card-head">
        <div><h3>Reward Cash Closing</h3><div class="hint">Setiap kelipatan closing $10.000 = Rp 500.000</div></div>
      </div>
      <div id="closing-summary"></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Closing</th><th class="num">Reward Tunai</th><th>Progres</th><th>Status</th><th></th></tr></thead>
          <tbody id="cash-tiers"></tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div><h3>Reward Saya</h3><div class="hint">${isAdmin ? 'Semua reward marketing' : 'Reward yang bisa Anda claim'}</div></div>
        ${isAdmin ? `<button class="btn btn-sm btn-primary" id="grant-reward">${icons.plus} Beri Reward</button>` : ''}
      </div>
      <div id="my-rewards"></div>
    </div>
  </div>`;

  const page = root.querySelector('.page');

  async function load() {
    const [programs, progress, rewards] = await Promise.all([
      api.get('/rewards/programs'),
      api.get('/rewards/progress'),
      api.get('/rewards'),
    ]);

    page.querySelector('#travel-cards').innerHTML = progress.travel.map((t) => `
      <div>
        <div class="reward-cover ${t.cover}">
          <span class="rc-tag">${t.achieved ? '✓ Tercapai' : 'Target ' + t.periodDays + ' hari'}</span>
          <span class="rc-emoji">${t.cover === 'bali' ? '🏝️' : '✈️'}</span>
          <div>
            <h4>${esc(t.title)}</h4>
            <p>${esc(t.destination)}</p>
          </div>
        </div>
        <div style="margin-top:14px">
          <div class="prog-row"><span style="color:rgba(255,255,255,.55)">NMI</span><b style="color:#fff">${fmtUSD(progress.nmi)} / ${fmtUSD(t.targetNmi)}</b></div>
          <div class="progress" style="background:rgba(255,255,255,.1)"><i style="width:${t.nmiProgress}%"></i></div>
          <div class="prog-row" style="margin-top:10px"><span style="color:rgba(255,255,255,.55)">Valid Lot</span><b style="color:#fff">${fmtNum(progress.lots)} / ${fmtNum(t.targetLots, 0)}</b></div>
          <div class="progress" style="background:rgba(255,255,255,.1)"><i style="width:${t.lotsProgress}%"></i></div>
          <ul class="req-list">
            ${t.benefits.map((b) => `<li style="color:rgba(255,255,255,.62)"><span style="width:15px;height:15px;display:inline-flex;color:#4ade80">${icons.check}</span>${esc(b)}</li>`).join('')}
          </ul>
        </div>
      </div>`).join('');

    const closing = progress.closing || 0;
    const nextTier = progress.nextTier;
    page.querySelector('#closing-summary').innerHTML = `
      <div class="closing-sum">
        <div class="cs-top">
          <div>
            <div class="cs-k">Total Closing ${isAdmin ? 'Tim' : 'Anda'} · 30 hari</div>
            <div class="cs-v">${fmtUSD(closing)}</div>
          </div>
          <div class="cs-next">
            ${nextTier
              ? `<span>Menuju ${fmtUSD(nextTier.closing)}</span><b>${fmtIDR(nextTier.cash)}</b>`
              : `<span>Target tertinggi tercapai</span><b>${fmtIDR(programs.cashTiers[programs.cashTiers.length - 1].cash)}</b>`}
          </div>
        </div>
        <div class="progress" style="height:10px"><i style="width:${progress.closingProgress || 0}%"></i></div>
        <div class="cs-foot">
          <span>${progress.closingProgress || 0}% dari target maksimum ${fmtUSD(programs.cashTiers[programs.cashTiers.length - 1].closing)}</span>
          ${nextTier ? `<span>Kurang ${fmtUSD(Math.max(0, nextTier.closing - closing))} lagi</span>` : '<span>Semua tier terbuka 🎉</span>'}
        </div>
      </div>`;

    page.querySelector('#cash-tiers').innerHTML = programs.cashTiers.map((t) => {
      const owned = rewards.find((r) => r.type === 'cash' && r.closingAmount === t.closing);
      const pct = t.progress ?? Math.min(100, Math.round((closing / t.closing) * 100));
      const achieved = t.achieved ?? closing >= t.closing;
      return `<tr class="${achieved ? 'tier-achieved' : ''}">
        <td><strong>Closing ${fmtUSD(t.closing)}</strong></td>
        <td class="num" style="font-weight:800;color:var(--brand)">${fmtIDR(t.cash)}</td>
        <td style="min-width:130px">
          <div class="tier-prog">
            <div class="progress" style="height:7px"><i style="width:${pct}%"></i></div>
            <span>${pct}%</span>
          </div>
        </td>
        <td>${owned
          ? `<span class="badge ${owned.status === 'claimed' ? 'green' : 'amber'}">${owned.status === 'claimed' ? 'Sudah di-claim' : 'Tersedia'}</span>`
          : achieved
            ? '<span class="badge amber">Siap di-claim</span>'
            : '<span class="badge gray">Belum tercapai</span>'}</td>
        <td class="num">${owned && owned.status === 'available' && !isAdmin
          ? `<button class="btn btn-sm btn-primary" data-claim="${owned.id}">Claim</button>`
          : achieved && !owned && !isAdmin
            ? `<button class="btn btn-sm btn-primary" data-request="${t.closing}">Claim</button>`
            : ''}</td>
      </tr>`;
    }).join('');

    page.querySelectorAll('[data-request]').forEach((b) => {
      b.addEventListener('click', async () => {
        const tier = programs.cashTiers.find((t) => String(t.closing) === b.dataset.request);
        const ok = await confirmDialog(
          `Ajukan claim ${fmtIDR(tier.cash)}?`,
          `Reward untuk closing ${fmtUSD(tier.closing)} akan diajukan ke admin untuk diverifikasi.`,
        );
        if (!ok) return;
        try {
          await api.post('/rewards/request', { closingAmount: tier.closing });
          toast('Pengajuan claim terkirim ke admin', 'success');
          load();
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    page.querySelector('#my-rewards').innerHTML = rewards.length ? `<div class="table-wrap">
      <table>
        <thead><tr><th>Reward</th>${isAdmin ? '<th>Marketing</th>' : ''}<th class="num">Nilai</th><th>Status</th><th>Tanggal</th><th></th></tr></thead>
        <tbody>
          ${rewards.map((r) => `
            <tr>
              <td><strong>${esc(r.title)}</strong></td>
              ${isAdmin ? `<td>${esc(r.marketingName)}</td>` : ''}
              <td class="num" style="font-weight:700">${r.cashValue ? fmtIDR(r.cashValue) : '—'}</td>
              <td><span class="badge ${r.status === 'claimed' ? 'green' : 'amber'}">${r.status === 'claimed' ? 'Di-claim' : 'Tersedia'}</span></td>
              <td style="color:var(--text-3);font-size:12.5px">${fmtDate(r.claimedAt || r.createdAt)}</td>
              <td class="num">
                ${r.status === 'available' && !isAdmin ? `<button class="btn btn-sm btn-primary" data-claim="${r.id}">Claim</button>` : ''}
                ${isAdmin ? `<button class="icon-btn" style="width:30px;height:30px" data-del="${r.id}">${icons.trash}</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '<div class="empty">Belum ada reward. Capai target closing untuk mendapatkan reward!</div>';

    page.querySelectorAll('[data-claim]').forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          await api.post(`/rewards/${b.dataset.claim}/claim`, {});
          toast('Reward berhasil di-claim! Admin akan menghubungi Anda.', 'success');
          load();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
    page.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', () => confirmDialog('Hapus reward ini?', async () => {
        await api.del(`/rewards/${b.dataset.del}`);
        toast('Reward dihapus', 'success');
        load();
      }));
    });
  }

  page.querySelector('#grant-reward')?.addEventListener('click', () => openGrantReward(load));

  await load();
}

async function openGrantReward(reload) {
  const [marketers, programs] = await Promise.all([
    api.get('/auth/marketers'),
    api.get('/rewards/programs'),
  ]);
  openModal({
    title: 'Beri Reward ke Marketing',
    body: `
      <form id="grant-form">
        <div class="field"><label>Marketing</label>
          <select name="marketingId">${marketers.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Closing (USD)</label>
          <select name="closingAmount" id="closing-select">
            ${programs.cashTiers.map((t) => `<option value="${t.closing}">${fmtUSD(t.closing)} → ${fmtIDR(t.cash)}</option>`).join('')}
          </select></div>
        <div class="field"><label>Judul Reward</label><input name="title" id="reward-title" value="Reward Closing $10.000" /></div>
      </form>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button>
             <button class="btn btn-primary" id="save-grant">Beri Reward</button>`,
    onMount: (modal, close) => {
      const sel = modal.querySelector('#closing-select');
      const title = modal.querySelector('#reward-title');
      sel.addEventListener('change', () => {
        title.value = `Reward Closing ${fmtUSD(Number(sel.value))}`;
      });
      modal.querySelector('#save-grant').addEventListener('click', async () => {
        const fd = new FormData(modal.querySelector('#grant-form'));
        const closing = Number(fd.get('closingAmount'));
        const tier = programs.cashTiers.find((t) => t.closing === closing);
        try {
          await api.post('/rewards', {
            marketingId: fd.get('marketingId'),
            type: 'cash',
            title: fd.get('title'),
            closingAmount: closing,
            cashValue: tier?.cash || 0,
          });
          toast('Reward diberikan', 'success');
          close();
          reload();
        } catch (e) { toast(e.message, 'error'); }
      });
    },
  });
}
