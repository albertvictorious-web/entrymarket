import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { authRequired } from '../auth.js';

const r = Router();
const oid = (v) => new ObjectId(String(v));

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

r.get('/', authRequired, async (req, res) => {
  const db = getDb();
  const rows = await db.collection('reglinks')
    .find({ tenantId: req.tenantId, userId: req.user._id })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(rows.map((x) => ({
    id: String(x._id),
    title: x.title,
    url: x.url,
    note: x.note || '',
    clicks: x.clicks || 0,
    createdAt: x.createdAt,
  })));
});

r.post('/', authRequired, async (req, res) => {
  const db = getDb();
  const { title, url, note } = req.body || {};
  if (!String(title || '').trim()) return res.status(400).json({ error: 'Judul link wajib diisi' });
  if (!/^https?:\/\//i.test(String(url || ''))) {
    return res.status(400).json({ error: 'URL harus diawali http:// atau https://' });
  }
  const doc = {
    tenantId: req.tenantId,
    userId: req.user._id,
    title: String(title).slice(0, 120),
    url: String(url).slice(0, 500),
    note: String(note || '').slice(0, 300),
    slug: slugify(title),
    clicks: 0,
    createdAt: new Date(),
  };
  const { insertedId } = await db.collection('reglinks').insertOne(doc);
  res.status(201).json({ id: String(insertedId) });
});

r.patch('/:id', authRequired, async (req, res) => {
  const db = getDb();
  const link = await db.collection('reglinks').findOne({ _id: oid(req.params.id), tenantId: req.tenantId, userId: req.user._id });
  if (!link) return res.status(404).json({ error: 'Link tidak ditemukan' });
  const { title, url, note } = req.body || {};
  const set = {};
  if (title !== undefined) set.title = String(title).slice(0, 120);
  if (url !== undefined) {
    if (!/^https?:\/\//i.test(String(url))) return res.status(400).json({ error: 'URL tidak valid' });
    set.url = String(url).slice(0, 500);
  }
  if (note !== undefined) set.note = String(note).slice(0, 300);
  await db.collection('reglinks').updateOne({ _id: link._id, tenantId: req.tenantId }, { $set: set });
  res.json({ ok: true });
});

r.delete('/:id', authRequired, async (req, res) => {
  const db = getDb();
  await db.collection('reglinks').deleteOne({ _id: oid(req.params.id), tenantId: req.tenantId, userId: req.user._id });
  res.json({ ok: true });
});

export default r;
