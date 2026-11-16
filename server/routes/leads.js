import { Router } from 'express';
import { ObjectId } from 'mongodb';
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
  const { clientName, phone, source, potential, note, marketingId } = req.body || {};
  if (!clientName) return res.status(400).json({ error: 'Nama nasabah wajib' });
  const target = req.user.role === 'admin' && marketingId ? oid(marketingId) : req.user._id;
  const doc = {
    marketingId: target,
    clientName,
    phone: phone || '',
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

r.patch('/:id', authRequired, async (req, res) => {
  const db = getDb();
  const lead = await db.collection('leads').findOne({ _id: oid(req.params.id) });
  if (!lead) return res.status(404).json({ error: 'Lead tidak ditemukan' });
  if (req.user.role !== 'admin' && String(lead.marketingId) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Bukan lead Anda' });
  }
  const { status, note, potential, clientName, phone, source } = req.body || {};
  const set = { updatedAt: new Date() };
  if (status && STATUSES.includes(status)) set.status = status;
  if (note !== undefined) set.note = note;
  if (potential !== undefined) set.potential = Number(potential) || 0;
  if (clientName) set.clientName = clientName;
  if (phone !== undefined) set.phone = phone;
  if (source) set.source = source;
  await db.collection('leads').updateOne({ _id: oid(req.params.id) }, { $set: set });
  res.json({ ok: true });
});

r.delete('/:id', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  await db.collection('leads').deleteOne({ _id: oid(req.params.id) });
  res.json({ ok: true });
});

export default r;
