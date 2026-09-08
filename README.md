# 标普500 定投工作台 · S&P 500 DCA Workstation

A mobile-first, installable (PWA) workstation for **long-term dollar-cost averaging into the S&P 500 composite index**.
It is deliberately built as a **capital-deployment system**, not a buy/sell predictor:

> Score → Regime → DCA intensity → Historical validation
> (never `Score → BUY`)

Everything is a static site — open `index.html`, or publish it with GitHub Pages and add it to your phone's home screen.
The whole interface switches between **中文** and **English** with one tap.

## What it shows

### Home
1. **Quote** — S&P 500 (`^GSPC`) level, change and update time. Live level during the New York session, last close when the market is shut.
2. **DCA temperature (0–100)** with sub-scores, market regime, suggested deployment intensity and an auto-generated explanation.
3. **Position within the month** — "the Nth cheapest of M trading days this month", plus the share of this month's sessions that are more expensive than today.
4. **Editable holdings** — units, average cost, currency and normal monthly contribution (saved on the device), with this month's suggested contribution.
5. **Index trend** — 1/3/5/10-year chart with the score curve overlaid.
6. **News** — 新浪财经 / 金十数据 / 东方财富, deduplicated and topic-tagged.

### Backtest
- **Score validation**: score buckets (0–20 … 80–100) vs. realised forward 3M / 6M / 12M returns and win rate, computed on real history with **no look-ahead**.
- **Sub-score correlation matrix**: shows how much daily RSI, weekly RSI and drawdown are measuring the same "the market went down" event (the double-counting risk).
- **Dynamic vs fixed DCA**: same buy dates, different contribution sizes — invested capital, final value, total return, average entry level and the average-cost edge.
- **Time machine**: drag the timeline to any historical day to see the score of that day, the contribution the rules would have suggested, and what actually followed.

### Wealth
- Scenario grid (conservative 5% / base 8% / optimistic 11%) over 5 / 10 / 20 years, contributions vs investment gains.
- The deployment-intensity ladder with the money amount for each score band.

## Scoring model

| Component | Weight | How the 0–100 sub-score is built |
| --- | --- | --- |
| Price position | 30% | Percentile of today's close inside the trailing 5-year price distribution (cheap = high) |
| Daily RSI | 20% | Wilder 14-period RSI on daily closes, inverted (RSI 70 → 0, 50 → 50, 30 → 70, 20 → 80) |
| Weekly RSI | 20% | Wilder 14-period RSI on **true calendar-week candles** (ISO weeks, holiday-safe — not "every 5th bar") |
| Drawdown | 20% | Today's drawdown from the 12-month peak, ranked inside the 5-year distribution of drawdowns |
| Monthly position | 10% | How cheap today is versus the other trading days of the current calendar month |

A **regime layer** (200-day moving average, drawdown depth, weekly RSI) classifies the market as
🟢 normal · 🟡 correction · 🟠 bear · 🔴 stress, and the score maps to a DCA multiplier of 0.5×–2.0×.

### Known limitations (read this)
- The price component measures **price level, not valuation**. Forward P/E, CAPE, earnings yield and VIX are *not* included yet — a low price percentile does not by itself mean the underlying companies are cheap.
- Daily RSI, weekly RSI and drawdown are correlated. The Backtest tab shows exactly how correlated, so you can see when 60% of the weight is voting on the same phenomenon.
- News never enters the score.
- The wealth plan is a **scenario simulation, not a forecast**.

## Data sources

| Purpose | Primary | Fallback |
| --- | --- | --- |
| Index history & quote | Yahoo Finance daily chart (`^GSPC`, 10Y) | Stooq daily CSV |
| News | Native publisher RSS (新浪财经 / 金十数据 / 东方财富) | Google News RSS scoped to the same publisher |

Requests are retried through public CORS relays when the browser blocks a direct call, and the last successful history payload is cached in `localStorage` (clearly flagged when shown). Data refreshes automatically every 10 minutes while the tab is open, and whenever the tab regains focus.

## Run it

```bash
npm start          # serves the folder on http://localhost:8080
npm test           # unit tests: indicators, scoring, backtest, data parsing, i18n
```

On a phone: open the published URL, then **Share → Add to Home Screen**.
Pushing to `main` publishes the site through the included GitHub Pages workflow (enable Pages → "GitHub Actions" once in repository settings).

## Layout

```
index.html                   app shell (home / backtest / wealth / news tabs)
manifest.webmanifest, sw.js  PWA install + app-shell cache
assets/js/indicators.js      RSI, weekly OHLC aggregation, percentiles, drawdown
assets/js/scoring.js         sub-scores, total score, regime, DCA ladder
assets/js/backtest.js        forward-return buckets, correlations, DCA sim, FV math
assets/js/data.js            Yahoo/Stooq loading, caching, market-hours logic
assets/js/news.js            feed aggregation, dedupe, topic classification
assets/js/i18n.js            中文 / English dictionary + score explanation
assets/js/app.js             rendering and interaction
tests/                       Node test-runner suite
```

## Disclaimer

For personal research and capital-deployment planning only. Not investment advice.
