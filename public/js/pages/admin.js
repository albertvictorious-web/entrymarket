import { api } from '../api.js';
import { icons } from '../icons.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { fmtUSD, fmtNum, fmtDate, initials, esc } from '../utils.js';

export async function renderAdmin(root, ctx) {
  root.innerHTML = `<div class="page">
    <div class="card dark" style="margin-bottom:18px">
      <div class="card-head">
        <div><h3>Manajemen Marketing</h3><div class="hint">Kelola akun, pantau performa, dan atur akses</div></div>
        <button class="btn btn-primary btn-sm" id="add-marketer">${icons.plus} Tambah Marketing</button>
      </div>
      <div class="grid grid-4" id="admin-stats"></div>
    </div>
    <div class="card">
      <div class="card-head">
        <h3>Daftar Marketing</h3>
        <div class="field" style="margin:0;width:220px">
          <input id="search-marketer" placeholder="Cari nama / email…" style="padding:8px 12px" />
        </div>
      </div>
      <div id="marketer-table"></div>
    </div>
  </div>`;

  const page = root.querySelector('.page');
  let all = [];
  let perf = [];

  async function load() {
    [all, perf] = await Promise.all([
      api.get('/auth/marketers'),
      api.get('/leaderboard?range=30d'),
    ]);
    const totalNmi = perf.reduce((a, p) => a + p.nmi, 0);
    const totalLots = perf.reduce((a, p) => a + p.lots, 0);
    const active = all.filter((m) => m.active).length;

    page.querySelector('#admin-stats').innerHTML = `
      ${cell('Total Marketing', String(all.length), `${active} aktif`)}
      ${cell('Total NMI 30 hari', fmtUSD(totalNmi), 'seluruh tim')}
      ${cell('Total Lot', fmtNum(totalLots), 'valid lot')}
      ${cell('Rata-rata NMI', fmtUSD(all.length ? totalNmi / all.length : 0), 'per marketing')}
    `;
    paintTable();
  }

  function paintTable() {
    const q = (page.querySelector('#search-marketer').value || '').toLowerCase();
    const rows = all.filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.includes(q));
    page.querySelector('#marketer-table').innerHTML = `<div class="table-wrap">
      <table>
        <thead><tr><th>Marketing</th><th>Kontak</th><th class="num">NMI 30h</th><th class="num">Lot</th><th class="num">Nasabah</th><th>Bergabung</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map((m) => {
            const p = perf.find((x) => x.marketingId === m.id) || { nmi: 0, lots: 0, clients: 0 };
            return `<tr>
              <td><div class="cell-user"><div class="avatar sm">${initials(m.name)}</div>
                <div><strong>${esc(m.name)}</strong><span>${esc(m.email)}</span></div></div></td>
              <td style="font-size:12.5px;color:var(--text-2)">${esc(m.phone || '—')}</td>
              <td class="num" style="font-weight:700">${fmtUSD(p.nmi)}</td>
              <td class="num">${fmtNum(p.lots)}</td>
              <td class="num">${p.clients}</td>
              <td style="font-size:12.5px;color:var(--text-3)">${fmtDate(m.joinedAt)}</td>
              <td><span class="badge ${m.active ? 'green' : 'gray'}">${m.active ? 'Aktif' : 'Nonaktif'}</span></td>
              <td class="num" style="white-space:nowrap">
                <button class="icon-btn" style="width:30px;height:30px" data-edit="${m.id}">${icons.edit}</button>
                <button class="icon-btn" style="width:30px;height:30px" data-toggle="${m.id}">${m.active ? icons.close : icons.check}</button>
                <button class="icon-btn" style="width:30px;height:30px" data-del="${m.id}">${icons.trash}</button>
              </td>
            </tr>`;
          }).join('') || '<tr><td colspan="8"><div class="empty">Tidak ada marketing</div></td></tr>'}
        </tbody>
      </table>
    </div>`;

    page.querySelectorAll('[data-edit]').forEach((b) => {
      b.addEventListener('click', () => openEdit(all.find((m) => m.id === b.dataset.edit), load));
    });
    page.querySelectorAll('[data-toggle]').forEach((b) => {
      b.addEventListener('click', async () => {
        const m = all.find((x) => x.id === b.dataset.toggle);
        await api.patch(`/auth/marketers/${m.id}`, { active: !m.active });
        toast(`Akun ${m.name} ${m.active ? 'dinonaktifkan' : 'diaktifkan'}`, 'success');
        load();
      });
    });
    page.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', () => confirmDialog('Hapus akun marketing ini? Data NMI & leads tetap tersimpan.', async () => {
        await api.del(`/auth/marketers/${b.dataset.del}`);
        toast('Marketing dihapus', 'success');
        load();
      }));
    });
  }

  page.querySelector('#search-marketer').addEventListener('input', paintTable);
  page.querySelector('#add-marketer').addEventListener('click', () => openAdd(load));

  await load();
}

function cell(k, v, d) {
  return `<div style="padding:14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)">
    <div style="font-size:11.5px;color:rgba(255,255,255,.45);font-weight:600;margin-bottom:5px">${k}</div>
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em;color:#fff">${v}</div>
    <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:3px">${d}</div>
  </div>`;
}

function openAdd(reload) {
  const today = new Date().toISOString().slice(0, 10);
  openModal({
    title: 'Tambah Marketing',
    body: `
      <form id="mk-form">
        <div class="field"><label>Nama Lengkap</label><input name="name" required /></div>
        <div class="field"><label>Email</label><input name="email" type="email" required /></div>
        <div class="field-row">
          <div class="field"><label>Password</label><input name="password" type="text" value="marketing123" required /></div>
          <div class="field"><label>No. HP</label><input name="phone" placeholder="0812xxxxxxx" /></div>
        </div>
        <div class="field"><label>Bergabung Sejak</label><input name="joinedAt" type="date" value="${today}" /></div>
      </form>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button>
             <button class="btn btn-primary" id="save-mk">Simpan</button>`,
    onMount: (modal, close) => {
      modal.querySelector('#save-mk').addEventListener('click', async () => {
        const form = modal.querySelector('#mk-form');
        if (!form.reportValidity()) return;
        try {
          await api.post('/auth/marketers', Object.fromEntries(new FormData(form).entries()));
          toast('Marketing ditambahkan', 'success');
          close();
          reload();
        } catch (e) { toast(e.message, 'error'); }
      });
    },
  });
}

function openEdit(m, reload) {
  openModal({
    title: 'Edit Marketing',
    body: `
      <form id="mk-edit">
        <div class="field"><label>Nama Lengkap</label><input name="name" value="${esc(m.name)}" required /></div>
        <div class="field"><label>Email</label><input value="${esc(m.email)}" disabled style="background:var(--paper);color:var(--text-3)" /></div>
        <div class="field-row">
          <div class="field"><label>No. HP</label><input name="phone" value="${esc(m.phone || '')}" /></div>
          <div class="field"><label>Bergabung Sejak</label><input name="joinedAt" type="date" value="${new Date(m.joinedAt).toISOString().slice(0, 10)}" /></div>
        </div>
        <div class="field"><label>Password Baru (opsional)</label><input name="password" type="text" placeholder="Kosongkan jika tidak diubah" /></div>
      </form>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button>
             <button class="btn btn-primary" id="save-edit">Simpan Perubahan</button>`,
    onMount: (modal, close) => {
      modal.querySelector('#save-edit').addEventListener('click', async () => {
        const fd = new FormData(modal.querySelector('#mk-edit'));
        const body = Object.fromEntries(fd.entries());
        if (!body.password) delete body.password;
        try {
          await api.patch(`/auth/marketers/${m.id}`, body);
          toast('Data marketing diperbarui', 'success');
          close();
          reload();
        } catch (e) { toast(e.message, 'error'); }
      });
    },
  });
}
