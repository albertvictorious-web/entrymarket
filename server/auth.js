import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDb } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret';

export function signToken(user) {
  return jwt.sign({ id: String(user._id), role: user.role }, SECRET, { expiresIn: '7d' });
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
  };
}
