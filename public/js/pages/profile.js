import { api } from '../api.js';
import { icons } from '../icons.js';
import { fmtUSD, fmtNum, fmtDate, initials, esc } from '../utils.js';
import { toast, confirmDialog } from '../ui.js';

export async function renderProfile(root, ctx) {
  const [me, overview] = await Promise.all([
    api.get('/auth/me'),
    api.get('/dashboard/overview?range=90d'),
  ]);

  root.innerHTML = `<div class="page">
    <div class="card dark" style="margin-bottom:18px;overflow:hidden;position:relative">
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        <div class="avatar" style="width:72px;height:72px;flex-basis:72px;font-size:24px">${initials(me.name)}</div>
        <div style="flex:1;min-width:200px">
          <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-bottom:6px">Keanggotaan Sales</div>
          <h1 style="margin:0 0 4px;font-size:24px;font-weight:800;letter-spacing:-.03em;color:#fff">${esc(me.name)}</h1>
          <div style="font-size:13px;color:rgba(255,255,255,.6)">${esc(me.email)}</div>
        </div>
        ${me.role !== 'admin' ? `<div style="text-align:right;display:flex;flex-direction:column;gap:10px;align-items:flex-end">
          <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12)">
            <span style="width:26px;height:26px;display:inline-flex;color:#fff">${icons.building}</span>
            <div style="text-align:left">
              <div style="font-size:10px;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.08em;font-weight:700">Broker</div>
              <div style="font-size:13px;font-weight:800;color:#fff">${esc(ctx.settings?.brokerName || me.company)}</div>
            </div>
          </div>
          <div style="display:inline-flex;align-items:center;gap:9px;padding:7px 13px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)">
            <img src="${ctx.settings?.logo('white') || '/img/partner-doo-white.png'}" alt="${esc(ctx.settings?.brokerName || me.company)}" style="height:26px;width:auto;max-width:120px;object-fit:contain" />
            <span style="font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.45);line-height:1.3;text-align:left">Official<br />Partner</span>
          </div>
        </div>` : ''}
      </div>

      <div class="hero-grid" style="margin-top:24px">
        <div class="hero-cell"><div class="k">Bergabung Sejak</div><div class="v" style="font-size:16px">${fmtDate(me.joinedAt)}</div></div>
        <div class="hero-cell"><div class="k">Role</div><div class="v" style="font-size:16px;text-transform:capitalize">${esc(me.role)}</div></div>
        <div class="hero-cell"><div class="k">No. HP</div><div class="v" style="font-size:16px">${esc(me.phone || '—')}</div></div>
        <div class="hero-cell"><div class="k">Status</div><div class="v" style="font-size:16px;color:#4ade80">${me.active ? 'Aktif' : 'Nonaktif'}</div></div>
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom:18px">
      <div class="stat"><div class="ico" style="background:var(--brand-soft);color:var(--brand)">${icons.chart}</div>
        <div class="k">NMI 90 hari</div><div class="v">${fmtUSD(overview.myStats.nmi)}</div>
        <div class="d">Margin in ${fmtUSD(overview.myStats.marginIn)}</div></div>
      <div class="stat"><div class="ico" style="background:var(--blue-soft);color:var(--blue)">${icons.target}</div>
        <div class="k">Total Lot</div><div class="v">${fmtNum(overview.myStats.lots)}</div>
        <div class="d">${overview.myStats.txCount} transaksi</div></div>
      <div class="stat"><div class="ico" style="background:var(--green-soft);color:var(--green)">${icons.trophy}</div>
        <div class="k">Peringkat</div><div class="v">#${overview.myRank || '-'}</div>
        <div class="d">dari ${overview.totalMarketers} marketing</div></div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="card-head">
        <div><h3>Link Registrasi Nasabah</h3><div class="hint">Simpan beberapa link untuk dibagikan ke calon nasabah</div></div>
        <button class="btn btn-sm btn-primary" id="add-link">${icons.plus} Tambah Link</button>
      </div>
      <div id="link-list"></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Pengaturan Akun</h3></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-outline" id="logout-btn">${icons.logout} Keluar dari akun</button>
      </div>
      <p style="font-size:12px;color:var(--text-3);margin:14px 0 0;line-height:1.6">
        Untuk mengubah nama, nomor HP, atau password, hubungi admin Entry Market.
      </p>
    </div>

    ${me.role === 'admin' ? `<div class="card" style="margin-top:18px">
      <div class="card-head">
        <div><h3>Broker Partner</h3><div class="hint">Nama & logo partner yang tampil di dashboard sales</div></div>
      </div>
      <div class="field"><label>Nama Broker Partner</label>
        <input id="broker-name" value="${esc(ctx.settings?.brokerName || '')}" placeholder="Doo Financial Futures" maxlength="120" /></div>
      <div class="field"><label>Logo Broker Partner (PNG / JPG)</label>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div class="broker-logo-preview" id="broker-preview">
            ${ctx.settings?.brokerLogo
              ? `<img src="${ctx.settings.brokerLogo}" alt="logo" />`
              : `<img src="/img/partner-doo.png" alt="logo" />`}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <label class="btn btn-ghost btn-sm" style="cursor:pointer">
              ${icons.upload} Pilih Logo
              <input type="file" id="broker-file" accept="image/png,image/jpeg" hidden />
            </label>
            <button class="btn btn-ghost btn-sm" id="broker-clear">${icons.trash} Hapus</button>
          </div>
        </div>
        <div class="hint" style="margin-top:8px">Format PNG atau JPG, maksimal 1 MB. Disarankan latar transparan.</div>
      </div>
      <button class="btn btn-primary" id="broker-save">${icons.check} Simpan Broker Partner</button>
    </div>` : ''}

    <div class="copyright">Entry Market | PT. Sosial Grow Media Connection</div>
  </div>`;

  root.querySelector('#logout-btn').addEventListener('click', () => ctx.logout());

  /* ---------- Link Registrasi ---------- */
  const linkList = root.querySelector('#link-list');
  let links = [];

  function paintLinks() {
    if (!links.length) {
      linkList.innerHTML = `<div class="empty" style="padding:26px 0">Belum ada link. Tambahkan link registrasi nasabah Anda.</div>`;
      return;
    }
    linkList.innerHTML = links.map((l) => `
      <div class="reglink">
        <div class="rl-main">
          <div class="rl-title">${esc(l.title)}</div>
          <a class="rl-url" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a>
          ${l.note ? `<div class="rl-note">${esc(l.note)}</div>` : ''}
        </div>
        <div class="rl-actions">
          <button class="btn btn-sm btn-primary" data-copy="${l.id}">${icons.check} Copy</button>
          <button class="icon-btn" style="width:32px;height:32px" data-edit="${l.id}">${icons.edit}</button>
          <button class="icon-btn" style="width:32px;height:32px" data-rm="${l.id}">${icons.trash}</button>
        </div>
      </div>`).join('');

    linkList.querySelectorAll('[data-copy]').forEach((b) => {
      b.addEventListener('click', async () => {
        const l = links.find((x) => x.id === b.dataset.copy);
        try {
          await navigator.clipboard.writeText(l.url);
          toast('Link disalin ke clipboard', 'success');
        } catch {
          const ta = document.createElement('textarea');
          ta.value = l.url;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          toast('Link disalin', 'success');
        }
      });
    });
    linkList.querySelectorAll('[data-edit]').forEach((b) => {
      b.addEventListener('click', () => openLinkModal(links.find((x) => x.id === b.dataset.edit)));
    });
    linkList.querySelectorAll('[data-rm]').forEach((b) => {
      b.addEventListener('click', async () => {
        const ok = await confirmDialog('Hapus link ini?', 'Link akan dihapus dari daftar Anda.');
        if (!ok) return;
        try {
          await api.del(`/reglinks/${b.dataset.rm}`);
          toast('Link dihapus', 'success');
          await loadLinks();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  function openLinkModal(link) {
    const wrap = document.createElement('div');
    wrap.className = 'note-editor-backdrop';
    wrap.innerHTML = `
      <div class="note-editor" style="max-width:520px">
        <div class="ne-head">
          <strong style="font-size:15px;font-weight:800">${link ? 'Edit Link' : 'Tambah Link Registrasi'}</strong>
          <button class="icon-btn" id="lm-close" style="width:32px;height:32px">${icons.close}</button>
        </div>
        <div class="field"><label>Judul Link</label>
          <input id="lm-title" placeholder="Contoh: Registrasi Doo Futures" value="${esc(link?.title || '')}" maxlength="120" /></div>
        <div class="field"><label>URL Registrasi</label>
          <input id="lm-url" placeholder="https://..." value="${esc(link?.url || '')}" /></div>
        <div class="field"><label>Keterangan (opsional)</label>
          <input id="lm-note" placeholder="Contoh: khusus nasabah Jakarta" value="${esc(link?.note || '')}" maxlength="300" /></div>
        <div class="ne-actions">
          <button class="btn btn-ghost btn-sm" id="lm-cancel">Batal</button>
          <button class="btn btn-primary btn-sm" id="lm-save">${icons.check} Simpan</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('#lm-title').focus();
    const close = () => wrap.remove();
    wrap.querySelector('#lm-close').addEventListener('click', close);
    wrap.querySelector('#lm-cancel').addEventListener('click', close);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });

    wrap.querySelector('#lm-save').addEventListener('click', async () => {
      const payload = {
        title: wrap.querySelector('#lm-title').value.trim(),
        url: wrap.querySelector('#lm-url').value.trim(),
        note: wrap.querySelector('#lm-note').value.trim(),
      };
      if (!payload.title) { toast('Judul link wajib diisi', 'error'); return; }
      if (!/^https?:\/\//i.test(payload.url)) { toast('URL harus diawali http:// atau https://', 'error'); return; }
      try {
        if (link) await api.patch(`/reglinks/${link.id}`, payload);
        else await api.post('/reglinks', payload);
        toast('Link tersimpan', 'success');
        close();
        await loadLinks();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function loadLinks() {
    try {
      links = await api.get('/reglinks');
    } catch {
      links = [];
    }
    paintLinks();
  }

  root.querySelector('#add-link').addEventListener('click', () => openLinkModal(null));
  await loadLinks();

  /* ---------- Broker partner (admin) ---------- */
  if (me.role === 'admin') {
    let pendingLogo = null;

    root.querySelector('#broker-file').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 1024 * 1024) { toast('Ukuran logo maksimal 1 MB', 'error'); return; }
      if (!['image/png', 'image/jpeg'].includes(file.type)) { toast('Format logo harus PNG atau JPG', 'error'); return; }
      const fr = new FileReader();
      fr.onload = () => {
        pendingLogo = String(fr.result);
        root.querySelector('#broker-preview').innerHTML = `<img src="${pendingLogo}" alt="logo" />`;
      };
      fr.onerror = () => toast('Logo gagal dibaca', 'error');
      fr.readAsDataURL(file);
    });

    root.querySelector('#broker-clear').addEventListener('click', () => {
      pendingLogo = '';
      root.querySelector('#broker-preview').innerHTML = `<img src="/img/partner-doo.png" alt="logo" />`;
    });

    root.querySelector('#broker-save').addEventListener('click', async () => {
      const body = { brokerName: root.querySelector('#broker-name').value.trim() };
      if (pendingLogo !== null) body.brokerLogo = pendingLogo;
      try {
        const saved = await api.patch('/settings', body);
        ctx.settings.brokerName = saved.brokerName;
        ctx.settings.brokerLogo = saved.brokerLogo;
        ctx.refreshPartner?.();
        pendingLogo = null;
        toast('Broker partner diperbarui', 'success');
      } catch (e) { toast(e.message, 'error'); }
    });
  }
}
