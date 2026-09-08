import test from 'node:test';
import assert from 'node:assert/strict';
import { t, bandLabel, regimeLabel, formatPercent, formatNumber, explainScore, LANGS } from '../assets/js/i18n.js';
import { computeSnapshot } from '../assets/js/scoring.js';
import { syntheticSeries } from './helpers.mjs';

test('every language exposes the same keys for the whole UI', () => {
  const keys = ['appTitle', 'scoreTitle', 'monthlyRank', 'backtestTitle', 'wealthTitle', 'newsTitle', 'disclaimer'];
  for (const key of keys) {
    for (const lang of LANGS) {
      const value = t(key, lang);
      assert.ok(value && value !== key, `${key} missing for ${lang}`);
    }
  }
  assert.notEqual(t('scoreTitle', 'zh'), t('scoreTitle', 'en'));
});

test('templated strings interpolate parameters', () => {
  assert.equal(t('monthlyRank', 'en', { rank: 3, total: 20 }), 'The 3 cheapest of 20 trading days this month');
  assert.equal(t('monthlyRank', 'zh', { rank: 3, total: 20 }), '本月第 3 / 20 个交易日便宜');
});

test('band and regime labels are translated', () => {
  assert.equal(bandLabel('cheapish', 'zh'), '偏便宜');
  assert.equal(bandLabel('cheapish', 'en'), 'Cheap-ish');
  assert.ok(regimeLabel('stress', 'zh').includes('压力'));
  assert.ok(regimeLabel('stress', 'en').toLowerCase().includes('stress'));
});

test('number and percent formatting handles missing values', () => {
  assert.equal(formatPercent(null, 'en'), '—');
  assert.equal(formatPercent(0.0123, 'en'), '+1.23%');
  assert.equal(formatPercent(-0.0123, 'en'), '-1.23%');
  assert.equal(formatNumber(NaN, 'en'), '—');
});

test('score explanation is generated in both languages from the live numbers', () => {
  const snapshot = computeSnapshot(syntheticSeries(1400));
  const en = explainScore(snapshot, 'en');
  const zh = explainScore(snapshot, 'zh');
  assert.ok(en.includes('5-year price distribution'));
  assert.ok(en.includes('weekly RSI'));
  assert.ok(zh.includes('分位'));
  assert.ok(zh.includes('周线 RSI'));
  assert.ok(zh.includes(String(snapshot.monthly.rank)));
});
