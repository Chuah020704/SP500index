const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function normalizeHistory(entries) {
  return entries
    .filter((entry) => entry && entry.date && Number.isFinite(entry.close))
    .map((entry) => ({
      date: entry.date,
      close: Number(entry.close),
      open: Number.isFinite(entry.open) ? Number(entry.open) : Number(entry.close),
      high: Number.isFinite(entry.high) ? Number(entry.high) : Number(entry.close),
      low: Number.isFinite(entry.low) ? Number(entry.low) : Number(entry.close),
      volume: Number.isFinite(entry.volume) ? Number(entry.volume) : 0,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function getIsoWeekKey(dateInput) {
  const date = new Date(dateInput);
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / DAY_MS) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function aggregateCalendarWeeks(entries) {
  const normalized = normalizeHistory(entries);
  const grouped = new Map();

  for (const entry of normalized) {
    const key = getIsoWeekKey(entry.date);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...entry });
      continue;
    }

    existing.high = Math.max(existing.high, entry.high);
    existing.low = Math.min(existing.low, entry.low);
    existing.close = entry.close;
    existing.date = entry.date;
    existing.volume += entry.volume;
  }

  return Array.from(grouped.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function computeRsi(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const values = closes.map((value) => Number(value));
  const result = new Array(values.length).fill(null);
  if (values.length <= period) return result;

  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = values[index] - values[index - 1];
    gains += Math.max(delta, 0);
    losses += Math.max(-delta, 0);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

  for (let index = period + 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    result[index] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
  }

  return result;
}

function percentileRank(values, current) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length || !Number.isFinite(current)) return null;
  const belowOrEqual = valid.filter((value) => value <= current).length;
  return (belowOrEqual / valid.length) * 100;
}

function rsiToScore(rsi) {
  if (!Number.isFinite(rsi)) return null;
  return clamp(((80 - rsi) / 60) * 100);
}

function computeDrawdownSeries(closes) {
  const series = [];
  let peak = -Infinity;
  for (const close of closes) {
    if (!Number.isFinite(close)) continue;
    peak = Math.max(peak, close);
    series.push(peak === 0 ? 0 : ((close - peak) / peak) * 100);
  }
  return series;
}

function findMonthlyPosition(entries) {
  const normalized = normalizeHistory(entries);
  const latest = normalized.at(-1);
  if (!latest) {
    return {
      score: null,
      rank: null,
      total: null,
      low: null,
      high: null,
    };
  }

  const [year, month] = latest.date.split('-');
  const monthly = normalized.filter((entry) => entry.date.startsWith(`${year}-${month}`));
  const closes = monthly.map((entry) => entry.close).sort((a, b) => a - b);
  const low = closes[0];
  const high = closes.at(-1);
  const rank = closes.findIndex((value) => value === latest.close) + 1;
  const percentile = percentileRank(monthly.map((entry) => entry.close), latest.close);
  return {
    score: percentile == null ? null : round(100 - percentile, 2),
    rank,
    total: monthly.length,
    low: round(low),
    high: round(high),
  };
}

function explainScore(totalScore, factors) {
  const validFactors = Object.entries(factors)
    .filter(([, value]) => value && Number.isFinite(value.score))
    .map(([key, value]) => ({
      key,
      score: value.score,
      labelEn: value.labelEn || key,
      labelZh: value.labelZh || key,
    }));

  if (!validFactors.length) {
    return {
      en: 'Live scoring is waiting for enough history to calculate each factor.',
      zh: '正在等待足够的历史数据来完成全部评分项。',
    };
  }

  const sorted = [...validFactors].sort((a, b) => b.score - a.score);
  const strongest = sorted[0];
  const weakest = sorted.at(-1);
  const tone = totalScore >= 70 ? 'deep pullback' : totalScore >= 50 ? 'balanced' : 'expensive';
  const toneZh = totalScore >= 70 ? '回调较充分' : totalScore >= 50 ? '中性偏观察' : '相对偏贵';

  return {
    en: `Overall score ${round(totalScore, 1)}/100 suggests a ${tone} setup. The strongest support comes from ${strongest.labelEn}, while ${weakest.labelEn} is the least supportive right now.`,
    zh: `当前总分 ${round(totalScore, 1)}/100，代表市场处于${toneZh}状态。支撑评分最高的是${strongest.labelZh}，当前最弱的是${weakest.labelZh}。`,
  };
}

function computeScoreModel(history) {
  const normalized = normalizeHistory(history);
  const latest = normalized.at(-1);
  if (!latest) {
    return {
      latest: null,
      dailyRsi: null,
      weeklyRsi: null,
      totalScore: null,
      factors: {},
      monthlyPosition: findMonthlyPosition([]),
      explanation: explainScore(null, {}),
      drawdown: null,
      regime: 'Unknown',
    };
  }

  const closes = normalized.map((entry) => entry.close);
  const dailyRsiSeries = computeRsi(closes, 14);
  const dailyRsi = dailyRsiSeries.at(-1);
  const weeklyHistory = aggregateCalendarWeeks(normalized);
  const weeklyCloses = weeklyHistory.map((entry) => entry.close);
  const weeklyRsiSeries = computeRsi(weeklyCloses, 14);
  const weeklyRsi = weeklyRsiSeries.at(-1);
  const drawdowns = computeDrawdownSeries(closes);
  const currentDrawdown = drawdowns.at(-1);
  const drawdownScore = currentDrawdown == null
    ? null
    : percentileRank(drawdowns.map((value) => -value), -currentDrawdown);
  const pricePercentile = percentileRank(closes, latest.close);
  const priceScore = pricePercentile == null ? null : 100 - pricePercentile;
  const monthlyPosition = findMonthlyPosition(normalized);
  const factors = {
    price: { score: round(priceScore), weight: 0.3, labelEn: '5Y Price', labelZh: '5年价格位置' },
    dailyRsi: { score: round(rsiToScore(dailyRsi)), weight: 0.2, labelEn: 'Daily RSI', labelZh: '日线RSI' },
    weeklyRsi: { score: round(rsiToScore(weeklyRsi)), weight: 0.2, labelEn: 'Weekly RSI', labelZh: '周线RSI' },
    drawdown: { score: round(drawdownScore), weight: 0.2, labelEn: 'Drawdown', labelZh: '阶段回撤' },
    monthly: { score: round(monthlyPosition.score), weight: 0.1, labelEn: 'Monthly Position', labelZh: '本月位置' },
  };

  const weightedScore = Object.values(factors)
    .filter((factor) => Number.isFinite(factor.score))
    .reduce((sum, factor) => sum + (factor.score * factor.weight), 0);

  const regime = currentDrawdown <= -20 || (dailyRsi != null && dailyRsi < 30 && weeklyRsi != null && weeklyRsi < 40)
    ? 'Stress'
    : currentDrawdown <= -10 || (dailyRsi != null && dailyRsi < 40)
      ? 'Correction'
      : latest.close >= closes[Math.max(0, closes.length - 200)]
        ? 'Bull / Normal'
        : 'Watch';

  return {
    latest,
    dailyRsi: round(dailyRsi),
    weeklyRsi: round(weeklyRsi),
    totalScore: round(weightedScore, 2),
    factors,
    monthlyPosition,
    explanation: explainScore(weightedScore, factors),
    drawdown: round(currentDrawdown),
    regime,
    weeklyHistory,
  };
}

module.exports = {
  aggregateCalendarWeeks,
  clamp,
  computeDrawdownSeries,
  computeRsi,
  computeScoreModel,
  findMonthlyPosition,
  normalizeHistory,
  percentileRank,
  round,
  rsiToScore,
};
