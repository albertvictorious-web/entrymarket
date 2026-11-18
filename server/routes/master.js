import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { randomBytes } from 'node:crypto';
import { getDb } from '../db.js';
import { masterOnly, authRequired, hashPassword, publicUser } from '../auth.js';

const r = Router();
const PLANS = ['Starter', 'Growth', 'Enterprise'];
const STATUSES = ['active', 'trial', 'suspended'];
const validId = (id) => ObjectId.isValid(String(id));

function expiryDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function tenantSlug(name) {
  const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'broker';
  return `${base}-${randomBytes(3).toString('hex')}`;
}

r.use(authRequired, masterOnly);

r.get('/tenants', async (req, res) => {
  const db = getDb();
  const tenants = await db.collection('tenants').find({}).sort({ createdAt: -1 }).toArray();
  const result = await Promise.all(tenants.map(async (tenant) => {
    const [adminCount, marketingCount, leadsCount, nmi] = await Promise.all([
      db.collection('users').countDocuments({ tenantId: tenant._id, role: 'admin' }),
      db.collection('users').countDocuments({ tenantId: tenant._id, role: 'marketing' }),
      db.collection('leads').countDocuments({ tenantId: tenant._id }),
      db.collection('nmi').aggregate([
        { $match: { tenantId: tenant._id } },
        { $group: {
          _id: null,
          marginIn: { $sum: { $cond: [{ $eq: ['$type', 'in'] }, '$amount', 0] } },
          marginOut: { $sum: { $cond: [{ $eq: ['$type', 'out'] }, '$amount', 0] } },
        } },
      ]).toArray(),
    ]);
    return {
      id: String(tenant._id),
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan || 'Starter',
      subscriptionStatus: tenant.subscriptionStatus || 'active',
      expiresAt: tenant.expiresAt || null,
      createdAt: tenant.createdAt,
      adminCount,
      marketingCount,
      leadsCount,
      nmi: Math.round((nmi[0]?.marginIn || 0) - (nmi[0]?.marginOut || 0)),
    };
  }));
  res.json(result);
});

r.post('/tenants', async (req, res) => {
  const db = getDb();
  const { name, plan, status, expiresAt, adminName, adminEmail, adminPassword } = req.body || {};
  const email = String(adminEmail || '').trim().toLowerCase();
  if (!String(name || '').trim() || !String(adminName || '').trim() || !email || !adminPassword) {
    return res.status(400).json({ error: 'Nama broker dan data admin wajib diisi' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Format email admin tidak valid' });
  if (String(adminPassword).length < 10) return res.status(400).json({ error: 'Password admin minimal 10 karakter' });
  if (!PLANS.includes(plan)) return res.status(400).json({ error: 'Paket berlangganan tidak valid' });
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Status langganan tidak valid' });
  const expiry = expiryDate(expiresAt);
  if (expiry === undefined) return res.status(400).json({ error: 'Tanggal berakhir tidak valid' });
  if (await db.collection('users').findOne({ email })) return res.status(409).json({ error: 'Email sudah terdaftar' });

  const now = new Date();
  const tenant = {
    name: String(name).trim().slice(0, 120),
    slug: tenantSlug(name),
    plan,
    subscriptionStatus: status,
    expiresAt: expiry,
    createdAt: now,
    updatedAt: now,
  };
  const passwordHash = await hashPassword(adminPassword);
  const { insertedId: tenantId } = await db.collection('tenants').insertOne(tenant);
  const admin = {
    tenantId,
    name: String(adminName).trim().slice(0, 120),
    email,
    password: passwordHash,
    role: 'admin',
    phone: '',
    joinedAt: now,
    company: tenant.name,
    active: true,
  };
  try {
    const { insertedId } = await db.collection('users').insertOne(admin);
    return res.status(201).json({ id: String(tenantId), admin: publicUser({ ...admin, _id: insertedId }) });
  } catch (error) {
    await db.collection('tenants').deleteOne({ _id: tenantId });
    if (error?.code === 11000) return res.status(409).json({ error: 'Email sudah terdaftar' });
    throw error;
  }
});

r.post('/tenants/:id/admin', async (req, res) => {
  const db = getDb();
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Tenant tidak valid' });
  const tenantId = new ObjectId(req.params.id);
  const tenant = await db.collection('tenants').findOne({ _id: tenantId });
  if (!tenant) return res.status(404).json({ error: 'Broker tidak ditemukan' });
  const { name, email: rawEmail, password } = req.body || {};
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!String(name || '').trim() || !email || !password) return res.status(400).json({ error: 'Nama, email, password wajib diisi' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Format email admin tidak valid' });
  if (String(password).length < 10) return res.status(400).json({ error: 'Password admin minimal 10 karakter' });
  if (await db.collection('users').findOne({ email })) return res.status(409).json({ error: 'Email sudah terdaftar' });

  const admin = {
    tenantId,
    name: String(name).trim().slice(0, 120),
    email,
    password: await hashPassword(password),
    role: 'admin',
    phone: '',
    joinedAt: new Date(),
    company: tenant.name,
    active: true,
  };
  try {
    const { insertedId } = await db.collection('users').insertOne(admin);
    res.status(201).json(publicUser({ ...admin, _id: insertedId }));
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'Email sudah terdaftar' });
    throw error;
  }
});

r.get('/tenants/:id/admins', async (req, res) => {
  const db = getDb();
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Tenant tidak valid' });
  const tenantId = new ObjectId(req.params.id);
  const tenant = await db.collection('tenants').findOne({ _id: tenantId }, { projection: { _id: 1 } });
  if (!tenant) return res.status(404).json({ error: 'Broker tidak ditemukan' });
  const admins = await db.collection('users')
    .find({ tenantId, role: 'admin' })
    .sort({ name: 1 })
    .toArray();
  res.json(admins.map(publicUser));
});

r.patch('/tenants/:id/admins/:adminId', async (req, res) => {
  const db = getDb();
  if (!validId(req.params.id) || !validId(req.params.adminId)) {
    return res.status(400).json({ error: 'Tenant atau admin tidak valid' });
  }
  const tenantId = new ObjectId(req.params.id);
  const adminId = new ObjectId(req.params.adminId);
  const user = await db.collection('users').findOne({ _id: adminId, tenantId, role: 'admin' });
  if (!user) return res.status(404).json({ error: 'Admin tenant tidak ditemukan' });

  const { name: rawName, email: rawEmail, password } = req.body || {};
  const set = {};
  if (rawName !== undefined) {
    const name = String(rawName).trim();
    if (!name) return res.status(400).json({ error: 'Nama admin tidak boleh kosong' });
    set.name = name.slice(0, 120);
  }
  if (rawEmail !== undefined) {
    const email = String(rawEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Format email admin tidak valid' });
    }
    if (await db.collection('users').findOne({ email, _id: { $ne: adminId } }, { projection: { _id: 1 } })) {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }
    set.email = email;
  }
  if (password !== undefined && String(password).length > 0) {
    if (String(password).length < 10) return res.status(400).json({ error: 'Password admin minimal 10 karakter' });
    set.password = await hashPassword(String(password));
  }
  if (!Object.keys(set).length) {
    return res.status(400).json({ error: 'Masukkan email atau password baru' });
  }

  try {
    await db.collection('users').updateOne({ _id: adminId, tenantId, role: 'admin' }, { $set: set });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'Email sudah terdaftar' });
    throw error;
  }
  const updatedAdmin = await db.collection('users').findOne({ _id: adminId, tenantId, role: 'admin' });
  if (!updatedAdmin) return res.status(404).json({ error: 'Admin tenant tidak ditemukan' });
  res.json(publicUser(updatedAdmin));
});

r.patch('/tenants/:id', async (req, res) => {
  const db = getDb();
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Tenant tidak valid' });
  const tenantId = new ObjectId(req.params.id);
  const { plan, subscriptionStatus, expiresAt } = req.body || {};
  const set = { updatedAt: new Date() };
  if (plan !== undefined) {
    if (!PLANS.includes(plan)) return res.status(400).json({ error: 'Paket berlangganan tidak valid' });
    set.plan = plan;
  }
  if (subscriptionStatus !== undefined) {
    if (!STATUSES.includes(subscriptionStatus)) return res.status(400).json({ error: 'Status langganan tidak valid' });
    set.subscriptionStatus = subscriptionStatus;
  }
  if (expiresAt !== undefined) {
    const expiry = expiryDate(expiresAt);
    if (expiry === undefined) return res.status(400).json({ error: 'Tanggal berakhir tidak valid' });
    set.expiresAt = expiry;
  }
  const result = await db.collection('tenants').updateOne({ _id: tenantId }, { $set: set });
  if (!result.matchedCount) return res.status(404).json({ error: 'Broker tidak ditemukan' });
  res.json({ ok: true });
});

export default r;
