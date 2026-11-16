import { api } from '../api.js';
import { icons } from '../icons.js';
import { openModal, toast, confirmDialog } from '../ui.js';
import { fmtDate, dayNum, monthShort, esc, APPT_STATUS } from '../utils.js';

export async function renderAppointments(root, ctx) {
  const isAdmin = ctx.user.role === 'admin';
  const state = { tab: 'upcoming' };

  root.innerHTML = `<div class="page">
    <div class="card" style="margin-bottom:18px">
      <div class="card-head" style="flex-wrap:wrap">
        <div><h3>Appointment Prospek</h3><div class="hint">Jadwal pertemuan dengan calon nasabah</div></div>
        <button class="btn btn-primary btn-sm" id="add-appt">${icons.plus} Buat Jadwal</button>
      </div>
      <div class="seg" id="appt-tabs">
        <button data-tab="upcoming" class="active">Mendatang</button>
        <button data-tab="past">Riwayat</button>
      </div>
      <div id="appt-list" style="margin-top:16px"></div>
    </div>
  </div>`;

  const page = root.querySelector('.page');

  async function load() {
    const all = await api.get('/appointments');
    const now = Date.now();
    const list = all
      .filter((a) => (state.tab === 'upcoming' ? new Date(a.date).getTime() >= now - 86400000 : new Date(a.date).getTime() < now - 86400000))
      .sort((a, b) => (state.tab === 'upcoming' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date)));

    page.querySelector('#appt-list').innerHTML = list.map((a) => `
      <div class="appt">
        <div class="appt-date">
          <div class="d">${dayNum(a.date)}</div>
          <div class="m">${monthShort(a.date)}</div>
        </div>
        <div class="appt-body">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
            <div>
              <strong>${esc(a.clientName)}</strong>
              <div class="meta">
                <span>${icons.pin} ${esc(a.location)}</span>
                <span>${icons.clock} ${esc(a.time)} WIB</span>
                ${isAdmin ? `<span>${icons.users} ${esc(a.marketingName)}</span>` : ''}
              </div>
            </div>
            <span class="badge ${APPT_STATUS[a.status]?.cls || 'gray'}">${APPT_STATUS[a.status]?.label || a.status}</span>
          </div>
          ${a.result ? `<div class="result"><b>Hasil:</b> ${esc(a.result)}</div>` : ''}
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <button class="btn btn-sm btn-outline" data-progress="${a.id}">${icons.edit} Update Progres</button>
            <button class="btn btn-sm btn-ghost" data-del="${a.id}" style="color:var(--red)">${icons.trash}</button>
          </div>
        </div>
      </div>`).join('') || `<div class="empty">${state.tab === 'upcoming' ? 'Belum ada jadwal mendatang' : 'Belum ada riwayat appointment'}</div>`;

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
      <form id="appt-form">
        ${isAdmin ? `<div class="field"><label>Marketing</label><select name="marketingId" id="appt-marketing"></select></div>` : ''}
        <div class="field"><label>Nama Nasabah</label><input name="clientName" required placeholder="Nama calon nasabah" /></div>
        <div class="field"><label>Lokasi Pertemuan</label><input name="location" required placeholder="Kantor / Cafe / Zoom" /></div>
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
