import { Router } from 'express';
import { authRequired } from '../auth.js';

const r = Router();
const KEY = process.env.TWELVE_DATA_KEY || '9e4cd33d14b24055ab8dea3a8a94060c';
const BASE = 'https://api.twelvedata.com';

export const SYMBOLS = [
  { symbol: 'XAU/USD', label: 'Gold', short: 'XAUUSD' },
  { symbol: 'EUR/USD', label: 'EUR/USD', short: 'EURUSD' },
  { symbol: 'GBP/USD', label: 'GBP/USD', short: 'GBPUSD' },
  { symbol: 'USD/JPY', label: 'USD/JPY', short: 'USDJPY' },
  { symbol: 'BTC/USD', label: 'Bitcoin', short: 'BTCUSD' },
  { symbol: 'USOIL', label: 'Crude Oil', short: 'USOIL' },
];

const cache = new Map();
const TTL = 20000;
const NEWS_TTL = 300000;

async function cached(key, fn, ttl = TTL) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

r.get('/quotes', authRequired, async (req, res) => {
  try {
    const data = await cached('quotes', async () => {
      const symbols = SYMBOLS.map((s) => s.symbol).join(',');
      const url = `${BASE}/quote?symbol=${encodeURIComponent(symbols)}&apikey=${KEY}`;
      const resp = await fetch(url);
      const json = await resp.json();
      return json;
    });
    const list = SYMBOLS.map((s) => {
      const q = data[s.symbol] || {};
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
    });
    res.json({ quotes: list, source: 'Twelve Data' });
  } catch (e) {
    res.status(502).json({ error: 'Gagal mengambil data pasar', detail: String(e.message) });
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
    res.json({ events, week, source: 'ForexFactory Economic Calendar' });
  } catch (e) {
    res.status(502).json({ error: 'Gagal mengambil kalender ekonomi', detail: String(e.message) });
  }
});

const NEWS_FEEDS = [
  { name: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { name: 'Investing', url: 'https://www.investing.com/rss/news_14.rss' },
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
        .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0))
        .slice(0, 24);
    }, NEWS_TTL);
    res.json({ items, sources: NEWS_FEEDS.map((f) => f.name) });
  } catch (e) {
    res.status(502).json({ error: 'Gagal mengambil berita pasar', detail: String(e.message) });
  }
});

export default r;
