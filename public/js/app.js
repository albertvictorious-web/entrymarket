import { api, store } from './api.js';
import { icons } from './icons.js';
import { toast } from './ui.js';
import { initials, esc } from './utils.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderNmi } from './pages/nmi.js';
import { renderLeads } from './pages/leads.js';
import { renderLeaderboard } from './pages/leaderboard.js';
import { renderAppointments } from './pages/appointments.js';
import { renderRewards } from './pages/rewards.js';
import { renderAnnouncements } from './pages/announcements.js';
import { renderTools } from './pages/tools.js';
import { renderAdmin } from './pages/admin.js';
import { renderProfile } from './pages/profile.js';

const ROUTES = {
  dashboard: { title: 'Dashboard', sub: 'Ringkasan performa NMI', icon: 'dashboard', render: renderDashboard, group: 'Utama' },
  nmi: { title: 'NMI', sub: 'Net Margin In & riwayat transaksi', icon: 'nmi', render: renderNmi, group: 'Utama' },
  leads: { title: 'Leads', sub: 'Pipeline prospek nasabah', icon: 'leads', render: renderLeads, group: 'Utama' },
  leaderboard: { title: 'Leaderboard', sub: 'Peringkat NMI marketing', icon: 'trophy', render: renderLeaderboard, group: 'Utama' },
  appointments: { title: 'Appointment', sub: 'Jadwal pertemuan prospek', icon: 'calendar', render: renderAppointments, group: 'Aktivitas' },
  rewards: { title: 'Reward', sub: 'Cash & traveling reward', icon: 'gift', render: renderRewards, group: 'Aktivitas' },
  announcements: { title: 'Pengumuman', sub: 'Info & berita dari admin', icon: 'megaphone', render: renderAnnouncements, group: 'Aktivitas' },
  tools: { title: 'Tools Trading', sub: 'Harga, kalender, sesi & berita', icon: 'tools', render: renderTools, group: 'Trading' },
  admin: { title: 'Manajemen Marketing', sub: 'Kelola akun & akses', icon: 'users', render: renderAdmin, group: 'Admin', adminOnly: true },
  profile: { title: 'Profil', sub: 'Keanggotaan & akun', icon: 'shield', render: renderProfile, group: 'Akun' },
};

const MOBILE_NAV = ['dashboard', 'nmi', 'leads', 'rewards', 'tools'];

const app = document.getElementById('app');
let cleanup = null;
let currentRoute = 'dashboard';

function routeFromHash() {
  const h = location.hash.replace('#/', '').split('?')[0];
  return ROUTES[h] ? h : 'dashboard';
}

function navGroups(user) {
  const groups = {};
  Object.entries(ROUTES).forEach(([key, r]) => {
    if (r.adminOnly && user.role !== 'admin') return;
    (groups[r.group] ||= []).push([key, r]);
  });
  return groups;
}

function shell(user) {
  const groups = navGroups(user);
  return `
    <div class="shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <img src="/img/logo-mark.png" alt="Entry Market" />
          <img src="/img/logo-word-dark.png" alt="entry market" style="height:22px" />
        </div>
        <nav class="nav">
          ${Object.entries(groups).map(([g, items]) => `
            <div class="nav-label">${g}</div>
            ${items.map(([key, r]) => `
              <button class="nav-item" data-route="${key}">
                <span class="nav-ico">${icons[r.icon]}</span>
                <span>${r.title}</span>
              </button>`).join('')}
          `).join('')}
        </nav>
        <div class="sidebar-partner">
          <img src="/img/partner-doo.png" alt="Doo Financial Futures" />
          <span class="sp-label">Official<br />Partner</span>
        </div>
        <div class="sidebar-foot">
          <button class="user-chip" data-route="profile">
            <div class="avatar">${initials(user.name)}</div>
            <div class="meta"><strong>${esc(user.name)}</strong><span>${user.role}</span></div>
            <span style="width:16px;height:16px;color:var(--text-3)">${icons.chevronRight}</span>
          </button>
        </div>
      </aside>

      <div class="main">
        <div class="mobile-topbar">
          <img src="/img/logo-mark.png" alt="Entry Market" />
          <span class="mt-title" id="mt-title">Dashboard</span>
          <span class="mt-spacer"></span>
          <button class="icon-btn" data-route="announcements">${icons.bell}<span class="dot"></span></button>
        </div>

        <header class="topbar">
          <div>
            <h2 id="page-title">Dashboard</h2>
            <div class="sub" id="page-sub">Ringkasan performa NMI</div>
          </div>
          <div class="topbar-spacer"></div>
          <button class="icon-btn" data-route="announcements" title="Pengumuman">${icons.bell}<span class="dot"></span></button>
          <button class="icon-btn" data-route="profile" title="Profil">${icons.shield}</button>
        </header>

        <main class="content" id="content"></main>

        <nav class="bottom-nav">
          ${MOBILE_NAV.map((k) => `
            <button class="bn-item" data-route="${k}">
              <span class="bn-ico">${icons[ROUTES[k].icon]}</span>
              <span>${ROUTES[k].title.split(' ')[0]}</span>
            </button>`).join('')}
        </nav>
      </div>
    </div>`;
}

async function navigate(key) {
  if (!ROUTES[key]) key = 'dashboard';
  const user = store.user;
  if (ROUTES[key].adminOnly && user.role !== 'admin') key = 'dashboard';
  currentRoute = key;
  if (location.hash !== `#/${key}`) history.replaceState(null, '', `#/${key}`);

  document.querySelectorAll('[data-route]').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === key);
  });
  const t = document.getElementById('page-title');
  const s = document.getElementById('page-sub');
  const mt = document.getElementById('mt-title');
  if (t) t.textContent = ROUTES[key].title;
  if (s) s.textContent = ROUTES[key].sub;
  if (mt) mt.textContent = ROUTES[key].title;

  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }

  const content = document.getElementById('content');
  content.innerHTML = '';
  const ctx = {
    user: store.user,
    navigate,
    logout,
    onCleanup: (fn) => { cleanup = fn; },
  };
  try {
    await ROUTES[key].render(content, ctx);
  } catch (e) {
    content.innerHTML = `<div class="page"><div class="card"><div class="empty">${esc(e.message)}</div></div></div>`;
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function logout() {
  store.clear();
  location.hash = '';
  renderLogin();
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-hero">
        <div class="brand-lockup">
          <img src="/img/logo-mark.png" alt="Entry Market" />
          <img src="/img/logo-word-white.png" alt="entry market" style="height:30px" />
        </div>
        <div>
          <h2 class="login-headline">Trade Beyond <em>Limits</em></h1>
          <p class="login-sub">Platform dashboard marketing Entry Market — pantau NMI, kelola leads, jadwalkan appointment, dan raih reward traveling.</p>
        </div>
        <div class="login-partner">
          <img src="/img/partner-doo-white.png" alt="Doo Financial Futures" />
          <span class="lp-label">Broker<br />Partner</span>
        </div>
        <div class="login-stats">
          <div><strong>NMI</strong><span>Net Margin In</span></div>
          <div><strong>Leads</strong><span>Pipeline Prospek</span></div>
          <div><strong>Reward</strong><span>Cash & Traveling</span></div>
        </div>
      </div>
      <div class="login-panel">
        <div class="login-card">
          <h1>Masuk ke Dashboard</h1>
          <p>Gunakan akun marketing atau admin Anda.</p>
          <form id="login-form">
            <div class="field">
              <label>Email</label>
              <input name="email" type="email" placeholder="nama@entrymarket.id" required autocomplete="username" />
            </div>
            <div class="field">
              <label>Password</label>
              <input name="password" type="password" placeholder="••••••••" required autocomplete="current-password" />
            </div>
            <button class="btn btn-primary btn-block" type="submit" id="login-btn" style="margin-top:6px">Masuk</button>
          </form>
          <div class="login-hint">
            <b>Akun demo</b><br />
            Admin: <code>admin@entrymarket.id</code> / <code>admin123</code><br />
            Marketing: <code>rizky@entrymarket.id</code> / <code>marketing123</code>
          </div>
        </div>
      </div>
    </div>`;

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Memproses…';
    try {
      const fd = new FormData(form);
      const { token, user } = await api.post('/auth/login', Object.fromEntries(fd.entries()));
      store.token = token;
      store.user = user;
      await boot();
      toast(`Selamat datang, ${user.name.split(' ')[0]}!`, 'success');
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Masuk';
    }
  });
}

async function boot() {
  if (!store.token) { renderLogin(); return; }
  try {
    const me = await api.get('/auth/me');
    store.user = me;
  } catch {
    store.clear();
    renderLogin();
    return;
  }
  app.innerHTML = shell(store.user);
  document.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.route));
  });
  await navigate(routeFromHash());
}

window.addEventListener('hashchange', () => {
  if (store.token) navigate(routeFromHash());
});
window.addEventListener('em:logout', () => {
  store.clear();
  renderLogin();
});

boot();
