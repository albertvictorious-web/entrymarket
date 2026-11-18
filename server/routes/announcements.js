import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { authRequired, adminOnly } from '../auth.js';

const r = Router();
const oid = (v) => new ObjectId(String(v));

r.get('/', authRequired, async (req, res) => {
  const db = getDb();
  const rows = await db.collection('announcements').find({ tenantId: req.tenantId }).sort({ pinned: -1, createdAt: -1 }).toArray();
  res.json(rows.map((x) => ({ ...x, id: String(x._id) })));
});

r.post('/', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  const { title, body, category, pinned } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'Judul dan isi wajib' });
  const doc = {
    title,
    body,
    category: category || 'info',
    pinned: !!pinned,
    authorId: req.user._id,
    tenantId: req.tenantId,
    createdAt: new Date(),
  };
  const { insertedId } = await db.collection('announcements').insertOne(doc);
  res.status(201).json({ id: String(insertedId) });
});

r.delete('/:id', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  await db.collection('announcements').deleteOne({ _id: oid(req.params.id), tenantId: req.tenantId });
  res.json({ ok: true });
});

export default r;
