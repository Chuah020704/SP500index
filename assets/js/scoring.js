/**
 * Scoring engine: turns raw price history into a 0-100 "DCA temperature",
 * a market regime and a capital-deployment intensity.
 *
 * Design rules:
 *  - Every sub-score is normalised to 0-100 first, then weighted.
 *  - A higher score means "the pull-back is more complete" (relatively cheaper),
 *    a lower score means "relatively expensive".
 *  - Nothing here looks into the future: a score for day `i` only uses bars <= i.
 *  - News never influences the score.
 */

import {
  normalizeBars,
  toWeeklyBars,
  monthKey,
  rsiSeries,
  smaSeries,
  percentileRank,
  drawdownSeries,
  clamp,
} from './indicators.js';

export const DEFAULT_WEIGHTS = {
  price: 30,
  dailyRsi: 20,
  weeklyRsi: 20,
  drawdown: 20,
  monthly: 10,
};

export const LOOKBACK_SESSIONS = 1260; // ~5 years of trading days
export const DRAWDOWN_LOOKBACK = 252; // peak of the last ~12 months

/** Default DCA intensity ladder (editable by the user in the UI). */
export const DEFAULT_DCA_LADDER = [
  { min: 0, max: 30, multiplier: 0.5 },
  { min: 30, max: 45, multiplier: 0.75 },
  { min: 45, max: 60, multiplier: 1.0 },
  { min: 60, max: 75, multiplier: 1.25 },
  { min: 75, max: 90, multiplier: 1.5 },
  { min: 90, max: 100.01, multiplier: 2.0 },
];

export function dcaMultiplier(score, ladder = DEFAULT_DCA_LADDER) {
  for (const step of ladder) {
    if (score >= step.min && score < step.max) return step.multiplier;
  }
  return ladder.length ? ladder[ladder.length - 1].multiplier : 1;
}

/**
 * RSI -> sub-score. Low RSI (weak momentum, more pull-back) scores high.
 * Anchors: RSI 70 -> 0, RSI 50 -> 50, RSI 30 -> 70, RSI 20 -> 80, RSI 0 -> 100.
 */
export function rsiScore(rsi) {
  if (!Number.isFinite(rsi)) return null;
  const raw = rsi <= 50 ? 100 - rsi : 50 - (rsi - 50) * 2.5;
  return clamp(raw, 0, 100);
}

/** Price percentile -> sub-score (cheap relative to history = high score). */
export function priceScoreFromPercentile(percentile) {
  if (!Number.isFinite(percentile)) return null;
  return clamp(100 - percentile, 0, 100);
}

/**
 * Drawdown sub-score: where does today's drawdown sit inside the historical
 * distribution of drawdowns? A deeper-than-usual drawdown scores high.
 * This is far more meaningful than a fixed "-10% => 10 points" rule.
 */
export function drawdownScoreFromSample(sample, drawdown) {
  const pct = percentileRank(sample, drawdown);
  if (pct === null) return null;
  return clamp(100 - pct, 0, 100);
}

/**
 * Monthly ranking: how cheap is today compared with the other trading days of
 * the same calendar month? Returns rank (1 = cheapest), total sessions and the
 * share of this month's sessions that are more expensive than today.
 */
export function monthlyRanking(bars, index) {
  const target = bars[index];
  const key = monthKey(target.date);
  const monthBars = [];
  for (let i = 0; i <= index; i += 1) {
    if (monthKey(bars[i].date) === key) monthBars.push(bars[i]);
  }
  const closes = monthBars.map((b) => b.close);
  const cheaper = closes.filter((c) => c < target.close).length;
  const rank = cheaper + 1;
  const total = closes.length;
  const moreExpensive = closes.filter((c) => c > target.close).length;
  const cheaperThanShare = total > 1 ? (moreExpensive / (total - 1)) * 100 : 50;
  const score = total > 1 ? clamp(cheaperThanShare, 0, 100) : 50;
  return {
    month: key,
    rank,
    total,
    high: closes.length ? Math.max(...closes) : null,
    low: closes.length ? Math.min(...closes) : null,
    cheaperThanShare,
    score,
    bars: monthBars,
  };
}

/**
 * Market regime layer. Answers "what kind of market is this?" separately from
 * "how cheap is it?", so a -15% drawdown in a healthy trend and a -15%
 * drawdown inside a bear market are not read the same way.
 */
export function classifyRegime({ close, sma200, drawdown, weeklyRsi }) {
  const dd = Number.isFinite(drawdown) ? drawdown : 0;
  const aboveTrend = Number.isFinite(sma200) ? close >= sma200 : true;
  if (dd <= -0.25 || (dd <= -0.2 && Number.isFinite(weeklyRsi) && weeklyRsi < 30)) {
    return 'stress';
  }
  if (!aboveTrend && dd <= -0.15) return 'bear';
  if (dd <= -0.05 || !aboveTrend) return 'correction';
  return 'normal';
}

/** Score band used for labels and colours. */
export function scoreBand(score) {
  if (score >= 85) return 'deep';
  if (score >= 70) return 'cheapish';
  if (score >= 55) return 'slightlyCheap';
  if (score >= 40) return 'fair';
  if (score >= 25) return 'slightlyExpensive';
  return 'expensive';
}

/**
 * Weekly RSI for each daily bar, without look-ahead.
 * Completed weeks use their real weekly close; the running week uses the close
 * of the day being evaluated as its provisional close - exactly what the live
 * dashboard sees intraday.
 */
export function weeklyRsiByDay(bars, period = 14) {
  const weekly = toWeeklyBars(bars);
  const weekEndIndexByDate = new Map();
  weekly.forEach((w, i) => weekEndIndexByDate.set(w.date, i));

  const out = new Array(bars.length).fill(null);
  const completedCloses = [];
  let nextWeek = 0;
  for (let i = 0; i < bars.length; i += 1) {
    // Weeks whose last session is before today's bar are complete.
    while (nextWeek < weekly.length && weekly[nextWeek].date < bars[i].date) {
      completedCloses.push(weekly[nextWeek].close);
      nextWeek += 1;
    }
    const provisional = completedCloses.concat([bars[i].close]);
    const series = rsiSeries(provisional, period);
    out[i] = series[series.length - 1];
  }
  return out;
}

/**
 * Compute the full score detail for every bar of the series.
 * Returns an array aligned with `bars`; entries are null during warm-up.
 */
export function computeScoreSeries(rawBars, options = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const lookback = options.lookback || LOOKBACK_SESSIONS;
  const minHistory = options.minHistory || 260; // ~1 year before we score anything
  const bars = normalizeBars(rawBars);
  const closes = bars.map((b) => b.close);

  const dailyRsi = rsiSeries(closes, 14);
  const weeklyRsi = weeklyRsiByDay(bars, 14);
  const sma200 = smaSeries(closes, 200);
  const drawdowns = drawdownSeries(closes, DRAWDOWN_LOOKBACK);

  const out = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i += 1) {
    if (i < minHistory || dailyRsi[i] === null || weeklyRsi[i] === null) continue;
    const from = Math.max(0, i - lookback + 1);
    const priceSample = closes.slice(from, i + 1);
    const ddSample = drawdowns.slice(from, i + 1);

    const pricePercentile = percentileRank(priceSample, closes[i]);
    const parts = {
      price: priceScoreFromPercentile(pricePercentile),
      dailyRsi: rsiScore(dailyRsi[i]),
      weeklyRsi: rsiScore(weeklyRsi[i]),
      drawdown: drawdownScoreFromSample(ddSample, drawdowns[i]),
      monthly: monthlyRanking(bars, i).score,
    };
    if (Object.values(parts).some((v) => v === null)) continue;

    const total =
      (parts.price * weights.price +
        parts.dailyRsi * weights.dailyRsi +
        parts.weeklyRsi * weights.weeklyRsi +
        parts.drawdown * weights.drawdown +
        parts.monthly * weights.monthly) /
      (weights.price + weights.dailyRsi + weights.weeklyRsi + weights.drawdown + weights.monthly);

    out[i] = {
      index: i,
      date: bars[i].date,
      close: closes[i],
      score: clamp(total, 0, 100),
      parts,
      weights,
      metrics: {
        pricePercentile,
        dailyRsi: dailyRsi[i],
        weeklyRsi: weeklyRsi[i],
        drawdown: drawdowns[i],
        drawdownPercentile: percentileRank(ddSample, drawdowns[i]),
        sma200: sma200[i],
      },
      regime: classifyRegime({
        close: closes[i],
        sma200: sma200[i],
        drawdown: drawdowns[i],
        weeklyRsi: weeklyRsi[i],
      }),
    };
  }
  return out;
}

/**
 * Full snapshot for the latest bar, including the weighted point contributions
 * (e.g. "price 21/30") and the monthly ranking detail used by the UI.
 */
export function computeSnapshot(rawBars, options = {}) {
  const bars = normalizeBars(rawBars);
  if (bars.length < 30) return null;
  const series = computeScoreSeries(bars, options);
  let latest = null;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i]) {
      latest = series[i];
      break;
    }
  }
  if (!latest) return null;

  const weights = latest.weights;
  const points = {
    price: (latest.parts.price / 100) * weights.price,
    dailyRsi: (latest.parts.dailyRsi / 100) * weights.dailyRsi,
    weeklyRsi: (latest.parts.weeklyRsi / 100) * weights.weeklyRsi,
    drawdown: (latest.parts.drawdown / 100) * weights.drawdown,
    monthly: (latest.parts.monthly / 100) * weights.monthly,
  };

  return {
    ...latest,
    points,
    band: scoreBand(latest.score),
    monthly: monthlyRanking(bars, latest.index),
    dcaMultiplier: dcaMultiplier(latest.score, options.ladder || DEFAULT_DCA_LADDER),
    series,
    bars,
  };
}
