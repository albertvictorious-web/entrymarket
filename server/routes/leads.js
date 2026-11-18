import { Router } from 'express';
import { ObjectId } from 'mongodb';
import * as XLSX from 'xlsx';
import { getDb } from '../db.js';
import { authRequired, adminOnly } from '../auth.js';

const r = Router();
const oid = (v) => new ObjectId(String(v));
const STATUSES = ['new', 'contacted', 'prospect', 'closing', 'lost'];

async function withNames(db, rows) {
  const users = await db.collection('users').find({ role: 'marketing' }).toArray();
  const byId = new Map(users.map((u) => [String(u._id), u.name]));
  return rows.map((x) => ({
    ...x,
    id: String(x._id),
    marketingId: String(x.marketingId),
    marketingName: byId.get(String(x.marketingId)) || '-',
  }));
}

r.get('/', authRequired, async (req, res) => {
  const db = getDb();
  const match = req.user.role === 'admin' ? {} : { marketingId: req.user._id };
  if (req.query.status && STATUSES.includes(req.query.status)) match.status = req.query.status;
  if (req.query.marketingId && req.user.role === 'admin') match.marketingId = oid(req.query.marketingId);
  const rows = await db.collection('leads').find(match).sort({ updatedAt: -1 }).toArray();
  res.json(await withNames(db, rows));
});

r.post('/', authRequired, async (req, res) => {
  const db = getDb();
  const { clientName, phone, address, source, potential, note, marketingId } = req.body || {};
  if (!clientName) return res.status(400).json({ error: 'Nama nasabah wajib' });
  const target = req.user.role === 'admin' && marketingId ? oid(marketingId) : req.user._id;
  const doc = {
    marketingId: target,
    clientName,
    phone: phone || '',
    address: address || '',
    source: source || 'Manual',
    status: 'new',
    potential: Number(potential) || 0,
    note: note || '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { insertedId } = await db.collection('leads').insertOne(doc);
  res.status(201).json({ id: String(insertedId) });
});

/* ---------- Import massal dari Excel / CSV ---------- */
const HEADER_MAP = {
  nama: 'clientName',
  'nama nasabah': 'clientName',
  nasabah: 'clientName',
  clientname: 'clientName',
  name: 'clientName',
  hp: 'phone',
  'no hp': 'phone',
  'no. hp': 'phone',
  telepon: 'phone',
  phone: 'phone',
  wa: 'phone',
  whatsapp: 'phone',
  alamat: 'address',
  address: 'address',
  lokasi: 'address',
  sumber: 'source',
  source: 'source',
  potensi: 'potential',
  potential: 'potential',
  estimasi: 'potential',
  catatan: 'note',
  note: 'note',
  keterangan: 'note',
};

function normalizeRow(raw) {
  const out = {};
  Object.entries(raw).forEach(([k, v]) => {
    const key = HEADER_MAP[String(k).trim().toLowerCase()];
    if (key && v !== undefined && v !== null && String(v).trim() !== '') out[key] = v;
  });
  return out;
}

r.post('/import', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  const { file, filename, distribute } = req.body || {};
  if (!file) return res.status(400).json({ error: 'File tidak ditemukan' });

  const base64 = String(file).includes(',') ? String(file).split(',').pop() : String(file);
  let rows;
  try {
    const wb = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch {
    return res.status(400).json({ error: `Gagal membaca file ${filename || ''}. Gunakan format .xlsx, .xls, atau .csv` });
  }

  const parsed = rows.map(normalizeRow).filter((x) => x.clientName);
  if (!parsed.length) {
    return res.status(400).json({ error: 'Tidak ada baris valid. Pastikan ada kolom "Nama" / "Nama Nasabah".' });
  }

  const marketers = await db.collection('users').find({ role: 'marketing', active: { $ne: false } }).sort({ name: 1 }).toArray();
  if (!marketers.length) return res.status(400).json({ error: 'Belum ada akun marketing untuk menerima leads' });

  const now = new Date();
  const docs = parsed.map((row, i) => ({
    marketingId: distribute === false ? marketers[0]._id : marketers[i % marketers.length]._id,
    clientName: String(row.clientName).slice(0, 120),
    phone: String(row.phone || '').slice(0, 40),
    address: String(row.address || '').slice(0, 240),
    source: String(row.source || 'Import').slice(0, 60),
    status: 'new',
    potential: Number(String(row.potential || '').replace(/[^0-9.-]/g, '')) || 0,
    note: String(row.note || '').slice(0, 400),
    createdAt: now,
    updatedAt: now,
  }));

  await db.collection('leads').insertMany(docs);
  res.status(201).json({
    ok: true,
    imported: docs.length,
    skipped: rows.length - docs.length,
    distributedTo: distribute === false ? 1 : marketers.length,
  });
});

/* ---------- Bagi rata semua leads ke seluruh marketing ---------- */
r.post('/distribute', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  const marketers = await db.collection('users').find({ role: 'marketing', active: { $ne: false } }).sort({ name: 1 }).toArray();
  if (!marketers.length) return res.status(400).json({ error: 'Belum ada akun marketing aktif' });

  const leads = await db.collection('leads').find({}).sort({ createdAt: 1 }).toArray();
  if (!leads.length) return res.status(400).json({ error: 'Belum ada leads untuk dibagikan' });

  const ops = leads.map((l, i) => ({
    updateOne: {
      filter: { _id: l._id },
      update: { $set: { marketingId: marketers[i % marketers.length]._id, updatedAt: new Date() } },
    },
  }));
  await db.collection('leads').bulkWrite(ops);
  res.json({ ok: true, total: leads.length, marketers: marketers.length });
});

r.patch('/:id', authRequired, async (req, res) => {
  const db = getDb();
  const lead = await db.collection('leads').findOne({ _id: oid(req.params.id) });
  if (!lead) return res.status(404).json({ error: 'Lead tidak ditemukan' });
  if (req.user.role !== 'admin' && String(lead.marketingId) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Bukan lead Anda' });
  }
  const { status, note, potential, clientName, phone, address, source, marketingId } = req.body || {};
  const set = { updatedAt: new Date() };
  if (status && STATUSES.includes(status)) set.status = status;
  if (note !== undefined) set.note = note;
  if (potential !== undefined) set.potential = Number(potential) || 0;
  if (clientName) set.clientName = clientName;
  if (phone !== undefined) set.phone = phone;
  if (address !== undefined) set.address = address;
  if (source) set.source = source;
  if (marketingId && req.user.role === 'admin') set.marketingId = oid(marketingId);
  await db.collection('leads').updateOne({ _id: oid(req.params.id) }, { $set: set });
  res.json({ ok: true });
});

r.delete('/:id', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  await db.collection('leads').deleteOne({ _id: oid(req.params.id) });
  res.json({ ok: true });
});

export default r;
