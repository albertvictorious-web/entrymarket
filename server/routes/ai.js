import { Router } from 'express';
import { getDb } from '../db.js';
import { authRequired } from '../auth.js';

const r = Router();

const SYSTEM_PROMPT = `Anda adalah "Entry AI", asisten di dashboard Entry Market (broker partner Doo Financial Futures).
Anda membantu marketing dan admin memahami data mereka: NMI (Net Margin In = margin in - margin out),
total lot, jumlah nasabah, leads, appointment, reward cash closing, dan reward traveling.
Jawab singkat, jelas, dalam Bahasa Indonesia, dan gunakan angka dari konteks yang diberikan.
Jika data tidak tersedia, katakan apa adanya dan sarankan langkah berikutnya.`;

async function buildContext(db, user) {
  const isAdmin = user.role === 'admin';
  const since = new Date(Date.now() - 30 * 86400000);
  const match = { date: { $gte: since } };
  if (!isAdmin) match.marketingId = user._id;

  const [agg, leads, appts, rewards] = await Promise.all([
    db.collection('nmi').aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          marginIn: { $sum: { $cond: [{ $eq: ['$type', 'in'] }, '$amount', 0] } },
          marginOut: { $sum: { $cond: [{ $eq: ['$type', 'out'] }, '$amount', 0] } },
          lots: { $sum: '$lots' },
          clients: { $addToSet: '$clientName' },
        },
      },
    ]).toArray(),
    db.collection('leads').countDocuments(isAdmin ? {} : { marketingId: user._id }),
    db.collection('appointments').countDocuments(isAdmin ? {} : { marketingId: user._id }),
    db.collection('rewards').countDocuments(isAdmin ? {} : { marketingId: user._id }),
  ]);

  const s = agg[0] || { marginIn: 0, marginOut: 0, lots: 0, clients: [] };
  return {
    user: { name: user.name, role: user.role, company: user.company || 'Doo Financial Futures' },
    periode: '30 hari terakhir',
    marginIn: Math.round(s.marginIn),
    marginOut: Math.round(s.marginOut),
    nmi: Math.round(s.marginIn - s.marginOut),
    lots: Math.round(s.lots * 10) / 10,
    nasabah: s.clients.length,
    leads,
    appointment: appts,
    reward: rewards,
  };
}

/* Fallback lokal bila tidak ada API key AI: jawaban berbasis data. */
function localAnswer(question, ctx) {
  const q = question.toLowerCase();
  const fmt = (n) => `$${Number(n).toLocaleString('en-US')}`;
  if (/nmi|margin|profit/.test(q)) {
    return `NMI Anda ${ctx.periode} adalah **${fmt(ctx.nmi)}** (margin in ${fmt(ctx.marginIn)} − margin out ${fmt(ctx.marginOut)}), dengan total ${ctx.lots} lot dari ${ctx.nasabah} nasabah.`;
  }
  if (/lot/.test(q)) return `Total lot ${ctx.periode}: **${ctx.lots} lot**.`;
  if (/lead|prospek/.test(q)) return `Anda memiliki **${ctx.leads} leads** tercatat. Buka menu Leads untuk memperbarui progres.`;
  if (/appointment|jadwal|meeting/.test(q)) return `Ada **${ctx.appointment} appointment** tercatat. Buka menu Appointment untuk detail jadwal.`;
  if (/reward|hadiah|closing/.test(q)) {
    return `Reward cash dihitung dari closing: setiap $10.000 = Rp 500.000. Closing Anda ${ctx.periode} sekitar ${fmt(ctx.marginIn)}. Buka menu Reward untuk melihat progres dan claim.`;
  }
  if (/nasabah|client/.test(q)) return `Anda memiliki **${ctx.nasabah} nasabah** aktif ${ctx.periode}.`;
  return `Halo ${ctx.user.name}! Saya bisa bantu soal NMI, lot, nasabah, leads, appointment, dan reward. Ringkasan ${ctx.periode}: NMI ${fmt(ctx.nmi)}, ${ctx.lots} lot, ${ctx.nasabah} nasabah, ${ctx.leads} leads.`;
}

r.get('/history', authRequired, async (req, res) => {
  const db = getDb();
  const rows = await db.collection('ai_chats')
    .find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(40)
    .toArray();
  res.json(rows.reverse().map((m) => ({
    id: String(m._id),
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
  })));
});

r.delete('/history', authRequired, async (req, res) => {
  const db = getDb();
  await db.collection('ai_chats').deleteMany({ userId: req.user._id });
  res.json({ ok: true });
});

r.post('/chat', authRequired, async (req, res) => {
  const db = getDb();
  const message = String(req.body?.message || '').slice(0, 2000).trim();
  if (!message) return res.status(400).json({ error: 'Pesan kosong' });

  const ctx = await buildContext(db, req.user);
  const now = new Date();
  await db.collection('ai_chats').insertOne({
    userId: req.user._id, role: 'user', content: message, createdAt: now,
  });

  let answer = '';
  let provider = 'local';

  const history = await db.collection('ai_chats')
    .find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
  const turns = history.reverse().map((m) => ({ role: m.role, content: m.content }));

  /* 1) Google Gemini — satu model utama, cadangan hanya bila gagal cepat. */
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const models = (process.env.GEMINI_MODEL || 'gemini-3.6-flash,gemini-3.5-flash').split(',');
    const contents = turns.map((t) => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: t.content }],
    }));
    const deadline = Date.now() + 18000;
    for (const model of models) {
      if (Date.now() > deadline) break;
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model.trim()}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: `${SYSTEM_PROMPT}\n\nKonteks data pengguna (JSON):\n${JSON.stringify(ctx)}` }],
              },
              contents,
              generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
            }),
            signal: AbortSignal.timeout(9000),
          },
        );
        const json = await resp.json();
        const text = json?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || '')
          .join('')
          .trim();
        if (text) {
          answer = text;
          provider = model.trim();
          break;
        }
      } catch {
        /* coba model berikutnya */
      }
    }
  }

  /* 2) OpenAI (opsional) */
  if (!answer && process.env.OPENAI_API_KEY) {
    try {
      const resp = await fetch(`${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: `${SYSTEM_PROMPT}\n\nKonteks data pengguna (JSON):\n${JSON.stringify(ctx)}` },
            ...turns,
          ],
          temperature: 0.4,
          max_tokens: 600,
        }),
        signal: AbortSignal.timeout(25000),
      });
      const json = await resp.json();
      const text = json?.choices?.[0]?.message?.content?.trim();
      if (text) {
        answer = text;
        provider = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      }
    } catch {
      /* fallback ke jawaban lokal */
    }
  }

  if (!answer) answer = localAnswer(message, ctx);

  await db.collection('ai_chats').insertOne({
    userId: req.user._id, role: 'assistant', content: answer, createdAt: new Date(),
  });

  res.json({ answer, provider });
});

export default r;
