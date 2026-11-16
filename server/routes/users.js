import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { authRequired, adminOnly, publicUser, hashPassword, signToken, verifyPassword } from '../auth.js';

const r = Router();
const oid = (v) => new ObjectId(String(v));

r.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email dan password wajib diisi' });
  const db = getDb();
  const user = await db.collection('users').findOne({ email: String(email).toLowerCase().trim() });
  if (!user || !(await verifyPassword(password, user.password))) {
    return res.status(401).json({ error: 'Email atau password salah' });
  }
  if (user.active === false) return res.status(403).json({ error: 'Akun dinonaktifkan admin' });
  res.json({ token: signToken(user), user: publicUser(user) });
});

r.get('/me', authRequired, (req, res) => res.json(publicUser(req.user)));

r.get('/marketers', authRequired, async (req, res) => {
  const db = getDb();
  const users = await db.collection('users').find({ role: 'marketing' }).sort({ name: 1 }).toArray();
  res.json(users.map(publicUser));
});

r.post('/marketers', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  const { name, email, password, phone, joinedAt } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Nama, email, password wajib' });
  const exists = await db.collection('users').findOne({ email: String(email).toLowerCase() });
  if (exists) return res.status(409).json({ error: 'Email sudah terdaftar' });
  const doc = {
    name,
    email: String(email).toLowerCase().trim(),
    password: await hashPassword(password),
    role: 'marketing',
    phone: phone || '',
    joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
    company: 'Doo Financial Futures',
    active: true,
  };
  const { insertedId } = await db.collection('users').insertOne(doc);
  res.status(201).json(publicUser({ ...doc, _id: insertedId }));
});

r.patch('/marketers/:id', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  const { name, phone, active, password, joinedAt } = req.body || {};
  const set = {};
  if (name) set.name = name;
  if (phone !== undefined) set.phone = phone;
  if (active !== undefined) set.active = !!active;
  if (joinedAt) set.joinedAt = new Date(joinedAt);
  if (password) set.password = await hashPassword(password);
  await db.collection('users').updateOne({ _id: oid(req.params.id) }, { $set: set });
  const u = await db.collection('users').findOne({ _id: oid(req.params.id) });
  res.json(publicUser(u));
});

r.delete('/marketers/:id', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  await db.collection('users').deleteOne({ _id: oid(req.params.id), role: 'marketing' });
  res.json({ ok: true });
});

export default r;
