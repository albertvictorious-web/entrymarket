import { Router } from 'express';
import { authRequired } from '../auth.js';

const r = Router();
const KEY = process.env.TWELVE_DATA_KEY || '9e4cd33d14b24055ab8dea3a8a94060c';
const BASE = 'https://api.twelvedata.com';

export const SYMBOLS = [
  { symbol: 'XAU/USD', label: 'Gold', short: 'XAUUSD', group: 'commodity' },
  { symbol: 'EUR/USD', label: 'Euro', short: 'EURUSD', group: 'forex' },
  { symbol: 'GBP/USD', label: 'Pound Sterling', short: 'GBPUSD', group: 'forex' },
  { symbol: 'USD/JPY', label: 'US Dollar / Yen', short: 'USDJPY', group: 'forex' },
  { symbol: 'AUD/USD', label: 'Aussie Dollar', short: 'AUDUSD', group: 'forex' },
  { symbol: 'USD/CHF', label: 'Swiss Franc', short: 'USDCHF', group: 'forex' },
  { symbol: 'USD/CAD', label: 'Canadian Dollar', short: 'USDCAD', group: 'forex' },
  { symbol: 'NZD/USD', label: 'Kiwi Dollar', short: 'NZDUSD', group: 'forex' },
  { symbol: 'BTC/USD', label: 'Bitcoin', short: 'BTCUSD', group: 'crypto' },
];

const cache = new Map();
const TTL = 120000;
const NEWS_TTL = 300000;
const STALE_TTL = 3600000;

/* Twelve Data free tier: 8 kredit/menit. Kita jaga agar tidak pernah
   menembus batas dengan antrean berjeda + cache panjang. */
const RATE = { limit: 7, windowMs: 60000, used: [], queue: Promise.resolve() };

/* Tidak pernah menunggu lama: kalau kuota menit ini habis, langsung tolak
   agar request tidak menggantung (serverless punya batas waktu eksekusi). */
function rateGate() {
  const now = Date.now();
  RATE.used = RATE.used.filter((t) => now - t < RATE.windowMs);
  if (RATE.used.length >= RATE.limit) {
    const err = new Error('Kuota menit tercapai');
    err.rateLimited = true;
    throw err;
  }
  RATE.used.push(now);
}

async function cached(key, fn, ttl = TTL) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  try {
    const value = await fn();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    if (hit && Date.now() - hit.at < STALE_TTL) return hit.value;
    throw e;
  }
}

async function fetchQuote(symbol) {
  rateGate();
  const url = `${BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${KEY}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const json = await resp.json();
  if (json.code) throw new Error(json.message || `Error ${json.code}`);
  return json;
}

function shape(s, q) {
  return {
    ...s,
    price: Number(q.close ?? q.price ?? 0),
    change: Number(q.change ?? 0),
    percent: Number(q.percent_change ?? 0),
    high: Number(q.high ?? 0),
    low: Number(q.low ?? 0),
    open: Number(q.open ?? 0),
    prevClose: Number(q.previous_close ?? 0),
    isOpen: q.is_market_open !== false,
    updatedAt: q.datetime || null,
  };
}

function empty(s) {
  return { ...s, price: 0, change: 0, percent: 0, high: 0, low: 0, open: 0, prevClose: 0, isOpen: false, updatedAt: null };
}

r.get('/quotes', authRequired, async (req, res) => {
  const only = String(req.query.symbols || '').split(',').map((x) => x.trim()).filter(Boolean);
  const targets = only.length ? SYMBOLS.filter((s) => only.includes(s.short)) : SYMBOLS;

  const list = [];
  for (const s of targets) {
    const hit = cache.get(`quote:${s.symbol}`);
    if (hit) {
      list.push(shape(s, hit.value));
      continue;
    }
    try {
      const q = await cached(`quote:${s.symbol}`, () => fetchQuote(s.symbol));
      list.push(shape(s, q));
    } catch {
      list.push(empty(s));
    }
  }

  res.json({ quotes: list, source: 'Twelve Data' });
});

/* Warm-up bertahap: isi cache satu simbol per request agar tidak kena limit. */
r.get('/quotes/warm', authRequired, async (req, res) => {
  const pending = SYMBOLS.filter((s) => !cache.has(`quote:${s.symbol}`));
  if (!pending.length) return res.json({ warmed: 0, remaining: 0 });
  const s = pending[0];
  try {
    const q = await cached(`quote:${s.symbol}`, () => fetchQuote(s.symbol));
    res.json({ warmed: 1, symbol: s.short, price: Number(q.close ?? 0), remaining: pending.length - 1 });
  } catch (e) {
    res.json({ warmed: 0, symbol: s.short, error: String(e.message).slice(0, 80), remaining: pending.length });
  }
});

const CALENDAR_FEEDS = {
  thisweek: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  nextweek: 'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
};

r.get('/calendar', authRequired, async (req, res) => {
  const week = req.query.week === 'nextweek' ? 'nextweek' : 'thisweek';
  try {
    const raw = await cached(`calendar:${week}`, async () => {
      const resp = await fetch(CALENDAR_FEEDS[week], {
        headers: { 'User-Agent': 'Mozilla/5.0 EntryMarketDashboard' },
      });
      if (!resp.ok) throw new Error(`Feed error ${resp.status}`);
      return resp.json();
    });
    const events = raw.map((e) => {
      const d = new Date(e.date);
      return {
        date: d.toISOString().slice(0, 10),
        time: d.toISOString().slice(11, 16),
        timestamp: d.getTime(),
        country: e.country || '',
        currency: e.country || '',
        event: e.title || '',
        impact: e.impact || 'Low',
        actual: e.actual ?? '',
        forecast: e.forecast ?? '',
        previous: e.previous ?? '',
      };
    }).sort((a, b) => a.timestamp - b.timestamp);

    const days = [...new Set(events.map((e) => e.date))].sort();
    const day = req.query.day && days.includes(req.query.day) ? req.query.day : days[0] || null;
    const impact = String(req.query.impact || '').toLowerCase();
    const filtered = events.filter((e) => {
      if (day && e.date !== day) return false;
      if (impact && impact !== 'all' && e.impact.toLowerCase() !== impact) return false;
      return true;
    });

    res.json({
      events: filtered,
      all: events,
      days,
      day,
      week,
      counts: {
        high: events.filter((e) => e.impact === 'High').length,
        medium: events.filter((e) => e.impact === 'Medium').length,
        low: events.filter((e) => e.impact === 'Low').length,
      },
      source: 'ForexFactory Economic Calendar',
    });
  } catch (e) {
    res.status(502).json({ error: 'Gagal mengambil kalender ekonomi', detail: String(e.message) });
  }
});

const NEWS_FEEDS = [
  { name: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { name: 'CNBC Commodities', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664' },
  { name: 'Investing', url: 'https://www.investing.com/rss/news_14.rss' },
  { name: 'Investing Commodities', url: 'https://www.investing.com/rss/news_11.rss' },
  { name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
];

function decodeEntities(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRss(xml, source) {
  const items = [];
  const blocks = xml.split(/<item[\s>]/).slice(1);
  for (const b of blocks.slice(0, 8)) {
    const pick = (tag) => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      return m ? decodeEntities(m[1]) : '';
    };
    const title = pick('title');
    if (!title) continue;
    items.push({
      source,
      title,
      link: pick('link'),
      summary: pick('description').slice(0, 220),
      published: pick('pubDate') ? new Date(pick('pubDate')).toISOString() : null,
    });
  }
  return items;
}

export const NEWS_CATEGORIES = [
  { id: 'all', label: 'Semua' },
  { id: 'forex', label: 'Mata Uang' },
  { id: 'commodity', label: 'Komoditas' },
  { id: 'gold', label: 'Gold' },
  { id: 'oil', label: 'Minyak' },
  { id: 'crypto', label: 'Kripto' },
  { id: 'index', label: 'Indeks & Saham' },
  { id: 'economy', label: 'Ekonomi Global' },
];

const CATEGORY_KEYWORDS = {
  gold: ['gold', 'xau', 'bullion', 'precious metal', 'emas'],
  oil: ['oil', 'crude', 'brent', 'wti', 'opec', 'petroleum'],
  forex: ['forex', 'currency', 'dollar', 'euro', 'yen', 'pound', 'sterling', 'franc', 'aussie', 'kiwi', 'loonie', 'usd', 'eur', 'jpy', 'gbp', 'exchange rate', 'central bank', 'fed', 'ecb', 'boj', 'rba', 'boe'],
  crypto: ['bitcoin', 'crypto', 'ethereum', 'ether', 'blockchain', 'btc', 'eth', 'solana', 'token'],
  index: ['stock', 'equit', 's&p', 'nasdaq', 'dow', 'index', 'shares', 'earnings', 'wall street', 'ftse', 'nikkei'],
  economy: ['economy', 'economic', 'inflation', 'gdp', 'recession', 'trade', 'tariff', 'policy', 'jobs', 'payroll', 'cpi', 'rate hike', 'rate cut'],
};

function categorize(item) {
  const hay = `${item.title} ${item.summary}`.toLowerCase();
  const tags = [];
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => hay.includes(w))) tags.push(cat);
  }
  if (tags.includes('gold') || tags.includes('oil')) tags.push('commodity');
  return tags.length ? [...new Set(tags)] : ['economy'];
}

r.get('/news', authRequired, async (req, res) => {
  try {
    const items = await cached('news', async () => {
      const results = await Promise.allSettled(NEWS_FEEDS.map(async (f) => {
        const resp = await fetch(f.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 EntryMarketDashboard' },
          signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) throw new Error(String(resp.status));
        return parseRss(await resp.text(), f.name);
      }));
      return results
        .filter((x) => x.status === 'fulfilled')
        .flatMap((x) => x.value)
        .map((n) => ({ ...n, tags: categorize(n) }))
        .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0))
        .slice(0, 60);
    }, NEWS_TTL);

    const cat = String(req.query.category || 'all').toLowerCase();
    const filtered = cat === 'all' ? items : items.filter((n) => n.tags.includes(cat));

    res.json({
      items: filtered.slice(0, 24),
      total: filtered.length,
      category: cat,
      categories: NEWS_CATEGORIES,
      sources: NEWS_FEEDS.map((f) => f.name),
    });
  } catch (e) {
    res.status(502).json({ error: 'Gagal mengambil berita pasar', detail: String(e.message) });
  }
});

export default r;
