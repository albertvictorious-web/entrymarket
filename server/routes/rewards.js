import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { authRequired, adminOnly } from '../auth.js';

const r = Router();
const oid = (v) => new ObjectId(String(v));

export const CASH_TIERS = [
  { closing: 10000, cash: 500000 },
  { closing: 20000, cash: 1000000 },
  { closing: 30000, cash: 1500000 },
  { closing: 40000, cash: 2000000 },
  { closing: 50000, cash: 2500000 },
  { closing: 60000, cash: 3000000 },
  { closing: 70000, cash: 3500000 },
  { closing: 80000, cash: 4000000 },
  { closing: 90000, cash: 4500000 },
  { closing: 100000, cash: 5000000 },
];

export const TRAVEL_PROGRAMS = [
  {
    id: 'bali',
    title: 'Reward Traveling Bali',
    destination: 'Bali, Indonesia',
    targetNmi: 25000,
    targetLots: 250,
    periodDays: 30,
    cover: 'bali',
    benefits: [
      'Tiket pesawat pulang-pergi',
      'Akomodasi hotel / vila selama perjalanan',
      'Uang saku Rp 1.000.000',
    ],
  },
  {
    id: 'three-countries',
    title: 'Reward Traveling 3 Negara',
    destination: 'Malaysia · Singapore · Thailand',
    targetNmi: 60000,
    targetLots: 600,
    periodDays: 30,
    cover: 'three',
    benefits: [
      'Tiket pesawat pulang-pergi',
      'Uang saku Rp 6.000.000',
    ],
  },
];

r.get('/programs', authRequired, (req, res) => res.json({ cashTiers: CASH_TIERS, travel: TRAVEL_PROGRAMS }));

r.get('/', authRequired, async (req, res) => {
  const db = getDb();
  const match = req.user.role === 'admin' ? {} : { marketingId: req.user._id };
  const rows = await db.collection('rewards').find(match).sort({ createdAt: -1 }).toArray();
  const users = await db.collection('users').find({ role: 'marketing' }).toArray();
  const byId = new Map(users.map((u) => [String(u._id), u.name]));
  res.json(rows.map((x) => ({
    ...x,
    id: String(x._id),
    marketingId: String(x.marketingId),
    marketingName: byId.get(String(x.marketingId)) || '-',
  })));
});

r.get('/progress', authRequired, async (req, res) => {
  const db = getDb();
  const marketingId = req.user.role === 'admin' && req.query.marketingId
    ? oid(req.query.marketingId)
    : req.user._id;
  const since = new Date(Date.now() - 30 * 86400000);
  const agg = await db.collection('nmi').aggregate([
    { $match: { marketingId, date: { $gte: since } } },
    {
      $group: {
        _id: null,
        marginIn: { $sum: { $cond: [{ $eq: ['$type', 'in'] }, '$amount', 0] } },
        marginOut: { $sum: { $cond: [{ $eq: ['$type', 'out'] }, '$amount', 0] } },
        lots: { $sum: '$lots' },
      },
    },
  ]).toArray();
  const s = agg[0] || { marginIn: 0, marginOut: 0, lots: 0 };
  const nmi = s.marginIn - s.marginOut;
  const lots = Math.round(s.lots * 10) / 10;
  res.json({
    nmi,
    lots,
    travel: TRAVEL_PROGRAMS.map((p) => ({
      ...p,
      nmiProgress: Math.min(100, Math.round((nmi / p.targetNmi) * 100)),
      lotsProgress: Math.min(100, Math.round((lots / p.targetLots) * 100)),
      achieved: nmi >= p.targetNmi && lots >= p.targetLots,
    })),
  });
});

r.post('/', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  const { marketingId, type, title, closingAmount, cashValue } = req.body || {};
  if (!marketingId || !title) return res.status(400).json({ error: 'Marketing dan judul wajib' });
  const doc = {
    marketingId: oid(marketingId),
    type: type || 'cash',
    title,
    closingAmount: Number(closingAmount) || 0,
    cashValue: Number(cashValue) || 0,
    status: 'available',
    createdAt: new Date(),
    claimedAt: null,
  };
  const { insertedId } = await db.collection('rewards').insertOne(doc);
  res.status(201).json({ id: String(insertedId) });
});

r.post('/:id/claim', authRequired, async (req, res) => {
  const db = getDb();
  const reward = await db.collection('rewards').findOne({ _id: oid(req.params.id) });
  if (!reward) return res.status(404).json({ error: 'Reward tidak ditemukan' });
  if (req.user.role !== 'admin' && String(reward.marketingId) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Bukan reward Anda' });
  }
  if (reward.status === 'claimed') return res.status(400).json({ error: 'Reward sudah di-claim' });
  await db.collection('rewards').updateOne(
    { _id: oid(req.params.id) },
    { $set: { status: 'claimed', claimedAt: new Date() } },
  );
  res.json({ ok: true });
});

r.delete('/:id', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  await db.collection('rewards').deleteOne({ _id: oid(req.params.id) });
  res.json({ ok: true });
});

export default r;
