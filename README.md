# SP500index

Phone-friendly bilingual S&P 500 AI DCA workstation.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000` on desktop or mobile, then add it to the home screen.

## Features

- Live S&P 500 quote fetch path with graceful demo fallback when the host cannot reach Yahoo Finance
- 5-year scoring model: price, daily RSI, weekly calendar-aggregated RSI, drawdown, monthly position
- Dynamic DCA multiplier, editable holdings, 5-year backtest, and compounding scenarios
- English / Mandarin toggle
- News ingestion hooks for Sina Finance, Jin10, and Eastmoney

## Validate

```bash
npm test
npm run build
```