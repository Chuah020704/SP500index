const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateCalendarWeeks, computeScoreModel } = require('../src/lib/scoring');
const { runBacktest, futureValueOfMonthlyContribution } = require('../src/lib/backtest');

function makeHistory(startDate, closes) {
  const history = [];
  const date = new Date(`${startDate}T00:00:00Z`);
  for (const close of closes) {
    history.push({
      date: date.toISOString().slice(0, 10),
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000,
    });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return history;
}

test('aggregateCalendarWeeks groups by actual calendar weeks', () => {
  const input = [
    { date: '2026-11-23', open: 1, high: 2, low: 1, close: 2, volume: 1 },
    { date: '2026-11-24', open: 2, high: 3, low: 2, close: 3, volume: 1 },
    { date: '2026-11-25', open: 3, high: 4, low: 3, close: 4, volume: 1 },
    { date: '2026-11-27', open: 4, high: 6, low: 4, close: 5, volume: 1 },
    { date: '2026-11-30', open: 5, high: 7, low: 5, close: 6, volume: 1 },
  ];

  const weekly = aggregateCalendarWeeks(input);
  assert.equal(weekly.length, 2);
  assert.equal(weekly[0].date, '2026-11-27');
  assert.equal(weekly[0].close, 5);
  assert.equal(weekly[1].date, '2026-11-30');
});

test('computeScoreModel returns usable sub-scores and monthly rank', () => {
  const closes = [];
  let price = 100;
  for (let index = 0; index < 160; index += 1) {
    price += Math.sin(index / 7) * 1.4 + 0.25;
    closes.push(Number(price.toFixed(2)));
  }
  const model = computeScoreModel(makeHistory('2026-01-01', closes));
  assert.ok(model.totalScore >= 0 && model.totalScore <= 100);
  assert.ok(model.monthlyPosition.rank >= 1);
  assert.ok(model.factors.price.score >= 0 && model.factors.price.score <= 100);
  assert.ok(model.weeklyRsi >= 0 && model.weeklyRsi <= 100);
});

test('backtest and compounding helpers return deterministic results', () => {
  const closes = [];
  let price = 100;
  for (let index = 0; index < 420; index += 1) {
    price += 0.3 + Math.cos(index / 13) * 0.9;
    closes.push(Number(price.toFixed(2)));
  }
  const history = makeHistory('2025-01-01', closes);
  const result = runBacktest(history, 1000);
  assert.ok(result.months > 10);
  assert.ok(result.totalContributed > 0);
  assert.ok(Number.isFinite(result.endingValue));

  const fv = futureValueOfMonthlyContribution(1000, 0.08, 10, 0);
  assert.equal(Math.round(fv), 182946);
});
