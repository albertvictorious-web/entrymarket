import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDb } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret';

export function signToken(user) {
  return jwt.sign({ id: String(user._id) }, SECRET, { expiresIn: '7d' });
}

export function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}

export function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan' });
  try {
    const payload = jwt.verify(token, SECRET);
    const db = getDb();
    const { ObjectId } = await import('mongodb');
    const user = await db.collection('users').findOne({ _id: new ObjectId(payload.id) });
    if (!user) return res.status(401).json({ error: 'User tidak ditemukan' });
    if (user.active === false) return res.status(403).json({ error: 'Akun dinonaktifkan' });
    if (user.role !== 'master') {
      if (!user.tenantId) return res.status(403).json({ error: 'Akun belum terhubung ke tenant' });
      const tenant = await db.collection('tenants').findOne({ _id: user.tenantId });
      if (!tenant || tenant.subscriptionStatus === 'suspended') {
        return res.status(403).json({ error: 'Langganan dashboard ini sedang ditangguhkan' });
      }
      if (tenant.expiresAt && new Date(tenant.expiresAt) < new Date()) {
        return res.status(403).json({ error: 'Masa langganan dashboard telah berakhir' });
      }
      if (tenant.subscriptionStatus !== 'active' && tenant.subscriptionStatus !== 'trial') {
        return res.status(403).json({ error: 'Status langganan dashboard tidak aktif' });
      }
      req.tenant = tenant;
      req.tenantId = tenant._id;
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token tidak valid' });
  }
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Akses khusus admin' });
  next();
}

export function masterOnly(req, res, next) {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Akses khusus master admin' });
  next();
}

export function tenantOnly(req, res, next) {
  if (!req.user || req.user.role === 'master' || !req.tenantId) {
    return res.status(403).json({ error: 'Fitur ini hanya tersedia untuk akun tenant' });
  }
  next();
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone || '',
    avatar: u.avatar || '',
    joinedAt: u.joinedAt,
    company: u.company || 'Doo Financial Futures',
    active: u.active !== false,
    tenantId: u.tenantId ? String(u.tenantId) : '',
    tenantName: u.tenantName || '',
  };
}
