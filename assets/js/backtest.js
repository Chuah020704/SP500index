/**
 * Backtesting and simulation.
 *
 * The point of this module is to answer the only question that matters:
 * "did a high score historically lead to better forward returns, and would a
 * score-driven DCA plan have beaten a plain fixed DCA plan?"
 */

import { dcaMultiplier, DEFAULT_DCA_LADDER } from './scoring.js';
import { monthKey } from './indicators.js';

export const DEFAULT_BUCKETS = [
  [0, 20],
  [20, 40],
  [40, 60],
  [60, 80],
  [80, 100.01],
];

export const DEFAULT_HORIZONS = { m3: 63, m6: 126, m12: 252 };

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Group historical scores into buckets and measure the realised forward return
 * of the index over each horizon.
 */
export function bucketForwardReturns(series, bars, options = {}) {
  const buckets = options.buckets || DEFAULT_BUCKETS;
  const horizons = options.horizons || DEFAULT_HORIZONS;
  const closes = bars.map((b) => b.close);

  const result = buckets.map(([min, max]) => ({
    min,
    max: Math.min(max, 100),
    count: 0,
    horizons: Object.fromEntries(Object.keys(horizons).map((k) => [k, { avg: null, median: null, positiveRate: null, samples: 0 }])),
    _raw: Object.fromEntries(Object.keys(horizons).map((k) => [k, []])),
  }));

  for (const point of series) {
    if (!point) continue;
    const bucket = result.find((b) => point.score >= b.min && point.score < (b.max === 100 ? 100.01 : b.max));
    if (!bucket) continue;
    bucket.count += 1;
    for (const [key, span] of Object.entries(horizons)) {
      const target = point.index + span;
      if (target < closes.length) {
        bucket._raw[key].push(closes[target] / closes[point.index] - 1);
      }
    }
  }

  for (const bucket of result) {
    for (const key of Object.keys(horizons)) {
      const values = bucket._raw[key];
      bucket.horizons[key] = {
        samples: values.length,
        avg: mean(values),
        median: median(values),
        positiveRate: values.length ? values.filter((v) => v > 0).length / values.length : null,
      };
    }
    delete bucket._raw;
  }
  return result;
}

/** Pearson correlation of two aligned numeric arrays. */
export function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

/**
 * Correlation matrix between the five sub-scores. This exposes the
 * double-counting risk: daily RSI, weekly RSI and drawdown often measure the
 * same "the market went down" phenomenon.
 */
export function componentCorrelations(series) {
  const keys = ['price', 'dailyRsi', 'weeklyRsi', 'drawdown', 'monthly'];
  const columns = Object.fromEntries(keys.map((k) => [k, []]));
  for (const point of series) {
    if (!point) continue;
    for (const k of keys) columns[k].push(point.parts[k]);
  }
  const matrix = {};
  for (const a of keys) {
    matrix[a] = {};
    for (const b of keys) {
      matrix[a][b] = a === b ? 1 : correlation(columns[a], columns[b]);
    }
  }
  return { keys, matrix };
}

/** First scoreable trading day of each calendar month. */
export function monthlyEntryPoints(series) {
  const seen = new Set();
  const points = [];
  for (const point of series) {
    if (!point) continue;
    const key = monthKey(point.date);
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(point);
  }
  return points;
}

/**
 * Compare a plain fixed DCA plan with the score-driven ("dynamic") plan on the
 * real historical series. Both plans buy on the same days; only the size of
 * each contribution differs.
 */
export function dcaBacktest(series, bars, options = {}) {
  const baseAmount = options.monthlyAmount || 1000;
  const ladder = options.ladder || DEFAULT_DCA_LADDER;
  const entries = monthlyEntryPoints(series);
  if (!entries.length) return null;
  const lastClose = bars[bars.length - 1].close;

  let fixedUnits = 0;
  let fixedInvested = 0;
  let dynUnits = 0;
  let dynInvested = 0;
  const timeline = [];

  for (const point of entries) {
    const multiplier = dcaMultiplier(point.score, ladder);
    const dynAmount = baseAmount * multiplier;
    fixedUnits += baseAmount / point.close;
    fixedInvested += baseAmount;
    dynUnits += dynAmount / point.close;
    dynInvested += dynAmount;
    timeline.push({
      date: point.date,
      close: point.close,
      score: point.score,
      multiplier,
      dynAmount,
      fixedValue: fixedUnits * point.close,
      dynamicValue: dynUnits * point.close,
      fixedInvested,
      dynInvested,
    });
  }

  const fixedValue = fixedUnits * lastClose;
  const dynValue = dynUnits * lastClose;
  const years = entries.length / 12;
  return {
    months: entries.length,
    from: entries[0].date,
    to: bars[bars.length - 1].date,
    years,
    fixed: {
      invested: fixedInvested,
      units: fixedUnits,
      value: fixedValue,
      gain: fixedValue - fixedInvested,
      returnPct: fixedInvested ? fixedValue / fixedInvested - 1 : null,
      avgCost: fixedUnits ? fixedInvested / fixedUnits : null,
    },
    dynamic: {
      invested: dynInvested,
      units: dynUnits,
      value: dynValue,
      gain: dynValue - dynInvested,
      returnPct: dynInvested ? dynValue / dynInvested - 1 : null,
      avgCost: dynUnits ? dynInvested / dynUnits : null,
    },
    /** Money-weighted edge: same money, was the average cost better? */
    avgCostEdge:
      fixedUnits && dynUnits ? 1 - dynInvested / dynUnits / (fixedInvested / fixedUnits) : null,
    timeline,
  };
}

/**
 * "If today were that day in history" - a full historical moment with the
 * realised forward returns that followed.
 */
export function historicalMoment(series, bars, date) {
  const closes = bars.map((b) => b.close);
  let point = null;
  for (const p of series) {
    if (!p) continue;
    if (p.date <= date) point = p;
    else break;
  }
  if (!point) return null;
  const forward = {};
  for (const [key, span] of Object.entries(DEFAULT_HORIZONS)) {
    const target = point.index + span;
    forward[key] = target < closes.length ? closes[target] / closes[point.index] - 1 : null;
  }
  return { ...point, forward };
}

/**
 * Future value of an initial capital plus a recurring monthly contribution.
 * FV = P(1+r)^n + PMT * ((1+r)^n - 1) / r   (r = monthly rate, n = months)
 * This is a scenario simulation, not a prediction.
 */
export function futureValue({ initial = 0, monthly = 0, annualReturn = 0.08, years = 10 }) {
  const n = Math.round(years * 12);
  const r = annualReturn / 12;
  const growthFactor = Math.pow(1 + r, n);
  const fromInitial = initial * growthFactor;
  const fromContrib = r === 0 ? monthly * n : monthly * ((growthFactor - 1) / r);
  const contributions = initial + monthly * n;
  const total = fromInitial + fromContrib;
  return {
    years,
    months: n,
    annualReturn,
    contributions,
    value: total,
    gain: total - contributions,
  };
}

/** Scenario grid: conservative / base / optimistic across several horizons. */
export function wealthScenarios({ initial = 0, monthly = 0 }, options = {}) {
  const rates = options.rates || { conservative: 0.05, base: 0.08, optimistic: 0.11 };
  const horizons = options.years || [5, 10, 20];
  const grid = {};
  for (const [name, rate] of Object.entries(rates)) {
    grid[name] = horizons.map((years) =>
      futureValue({ initial, monthly, annualReturn: rate, years })
    );
  }
  return { rates, horizons, grid };
}
