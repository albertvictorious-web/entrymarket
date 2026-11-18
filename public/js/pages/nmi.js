import { api } from '../api.js';
import { icons } from '../icons.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { fmtUSD, fmtNum, fmtDate, initials, esc } from '../utils.js';

const RANGES = [
  { id: '7d', label: '7 hari' },
  { id: '30d', label: '30 hari' },
  { id: '90d', label: '90 hari' },
];

export async function renderNmi(root, ctx) {
  const state = { range: '30d', type: 'all', marketingId: '' };
  const isAdmin = ctx.user.role === 'admin';

  root.innerHTML = `<div class="page">
    <div class="card dark" style="margin-bottom:18px">
      <div class="card-head">
        <div><h3>Riwayat NMI</h3><div class="hint">Margin In − Margin Out = Net Margin In</div></div>
        ${isAdmin
          ? `<button class="btn btn-primary btn-sm" id="add-nmi">${icons.plus} Catat NMI</button>`
          : `<span class="badge gray" style="padding:8px 12px">${icons.shield} Dicatat oleh admin</span>`}
      </div>
      <div class="grid grid-3" id="nmi-summary"></div>
    </div>

    <div class="card">
      <div class="card-head" style="flex-wrap:wrap">
        <h3>Transaksi</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <div class="seg" id="range-seg">
            ${RANGES.map((r) => `<button data-range="${r.id}" class="${state.range === r.id ? 'active' : ''}">${r.label}</button>`).join('')}
          </div>
          <div class="seg" id="type-seg">
            <button data-type="all" class="active">Semua</button>
            <button data-type="in">Margin In</button>
            <button data-type="out">Margin Out</button>
          </div>
        </div>
      </div>
      <div id="nmi-table"></div>
    </div>
  </div>`;

  const page = root.querySelector('.page');

  async function load() {
    const qs = new URLSearchParams({ range: state.range });
    if (state.type !== 'all') qs.set('type', state.type);
    const rows = await api.get(`/nmi?${qs}`);
    const marginIn = rows.filter((r) => r.type === 'in').reduce((a, r) => a + r.amount, 0);
    const marginOut = rows.filter((r) => r.type === 'out').reduce((a, r) => a + r.amount, 0);
    const lots = rows.reduce((a, r) => a + r.lots, 0);
    const clients = new Set(rows.map((r) => r.clientName)).size;

    page.querySelector('#nmi-summary').innerHTML = `
      ${sumCell('Margin In', fmtUSD(marginIn), '#4ade80')}
      ${sumCell('Margin Out', fmtUSD(marginOut), '#fb7185')}
      ${sumCell('Net NMI', fmtUSD(marginIn - marginOut), '#fff')}
    `;

    page.querySelector('#nmi-table').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Nasabah</th>${isAdmin ? '<th>Marketing</th>' : ''}
            <th>Tipe</th><th class="num">Nominal</th><th class="num">Lot</th><th>Tanggal</th>
            ${isAdmin ? '<th></th>' : ''}
          </tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td><div class="cell-user"><div class="avatar sm">${initials(r.clientName)}</div>
                  <div><strong>${esc(r.clientName)}</strong><span>${esc(r.note || '—')}</span></div></div></td>
                ${isAdmin ? `<td>${esc(r.marketingName)}</td>` : ''}
                <td><span class="badge ${r.type === 'in' ? 'green' : 'red'}">${r.type === 'in' ? 'Margin In' : 'Margin Out'}</span></td>
                <td class="num" style="font-weight:700;color:${r.type === 'in' ? 'var(--green)' : 'var(--red)'}">${r.type === 'in' ? '+' : '−'}${fmtUSD(r.amount)}</td>
                <td class="num">${fmtNum(r.lots)}</td>
                <td style="color:var(--text-3);font-size:12.5px">${fmtDate(r.date)}</td>
                ${isAdmin ? `<td class="num"><button class="icon-btn" style="width:30px;height:30px" data-del="${r.id}">${icons.trash}</button></td>` : ''}
              </tr>`).join('') || `<tr><td colspan="7"><div class="empty">Belum ada transaksi pada periode ini</div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:16px;font-size:12.5px;color:var(--text-2)">
        <span><b style="color:var(--text)">${rows.length}</b> transaksi</span>
        <span><b style="color:var(--text)">${clients}</b> nasabah unik</span>
        <span><b style="color:var(--text)">${fmtNum(lots)}</b> total lot</span>
      </div>`;

    page.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', () => confirmDialog('Hapus transaksi NMI ini?', async () => {
        await api.del(`/nmi/${b.dataset.del}`);
        toast('Transaksi dihapus', 'success');
        load();
      }));
    });
  }

  page.querySelectorAll('#range-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      state.range = b.dataset.range;
      page.querySelectorAll('#range-seg button').forEach((x) => x.classList.toggle('active', x === b));
      load();
    });
  });
  page.querySelectorAll('#type-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      state.type = b.dataset.type;
      page.querySelectorAll('#type-seg button').forEach((x) => x.classList.toggle('active', x === b));
      load();
    });
  });

  page.querySelector('#add-nmi')?.addEventListener('click', () => openNmiForm(ctx, load));

  await load();
}

function sumCell(k, v, color) {
  return `<div style="padding:14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)">
    <div style="font-size:11.5px;color:rgba(255,255,255,.45);font-weight:600;margin-bottom:5px">${k}</div>
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em;color:${color}">${v}</div>
  </div>`;
}

export async function openNmiForm(ctx, onDone) {
  const isAdmin = ctx.user.role === 'admin';
  if (!isAdmin) {
    toast('Pencatatan NMI hanya bisa dilakukan admin', 'error');
    return;
  }
  const marketers = await api.get('/auth/marketers');
  const today = new Date().toISOString().slice(0, 10);

  openModal({
    title: 'Catat Transaksi NMI',
    body: `
      <form id="nmi-form">
        <div class="field"><label>Marketing</label>
          <select name="marketingId" required>
            ${marketers.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
          </select></div>
        <div class="field"><label>Nama Nasabah</label>
          <input name="clientName" placeholder="Contoh: Hendra Kusuma" required /></div>
        <div class="field-row">
          <div class="field"><label>Tipe</label>
            <select name="type"><option value="in">Margin In (Deposit)</option><option value="out">Margin Out (Withdraw)</option></select>
          </div>
          <div class="field"><label>Nominal (USD)</label>
            <input name="amount" type="number" min="1" step="100" placeholder="5000" required /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Lot</label>
            <input name="lots" type="number" min="0" step="0.1" placeholder="2.5" /></div>
          <div class="field"><label>Tanggal</label>
            <input name="date" type="date" value="${today}" required /></div>
        </div>
        <div class="field"><label>Catatan</label>
          <input name="note" placeholder="Opsional" /></div>
      </form>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button>
             <button class="btn btn-primary" id="save-nmi">Simpan</button>`,
    onMount: (modal, close) => {
      modal.querySelector('#save-nmi').addEventListener('click', async () => {
        const form = modal.querySelector('#nmi-form');
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const body = Object.fromEntries(fd.entries());
        body.amount = Number(body.amount);
        body.lots = Number(body.lots) || 0;
        try {
          await api.post('/nmi', body);
          toast('Transaksi NMI tersimpan', 'success');
          close();
          onDone?.();
        } catch (e) { toast(e.message, 'error'); }
      });
    },
  });
}
