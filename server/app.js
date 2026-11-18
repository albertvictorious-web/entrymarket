import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import leadRoutes from './routes/leads.js';
import appointmentRoutes from './routes/appointments.js';
import rewardRoutes from './routes/rewards.js';
import announcementRoutes from './routes/announcements.js';
import marketRoutes from './routes/market.js';
import noteRoutes from './routes/notes.js';
import regLinkRoutes from './routes/reglinks.js';
import aiRoutes from './routes/ai.js';
import settingsRoutes from './routes/settings.js';
import masterRoutes from './routes/master.js';
import { authRequired, tenantOnly } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '6mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'entrymarket-dashboard' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/master', masterRoutes);
  app.use('/api/dashboard', authRequired, tenantOnly, dashboardRoutes);
  app.use('/api/leads', authRequired, tenantOnly, leadRoutes);
  app.use('/api/appointments', authRequired, tenantOnly, appointmentRoutes);
  app.use('/api/rewards', authRequired, tenantOnly, rewardRoutes);
  app.use('/api/announcements', authRequired, tenantOnly, announcementRoutes);
  app.use('/api/market', authRequired, tenantOnly, marketRoutes);
  app.use('/api/notes', authRequired, tenantOnly, noteRoutes);
  app.use('/api/reglinks', authRequired, tenantOnly, regLinkRoutes);
  app.use('/api/ai', authRequired, tenantOnly, aiRoutes);
  app.use('/api/settings', authRequired, tenantOnly, settingsRoutes);
  // Alias root-level: /api/nmi, /api/leaderboard (dipakai frontend)
  app.use('/api', authRequired, tenantOnly, dashboardRoutes);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  });

  return app;
}
