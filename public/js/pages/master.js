import { api } from '../api.js';
import { icons } from '../icons.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { fmtUSD, fmtDate, esc } from '../utils.js';

const PLANS = ['Starter', 'Growth', 'Enterprise'];
const STATUS = {
  active: { label: 'Aktif', cls: 'green' },
  trial: { label: 'Trial', cls: 'blue' },
  suspended: { label: 'Ditangguhkan', cls: 'red' },
};

export async function renderMaster(root, ctx) {
  root.innerHTML = `<div class="page">
    <section class="hero" style="margin-bottom:18px">
      <div class="hero-top">
        <div>
          <div class="hero-eyebrow"><span class="pulse"></span> Entry Market · SaaS Platform</div>
          <h1>Master Admin</h1>
          <p class="hero-sub">Kelola broker berlangganan, admin tenant, dan status layanan dari satu panel.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-glass" id="master-logout">${icons.logout} Keluar</button>
          <button class="btn btn-primary" id="create-tenant">${icons.plus} Tambah Broker</button>
        </div>
      </div>
      <div class="hero-grid">
        <div class="hero-cell"><div class="k">Total Broker</div><div class="v" id="tenant-total">—</div></div>
        <div class="hero-cell"><div class="k">Langganan Aktif</div><div class="v" id="tenant-active">—</div></div>
        <div class="hero-cell"><div class="k">Total Marketing</div><div class="v" id="marketing-total">—</div></div>
        <div class="hero-cell"><div class="k">NMI Seluruh Tenant</div><div class="v" id="nmi-total">—</div></div>
      </div>
    </section>

    <div class="card">
      <div class="card-head" style="flex-wrap:wrap">
        <div><h3>Broker & Langganan</h3><div class="hint">Pantau masa aktif, paket, dan penggunaan sistem tiap tenant</div></div>
        <button class="btn btn-ghost btn-sm" id="refresh-tenants">${icons.clock} Perbarui</button>
      </div>
      <div id="tenant-table"></div>
    </div>
    <div class="copyright">Entry Market SaaS · Master control panel</div>
  </div>`;

  const page = root.querySelector('.page');

  async function load() {
    try {
      const tenants = await api.get('/master/tenants');
      const active = tenants.filter((t) => (t.subscriptionStatus === 'active' || t.subscriptionStatus === 'trial')
        && (!t.expiresAt || new Date(t.expiresAt) >= new Date())).length;
      page.querySelector('#tenant-total').textContent = String(tenants.length);
      page.querySelector('#tenant-active').textContent = String(active);
      page.querySelector('#marketing-total').textContent = String(tenants.reduce((sum, t) => sum + t.marketingCount, 0));
      page.querySelector('#nmi-total').textContent = fmtUSD(tenants.reduce((sum, t) => sum + t.nmi, 0));

      page.querySelector('#tenant-table').innerHTML = `<div class="table-wrap">
        <table>
          <thead><tr><th>Broker / Tenant</th><th>Paket</th><th>Admin</th><th>Marketing</th><th>Leads</th><th class="num">NMI</th><th>Berakhir</th><th>Status</th><th></th></tr></thead>
          <tbody>${tenants.map((t) => {
            const expired = t.expiresAt && new Date(t.expiresAt) < new Date();
            const status = expired ? { label: 'Kedaluwarsa', cls: 'red' } : (STATUS[t.subscriptionStatus] || STATUS.suspended);
            return `<tr>
              <td><div class="cell-user"><div class="avatar sm">${esc(t.name.slice(0, 2).toUpperCase())}</div>
                <div><strong>${esc(t.name)}</strong><span>${esc(t.slug)}</span></div></div></td>
              <td><span class="badge gray">${esc(t.plan)}</span></td>
              <td>${t.adminCount}</td>
              <td>${t.marketingCount}</td>
              <td>${t.leadsCount}</td>
              <td class="num" style="font-weight:700">${fmtUSD(t.nmi)}</td>
              <td style="font-size:12px;color:var(--text-2)">${t.expiresAt ? fmtDate(t.expiresAt) : 'Tanpa batas'}</td>
              <td><span class="badge ${status.cls}">${status.label}</span></td>
              <td class="num" style="white-space:nowrap">
                <button class="icon-btn" style="width:30px;height:30px" title="Ubah paket / masa aktif" data-edit="${t.id}">${icons.edit}</button>
                <button class="icon-btn" style="width:30px;height:30px" title="Tambah admin tenant" data-admin="${t.id}">${icons.users}</button>
                <button class="icon-btn" style="width:30px;height:30px" title="Ubah email atau password admin tenant" data-manage-admins="${t.id}">${icons.edit}</button>
                ${t.subscriptionStatus === 'suspended'
                  ? `<button class="icon-btn" style="width:30px;height:30px;color:var(--green)" title="Aktifkan" data-status="${t.id}" data-next="active">${icons.check}</button>`
                  : `<button class="icon-btn" style="width:30px;height:30px;color:var(--red)" title="Tangguhkan" data-status="${t.id}" data-next="suspended">${icons.close}</button>`}
              </td>
            </tr>`;
          }).join('') || '<tr><td colspan="9"><div class="empty">Belum ada tenant broker</div></td></tr>'}</tbody>
        </table>
      </div>`;

      page.querySelectorAll('[data-admin]').forEach((button) => {
        button.addEventListener('click', () => openAdminForm(tenants.find((t) => t.id === button.dataset.admin), load));
      });
      page.querySelectorAll('[data-manage-admins]').forEach((button) => {
        button.addEventListener('click', () => openTenantAdmins(tenants.find((t) => t.id === button.dataset.manageAdmins), load));
      });
      page.querySelectorAll('[data-edit]').forEach((button) => {
        button.addEventListener('click', () => openSubscriptionForm(tenants.find((t) => t.id === button.dataset.edit), load));
      });
      page.querySelectorAll('[data-status]').forEach((button) => {
        button.addEventListener('click', () => {
          const tenant = tenants.find((t) => t.id === button.dataset.status);
          const next = button.dataset.next;
          confirmDialog(`${next === 'suspended' ? 'Tangguhkan' : 'Aktifkan'} layanan ${tenant.name}?`, async () => {
            try {
              await api.patch(`/master/tenants/${tenant.id}`, { subscriptionStatus: next });
              toast(`Status ${tenant.name} diperbarui`, 'success');
              load();
            } catch (error) { toast(error.message, 'error'); }
          }, { danger: next === 'suspended', confirmText: next === 'suspended' ? 'Tangguhkan' : 'Aktifkan' });
        });
      });
    } catch (error) {
      page.querySelector('#tenant-table').innerHTML = `<div class="empty">${esc(error.message)}</div>`;
      toast(error.message, 'error');
    }
  }

  page.querySelector('#create-tenant').addEventListener('click', () => openTenantForm(load));
  page.querySelector('#master-logout').addEventListener('click', () => ctx.logout());
  page.querySelector('#refresh-tenants').addEventListener('click', load);
  await load();
}

function openTenantForm(reload) {
  const defaultExpiry = new Date();
  defaultExpiry.setDate(defaultExpiry.getDate() + 30);
  openModal({
    title: 'Tambah Broker Berlangganan',
    body: `<form id="tenant-form">
      <div class="field"><label>Nama Broker / Perusahaan</label><input name="name" required maxlength="120" placeholder="Contoh: Broker Nusantara" /></div>
      <div class="field-row">
        <div class="field"><label>Paket</label><select name="plan">${PLANS.map((p) => `<option>${p}</option>`).join('')}</select></div>
        <div class="field"><label>Status awal</label><select name="status"><option value="active">Aktif</option><option value="trial">Trial</option></select></div>
      </div>
      <div class="field"><label>Masa aktif sampai</label><input name="expiresAt" type="date" value="${defaultExpiry.toISOString().slice(0, 10)}" required /></div>
      <div style="height:1px;background:var(--line);margin:18px 0"></div>
      <div style="font-weight:800;margin-bottom:12px">Akun admin broker</div>
      <div class="field"><label>Nama admin</label><input name="adminName" required maxlength="120" /></div>
      <div class="field"><label>Email login</label><input name="adminEmail" type="email" required autocomplete="off" /></div>
      <div class="field"><label>Password awal (minimal 10 karakter)</label><input name="adminPassword" type="password" minlength="10" required autocomplete="new-password" /></div>
      <p class="hint">Tenant dibuat terpisah. Admin broker hanya dapat melihat tim dan data milik perusahaannya.</p>
    </form>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" id="save-tenant">${icons.check} Buat Tenant</button>`,
    onMount: (modal, close) => {
      modal.querySelector('#save-tenant').addEventListener('click', async () => {
        const form = modal.querySelector('#tenant-form');
        if (!form.reportValidity()) return;
        const body = Object.fromEntries(new FormData(form).entries());
        try {
          await api.post('/master/tenants', body);
          toast('Tenant broker berhasil dibuat', 'success');
          close();
          reload();
        } catch (error) { toast(error.message, 'error'); }
      });
    },
  });
}

function openAdminForm(tenant, reload) {
  openModal({
    title: `Tambah Admin · ${tenant.name}`,
    body: `<form id="tenant-admin-form">
      <div class="field"><label>Nama admin</label><input name="name" required maxlength="120" /></div>
      <div class="field"><label>Email login</label><input name="email" type="email" required autocomplete="off" /></div>
      <div class="field"><label>Password awal (minimal 10 karakter)</label><input name="password" type="password" minlength="10" required autocomplete="new-password" /></div>
      <p class="hint">Admin baru akan mendapat akses pengelolaan khusus untuk tenant ${esc(tenant.name)}.</p>
    </form>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" id="save-tenant-admin">${icons.check} Tambah Admin</button>`,
    onMount: (modal, close) => {
      modal.querySelector('#save-tenant-admin').addEventListener('click', async () => {
        const form = modal.querySelector('#tenant-admin-form');
        if (!form.reportValidity()) return;
        try {
          await api.post(`/master/tenants/${tenant.id}/admin`, Object.fromEntries(new FormData(form).entries()));
          toast('Admin tenant berhasil ditambahkan', 'success');
          close();
          reload();
        } catch (error) { toast(error.message, 'error'); }
      });
    },
  });
}

async function openTenantAdmins(tenant, reload) {
  try {
    const admins = await api.get(`/master/tenants/${tenant.id}/admins`);
    const body = admins.length
      ? `<div style="display:grid;gap:10px">${admins.map((admin) => `
          <div class="card" style="padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div style="min-width:0">
              <strong>${esc(admin.name)}</strong>
              <div class="hint" style="overflow-wrap:anywhere">${esc(admin.email)}</div>
            </div>
            <button class="btn btn-ghost btn-sm" data-edit-admin="${esc(admin.id)}">${icons.edit} Ubah</button>
          </div>`).join('')}</div>`
      : '<div class="empty">Belum ada admin tenant.</div>';
    openModal({
      title: `Admin Tenant · ${tenant.name}`,
      body,
      footer: `<button class="btn btn-ghost" data-close>Tutup</button><button class="btn btn-primary" id="add-tenant-admin">${icons.plus} Tambah Admin</button>`,
      onMount: (modal, close) => {
        modal.querySelector('#add-tenant-admin').addEventListener('click', () => {
          close();
          openAdminForm(tenant, reload);
        });
        modal.querySelectorAll('[data-edit-admin]').forEach((button) => {
          button.addEventListener('click', () => {
            const admin = admins.find((item) => item.id === button.dataset.editAdmin);
            close();
            openAdminCredentialsForm(tenant, admin, reload);
          });
        });
      },
    });
  } catch (error) {
    toast(error.message, 'error');
  }
}

function openAdminCredentialsForm(tenant, admin, reload) {
  openModal({
    title: `Ubah Kredensial · ${tenant.name}`,
    body: `<form id="tenant-admin-credentials-form">
      <div class="field"><label>Nama admin</label><input name="name" maxlength="120" value="${esc(admin.name)}" /></div>
      <div class="field"><label>Email login</label><input name="email" type="email" required autocomplete="off" value="${esc(admin.email)}" /></div>
      <div class="field"><label>Password baru (kosongkan jika tidak diubah)</label><input name="password" type="password" minlength="10" autocomplete="new-password" /></div>
      <p class="hint">Perubahan berlaku untuk akun admin ${esc(admin.email)} di tenant ini. Password tidak ditampilkan dan tidak bisa dipulihkan dari panel.</p>
    </form>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" id="save-admin-credentials">${icons.check} Simpan Perubahan</button>`,
    onMount: (modal, close) => {
      modal.querySelector('#save-admin-credentials').addEventListener('click', async () => {
        const form = modal.querySelector('#tenant-admin-credentials-form');
        if (!form.reportValidity()) return;
        const body = Object.fromEntries(new FormData(form).entries());
        if (!body.password) delete body.password;
        try {
          await api.patch(`/master/tenants/${tenant.id}/admins/${admin.id}`, body);
          toast('Kredensial admin berhasil diperbarui', 'success');
          close();
          reload();
        } catch (error) { toast(error.message, 'error'); }
      });
    },
  });
}

function openSubscriptionForm(tenant, reload) {
  const expiry = tenant.expiresAt ? new Date(tenant.expiresAt).toISOString().slice(0, 10) : '';
  openModal({
    title: `Langganan · ${tenant.name}`,
    body: `<form id="subscription-form">
      <div class="field"><label>Paket</label><select name="plan">${PLANS.map((p) => `<option ${tenant.plan === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <div class="field"><label>Status</label><select name="subscriptionStatus">
        ${Object.entries(STATUS).map(([id, s]) => `<option value="${id}" ${tenant.subscriptionStatus === id ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select></div>
      <div class="field"><label>Masa aktif sampai (kosongkan untuk tanpa batas)</label><input name="expiresAt" type="date" value="${expiry}" /></div>
    </form>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" id="save-subscription">${icons.check} Simpan</button>`,
    onMount: (modal, close) => {
      modal.querySelector('#save-subscription').addEventListener('click', async () => {
        const body = Object.fromEntries(new FormData(modal.querySelector('#subscription-form')).entries());
        try {
          await api.patch(`/master/tenants/${tenant.id}`, body);
          toast('Langganan diperbarui', 'success');
          close();
          reload();
        } catch (error) { toast(error.message, 'error'); }
      });
    },
  });
}
