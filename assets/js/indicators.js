/**
 * Market indicator primitives.
 * All functions are pure so they can be unit tested in Node and reused in the browser.
 *
 * A "bar" is `{ date: 'YYYY-MM-DD', open, high, low, close }`.
 */

/** Sort bars ascending by date and drop rows without a usable close. */
export function normalizeBars(bars) {
  return bars
    .filter((b) => b && b.date && Number.isFinite(b.close))
    .map((b) => ({
      date: b.date,
      open: Number.isFinite(b.open) ? b.open : b.close,
      high: Number.isFinite(b.high) ? b.high : b.close,
      low: Number.isFinite(b.low) ? b.low : b.close,
      close: b.close,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .filter((bar, i, arr) => i === 0 || arr[i - 1].date !== bar.date);
}

/**
 * ISO-8601 week key (`YYYY-Www`) for a `YYYY-MM-DD` date string.
 * Weeks start on Monday, which is what a real weekly candle uses.
 */
export function isoWeekKey(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay() || 7; // Sunday => 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // move to Thursday of this ISO week
  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - jan1) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Aggregate daily OHLC into true calendar-week candles.
 * Open = first session of the week, Close = last session of the week,
 * High/Low = extremes of the week. Holiday-shortened weeks are handled
 * correctly, unlike naive "every 5th bar" sampling.
 */
export function toWeeklyBars(dailyBars) {
  const bars = normalizeBars(dailyBars);
  const weeks = [];
  let current = null;
  let currentKey = null;
  for (const bar of bars) {
    const key = isoWeekKey(bar.date);
    if (key !== currentKey) {
      if (current) weeks.push(current);
      currentKey = key;
      current = {
        week: key,
        date: bar.date,
        startDate: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        sessions: 1,
      };
    } else {
      current.date = bar.date;
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
      current.sessions += 1;
    }
  }
  if (current) weeks.push(current);
  return weeks;
}

/** Calendar month key (`YYYY-MM`) of a `YYYY-MM-DD` date string. */
export function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

/**
 * Wilder's RSI over a series of closes.
 * Returns an array aligned with `closes`; the first `period` entries are null.
 */
export function rsiSeries(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = rsiFromAverages(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    const g = change > 0 ? change : 0;
    const l = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}

function rsiFromAverages(avgGain, avgLoss) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Latest RSI value of a close series (or null when there is not enough history). */
export function latestRsi(closes, period = 14) {
  const series = rsiSeries(closes, period);
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i] !== null) return series[i];
  }
  return null;
}

/** Simple moving average series aligned with `values`. */
export function smaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Percentile rank (0-100) of `value` inside `sample`:
 * the share of observations strictly lower, plus half of the ties.
 */
export function percentileRank(sample, value) {
  const valid = sample.filter((v) => Number.isFinite(v));
  if (!valid.length) return null;
  let below = 0;
  let equal = 0;
  for (const v of valid) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return ((below + equal / 2) / valid.length) * 100;
}

/**
 * Running drawdown from the trailing peak, expressed as a negative fraction
 * (-0.12 === 12% below the peak of the lookback window).
 */
export function drawdownSeries(closes, lookback = Infinity) {
  const out = new Array(closes.length).fill(0);
  const deque = [];
  for (let i = 0; i < closes.length; i += 1) {
    const from = lookback === Infinity ? 0 : Math.max(0, i - lookback + 1);
    while (deque.length && deque[0] < from) deque.shift();
    while (deque.length && closes[deque[deque.length - 1]] <= closes[i]) deque.pop();
    deque.push(i);
    const peak = closes[deque[0]];
    out[i] = peak > 0 ? closes[i] / peak - 1 : 0;
  }
  return out;
}

/** Drawdown of the last close versus the highest close of the window. */
export function currentDrawdown(closes, lookback = 252) {
  if (!closes.length) return null;
  const from = Math.max(0, closes.length - lookback);
  let peak = -Infinity;
  for (let i = from; i < closes.length; i += 1) peak = Math.max(peak, closes[i]);
  if (!(peak > 0)) return null;
  return closes[closes.length - 1] / peak - 1;
}

/** Clamp helper. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
