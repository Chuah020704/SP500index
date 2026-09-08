import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rsiScore,
  priceScoreFromPercentile,
  drawdownScoreFromSample,
  monthlyRanking,
  classifyRegime,
  dcaMultiplier,
  computeSnapshot,
  computeScoreSeries,
  weeklyRsiByDay,
} from '../assets/js/scoring.js';
import { toWeeklyBars, rsiSeries } from '../assets/js/indicators.js';
import { syntheticSeries } from './helpers.mjs';

test('rsiScore inverts momentum: low RSI = more pull-back = higher score', () => {
  assert.equal(rsiScore(50), 50);
  assert.equal(rsiScore(30), 70);
  assert.equal(rsiScore(20), 80);
  assert.equal(rsiScore(70), 0);
  assert.equal(rsiScore(90), 0);
  assert.equal(rsiScore(0), 100);
  assert.ok(rsiScore(35) > rsiScore(45));
});

test('priceScoreFromPercentile is cheap-high / expensive-low', () => {
  assert.equal(priceScoreFromPercentile(0), 100);
  assert.equal(priceScoreFromPercentile(100), 0);
  assert.equal(priceScoreFromPercentile(40), 60);
});

test('drawdown score compares against the historical drawdown distribution', () => {
  const sample = [-0.02, -0.03, -0.04, -0.05, -0.07, -0.1, -0.12, -0.18, -0.25, -0.34];
  const deep = drawdownScoreFromSample(sample, -0.2);
  const shallow = drawdownScoreFromSample(sample, -0.02);
  assert.ok(deep > 70, `deep drawdown should score high, got ${deep}`);
  assert.ok(shallow < 20, `shallow drawdown should score low, got ${shallow}`);
});

test('monthlyRanking reports "the Nth cheapest day of the month"', () => {
  const bars = [
    { date: '2026-08-31', close: 100 },
    { date: '2026-09-01', close: 7200 },
    { date: '2026-09-02', close: 7250 },
    { date: '2026-09-03', close: 7900 },
    { date: '2026-09-04', close: 7800 },
    { date: '2026-09-08', close: 7718 },
  ];
  const r = monthlyRanking(bars, bars.length - 1);
  assert.equal(r.month, '2026-09');
  assert.equal(r.total, 5);
  assert.equal(r.rank, 3);
  assert.equal(r.high, 7900);
  assert.equal(r.low, 7200);
  assert.equal(Math.round(r.cheaperThanShare), 50);
});

test('monthlyRanking is neutral on the first trading day of a month', () => {
  const bars = [
    { date: '2026-08-31', close: 100 },
    { date: '2026-09-01', close: 7200 },
  ];
  const r = monthlyRanking(bars, 1);
  assert.equal(r.rank, 1);
  assert.equal(r.total, 1);
  assert.equal(r.score, 50);
});

test('regime layer separates "normal", "correction", "bear" and "stress"', () => {
  assert.equal(classifyRegime({ close: 110, sma200: 100, drawdown: -0.01, weeklyRsi: 60 }), 'normal');
  assert.equal(classifyRegime({ close: 105, sma200: 100, drawdown: -0.08, weeklyRsi: 45 }), 'correction');
  assert.equal(classifyRegime({ close: 80, sma200: 100, drawdown: -0.17, weeklyRsi: 35 }), 'bear');
  assert.equal(classifyRegime({ close: 70, sma200: 100, drawdown: -0.3, weeklyRsi: 22 }), 'stress');
});

test('DCA ladder maps score to deployment intensity, never to a buy/sell call', () => {
  assert.equal(dcaMultiplier(10), 0.5);
  assert.equal(dcaMultiplier(40), 0.75);
  assert.equal(dcaMultiplier(50), 1.0);
  assert.equal(dcaMultiplier(67), 1.25);
  assert.equal(dcaMultiplier(80), 1.5);
  assert.equal(dcaMultiplier(100), 2.0);
});

test('weeklyRsiByDay never looks into the future', () => {
  const bars = syntheticSeries(600);
  const byDay = weeklyRsiByDay(bars);
  const cut = 500;
  const truncated = weeklyRsiByDay(bars.slice(0, cut + 1));
  assert.ok(Math.abs(byDay[cut] - truncated[cut]) < 1e-9);
});

test('weekly RSI equals the RSI of true weekly closes at each week end', () => {
  const bars = syntheticSeries(600);
  const weekly = toWeeklyBars(bars);
  const weeklyCloses = weekly.map((w) => w.close);
  const weeklyRsi = rsiSeries(weeklyCloses, 14);
  const lastWeek = weekly[weekly.length - 1];
  const byDay = weeklyRsiByDay(bars);
  const idx = bars.findIndex((b) => b.date === lastWeek.date);
  assert.ok(Math.abs(byDay[idx] - weeklyRsi[weeklyRsi.length - 1]) < 1e-9);
});

test('snapshot returns weighted points that add up to the total score', () => {
  const bars = syntheticSeries(1400);
  const snap = computeSnapshot(bars);
  assert.ok(snap, 'snapshot should be produced');
  const sum = Object.values(snap.points).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - snap.score) < 1e-9, `${sum} vs ${snap.score}`);
  assert.ok(snap.score >= 0 && snap.score <= 100);
  assert.equal(snap.date, bars[bars.length - 1].date);
  assert.ok(['deep', 'cheapish', 'slightlyCheap', 'fair', 'slightlyExpensive', 'expensive'].includes(snap.band));
});

test('a crashed market scores materially higher than an all-time-high market', () => {
  const base = syntheticSeries(1400, { drift: 0.0004, vol: 0 });
  const crashed = base.map((b, i) =>
    i >= base.length - 40
      ? { ...b, close: b.close * (1 - 0.25 * ((i - (base.length - 41)) / 40)), high: b.close, low: b.close, open: b.close }
      : b
  );
  const hot = computeSnapshot(base).score;
  const cheap = computeSnapshot(crashed).score;
  assert.ok(cheap > hot + 20, `crash ${cheap} should beat high ${hot}`);
});

test('score series has no entries during warm-up and stays inside 0-100', () => {
  const bars = syntheticSeries(800);
  const series = computeScoreSeries(bars);
  assert.equal(series.slice(0, 260).every((p) => p === null), true);
  const scored = series.filter(Boolean);
  assert.ok(scored.length > 400);
  assert.ok(scored.every((p) => p.score >= 0 && p.score <= 100));
});
