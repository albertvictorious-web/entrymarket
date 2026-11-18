import { icons } from './icons.js';

export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'err' : type === 'success' ? 'ok' : ''}`;
  const ico = type === 'error' ? icons.close : type === 'success' ? icons.check : icons.bell;
  el.innerHTML = `<span style="width:16px;height:16px;display:inline-flex;flex:0 0 16px">${ico}</span><span>${message}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .2s, transform .2s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 220);
  }, 3200);
}

export function openModal({ title, body, footer, onMount, size }) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" ${size ? `style="max-width:${size}"` : ''}>
      <div class="modal-head">
        <h3>${title}</h3>
        <button class="icon-btn" data-close style="width:32px;height:32px">${icons.close}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  root.appendChild(backdrop);

  const close = () => {
    backdrop.style.opacity = '0';
    setTimeout(() => backdrop.remove(), 160);
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) close();
  });
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  if (onMount) onMount(backdrop.querySelector('.modal'), close);
  return { close, el: backdrop.querySelector('.modal') };
}

export function confirmDialog(message, onConfirm, { danger = true, confirmText = 'Hapus' } = {}) {
  openModal({
    title: 'Konfirmasi',
    body: `<p style="margin:0;color:var(--text-2);font-size:13.5px;line-height:1.65">${message}</p>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button>
             <button class="btn ${danger ? 'btn-primary' : 'btn-dark'}" data-ok style="background:${danger ? 'var(--red)' : ''};box-shadow:none">${confirmText}</button>`,
    onMount: (modal, close) => {
      modal.querySelector('[data-ok]').addEventListener('click', async () => {
        close();
        await onConfirm();
      });
    },
  });
}

/** Line/area chart drawn as inline SVG. */
export function areaChart(data, { height = 150, color = '#c94fba', id = 'c' } = {}) {
  if (!data.length) return `<div class="empty">Belum ada data</div>`;
  const w = 640;
  const h = height;
  const pad = { t: 12, r: 8, b: 22, l: 8 };
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = (w - pad.l - pad.r) / Math.max(data.length - 1, 1);
  const y = (v) => pad.t + (1 - (v - min) / span) * (h - pad.t - pad.b);
  const pts = data.map((d, i) => [pad.l + i * stepX, y(d.value)]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad.b} L${pts[0][0].toFixed(1)},${h - pad.b} Z`;
  const gridLines = [0, 0.5, 1].map((f) => {
    const yy = pad.t + f * (h - pad.t - pad.b);
    return `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" stroke="rgba(255,255,255,.07)" stroke-width="1"/>`;
  }).join('');
  const labels = data.filter((_, i) => i % Math.ceil(data.length / 5) === 0 || i === data.length - 1)
    .map((d) => {
      const i = data.indexOf(d);
      return `<text x="${pad.l + i * stepX}" y="${h - 6}" fill="rgba(255,255,255,.35)" font-size="9.5" text-anchor="middle" font-family="inherit">${d.label}</text>`;
    }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block">
    <defs>
      <linearGradient id="grad-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${area}" fill="url(#grad-${id})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    ${labels}
  </svg>`;
}

export function barChart(data, { height = 140, color = '#c94fba' } = {}) {
  if (!data.length) return `<div class="empty">Belum ada data</div>`;
  const max = Math.max(...data.map((d) => d.value), 1);
  return `<div style="display:flex;align-items:flex-end;gap:6px;height:${height}px;padding-top:8px">
    ${data.map((d) => `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end">
        <div title="${d.label}: ${d.value}" style="width:100%;max-width:34px;height:${Math.max(3, (d.value / max) * 100)}%;background:linear-gradient(180deg,${color},${color}99);border-radius:6px 6px 3px 3px;transition:height .4s"></div>
        <span style="font-size:9.5px;color:var(--text-3);white-space:nowrap">${d.label}</span>
      </div>`).join('')}
  </div>`;
}
