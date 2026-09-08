/**
 * Live market data layer for the S&P 500 composite index (^GSPC).
 *
 * Only real market data is used. Several public sources are tried in order and
 * each one can be routed through a CORS relay when the browser blocks the
 * direct call. A same-origin snapshot (refreshed periodically by a scheduled
 * GitHub Actions workflow, see `scripts/fetch-snapshot.js`) is used as a
 * reliable base when the live sources are unreachable from the browser. The
 * last good payload is also cached in localStorage so the workstation still
 * opens (clearly flagged as cached) when the network fails entirely.
 */

import { normalizeBars } from './indicators.js';

export const SYMBOL = '^GSPC';
const CACHE_KEY = 'sp500.history.v1';
const CACHE_TTL_OPEN = 10 * 60 * 1000; // 10 minutes while the US market is open
const CACHE_TTL_CLOSED = 6 * 60 * 60 * 1000; // 6 hours when it is closed

// Same-origin snapshot produced periodically by `.github/workflows/update-data.yml`
// (via `scripts/fetch-snapshot.js`) running on a GitHub Actions runner. Loading
// this first means the workstation is never hard-blocked by a browser CORS
// failure: the file ships with the page itself, on the same origin.
const SNAPSHOT_URL = new URL('../../data/sp500.json', import.meta.url).href;
const SNAPSHOT_MAX_AGE = 24 * 60 * 60 * 1000; // ignore the snapshot if it is over a day old

const CORS_RELAYS = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

async function fetchText(url, { timeout = 15000, direct = true } = {}) {
  const attempts = direct ? [url, ...CORS_RELAYS.map((f) => f(url))] : CORS_RELAYS.map((f) => f(url));
  let lastError = null;
  for (const attempt of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(attempt, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 32) throw new Error('empty payload');
      return text;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('all sources failed');
}

/** Yahoo Finance daily chart (primary source, includes the live quote). */
export async function fetchYahoo(range = '10y') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    SYMBOL
  )}?range=${range}&interval=1d&includePrePost=false`;
  const text = await fetchText(url);
  const json = JSON.parse(text);
  return parseYahoo(json);
}

export function parseYahoo(json) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('unexpected Yahoo payload');
  const meta = result.meta || {};
  const stamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const bars = [];
  for (let i = 0; i < stamps.length; i += 1) {
    const close = quote.close?.[i];
    if (!Number.isFinite(close)) continue;
    bars.push({
      date: new Date(stamps[i] * 1000).toISOString().slice(0, 10),
      open: quote.open?.[i],
      high: quote.high?.[i],
      low: quote.low?.[i],
      close,
    });
  }
  return {
    source: 'Yahoo Finance',
    bars: normalizeBars(bars),
    meta: {
      currency: meta.currency || 'USD',
      exchangeName: meta.fullExchangeName || meta.exchangeName || 'SNP',
      marketState: meta.marketState || null,
      regularMarketPrice: meta.regularMarketPrice ?? null,
      previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
      regularMarketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
      timezone: meta.exchangeTimezoneName || 'America/New_York',
    },
  };
}

/** Stooq daily CSV (fallback source, no live intraday quote). */
export async function fetchStooq() {
  const url = 'https://stooq.com/q/d/l/?s=%5Espx&i=d';
  const text = await fetchText(url);
  return parseStooq(text);
}

export function parseStooq(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift() || '';
  if (!/date/i.test(header)) throw new Error('unexpected Stooq payload');
  const bars = [];
  for (const line of lines) {
    const [date, open, high, low, close] = line.split(',');
    const c = Number(close);
    if (!date || !Number.isFinite(c)) continue;
    bars.push({ date, open: Number(open), high: Number(high), low: Number(low), close: c });
  }
  const normalized = normalizeBars(bars);
  const last = normalized[normalized.length - 1];
  const prev = normalized[normalized.length - 2];
  return {
    source: 'Stooq',
    bars: normalized,
    meta: {
      currency: 'USD',
      exchangeName: 'S&P 500 Index',
      marketState: null,
      regularMarketPrice: last ? last.close : null,
      previousClose: prev ? prev.close : null,
      regularMarketTime: last ? Date.parse(`${last.date}T21:00:00Z`) : null,
      timezone: 'America/New_York',
    },
  };
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.payload?.bars?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), payload }));
  } catch {
    /* storage full or unavailable - not fatal */
  }
}

/**
 * Is the New York cash session currently open?
 * (Weekday, 09:30-16:00 America/New_York. Holidays are detected separately by
 * comparing the last bar date with the current NY date.)
 */
export function isMarketOpen(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = parts.weekday;
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

/** New York calendar date (YYYY-MM-DD) for "is today a trading day?" checks. */
export function nyDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

/**
 * Derive the quote block shown at the top of the workstation.
 * During a session it shows the live level; outside it shows the last close.
 */
export function buildQuote(payload, now = new Date()) {
  const bars = payload.bars;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  // A cache written by an older version of the app may lack `meta`; fall back to
  // the bars rather than throwing, which would brick the page until storage is cleared.
  const meta = payload.meta || {};
  const open = isMarketOpen(now) && meta.marketState === 'REGULAR';
  const live = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : last.close;
  const price = open ? live : last.close;
  const reference = open ? (Number.isFinite(meta.previousClose) ? meta.previousClose : prev?.close) : prev?.close;
  const change = Number.isFinite(reference) ? price - reference : null;
  return {
    symbol: SYMBOL,
    name: 'S&P 500',
    price,
    change,
    changePct: Number.isFinite(change) && reference ? change / reference : null,
    isLive: open,
    asOf: open ? meta.regularMarketTime || Date.now() : Date.parse(`${last.date}T21:00:00Z`),
    lastCloseDate: last.date,
    source: payload.source,
  };
}

/**
 * Same-origin snapshot written periodically by `.github/workflows/update-data.yml`
 * (via `scripts/fetch-snapshot.js`, running on a GitHub Actions runner). Because
 * it ships with the page itself it is never blocked by a browser CORS wall, so
 * it works even when a visitor's network/browser blocks Yahoo, Stooq and every
 * CORS relay.
 */
export async function fetchSnapshot() {
  const res = await fetch(`${SNAPSHOT_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.bars?.length) throw new Error('empty snapshot');
  return json;
}

/**
 * Load the index history:
 *  1. Local cache, if still fresh (unchanged fast path).
 *  2. The bundled same-origin snapshot (reliable base, no CORS exposure).
 *  3. A live direct/relay fetch (Yahoo, then Stooq) attempted as a "top-up" -
 *     used when it succeeds because it is fresher, but never a hard
 *     requirement since the snapshot already makes the app usable.
 *  4. The last cache entry, marked stale, if everything above fails.
 * Returns `{ bars, meta, source, cached, snapshot, fetchedAt, error }`.
 */
export async function loadHistory({ force = false, now = new Date() } = {}) {
  const cached = readCache();
  const ttl = isMarketOpen(now) ? CACHE_TTL_OPEN : CACHE_TTL_CLOSED;
  if (!force && cached && Date.now() - cached.savedAt < ttl) {
    return { ...cached.payload, cached: true, fetchedAt: cached.savedAt };
  }

  const errors = [];
  let snapshot = null;
  try {
    snapshot = await fetchSnapshot();
    if (snapshot.bars.length < 300) throw new Error('snapshot history too short');
  } catch (err) {
    errors.push(`snapshot: ${err.message}`);
    snapshot = null;
  }

  for (const loader of [fetchYahoo, fetchStooq]) {
    try {
      const payload = await loader();
      if (payload.bars.length < 300) throw new Error('history too short');
      writeCache(payload);
      return { ...payload, cached: false, fetchedAt: Date.now() };
    } catch (err) {
      errors.push(`${loader.name}: ${err.message}`);
    }
  }

  if (snapshot) {
    const payload = { source: snapshot.source, bars: snapshot.bars, meta: snapshot.meta };
    const snapshotAge = Date.now() - (snapshot.generatedAt || 0);
    writeCache(payload);
    return {
      ...payload,
      cached: false,
      snapshot: true,
      stale: !snapshot.generatedAt || snapshotAge > SNAPSHOT_MAX_AGE,
      snapshotGeneratedAt: snapshot.generatedAt || null,
      fetchedAt: Date.now(),
      error: errors.join(' | '),
    };
  }

  if (cached) {
    return {
      ...cached.payload,
      cached: true,
      stale: true,
      fetchedAt: cached.savedAt,
      error: errors.join(' | '),
    };
  }
  throw new Error(errors.join(' | ') || 'no data source available');
}
