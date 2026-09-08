import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYahoo, parseStooq, buildQuote, isMarketOpen, nyDate } from '../assets/js/data.js';

const yahooFixture = {
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          fullExchangeName: 'SNP',
          marketState: 'CLOSED',
          regularMarketPrice: 7718.6,
          chartPreviousClose: 7748.2,
          regularMarketTime: 1757016000,
          exchangeTimezoneName: 'America/New_York',
        },
        timestamp: [1756814400, 1756900800, 1756987200],
        indicators: {
          quote: [
            {
              open: [7700, 7740, 7750],
              high: [7760, 7790, 7770],
              low: [7680, 7720, 7690],
              close: [7748.2, 7760.1, 7718.6],
            },
          ],
        },
      },
    ],
  },
};

test('parseYahoo maps the chart payload into OHLC bars', () => {
  const payload = parseYahoo(yahooFixture);
  assert.equal(payload.source, 'Yahoo Finance');
  assert.equal(payload.bars.length, 3);
  assert.equal(payload.bars[2].close, 7718.6);
  assert.equal(payload.meta.marketState, 'CLOSED');
  assert.ok(payload.bars[0].date < payload.bars[2].date);
});

test('parseYahoo skips sessions without a close', () => {
  const broken = JSON.parse(JSON.stringify(yahooFixture));
  broken.chart.result[0].indicators.quote[0].close[1] = null;
  assert.equal(parseYahoo(broken).bars.length, 2);
});

test('parseYahoo rejects an unexpected payload', () => {
  assert.throws(() => parseYahoo({}), /unexpected Yahoo payload/);
});

test('parseStooq reads the daily CSV fallback', () => {
  const csv = 'Date,Open,High,Low,Close\n2026-09-03,7700,7760,7680,7748.2\n2026-09-04,7750,7770,7690,7718.6\n';
  const payload = parseStooq(csv);
  assert.equal(payload.source, 'Stooq');
  assert.equal(payload.bars.length, 2);
  assert.equal(payload.meta.regularMarketPrice, 7718.6);
  assert.equal(payload.meta.previousClose, 7748.2);
  assert.throws(() => parseStooq('garbage'), /unexpected Stooq payload/);
});

test('buildQuote shows the last close when the market is shut', () => {
  const payload = parseYahoo(yahooFixture);
  // A Sunday: the US cash session is definitely closed.
  const quote = buildQuote(payload, new Date('2026-09-06T15:00:00Z'));
  assert.equal(quote.isLive, false);
  assert.equal(quote.price, 7718.6);
  assert.ok(Math.abs(quote.change - (7718.6 - 7760.1)) < 1e-9);
  assert.equal(quote.lastCloseDate, payload.bars[2].date);
});

test('buildQuote shows the live level during a regular session', () => {
  const payload = parseYahoo(yahooFixture);
  payload.meta.marketState = 'REGULAR';
  // Tuesday 14:00 UTC = 10:00 New York.
  const quote = buildQuote(payload, new Date('2026-09-08T14:00:00Z'));
  assert.equal(quote.isLive, true);
  assert.equal(quote.price, 7718.6);
  assert.ok(Math.abs(quote.change - (7718.6 - 7748.2)) < 1e-9);
});

test('isMarketOpen respects New York trading hours', () => {
  assert.equal(isMarketOpen(new Date('2026-09-08T14:00:00Z')), true); // 10:00 ET Tue
  assert.equal(isMarketOpen(new Date('2026-09-08T12:00:00Z')), false); // 08:00 ET Tue
  assert.equal(isMarketOpen(new Date('2026-09-08T21:00:00Z')), false); // 17:00 ET Tue
  assert.equal(isMarketOpen(new Date('2026-09-05T15:00:00Z')), false); // Saturday
});

test('nyDate returns the New York calendar day', () => {
  assert.equal(nyDate(new Date('2026-09-08T02:00:00Z')), '2026-09-07');
});
