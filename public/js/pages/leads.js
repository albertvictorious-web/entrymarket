import { api } from '../api.js';
import { icons } from '../icons.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { fmtUSD, fmtDate, initials, esc, LEAD_STATUS } from '../utils.js';

const COLUMNS = ['new', 'contacted', 'prospect', 'closing', 'lost'];

export async function renderLeads(root, ctx) {
  const isAdmin = ctx.user.role === 'admin';
  const state = { view: 'kanban', marketingId: '' };

  root.innerHTML = `<div class="page">
    <div class="card" style="margin-bottom:18px">
      <div class="card-head" style="flex-wrap:wrap">
        <div>
          <h3>Leads Nasabah</h3>
          <div class="hint">${isAdmin ? 'Semua leads marketing — bisa dibagikan & dipantau' : 'Leads yang dibagikan admin & leads Anda'}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <div class="seg" id="view-seg">
            <button data-view="kanban" class="active">Kanban</button>
            <button data-view="table">Tabel</button>
          </div>
          ${isAdmin ? `<button class="btn btn-ghost btn-sm" id="import-lead">${icons.upload} Import</button>
          <button class="btn btn-ghost btn-sm" id="distribute-lead">${icons.users} Bagi Rata</button>` : ''}
          <button class="btn btn-primary btn-sm" id="add-lead">${icons.plus} ${isAdmin ? 'Tambah Leads' : 'Lead Baru'}</button>
        </div>
      </div>
      ${isAdmin ? `<div class="field" style="margin:0;max-width:260px">
        <select id="filter-marketing"><option value="">Semua marketing</option></select>
      </div>` : ''}
      <div id="leads-body" style="margin-top:16px"></div>
    </div>
  </div>`;

  const page = root.querySelector('.page');
  let marketers = [];

  if (isAdmin) {
    marketers = await api.get('/auth/marketers');
    const sel = page.querySelector('#filter-marketing');
    sel.innerHTML += marketers.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    sel.addEventListener('change', () => { state.marketingId = sel.value; load(); });
  }

  async function load() {
    const qs = state.marketingId ? `?marketingId=${state.marketingId}` : '';
    const leads = await api.get(`/leads${qs}`);
    const body = page.querySelector('#leads-body');

    if (state.view === 'kanban') {
      body.innerHTML = `<div class="kanban">
        ${COLUMNS.map((c) => {
          const items = leads.filter((l) => l.status === c);
          return `<div class="kcol">
            <div class="kcol-head"><strong>${LEAD_STATUS[c].label}</strong><span>${items.length}</span></div>
            ${items.map((l) => `
              <div class="kcard" data-lead="${l.id}">
                <strong>${esc(l.clientName)}</strong>
                <div class="sub">${esc(l.source)} · ${esc(l.marketingName)}</div>
                ${l.address ? `<div class="sub" style="margin-top:4px">${icons.pin} ${esc(l.address)}</div>` : ''}
                <div class="foot">
                  <span class="amt">${fmtUSD(l.potential)}</span>
                  <span style="font-size:11px;color:var(--text-3)">${fmtDate(l.updatedAt, { year: undefined })}</span>
                </div>
              </div>`).join('') || '<div style="font-size:12px;color:var(--text-3);padding:8px 2px">Kosong</div>'}
          </div>`;
        }).join('')}
      </div>`;
    } else {
      body.innerHTML = `<div class="table-wrap">
        <table>
          <thead><tr><th>Nasabah</th><th>Marketing</th><th>Alamat</th><th>Sumber</th><th>Status</th><th class="num">Potensi</th><th>Update</th></tr></thead>
          <tbody>
            ${leads.map((l) => `
              <tr data-lead="${l.id}" style="cursor:pointer">
                <td><div class="cell-user"><div class="avatar sm">${initials(l.clientName)}</div>
                  <div><strong>${esc(l.clientName)}</strong><span>${esc(l.phone || '—')}</span></div></div></td>
                <td>${esc(l.marketingName)}</td>
                <td style="font-size:12.5px;color:var(--text-2);max-width:220px">${esc(l.address || '—')}</td>
                <td>${esc(l.source)}</td>
                <td><span class="badge ${LEAD_STATUS[l.status].cls}">${LEAD_STATUS[l.status].label}</span></td>
                <td class="num">${fmtUSD(l.potential)}</td>
                <td style="color:var(--text-3);font-size:12.5px">${fmtDate(l.updatedAt)}</td>
              </tr>`).join('') || '<tr><td colspan="7"><div class="empty">Belum ada leads</div></td></tr>'}
          </tbody>
        </table>
      </div>`;
    }

    body.querySelectorAll('[data-lead]').forEach((el) => {
      el.addEventListener('click', () => {
        const lead = leads.find((l) => l.id === el.dataset.lead);
        openLeadDetail(lead, ctx, marketers, load);
      });
    });
  }

  page.querySelectorAll('#view-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      state.view = b.dataset.view;
      page.querySelectorAll('#view-seg button').forEach((x) => x.classList.toggle('active', x === b));
      load();
    });
  });

  page.querySelector('#add-lead').addEventListener('click', () => openLeadForm(ctx, marketers, load));

  page.querySelector('#import-lead')?.addEventListener('click', () => openImport(load));

  page.querySelector('#distribute-lead')?.addEventListener('click', () => {
    confirmDialog(
      'Bagikan semua leads secara merata ke seluruh marketing aktif?',
      async () => {
        try {
          const r = await api.post('/leads/distribute', {});
          toast(`${r.total} leads dibagi rata ke ${r.marketers} marketing`, 'success');
          load();
        } catch (e) { toast(e.message, 'error'); }
      },
      { danger: false, confirmText: 'Bagi Rata' },
    );
  });

  await load();
}

function openLeadDetail(lead, ctx, marketers, reload) {
  const isAdmin = ctx.user.role === 'admin';
  openModal({
    title: 'Detail Lead',
    body: `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
        <div class="avatar lg">${initials(lead.clientName)}</div>
        <div>
          <strong style="font-size:16px;display:block">${esc(lead.clientName)}</strong>
          <span style="font-size:12.5px;color:var(--text-3)">${esc(lead.phone || '—')} · ${esc(lead.source)}</span>
        </div>
      </div>
      ${lead.address ? `<div class="field"><label>Alamat</label>
        <div style="font-size:13px;color:var(--text-2);line-height:1.6">${esc(lead.address)}</div></div>` : ''}
      ${isAdmin ? `<div class="field"><label>Marketing</label>
        <select id="lead-marketing">
          ${marketers.map((m) => `<option value="${m.id}" ${m.id === lead.marketingId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select></div>` : ''}
      <div class="field"><label>Status Progres</label>
        <select id="lead-status">
          ${Object.entries(LEAD_STATUS).map(([k, v]) => `<option value="${k}" ${lead.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Potensi (USD)</label>
        <input id="lead-potential" type="number" value="${lead.potential}" min="0" step="100" />
      </div>
      <div class="field"><label>Catatan Progres</label>
        <textarea id="lead-note" placeholder="Hasil follow up, kendala, next step…">${esc(lead.note || '')}</textarea>
      </div>
      <div style="font-size:12px;color:var(--text-3);display:flex;gap:14px;flex-wrap:wrap">
        <span>Marketing: <b style="color:var(--text-2)">${esc(lead.marketingName)}</b></span>
        <span>Dibuat: ${fmtDate(lead.createdAt)}</span>
      </div>`,
    footer: `${isAdmin ? `<button class="btn btn-ghost" id="del-lead" style="color:var(--red);margin-right:auto">${icons.trash} Hapus</button>` : ''}
             <button class="btn btn-ghost" data-close>Tutup</button>
             <button class="btn btn-primary" id="save-lead">Simpan Progres</button>`,
    onMount: (modal, close) => {
      modal.querySelector('#save-lead').addEventListener('click', async () => {
        try {
          const body = {
            status: modal.querySelector('#lead-status').value,
            potential: Number(modal.querySelector('#lead-potential').value),
            note: modal.querySelector('#lead-note').value,
          };
          const mk = modal.querySelector('#lead-marketing');
          if (mk) body.marketingId = mk.value;
          await api.patch(`/leads/${lead.id}`, body);
          toast('Progres lead diperbarui', 'success');
          close();
          reload();
        } catch (e) { toast(e.message, 'error'); }
      });
      modal.querySelector('#del-lead')?.addEventListener('click', () => {
        close();
        confirmDialog('Hapus lead ini secara permanen?', async () => {
          await api.del(`/leads/${lead.id}`);
          toast('Lead dihapus', 'success');
          reload();
        });
      });
    },
  });
}

function openLeadForm(ctx, marketers, reload) {
  const isAdmin = ctx.user.role === 'admin';
  openModal({
    title: isAdmin ? 'Tambah Leads' : 'Lead Baru',
    body: `
      <form id="lead-form">
        ${isAdmin ? `<div class="field"><label>Bagikan ke Marketing</label>
          <select name="marketingId">${marketers.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label>Nama Nasabah</label><input name="clientName" required placeholder="Nama calon nasabah" /></div>
        <div class="field-row">
          <div class="field"><label>No. HP</label><input name="phone" placeholder="0812xxxxxxx" /></div>
          <div class="field"><label>Sumber</label>
            <select name="source">
              <option>Instagram</option><option>Referral</option><option>Seminar</option>
              <option>Website</option><option>WhatsApp</option><option>Manual</option>
            </select></div>
        </div>
        <div class="field"><label>Alamat</label>
          <input name="address" placeholder="Kota / alamat lengkap nasabah" /></div>
        <div class="field"><label>Estimasi Potensi (USD)</label>
          <input name="potential" type="number" min="0" step="100" placeholder="5000" /></div>
        <div class="field"><label>Catatan</label><textarea name="note" placeholder="Kebutuhan nasabah, hasil obrolan awal…"></textarea></div>
      </form>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button>
             <button class="btn btn-primary" id="save-new-lead">Tambah Lead</button>`,
    onMount: (modal, close) => {
      modal.querySelector('#save-new-lead').addEventListener('click', async () => {
        const form = modal.querySelector('#lead-form');
        if (!form.reportValidity()) return;
        const body = Object.fromEntries(new FormData(form).entries());
        body.potential = Number(body.potential) || 0;
        try {
          await api.post('/leads', body);
          toast('Lead berhasil ditambahkan', 'success');
          close();
          reload();
        } catch (e) { toast(e.message, 'error'); }
      });
    },
  });
}

function openImport(reload) {
  openModal({
    title: 'Import Leads dari Excel / CSV',
    body: `
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.7;margin-bottom:16px">
        Unggah file <b>.xlsx</b>, <b>.xls</b>, atau <b>.csv</b>. Kolom yang dikenali:
        <b>Nama</b>, <b>No HP</b>, <b>Alamat</b>, <b>Sumber</b>, <b>Potensi</b>, <b>Catatan</b>.
      </div>
      <div class="field">
        <label>File Leads</label>
        <input type="file" id="import-file" accept=".xlsx,.xls,.csv" />
      </div>
      <label style="display:flex;align-items:center;gap:9px;font-size:13px;color:var(--text-2);cursor:pointer">
        <input type="checkbox" id="import-distribute" checked style="width:16px;height:16px;accent-color:var(--brand)" />
        Bagi rata otomatis ke semua marketing aktif
      </label>
      <div id="import-status" style="margin-top:14px;font-size:12.5px;color:var(--text-3)"></div>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button>
             <button class="btn btn-primary" id="run-import">${icons.upload} Import Sekarang</button>`,
    onMount: (modal, close) => {
      modal.querySelector('#run-import').addEventListener('click', async () => {
        const input = modal.querySelector('#import-file');
        const status = modal.querySelector('#import-status');
        const file = input.files?.[0];
        if (!file) { toast('Pilih file terlebih dahulu', 'error'); return; }
        if (file.size > 3 * 1024 * 1024) { toast('Ukuran file maksimal 3 MB', 'error'); return; }

        status.textContent = 'Membaca file…';
        const base64 = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(',').pop());
          fr.onerror = reject;
          fr.readAsDataURL(file);
        });

        try {
          const r = await api.post('/leads/import', {
            file: base64,
            filename: file.name,
            distribute: modal.querySelector('#import-distribute').checked,
          });
          toast(`${r.imported} leads berhasil diimport`, 'success');
          close();
          reload();
        } catch (e) {
          status.textContent = '';
          toast(e.message, 'error');
        }
      });
    },
  });
}
