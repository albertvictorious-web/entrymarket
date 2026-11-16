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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'entrymarket-dashboard' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  // Alias root-level: /api/nmi, /api/leaderboard (dipakai frontend)
  app.use('/api', dashboardRoutes);
  app.use('/api/leads', leadRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/rewards', rewardRoutes);
  app.use('/api/announcements', announcementRoutes);
  app.use('/api/market', marketRoutes);
  app.use('/api/notes', noteRoutes);
  app.use('/api/reglinks', regLinkRoutes);
  app.use('/api/ai', aiRoutes);

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
