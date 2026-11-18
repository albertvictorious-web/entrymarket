import { Router } from 'express';
import { getDb } from '../db.js';
import { authRequired, adminOnly } from '../auth.js';

const r = Router();

const DEFAULTS = (tenantName = 'Doo Financial Futures') => ({
  brokerName: tenantName,
  brokerLogo: '',
});

async function readSettings(db, tenantId, tenantName) {
  const doc = await db.collection('settings').findOne({ tenantId });
  return { ...DEFAULTS(tenantName), ...(doc?.value || {}) };
}

r.get('/', authRequired, async (req, res) => {
  const db = getDb();
  res.json(await readSettings(db, req.tenantId, req.tenant.name));
});

r.patch('/', authRequired, adminOnly, async (req, res) => {
  const db = getDb();
  const { brokerName, brokerLogo } = req.body || {};
  const current = await readSettings(db, req.tenantId, req.tenant.name);
  const next = { ...current };

  if (brokerName !== undefined) next.brokerName = String(brokerName).slice(0, 120).trim() || req.tenant.name;

  if (brokerLogo !== undefined) {
    if (brokerLogo === '') {
      next.brokerLogo = '';
    } else {
      const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(brokerLogo));
      if (!m) return res.status(400).json({ error: 'Format logo harus PNG atau JPG' });
      const image = Buffer.from(m[2], 'base64');
      const isPng = m[1] === 'png'
        && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isJpeg = m[1] === 'jpeg'
        && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
      if (!isPng && !isJpeg) return res.status(400).json({ error: 'Isi file tidak sesuai format PNG atau JPG' });
      if (image.length > 1024 * 1024) return res.status(413).json({ error: 'Ukuran logo maksimal 1 MB' });
      next.brokerLogo = String(brokerLogo);
    }
  }

  await db.collection('settings').updateOne(
    { tenantId: req.tenantId },
    { $set: { value: next, tenantId: req.tenantId, updatedAt: new Date() } },
    { upsert: true },
  );
  res.json(next);
});

export default r;
