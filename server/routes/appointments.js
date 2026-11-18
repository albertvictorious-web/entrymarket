import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { authRequired } from '../auth.js';

const r = Router();
const oid = (v) => new ObjectId(String(v));

r.get('/', authRequired, async (req, res) => {
  const db = getDb();
  const match = { tenantId: req.tenantId };
  if (req.user.role !== 'admin') match.marketingId = req.user._id;
  const rows = await db.collection('appointments').find(match).sort({ date: 1 }).toArray();
  const users = await db.collection('users').find({ tenantId: req.tenantId, role: 'marketing' }).toArray();
  const byId = new Map(users.map((u) => [String(u._id), u.name]));
  res.json(rows.map((x) => ({
    ...x,
    id: String(x._id),
    marketingId: String(x.marketingId),
    marketingName: byId.get(String(x.marketingId)) || '-',
  })));
});

r.post('/', authRequired, async (req, res) => {
  const db = getDb();
  const { clientName, location, date, time, marketingId } = req.body || {};
  if (!clientName || !location || !date || !time) {
    return res.status(400).json({ error: 'Nama nasabah, lokasi, tanggal, jam wajib diisi' });
  }
  const target = req.user.role === 'admin' && marketingId ? oid(marketingId) : req.user._id;
  if (req.user.role === 'admin' && marketingId
    && !await db.collection('users').findOne({ _id: target, tenantId: req.tenantId, role: 'marketing' })) {
    return res.status(400).json({ error: 'Marketing tujuan tidak valid' });
  }
  const doc = {
    marketingId: target,
    tenantId: req.tenantId,
    clientName,
    location,
    date: new Date(date),
    time,
    status: 'scheduled',
    result: '',
    createdAt: new Date(),
  };
  const { insertedId } = await db.collection('appointments').insertOne(doc);
  res.status(201).json({ id: String(insertedId) });
});

r.patch('/:id', authRequired, async (req, res) => {
  const db = getDb();
  const appt = await db.collection('appointments').findOne({ _id: oid(req.params.id), tenantId: req.tenantId });
  if (!appt) return res.status(404).json({ error: 'Appointment tidak ditemukan' });
  if (req.user.role !== 'admin' && String(appt.marketingId) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Bukan appointment Anda' });
  }
  const { status, result, clientName, location, date, time } = req.body || {};
  const set = {};
  if (status) set.status = status;
  if (result !== undefined) set.result = result;
  if (clientName) set.clientName = clientName;
  if (location) set.location = location;
  if (date) set.date = new Date(date);
  if (time) set.time = time;
  await db.collection('appointments').updateOne({ _id: oid(req.params.id), tenantId: req.tenantId }, { $set: set });
  res.json({ ok: true });
});

r.delete('/:id', authRequired, async (req, res) => {
  const db = getDb();
  const appt = await db.collection('appointments').findOne({ _id: oid(req.params.id), tenantId: req.tenantId });
  if (!appt) return res.status(404).json({ error: 'Tidak ditemukan' });
  if (req.user.role !== 'admin' && String(appt.marketingId) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Bukan appointment Anda' });
  }
  await db.collection('appointments').deleteOne({ _id: oid(req.params.id), tenantId: req.tenantId });
  res.json({ ok: true });
});

export default r;
