import { api } from '../api.js';
import { icons } from '../icons.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { fmtDate, dayNum, monthShort, esc, APPT_STATUS } from '../utils.js';

export async function renderAppointments(root, ctx) {
  const isAdmin = ctx.user.role === 'admin';
  const state = { tab: 'upcoming' };

  root.innerHTML = `<div class="page">
    <div class="appt-stats" id="appt-stats"></div>
    <div class="card">
      <div class="card-head" style="flex-wrap:wrap;gap:12px">
        <div><h3>Appointment Prospek</h3><div class="hint">Jadwal pertemuan dengan calon nasabah</div></div>
        <button class="btn btn-primary btn-sm" id="add-appt">${icons.plus} Buat Jadwal</button>
      </div>
      <div class="seg" id="appt-tabs">
        <button data-tab="upcoming" class="active">Mendatang</button>
        <button data-tab="past">Riwayat</button>
      </div>
      <div id="appt-list" class="appt-list"></div>
    </div>
  </div>`;

  const page = root.querySelector('.page');

  async function load() {
    const all = await api.get('/appointments');
    const now = Date.now();
    const list = all
      .filter((a) => (state.tab === 'upcoming' ? new Date(a.date).getTime() >= now - 86400000 : new Date(a.date).getTime() < now - 86400000))
      .sort((a, b) => (state.tab === 'upcoming' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date)));

    const upcoming = all.filter((a) => new Date(a.date).getTime() >= now - 86400000);
    const done = all.filter((a) => a.status === 'done' || a.status === 'closed');
    page.querySelector('#appt-stats').innerHTML = `
      <div class="appt-stat">
        <span class="as-ico" style="background:var(--brand-soft);color:var(--brand)">${icons.calendar}</span>
        <div><div class="as-k">Mendatang</div><div class="as-v">${upcoming.length}</div></div>
      </div>
      <div class="appt-stat">
        <span class="as-ico" style="background:var(--green-soft);color:var(--green)">${icons.check}</span>
        <div><div class="as-k">Selesai</div><div class="as-v">${done.length}</div></div>
      </div>
      <div class="appt-stat">
        <span class="as-ico" style="background:var(--blue-soft);color:var(--blue)">${icons.users}</span>
        <div><div class="as-k">Total</div><div class="as-v">${all.length}</div></div>
      </div>`;

    page.querySelector('#appt-list').innerHTML = list.map((a) => {
      const st = APPT_STATUS[a.status] || { label: a.status, cls: 'gray' };
      return `<article class="appt-card">
        <div class="ac-date">
          <span class="ac-d">${dayNum(a.date)}</span>
          <span class="ac-m">${monthShort(a.date)}</span>
        </div>
        <div class="ac-main">
          <div class="ac-top">
            <div class="ac-name">${esc(a.clientName)}</div>
            <span class="badge ${st.cls}">${st.label}</span>
          </div>
          <div class="ac-meta">
            <span class="ac-chip">${icons.pin}<b>${esc(a.location)}</b></span>
            <span class="ac-chip">${icons.clock}<b>${esc(a.time)} WIB</b></span>
            ${isAdmin ? `<span class="ac-chip">${icons.users}<b>${esc(a.marketingName)}</b></span>` : ''}
          </div>
          ${a.result ? `<div class="ac-result"><span>Hasil</span><p>${esc(a.result)}</p></div>` : ''}
          <div class="ac-actions">
            <button class="btn btn-sm btn-outline" data-progress="${a.id}">${icons.edit} Update Progres</button>
            <button class="icon-btn ac-del" data-del="${a.id}" title="Hapus">${icons.trash}</button>
          </div>
        </div>
      </article>`;
    }).join('') || `<div class="appt-empty">
        <div class="ae-ico">${icons.calendar}</div>
        <strong>${state.tab === 'upcoming' ? 'Belum ada jadwal mendatang' : 'Belum ada riwayat appointment'}</strong>
        <span>${state.tab === 'upcoming' ? 'Tekan "Buat Jadwal" untuk menambahkan pertemuan baru' : 'Riwayat akan muncul setelah pertemuan selesai'}</span>
      </div>`;

    page.querySelectorAll('[data-progress]').forEach((b) => {
      b.addEventListener('click', () => {
        const appt = all.find((x) => x.id === b.dataset.progress);
        openProgress(appt, load);
      });
    });
    page.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', () => confirmDialog('Hapus appointment ini?', async () => {
        await api.del(`/appointments/${b.dataset.del}`);
        toast('Appointment dihapus', 'success');
        load();
      }));
    });
  }

  page.querySelectorAll('#appt-tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      state.tab = b.dataset.tab;
      page.querySelectorAll('#appt-tabs button').forEach((x) => x.classList.toggle('active', x === b));
      load();
    });
  });

  page.querySelector('#add-appt').addEventListener('click', () => openApptForm(ctx, load));

  await load();
}

function openApptForm(ctx, reload) {
  const isAdmin = ctx.user.role === 'admin';
  const today = new Date().toISOString().slice(0, 10);
  openModal({
    title: 'Buat Appointment',
    body: `
      <form id="appt-form" class="appt-form">
        ${isAdmin ? `<div class="field"><label>Marketing</label><select name="marketingId" id="appt-marketing"></select></div>` : ''}
        <div class="field">
          <label>Nama Nasabah</label>
          <div class="input-ico">${icons.users}<input name="clientName" required placeholder="Nama calon nasabah" /></div>
        </div>
        <div class="field">
          <label>Lokasi Pertemuan</label>
          <div class="input-ico">${icons.pin}<input name="location" required placeholder="Kantor / Cafe / Zoom" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Tanggal</label><input name="date" type="date" value="${today}" required /></div>
          <div class="field"><label>Jam</label><input name="time" type="time" value="10:00" required /></div>
        </div>
      </form>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button>
             <button class="btn btn-primary" id="save-appt">Simpan Jadwal</button>`,
    onMount: async (modal, close) => {
      if (isAdmin) {
        const marketers = await api.get('/auth/marketers');
        modal.querySelector('#appt-marketing').innerHTML = marketers
          .map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
      }
      modal.querySelector('#save-appt').addEventListener('click', async () => {
        const form = modal.querySelector('#appt-form');
        if (!form.reportValidity()) return;
        try {
          await api.post('/appointments', Object.fromEntries(new FormData(form).entries()));
          toast('Jadwal appointment dibuat', 'success');
          close();
          reload();
        } catch (e) { toast(e.message, 'error'); }
      });
    },
  });
}

function openProgress(appt, reload) {
  openModal({
    title: 'Update Progres Pertemuan',
    body: `
      <div style="padding:12px;background:var(--paper);border-radius:12px;margin-bottom:16px;font-size:13px">
        <strong>${esc(appt.clientName)}</strong>
        <div style="color:var(--text-3);font-size:12px;margin-top:2px">${esc(appt.location)} · ${fmtDate(appt.date)} ${esc(appt.time)}</div>
      </div>
      <div class="field"><label>Status</label>
        <select id="appt-status">
          ${Object.entries(APPT_STATUS).map(([k, v]) => `<option value="${k}" ${appt.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Hasil Pertemuan</label>
        <textarea id="appt-result" placeholder="Contoh: nasabah tertarik, akan deposit $5.000 minggu depan">${esc(appt.result || '')}</textarea>
      </div>`,
    footer: `<button class="btn btn-ghost" data-close>Batal</button>
             <button class="btn btn-primary" id="save-progress">Simpan Progres</button>`,
    onMount: (modal, close) => {
      modal.querySelector('#save-progress').addEventListener('click', async () => {
        try {
          await api.patch(`/appointments/${appt.id}`, {
            status: modal.querySelector('#appt-status').value,
            result: modal.querySelector('#appt-result').value,
          });
          toast('Progres appointment tersimpan', 'success');
          close();
          reload();
        } catch (e) { toast(e.message, 'error'); }
      });
    },
  });
}
