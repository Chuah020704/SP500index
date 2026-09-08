const { generateDemoHistory } = require('../data/demoData');

async function fetchJson(url, timeoutMs = 15000, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 SP500index Workstation',
        accept: 'application/json,text/plain,*/*',
        ...headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function toIsoDate(timestamp) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

async function fetchYahooMarketData() {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5y&interval=1d&includePrePost=false&events=div%2Csplits';
  const payload = await fetchJson(url);
  const result = payload?.chart?.result?.[0];
  if (!result) {
    throw new Error('Missing chart result');
  }

  const quote = result?.indicators?.quote?.[0];
  const timestamps = result.timestamp || [];
  const history = timestamps.map((timestamp, index) => ({
    date: toIsoDate(timestamp),
    open: quote.open?.[index],
    high: quote.high?.[index],
    low: quote.low?.[index],
    close: quote.close?.[index],
    volume: quote.volume?.[index],
  })).filter((entry) => Number.isFinite(entry.close));

  const latest = history.at(-1);
  const previous = history.at(-2);
  const meta = result.meta || {};

  return {
    source: 'live',
    history,
    quote: {
      symbol: meta.symbol || '^GSPC',
      shortName: meta.shortName || 'S&P 500',
      latestPrice: meta.regularMarketPrice ?? latest?.close,
      previousClose: meta.chartPreviousClose ?? previous?.close,
      change: meta.regularMarketPrice != null && meta.previousClose != null
        ? Number((meta.regularMarketPrice - meta.previousClose).toFixed(2))
        : Number((latest.close - previous.close).toFixed(2)),
      changePercent: meta.regularMarketPrice != null && meta.previousClose != null
        ? Number((((meta.regularMarketPrice / meta.previousClose) - 1) * 100).toFixed(2))
        : Number((((latest.close / previous.close) - 1) * 100).toFixed(2)),
      updatedAt: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : `${latest.date}T20:00:00Z`,
      marketState: meta.marketState || 'CLOSED',
      currency: meta.currency || 'USD',
      exchangeTimezone: meta.exchangeTimezoneName || 'America/New_York',
    },
  };
}

async function getMarketDataset() {
  try {
    return await fetchYahooMarketData();
  } catch (error) {
    return {
      ...generateDemoHistory(),
      fallbackReason: error.message,
    };
  }
}

module.exports = {
  fetchYahooMarketData,
  getMarketDataset,
};
