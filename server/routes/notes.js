import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { authRequired } from '../auth.js';

const r = Router();
const oid = (v) => new ObjectId(String(v));

const COLORS = ['default', 'amber', 'green', 'blue', 'rose'];

r.get('/', authRequired, async (req, res) => {
  const db = getDb();
  const rows = await db.collection('notes')
    .find({ tenantId: req.tenantId, userId: req.user._id })
    .sort({ pinned: -1, updatedAt: -1 })
    .limit(200)
    .toArray();
  res.json(rows.map((n) => ({
    id: String(n._id),
    title: n.title || '',
    body: n.body || '',
    color: n.color || 'default',
    pinned: !!n.pinned,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  })));
});

r.post('/', authRequired, async (req, res) => {
  const db = getDb();
  const { title, body, color } = req.body || {};
  if (!String(title || '').trim() && !String(body || '').trim()) {
    return res.status(400).json({ error: 'Catatan tidak boleh kosong' });
  }
  const now = new Date();
  const doc = {
    tenantId: req.tenantId,
    userId: req.user._id,
    title: String(title || '').slice(0, 160),
    body: String(body || '').slice(0, 8000),
    color: COLORS.includes(color) ? color : 'default',
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await db.collection('notes').insertOne(doc);
  res.status(201).json({ id: String(insertedId) });
});

r.patch('/:id', authRequired, async (req, res) => {
  const db = getDb();
  const note = await db.collection('notes').findOne({ _id: oid(req.params.id), tenantId: req.tenantId, userId: req.user._id });
  if (!note) return res.status(404).json({ error: 'Catatan tidak ditemukan' });
  const { title, body, color, pinned } = req.body || {};
  const set = { updatedAt: new Date() };
  if (title !== undefined) set.title = String(title).slice(0, 160);
  if (body !== undefined) set.body = String(body).slice(0, 8000);
  if (color !== undefined && COLORS.includes(color)) set.color = color;
  if (pinned !== undefined) set.pinned = !!pinned;
  await db.collection('notes').updateOne({ _id: note._id, tenantId: req.tenantId }, { $set: set });
  res.json({ ok: true });
});

r.delete('/:id', authRequired, async (req, res) => {
  const db = getDb();
  await db.collection('notes').deleteOne({ _id: oid(req.params.id), tenantId: req.tenantId, userId: req.user._id });
  res.json({ ok: true });
});

export default r;
