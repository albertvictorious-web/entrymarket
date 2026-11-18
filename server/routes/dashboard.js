import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { authRequired, adminOnly, publicUser, hashPassword } from '../auth.js';

const r = Router();

const oid = (v) => (v ? new ObjectId(String(v)) : null);

function rangeStart(range) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === 'today') return d;
  if (range === '7d') return new Date(d.getTime() - 6 * 86400000);
  if (range === '30d') return new Date(d.getTime() - 29 * 86400000);
  if (range === '90d') return new Date(d.getTime() - 89 * 86400000);
  return new Date(0);
}

async function nmiAggregate(db, match) {
  const rows = await db.collection('nmi').aggregate([
    { $match: match },
    {
      $group: {
        _id: '$marketingId',
        marginIn: { $sum: { $cond: [{ $eq: ['$type', 'in'] }, '$amount', 0] } },
        marginOut: { $sum: { $cond: [{ $eq: ['$type', 'out'] }, '$amount', 0] } },
        lots: { $sum: '$lots' },
        clients: { $addToSet: '$clientName' },
        txCount: { $sum: 1 },
      },
    },
  ]).toArray();
  return rows.map((x) => ({
    marketingId: String(x._id),
    marginIn: x.marginIn,
    marginOut: x.marginOut,
    nmi: x.marginIn - x.marginOut,
    lots: Math.round(x.lots * 10) / 10,
    clients: x.clients.length,
    txCount: x.txCount,
  }));
}

r.get('/overview', authRequired, async (req, res) => {
  const db = getDb();
  const range = req.query.range || '30d';
  const since = rangeStart(range);
  const isAdmin = req.user.role === 'admin';

  const baseMatch = { tenantId: req.tenantId, date: { $gte: since } };
  if (!isAdmin) baseMatch.marketingId = req.user._id;

  const [agg, users, leadsCount, apptCount, announcements, leadsAgg, apptAgg] = await Promise.all([
    nmiAggregate(db, baseMatch),
    db.collection('users').find({ tenantId: req.tenantId, role: 'marketing' }).toArray(),
    db.collection('leads').countDocuments({ tenantId: req.tenantId, ...(isAdmin ? {} : { marketingId: req.user._id }) }),
    db.collection('appointments').countDocuments(
      { tenantId: req.tenantId, date: { $gte: new Date() }, ...(isAdmin ? {} : { marketingId: req.user._id }) },
    ),
    db.collection('announcements').find({ tenantId: req.tenantId }).sort({ pinned: -1, createdAt: -1 }).limit(3).toArray(),
    db.collection('leads').aggregate([
      { $match: { tenantId: req.tenantId, ...(isAdmin ? {} : { marketingId: req.user._id }) } },
      {
        $group: {
          _id: '$marketingId',
          total: { $sum: 1 },
          closing: { $sum: { $cond: [{ $eq: ['$status', 'closing'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
          potential: { $sum: '$potential' },
        },
      },
    ]).toArray(),
    db.collection('appointments').aggregate([
      { $match: { tenantId: req.tenantId, ...(isAdmin ? {} : { marketingId: req.user._id }) } },
      { $group: { _id: '$marketingId', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } } },
    ]).toArray(),
  ]);

  const byId = new Map(users.map((u) => [String(u._id), u]));
  const mine = agg.find((a) => a.marketingId === String(req.user._id)) || {
    marginIn: 0, marginOut: 0, nmi: 0, lots: 0, clients: 0, txCount: 0,
  };

  const leadsById = new Map(leadsAgg.map((x) => [String(x._id), x]));
  const apptById = new Map(apptAgg.map((x) => [String(x._id), x]));

  const leaderboard = agg
    .map((a) => ({
      ...a,
      name: byId.get(a.marketingId)?.name || 'Marketing',
      avatar: byId.get(a.marketingId)?.avatar || '',
      leads: leadsById.get(a.marketingId)?.total || 0,
      closing: leadsById.get(a.marketingId)?.closing || 0,
      appointments: apptById.get(a.marketingId)?.total || 0,
    }))
    .sort((a, b) => b.nmi - a.nmi)
    .map((a, i) => ({ ...a, rank: i + 1 }));

  /* Performa seluruh marketing — dipakai dashboard admin */
  const performance = users.map((u) => {
    const id = String(u._id);
    const a = agg.find((x) => x.marketingId === id) || {
      marginIn: 0, marginOut: 0, nmi: 0, lots: 0, clients: 0, txCount: 0,
    };
    const l = leadsById.get(id) || { total: 0, closing: 0, lost: 0, potential: 0 };
    const ap = apptById.get(id) || { total: 0, done: 0 };
    return {
      marketingId: id,
      name: u.name,
      email: u.email,
      active: u.active !== false,
      joinedAt: u.joinedAt,
      nmi: a.nmi,
      marginIn: a.marginIn,
      marginOut: a.marginOut,
      lots: a.lots,
      clients: a.clients,
      txCount: a.txCount,
      leads: l.total,
      closing: l.closing,
      lost: l.lost,
      potential: l.potential,
      appointments: ap.total,
      apptDone: ap.done,
      rank: leaderboard.find((x) => x.marketingId === id)?.rank || null,
    };
  }).sort((a, b) => b.nmi - a.nmi);

  const totals = agg.reduce(
    (acc, a) => ({
      marginIn: acc.marginIn + a.marginIn,
      marginOut: acc.marginOut + a.marginOut,
      nmi: acc.nmi + a.nmi,
      lots: acc.lots + a.lots,
      clients: acc.clients + a.clients,
    }),
    { marginIn: 0, marginOut: 0, nmi: 0, lots: 0, clients: 0 },
  );

  const trend = await db.collection('nmi').aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        marginIn: { $sum: { $cond: [{ $eq: ['$type', 'in'] }, '$amount', 0] } },
        marginOut: { $sum: { $cond: [{ $eq: ['$type', 'out'] }, '$amount', 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray();

  res.json({
    range,
    me: publicUser(req.user),
    myStats: mine,
    myRank: leaderboard.find((l) => l.marketingId === String(req.user._id))?.rank || null,
    totals,
    totalMarketers: users.length,
    leadsCount,
    apptCount,
    leaderboard,
    performance,
    trend: trend.map((t) => ({ date: t._id, nmi: t.marginIn - t.marginOut, marginIn: t.marginIn, marginOut: t.marginOut })),
    announcements: announcements.map((a) => ({ ...a, id: String(a._id) })),
  });
});

r.get('/nmi', authRequired, async (req, res) => {
  const db = getDb();
  const { range = '30d', marketingId, type } = req.query;
  const match = { tenantId: req.tenantId, date: { $gte: rangeStart(range) } };
  if (req.user.role !== 'admin') match.marketingId = req.user._id;
  else if (marketingId) match.marketingId = oid(marketingId);
  if (type === 'in' || type === 'out') match.type = type;

  const rows = await db.collection('nmi').find(match).sort({ date: -1 }).limit(300).toArray();
  const users = await db.collection('users').find({ tenantId: req.tenantId, role: 'marketing' }).toArray();
  const byId = new Map(users.map((u) => [String(u._id), u.name]));

  res.json(rows.map((x) => ({
    id: String(x._id),
    marketingId: String(x.marketingId),
    marketingName: byId.get(String(x.marketingId)) || '-',
    clientName: x.clientName,
    type: x.type,
    amount: x.amount,
    lots: x.lots,
    date: x.date,
    note: x.note || '',
  })));
});

r.post('/nmi', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  const { clientName, type, amount, lots, date, note, marketingId } = req.body || {};
  if (!clientName || !['in', 'out'].includes(type) || !(Number(amount) > 0)) {
    return res.status(400).json({ error: 'Data NMI tidak lengkap' });
  }
  if (!marketingId) return res.status(400).json({ error: 'Pilih marketing pemilik transaksi' });
  const ownerId = oid(marketingId);
  if (!await db.collection('users').findOne({ _id: ownerId, tenantId: req.tenantId, role: 'marketing' })) {
    return res.status(400).json({ error: 'Marketing pemilik transaksi tidak valid' });
  }
  const doc = {
    tenantId: req.tenantId,
    marketingId: ownerId,
    clientName: String(clientName).slice(0, 120),
    type,
    amount: Number(amount),
    lots: Number(lots) || 0,
    date: date ? new Date(date) : new Date(),
    note: String(note || '').slice(0, 300),
    createdAt: new Date(),
  };
  const { insertedId } = await db.collection('nmi').insertOne(doc);
  res.status(201).json({ id: String(insertedId) });
});

r.delete('/nmi/:id', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  await db.collection('nmi').deleteOne({ _id: oid(req.params.id), tenantId: req.tenantId });
  res.json({ ok: true });
});

r.get('/leaderboard', authRequired, async (req, res) => {
  const db = getDb();
  const range = req.query.range || '30d';
  const agg = await nmiAggregate(db, { tenantId: req.tenantId, date: { $gte: rangeStart(range) } });
  const users = await db.collection('users').find({ tenantId: req.tenantId, role: 'marketing' }).toArray();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const list = users.map((u) => {
    const a = agg.find((x) => x.marketingId === String(u._id)) || {
      marginIn: 0, marginOut: 0, nmi: 0, lots: 0, clients: 0, txCount: 0,
    };
    return { ...a, name: u.name, avatar: u.avatar || '', joinedAt: u.joinedAt };
  }).sort((a, b) => b.nmi - a.nmi).map((x, i) => ({ ...x, rank: i + 1 }));
  res.json(list);
});

export default r;
