export const fmtUSD = (n, digits = 0) =>
  '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtIDR = (n) =>
  'Rp ' + Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });

export const fmtNum = (n, d = 1) =>
  Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtCompact = (n) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(v) >= 1_000) return '$' + (v / 1_000).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
};

export const fmtDate = (d, opts = {}) =>
  new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', ...opts });

export const fmtDateTime = (d) =>
  new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtTime = (d) =>
  new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export const timeAgo = (d) => {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} hari lalu`;
  return fmtDate(d);
};

export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const monthShort = (d) =>
  new Date(d).toLocaleDateString('id-ID', { month: 'short' }).replace('.', '');

export const dayNum = (d) => String(new Date(d).getDate()).padStart(2, '0');

export const isSameDay = (a, b) => {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
};

export const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

export const LEAD_STATUS = {
  new: { label: 'Baru', cls: 'blue' },
  contacted: { label: 'Dihubungi', cls: 'amber' },
  prospect: { label: 'Prospek', cls: 'brand' },
  closing: { label: 'Closing', cls: 'green' },
  lost: { label: 'Gagal', cls: 'gray' },
};

export const APPT_STATUS = {
  scheduled: { label: 'Terjadwal', cls: 'blue' },
  done: { label: 'Selesai', cls: 'green' },
  cancelled: { label: 'Batal', cls: 'gray' },
  rescheduled: { label: 'Reschedule', cls: 'amber' },
};
