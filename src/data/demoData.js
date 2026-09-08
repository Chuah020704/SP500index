function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function isWeekday(date) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

function generateDemoHistory() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(Date.UTC(today.getUTCFullYear() - 5, today.getUTCMonth(), today.getUTCDate()));
  const history = [];
  let close = 3200;
  let tradingIndex = 0;

  for (let date = new Date(start); date <= today; date.setUTCDate(date.getUTCDate() + 1)) {
    if (!isWeekday(date)) continue;
    const seasonal = Math.sin(tradingIndex / 34) * 28;
    const trend = 2.8;
    const shock = Math.cos(tradingIndex / 11) * 9;
    const drift = trend + seasonal + shock;
    close = Math.max(1800, close + drift);
    const open = close - (Math.sin(tradingIndex / 5) * 12);
    const high = Math.max(open, close) + 14;
    const low = Math.min(open, close) - 14;
    history.push({
      date: formatDate(date),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 1000000 + (tradingIndex * 137),
    });
    tradingIndex += 1;
  }

  const latest = history.at(-1);
  const previous = history.at(-2);
  return {
    source: 'demo',
    history,
    quote: {
      symbol: '^GSPC',
      shortName: 'S&P 500',
      latestPrice: latest.close,
      previousClose: previous.close,
      change: Number((latest.close - previous.close).toFixed(2)),
      changePercent: Number((((latest.close / previous.close) - 1) * 100).toFixed(2)),
      updatedAt: `${latest.date}T20:00:00Z`,
      marketState: 'CLOSED',
      currency: 'USD',
      exchangeTimezone: 'America/New_York',
    },
  };
}

function demoNews() {
  return [
    {
      source: 'Sina Finance',
      title: 'Demo fallback: open the live workstation with network access to read real Sina Finance headlines.',
      url: 'https://finance.sina.com.cn/',
      publishedAt: new Date().toISOString(),
    },
    {
      source: 'Jin10',
      title: 'Demo fallback: Jin10 headlines will auto-load when the server can reach the source site.',
      url: 'https://www.jin10.com/',
      publishedAt: new Date().toISOString(),
    },
    {
      source: 'Eastmoney',
      title: 'Demo fallback: Eastmoney headlines will auto-load when live fetch becomes available.',
      url: 'https://www.eastmoney.com/',
      publishedAt: new Date().toISOString(),
    },
  ];
}

module.exports = {
  demoNews,
  generateDemoHistory,
};
