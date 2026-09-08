import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isoWeekKey,
  toWeeklyBars,
  rsiSeries,
  latestRsi,
  smaSeries,
  percentileRank,
  drawdownSeries,
  currentDrawdown,
  normalizeBars,
} from '../assets/js/indicators.js';

test('isoWeekKey groups Monday-Friday into the same ISO week', () => {
  assert.equal(isoWeekKey('2026-09-07'), isoWeekKey('2026-09-11'));
  assert.notEqual(isoWeekKey('2026-09-11'), isoWeekKey('2026-09-14'));
});

test('weekly aggregation uses real calendar weeks, not every 5th bar', () => {
  // Week 1 is holiday-shortened (4 sessions), week 2 is full (5 sessions).
  const daily = [
    { date: '2026-01-05', open: 100, high: 105, low: 99, close: 101 },
    { date: '2026-01-06', open: 101, high: 108, low: 100, close: 106 },
    { date: '2026-01-07', open: 106, high: 110, low: 104, close: 108 },
    { date: '2026-01-08', open: 108, high: 111, low: 98, close: 99 },
    // 2026-01-09 is a market holiday in this fixture
    { date: '2026-01-12', open: 99, high: 103, low: 95, close: 102 },
    { date: '2026-01-13', open: 102, high: 104, low: 101, close: 103 },
    { date: '2026-01-14', open: 103, high: 107, low: 102, close: 106 },
    { date: '2026-01-15', open: 106, high: 109, low: 105, close: 107 },
    { date: '2026-01-16', open: 107, high: 112, low: 106, close: 111 },
  ];
  const weekly = toWeeklyBars(daily);
  assert.equal(weekly.length, 2);
  assert.equal(weekly[0].sessions, 4);
  assert.equal(weekly[0].open, 100);
  assert.equal(weekly[0].close, 99);
  assert.equal(weekly[0].high, 111);
  assert.equal(weekly[0].low, 98);
  assert.equal(weekly[1].sessions, 5);
  assert.equal(weekly[1].close, 111);
  assert.equal(weekly[1].date, '2026-01-16');
});

test("Wilder RSI matches the reference values of Wilder's classic series", () => {
  const closes = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
    46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
  ];
  const rsi = rsiSeries(closes, 14);
  assert.equal(rsi[13], null);
  assert.ok(Math.abs(rsi[14] - 70.46) < 0.1, `got ${rsi[14]}`);
  assert.ok(Math.abs(rsi[15] - 66.25) < 0.1, `got ${rsi[15]}`);
  assert.ok(Math.abs(rsi[19] - 57.97) < 0.1, `got ${rsi[19]}`);
});

test('RSI is 100 for a monotonic rise and 0 for a monotonic fall', () => {
  const up = Array.from({ length: 40 }, (_, i) => 100 + i);
  const down = Array.from({ length: 40 }, (_, i) => 100 - i);
  assert.equal(latestRsi(up), 100);
  assert.equal(latestRsi(down), 0);
});

test('RSI returns nulls when history is shorter than the period', () => {
  assert.deepEqual(rsiSeries([1, 2, 3], 14), [null, null, null]);
});

test('smaSeries averages the trailing window', () => {
  const sma = smaSeries([1, 2, 3, 4, 5], 3);
  assert.deepEqual(sma, [null, null, 2, 3, 4]);
});

test('percentileRank places a value inside its sample distribution', () => {
  assert.equal(percentileRank([1, 2, 3, 4], 0), 0);
  assert.equal(percentileRank([1, 2, 3, 4], 5), 100);
  assert.equal(percentileRank([1, 2, 3, 4], 2.5), 50);
});

test('drawdown is measured against the rolling peak of the lookback window', () => {
  const closes = [100, 120, 110, 90, 95];
  const dd = drawdownSeries(closes);
  assert.equal(dd[0], 0);
  assert.equal(dd[1], 0);
  assert.ok(Math.abs(dd[3] - (90 / 120 - 1)) < 1e-12);
  assert.ok(Math.abs(currentDrawdown(closes, 252) - (95 / 120 - 1)) < 1e-12);
  // A short lookback forgets the old peak.
  const shortDd = drawdownSeries(closes, 2);
  assert.equal(shortDd[4], 95 / 95 - 1 === 0 ? 0 : shortDd[4]);
  assert.ok(shortDd[4] >= -1e-12);
});

test('normalizeBars sorts, de-duplicates and back-fills missing OHLC', () => {
  const bars = normalizeBars([
    { date: '2026-01-02', close: 10 },
    { date: '2026-01-01', close: 9 },
    { date: '2026-01-02', close: 10 },
    { date: '2026-01-03', close: null },
  ]);
  assert.deepEqual(bars.map((b) => b.date), ['2026-01-01', '2026-01-02']);
  assert.equal(bars[0].open, 9);
  assert.equal(bars[0].high, 9);
});
