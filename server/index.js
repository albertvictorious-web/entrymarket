import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './db.js';
import authRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import leadRoutes from './routes/leads.js';
import appointmentRoutes from './routes/appointments.js';
import rewardRoutes from './routes/rewards.js';
import announcementRoutes from './routes/announcements.js';
import marketRoutes from './routes/market.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'entrymarket-dashboard' }));
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/nmi', dashboardRoutes);
app.use('/api/leaderboard', dashboardRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/market', marketRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan server' });
});

connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Entry Market dashboard berjalan di http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error('Gagal konek MongoDB:', e.message);
    process.exit(1);
  });
