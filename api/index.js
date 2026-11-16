import { createApp } from '../server/app.js';
import { connect } from '../server/db.js';

const app = createApp();

let ready = null;

function ensureDb() {
  if (!ready) {
    ready = connect().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export default async function handler(req, res) {
  try {
    await ensureDb();
  } catch (err) {
    console.error('Gagal konek MongoDB:', err.message);
    res.status(503).json({ error: 'Database tidak tersedia' });
    return;
  }
  return app(req, res);
}
