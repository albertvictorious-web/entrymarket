import { api } from '../api.js';
import { icons } from '../icons.js';
import { toast, confirmDialog } from '../ui.js';
import { esc, fmtDate } from '../utils.js';

const COLORS = [
  { id: 'default', label: 'Netral' },
  { id: 'amber', label: 'Kuning' },
  { id: 'green', label: 'Hijau' },
  { id: 'blue', label: 'Biru' },
  { id: 'rose', label: 'Merah' },
];

export async function renderNotes(root, ctx) {
  let notes = [];
  let editing = null;
  let query = '';

  root.innerHTML = `<div class="page">
    <div class="notes-head">
      <div>
        <h3 style="margin:0 0 2px;font-size:16px;font-weight:800">Catatan Saya</h3>
        <div class="hint">Simpan ide, follow-up nasabah, atau pengingat harian</div>
      </div>
      <button class="btn btn-primary btn-sm" id="new-note">${icons.plus} Catatan Baru</button>
    </div>
    <div class="notes-search">
      <span class="ns-ico">${icons.search}</span>
      <input id="notes-q" placeholder="Cari catatan…" autocomplete="off" />
    </div>
    <div class="notes-grid" id="notes-grid"></div>
  </div>`;

  const page = root.querySelector('.page');
  const grid = page.querySelector('#notes-grid');

  function paint() {
    const list = notes.filter((n) => {
      if (!query) return true;
      const hay = `${n.title} ${n.body}`.toLowerCase();
      return hay.includes(query.toLowerCase());
    });
    if (!list.length) {
      grid.innerHTML = `<div class="notes-empty">
        <div class="ne-ico">${icons.edit}</div>
        <strong>${query ? 'Tidak ada catatan cocok' : 'Belum ada catatan'}</strong>
        <span>${query ? 'Coba kata kunci lain' : 'Tekan "Catatan Baru" untuk mulai menulis'}</span>
      </div>`;
      return;
    }
    grid.innerHTML = list.map((n) => `
      <article class="note-card note-${n.color}" data-open="${n.id}">
        <div class="note-top">
          <h4>${esc(n.title || 'Tanpa judul')}</h4>
          <button class="note-pin ${n.pinned ? 'on' : ''}" data-pin="${n.id}" title="Sematkan">${icons.target}</button>
        </div>
        <p>${esc(n.body || '').slice(0, 220)}${(n.body || '').length > 220 ? '…' : ''}</p>
        <div class="note-foot">
          <span>${fmtDate(n.updatedAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <button class="note-del" data-del="${n.id}" title="Hapus">${icons.trash}</button>
        </div>
      </article>`).join('');

    grid.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-pin]') || e.target.closest('[data-del]')) return;
        openEditor(notes.find((n) => n.id === el.dataset.open));
      });
    });
    grid.querySelectorAll('[data-pin]').forEach((b) => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const n = notes.find((x) => x.id === b.dataset.pin);
        try {
          await api.patch(`/notes/${n.id}`, { pinned: !n.pinned });
          await load();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    grid.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await confirmDialog('Hapus catatan ini?', 'Catatan akan dihapus permanen.');
        if (!ok) return;
        try {
          await api.del(`/notes/${b.dataset.del}`);
          toast('Catatan dihapus', 'success');
          await load();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  function openEditor(note) {
    editing = note || null;
    const wrap = document.createElement('div');
    wrap.className = 'note-editor-backdrop';
    wrap.innerHTML = `
      <div class="note-editor">
        <div class="ne-head">
          <input id="ne-title" placeholder="Judul catatan" value="${esc(editing?.title || '')}" maxlength="160" />
          <button class="icon-btn" id="ne-close" style="width:32px;height:32px">${icons.close}</button>
        </div>
        <textarea id="ne-body" placeholder="Tulis catatan Anda di sini…" rows="12">${esc(editing?.body || '')}</textarea>
        <div class="ne-colors">
          ${COLORS.map((c) => `<button class="ne-color note-${c.id} ${(editing?.color || 'default') === c.id ? 'active' : ''}" data-color="${c.id}" title="${c.label}"></button>`).join('')}
        </div>
        <div class="ne-actions">
          <button class="btn btn-ghost btn-sm" id="ne-cancel">Batal</button>
          <button class="btn btn-primary btn-sm" id="ne-save">${icons.check} Simpan</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const titleEl = wrap.querySelector('#ne-title');
    const bodyEl = wrap.querySelector('#ne-body');
    let color = editing?.color || 'default';
    titleEl.focus();

    wrap.querySelectorAll('.ne-color').forEach((b) => {
      b.addEventListener('click', () => {
        color = b.dataset.color;
        wrap.querySelectorAll('.ne-color').forEach((x) => x.classList.toggle('active', x === b));
      });
    });
    const close = () => wrap.remove();
    wrap.querySelector('#ne-close').addEventListener('click', close);
    wrap.querySelector('#ne-cancel').addEventListener('click', close);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });

    wrap.querySelector('#ne-save').addEventListener('click', async () => {
      const payload = { title: titleEl.value.trim(), body: bodyEl.value.trim(), color };
      if (!payload.title && !payload.body) { toast('Catatan masih kosong', 'error'); return; }
      try {
        if (editing) await api.patch(`/notes/${editing.id}`, payload);
        else await api.post('/notes', payload);
        toast('Catatan tersimpan', 'success');
        close();
        await load();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  async function load() {
    try {
      notes = await api.get('/notes');
    } catch {
      notes = [];
    }
    paint();
  }

  page.querySelector('#new-note').addEventListener('click', () => openEditor(null));
  page.querySelector('#notes-q').addEventListener('input', (e) => {
    query = e.target.value;
    paint();
  });

  await load();
}
