import test from 'node:test';
import assert from 'node:assert/strict';
import { computeScoreSeries } from '../assets/js/scoring.js';
import {
  bucketForwardReturns,
  componentCorrelations,
  correlation,
  dcaBacktest,
  monthlyEntryPoints,
  historicalMoment,
  futureValue,
  wealthScenarios,
} from '../assets/js/backtest.js';
import { normalizeBars } from '../assets/js/indicators.js';
import { syntheticSeries } from './helpers.mjs';

const bars = normalizeBars(syntheticSeries(1800));
const series = computeScoreSeries(bars);

test('bucketForwardReturns reports forward stats per score bucket', () => {
  const buckets = bucketForwardReturns(series, bars);
  assert.equal(buckets.length, 5);
  const totalCount = buckets.reduce((a, b) => a + b.count, 0);
  assert.equal(totalCount, series.filter(Boolean).length);
  for (const bucket of buckets) {
    if (!bucket.horizons.m12.samples) continue;
    assert.ok(bucket.horizons.m12.positiveRate >= 0 && bucket.horizons.m12.positiveRate <= 1);
    assert.ok(Number.isFinite(bucket.horizons.m12.avg));
  }
});

test('forward returns never use data beyond the sample', () => {
  const short = bars.slice(0, 400);
  const shortSeries = computeScoreSeries(short);
  const buckets = bucketForwardReturns(shortSeries, short);
  const samples = buckets.reduce((a, b) => a + b.horizons.m12.samples, 0);
  assert.ok(samples <= shortSeries.filter(Boolean).length);
});

test('correlation is 1 for identical series and -1 for mirrored series', () => {
  const a = [1, 2, 3, 4, 5];
  assert.ok(Math.abs(correlation(a, a) - 1) < 1e-12);
  assert.ok(Math.abs(correlation(a, a.map((v) => -v)) + 1) < 1e-12);
  assert.equal(correlation([1], [1]), null);
});

test('componentCorrelations exposes double-counting between sub-scores', () => {
  const { keys, matrix } = componentCorrelations(series);
  assert.deepEqual(keys, ['price', 'dailyRsi', 'weeklyRsi', 'drawdown', 'monthly']);
  assert.equal(matrix.price.price, 1);
  const rsiPair = matrix.dailyRsi.weeklyRsi;
  assert.ok(rsiPair >= -1 && rsiPair <= 1);
});

test('monthlyEntryPoints picks one contribution day per calendar month', () => {
  const entries = monthlyEntryPoints(series);
  const months = new Set(entries.map((e) => e.date.slice(0, 7)));
  assert.equal(entries.length, months.size);
  assert.ok(entries.length > 12);
});

test('dcaBacktest compares fixed vs score-driven contributions on real bars', () => {
  const result = dcaBacktest(series, bars, { monthlyAmount: 1000 });
  assert.ok(result.months > 12);
  assert.ok(Math.abs(result.fixed.invested - result.months * 1000) < 1e-6);
  assert.ok(result.dynamic.invested > 0);
  assert.ok(result.fixed.units > 0 && result.dynamic.units > 0);
  assert.ok(Math.abs(result.fixed.value - result.fixed.units * bars[bars.length - 1].close) < 1e-6);
  assert.equal(result.timeline.length, result.months);
  assert.ok(Number.isFinite(result.avgCostEdge));
});

test('a dynamic plan that always buys 1x reproduces the fixed plan exactly', () => {
  const flat = [{ min: 0, max: 100.01, multiplier: 1 }];
  const result = dcaBacktest(series, bars, { monthlyAmount: 500, ladder: flat });
  assert.ok(Math.abs(result.dynamic.invested - result.fixed.invested) < 1e-9);
  assert.ok(Math.abs(result.dynamic.units - result.fixed.units) < 1e-9);
  assert.ok(Math.abs(result.avgCostEdge) < 1e-12);
});

test('historicalMoment returns the score of that day plus what happened next', () => {
  const moment = historicalMoment(series, bars, series.filter(Boolean)[10].date);
  assert.ok(moment);
  assert.ok(Number.isFinite(moment.score));
  assert.ok(Number.isFinite(moment.forward.m12));
});

test('futureValue matches the textbook annuity formula', () => {
  // PMT 1000, r 5% per period, n 20 -> 33,065.95
  const fv = futureValue({ monthly: 1000, annualReturn: 0.05 * 12, years: 20 / 12 });
  assert.ok(Math.abs(fv.value - 33065.954) < 0.01, `got ${fv.value}`);

  const zero = futureValue({ monthly: 100, annualReturn: 0, years: 1 });
  assert.equal(zero.value, 1200);

  const withInitial = futureValue({ initial: 10000, monthly: 0, annualReturn: 0.12, years: 1 });
  assert.ok(Math.abs(withInitial.value - 10000 * Math.pow(1.01, 12)) < 1e-6);
  assert.ok(Math.abs(withInitial.gain - (withInitial.value - 10000)) < 1e-9);
});

test('wealthScenarios produces a 3-rate x 3-horizon grid', () => {
  const grid = wealthScenarios({ initial: 20000, monthly: 1000 });
  assert.deepEqual(grid.horizons, [5, 10, 20]);
  assert.ok(grid.grid.optimistic[2].value > grid.grid.base[2].value);
  assert.ok(grid.grid.base[2].value > grid.grid.conservative[2].value);
  assert.equal(grid.grid.base[0].contributions, 20000 + 1000 * 60);
});
