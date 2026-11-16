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

  /* Closing = total margin in pada periode berjalan. */
  const closing = Math.round(s.marginIn);
  const maxTier = CASH_TIERS[CASH_TIERS.length - 1].closing;
  const nextTier = CASH_TIERS.find((t) => closing < t.closing) || null;
  const cashTiers = CASH_TIERS.map((t) => ({
    ...t,
    progress: Math.min(100, Math.round((closing / t.closing) * 100)),
    achieved: closing >= t.closing,
  }));

  res.json({
    nmi,
    lots,
    closing,
    closingProgress: Math.min(100, Math.round((closing / maxTier) * 100)),
    nextTier,
    cashTiers,
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

/* Marketing mengajukan claim tier yang sudah tercapai; admin memverifikasi. */
r.post('/request', authRequired, async (req, res) => {
  const db = getDb();
  const closing = Number(req.body?.closingAmount);
  const tier = CASH_TIERS.find((t) => t.closing === closing);
  if (!tier) return res.status(400).json({ error: 'Tier reward tidak valid' });

  const since = new Date(Date.now() - 30 * 86400000);
  const agg = await db.collection('nmi').aggregate([
    { $match: { marketingId: req.user._id, date: { $gte: since } } },
    { $group: { _id: null, marginIn: { $sum: { $cond: [{ $eq: ['$type', 'in'] }, '$amount', 0] } } } },
  ]).toArray();
  const closingNow = Math.round(agg[0]?.marginIn || 0);
  if (closingNow < tier.closing) {
    return res.status(400).json({ error: `Closing Anda ${closingNow.toLocaleString('en-US')} belum mencapai ${closing.toLocaleString('en-US')}` });
  }

  const existing = await db.collection('rewards').findOne({
    marketingId: req.user._id, type: 'cash', closingAmount: tier.closing,
  });
  if (existing) return res.status(400).json({ error: 'Reward tier ini sudah diajukan' });

  const { insertedId } = await db.collection('rewards').insertOne({
    marketingId: req.user._id,
    type: 'cash',
    title: `Reward Cash Closing $${tier.closing.toLocaleString('en-US')}`,
    closingAmount: tier.closing,
    cashValue: tier.cash,
    status: 'available',
    requestedBy: 'marketing',
    createdAt: new Date(),
    claimedAt: null,
  });
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
