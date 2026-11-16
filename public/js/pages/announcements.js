import { api } from '../api.js';
import { icons } from '../icons.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { timeAgo, fmtDateTime, esc } from '../utils.js';

const CATS = {
  info: { label: 'Info', cls: 'gray' },
  event: { label: 'Event', cls: 'blue' },
  reward: { label: 'Reward', cls: 'brand' },
  urgent: { label: 'Penting', cls: 'red' },
};

export async function renderAnnouncements(root, ctx) {
  const isAdmin = ctx.user.role === 'admin';

  root.innerHTML = `<div class="page">
    <div class="card">
      <div class="card-head">
        <div><h3>Pengumuman</h3><div class="hint">Info acara, berita, dan kebijakan dari admin</div></div>
        ${isAdmin ? `<button class="btn btn-primary btn-sm" id="add-ann">${icons.plus} Buat Pengumuman</button>` : ''}
      </div>
      <div id="ann-list"></div>
    </div>
  </div>`;

  const page = root.querySelector('.page');

  async function load() {
    const list = await api.get('/announcements');
    page.querySelector('#ann-list').innerHTML = list.map((a) => `
      <div class="ann ${a.pinned ? 'pinned' : ''}">
        <div class="ann-head">
          ${a.pinned ? `<span class="badge brand">${icons.pin} Disematkan</span>` : ''}
          <span class="badge ${CATS[a.category]?.cls || 'gray'}">${CATS[a.category]?.label || a.category}</span>
          <h4>${esc(a.title)}</h4>
          ${isAdmin ? `<button class="icon-btn" style="width:28px;height:28px;margin-left:auto" data-del="${a.id}">${icons.trash}</button>` : ''}
        </div>
        <p>${esc(a.body)}</p>
        <div class="when">${fmtDateTime(a.createdAt)} · ${timeAgo(a.createdAt)}</div>
      </div>`).join('') || '<div class="empty">Belum ada pengumuman</div>';

    page.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', () => confirmDialog('Hapus pengumuman ini?', async () => {
        await api.del(`/announcements/${b.dataset.del}`);
        toast('Pengumuman dihapus', 'success');
        load();
      }));
    });
  }

  page.querySelector('#add-ann')?.addEventListener('click', () => openAnnForm(load));

  await load();
}

function openAnnForm(reload) {
  openModal({
    title: 'Buat Pengumuman',
    body: `
      <form id="ann-form">
        <div class="field"><label>Judul</label><input name="title" required placeholder="Judul pengumuman" /></div>
        <div class="field-row">
          <div class="field"><label>Kategori</label>
            <select name="category">
              <option value="info">Info</option><option value="event">Event</option>
              <option value="reward">Reward</option><option value="urgent">Penting</option>
            </select></div>
          <div class="field"><label>Sematkan</label>
            <select name="pinned"><option value="false">Tidak</option><option value="true">Ya</option></select></div>
        </div>
        <div class="field"><label>Isi Pengumuman</label>
          <textarea name="body" required style="min-height:130px" placeholder="Detail acara / berita / instruksi…"></textarea></div>
      </form>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button>
             <button class="btn btn-primary" id="save-ann">Publikasikan</button>`,
    onMount: (modal, close) => {
      modal.querySelector('#save-ann').addEventListener('click', async () => {
        const form = modal.querySelector('#ann-form');
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        try {
          await api.post('/announcements', {
            title: fd.get('title'),
            body: fd.get('body'),
            category: fd.get('category'),
            pinned: fd.get('pinned') === 'true',
          });
          toast('Pengumuman dipublikasikan', 'success');
          close();
          reload();
        } catch (e) { toast(e.message, 'error'); }
      });
    },
  });
}
