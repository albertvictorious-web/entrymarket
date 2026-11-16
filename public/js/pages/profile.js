import { api } from '../api.js';
import { icons } from '../icons.js';
import { fmtUSD, fmtNum, fmtDate, initials, esc } from '../utils.js';

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
        <div style="text-align:right;display:flex;flex-direction:column;gap:10px;align-items:flex-end">
          <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12)">
            <span style="width:26px;height:26px;display:inline-flex;color:#fff">${icons.building}</span>
            <div style="text-align:left">
              <div style="font-size:10px;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.08em;font-weight:700">Broker</div>
              <div style="font-size:13px;font-weight:800;color:#fff">${esc(me.company)}</div>
            </div>
          </div>
          <div style="display:inline-flex;align-items:center;gap:9px;padding:7px 13px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)">
            <img src="/img/partner-doo-white.png" alt="Doo Financial Futures" style="height:26px;width:auto" />
            <span style="font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.45);line-height:1.3;text-align:left">Official<br />Partner</span>
          </div>
        </div>
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

    <div class="card">
      <div class="card-head"><h3>Pengaturan Akun</h3></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-outline" id="logout-btn">${icons.logout} Keluar dari akun</button>
      </div>
      <p style="font-size:12px;color:var(--text-3);margin:14px 0 0;line-height:1.6">
        Untuk mengubah nama, nomor HP, atau password, hubungi admin Entry Market.
      </p>
    </div>
  </div>`;

  root.querySelector('#logout-btn').addEventListener('click', () => ctx.logout());
}
