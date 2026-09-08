const translations = {
  en: {
    titleEyebrow: 'AI DCA Dashboard',
    titleMain: 'S&P 500 Workstation',
    loading: 'Loading workstation...',
    live: 'Live',
    demo: 'Demo fallback',
    updated: 'Updated',
    lastClose: 'Last close',
    scoreCard: 'Score Card',
    holdings: 'Editable Holdings',
    chart: 'Index Trend',
    news: 'Finance News',
    score: 'Today score',
    marketRegime: 'Market regime',
    dca: 'Today DCA',
    monthlyRank: 'Monthly cheapness',
    drawdown: 'Drawdown',
    dailyRsi: 'Daily RSI',
    weeklyRsi: 'Weekly RSI',
    price: '5Y price position',
    monthlyPos: 'Monthly position',
    priceSub: 'Price',
    rsiDailySub: 'Daily RSI',
    rsiWeeklySub: 'Weekly RSI',
    drawdownSub: 'Drawdown',
    monthlySub: 'Monthly',
    units: 'Units held',
    avgCost: 'Average cost',
    monthlyBudget: 'Base monthly DCA',
    marketValue: 'Market value',
    pnl: 'Unrealized P/L',
    suggestedBuy: 'Suggested next buy',
    save: 'Save locally',
    backtest: '5Y dynamic DCA backtest',
    contributed: 'Dynamic contributions',
    endingValue: 'Ending value',
    excess: 'Vs fixed DCA',
    returnPct: 'Return',
    compound: 'Compounding scenarios',
    years: 'years',
    of: 'of',
    cheapest: 'cheapest',
    latestCloseInfo: 'Trading day shows the latest quote. Market closed shows the latest official close.',
    fallbackNote: 'Live data fetch is unavailable in the current environment, so the workstation is showing a demo fallback dataset.',
    scenarioNote: 'Scenario simulator uses fixed annual return assumptions and is not a forecast.',
    recentMonths: 'Recent dynamic DCA steps',
    noNews: 'No live headlines yet.',
  },
  zh: {
    titleEyebrow: 'AI定投工作台',
    titleMain: '标普500工作台',
    loading: '正在加载工作台...',
    live: '实时',
    demo: '演示回退',
    updated: '更新时间',
    lastClose: '最近收盘',
    scoreCard: '评分卡',
    holdings: '可编辑持仓',
    chart: '指数走势',
    news: '财经资讯',
    score: '今日评分',
    marketRegime: '市场状态',
    dca: '今日定投',
    monthlyRank: '本月便宜度',
    drawdown: '回撤',
    dailyRsi: '日线RSI',
    weeklyRsi: '周线RSI',
    price: '5年价格位置',
    monthlyPos: '本月位置',
    priceSub: '价格',
    rsiDailySub: '日线RSI',
    rsiWeeklySub: '周线RSI',
    drawdownSub: '回撤',
    monthlySub: '本月',
    units: '持有份额',
    avgCost: '持仓成本',
    monthlyBudget: '基础月定投',
    marketValue: '持仓市值',
    pnl: '浮动盈亏',
    suggestedBuy: '建议下次投入',
    save: '保存到本机',
    backtest: '近5年动态定投回测',
    contributed: '动态总投入',
    endingValue: '期末价值',
    excess: '对比固定定投',
    returnPct: '收益率',
    compound: '复利情景',
    years: '年',
    of: '共',
    cheapest: '便宜',
    latestCloseInfo: '交易日展示最新行情；休市时展示最近官方收盘。',
    fallbackNote: '当前环境无法拉取实时数据，因此工作台暂时展示演示回退数据。',
    scenarioNote: '复利情景采用固定年化收益假设，仅作情景模拟，不代表收益预测。',
    recentMonths: '最近动态定投记录',
    noNews: '暂无实时资讯。',
  },
};

const state = {
  lang: localStorage.getItem('sp500-lang') || 'en',
  data: null,
};

function t(key) {
  return translations[state.lang][key] || key;
}

function fmtNumber(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return new Intl.NumberFormat(state.lang === 'zh' ? 'zh-CN' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function fmtPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  const sign = Number(value) > 0 ? '+' : '';
  return `${sign}${fmtNumber(value, 2)}%`;
}

function fmtCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return new Intl.NumberFormat(state.lang === 'zh' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function fmtDate(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat(state.lang === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  }).format(new Date(value));
}

function loadHoldingForm() {
  return {
    units: Number(localStorage.getItem('sp500-units') || 0),
    avgCost: Number(localStorage.getItem('sp500-avg-cost') || 0),
    monthlyBudget: Number(localStorage.getItem('sp500-monthly-budget') || 1000),
  };
}

function saveHoldingForm() {
  const form = document.getElementById('holdingForm');
  const units = Number(form.units.value || 0);
  const avgCost = Number(form.avgCost.value || 0);
  const monthlyBudget = Number(form.monthlyBudget.value || 1000);
  localStorage.setItem('sp500-units', String(units));
  localStorage.setItem('sp500-avg-cost', String(avgCost));
  localStorage.setItem('sp500-monthly-budget', String(monthlyBudget));
  render();
}

function subscoreLabel(key) {
  const map = {
    price: t('priceSub'),
    dailyRsi: t('rsiDailySub'),
    weeklyRsi: t('rsiWeeklySub'),
    drawdown: t('drawdownSub'),
    monthly: t('monthlySub'),
  };
  return map[key] || key;
}

function regimeLabel(regime) {
  const labels = {
    'Bull / Normal': { en: 'Bull / Normal', zh: '多头 / 常态' },
    Correction: { en: 'Correction', zh: '回调' },
    Stress: { en: 'Stress', zh: '压力区' },
    Watch: { en: 'Watch', zh: '观察' },
    Unknown: { en: 'Unknown', zh: '未知' },
  };
  return labels[regime]?.[state.lang] || regime;
}

function buildChart(history) {
  const closes = history.slice(-252).map((entry) => entry.close);
  if (!closes.length) return '';
  const width = 360;
  const height = 220;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const points = closes.map((value, index) => {
    const x = (index / (closes.length - 1)) * width;
    const y = height - (((value - min) / (max - min || 1)) * (height - 24)) - 12;
    return `${x},${y}`;
  }).join(' ');
  const fill = `0,${height} ${points} ${width},${height}`;
  return `
    <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="S&P 500 trend">
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.42"></stop>
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.02"></stop>
        </linearGradient>
      </defs>
      <polygon fill="url(#area)" points="${fill}"></polygon>
      <polyline fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${points}"></polyline>
    </svg>
  `;
}

function render() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelector('[data-i18n="titleEyebrow"]').textContent = t('titleEyebrow');
  document.querySelector('[data-i18n="titleMain"]').textContent = t('titleMain');
  document.getElementById('langToggle').textContent = state.lang === 'en' ? '中文' : 'EN';

  const app = document.getElementById('app');
  if (!state.data) {
    app.innerHTML = `<section class="card hero-card"><div class="loading">${t('loading')}</div></section>`;
    return;
  }

  const { market, score, backtest, compound, news } = state.data;
  const holdings = loadHoldingForm();
  const currentPrice = market.quote.latestPrice;
  const budgetScale = (holdings.monthlyBudget || 0) / (backtest.baseContribution || 1000 || 1);
  const marketValue = holdings.units * currentPrice;
  const pnl = holdings.units * (currentPrice - holdings.avgCost);
  const suggestedBuy = holdings.monthlyBudget * score.suggestedMultiplier;
  const priceClass = market.quote.change > 0 ? 'positive' : market.quote.change < 0 ? 'negative' : 'neutral';
  const latestCloseLabel = market.quote.marketState === 'REGULAR' ? t('updated') : t('lastClose');
  const monthlyRank = score.monthlyPosition.rank && score.monthlyPosition.total
    ? `${score.monthlyPosition.rank} ${t('of')} ${score.monthlyPosition.total} ${t('cheapest')}`
    : '--';

  app.innerHTML = `
    <section class="card hero-card">
      <div class="badge-row">
        <span class="badge">${market.source === 'live' ? t('live') : t('demo')}</span>
        <span class="badge">${latestCloseLabel}: ${fmtDate(market.quote.updatedAt)}</span>
      </div>
      <div class="hero-price">${fmtNumber(currentPrice)}</div>
      <div class="metric-value ${priceClass}">${fmtPercent(market.quote.changePercent)} · ${fmtNumber(market.quote.change)}</div>
      <div class="score-pill">${t('score')}: ${fmtNumber(score.totalScore)}</div>
      <div class="kpi-row">
        <div><div class="metric-label">${t('marketRegime')}</div><div class="metric-value">${regimeLabel(score.regime)}</div></div>
        <div><div class="metric-label">${t('dca')}</div><div class="metric-value">${fmtNumber(score.suggestedMultiplier, 2)}×</div></div>
      </div>
      <div class="mini-grid">
        <div><div class="metric-label">${t('dailyRsi')}</div><div class="metric-value">${fmtNumber(score.dailyRsi)}</div></div>
        <div><div class="metric-label">${t('weeklyRsi')}</div><div class="metric-value">${fmtNumber(score.weeklyRsi)}</div></div>
        <div><div class="metric-label">${t('drawdown')}</div><div class="metric-value">${fmtPercent(score.drawdown)}</div></div>
      </div>
      <div class="subscore-grid" style="margin-top:14px;">
        ${Object.entries(score.factors).map(([key, factor]) => `
          <div>
            <div class="metric-label">${subscoreLabel(key)}</div>
            <div class="metric-value">${fmtNumber(factor.score)}</div>
          </div>
        `).join('')}
      </div>
      <div class="badge-row">
        <span class="badge">${t('monthlyRank')}: ${monthlyRank}</span>
        <span class="badge">${t('price')}: ${fmtNumber(score.factors.price?.score)}</span>
      </div>
      <div class="explanation">${score.explanation[state.lang]} ${t('latestCloseInfo')} ${market.source === 'demo' ? t('fallbackNote') : ''}</div>
    </section>

    <section class="card">
      <h2>${t('holdings')}</h2>
      <form id="holdingForm" class="field-grid">
        <div>
          <label for="units">${t('units')}</label>
          <input id="units" name="units" type="number" min="0" step="0.0001" value="${holdings.units}">
        </div>
        <div>
          <label for="avgCost">${t('avgCost')}</label>
          <input id="avgCost" name="avgCost" type="number" min="0" step="0.01" value="${holdings.avgCost}">
        </div>
        <div>
          <label for="monthlyBudget">${t('monthlyBudget')}</label>
          <input id="monthlyBudget" name="monthlyBudget" type="number" min="0" step="1" value="${holdings.monthlyBudget}">
        </div>
        <div style="align-self:end;"><button class="primary-button" id="saveHoldingButton" type="button">${t('save')}</button></div>
      </form>
      <div class="holding-summary" style="margin-top:14px;">
        <div><div class="metric-label">${t('marketValue')}</div><div class="metric-value">${fmtCurrency(marketValue)}</div></div>
        <div><div class="metric-label">${t('pnl')}</div><div class="metric-value ${pnl >= 0 ? 'positive' : 'negative'}">${fmtCurrency(pnl)}</div></div>
        <div><div class="metric-label">${t('suggestedBuy')}</div><div class="metric-value">${fmtCurrency(suggestedBuy)}</div></div>
        <div><div class="metric-label">${t('returnPct')}</div><div class="metric-value">${fmtPercent(backtest.totalReturnPct)}</div></div>
      </div>
      <h3 style="margin-top:18px;">${t('backtest')}</h3>
      <div class="backtest-grid">
        <div><div class="metric-label">${t('contributed')}</div><div class="metric-value">${fmtCurrency(backtest.totalContributed * budgetScale)}</div></div>
        <div><div class="metric-label">${t('endingValue')}</div><div class="metric-value">${fmtCurrency(backtest.endingValue * budgetScale)}</div></div>
        <div><div class="metric-label">${t('excess')}</div><div class="metric-value ${backtest.excessVsStatic >= 0 ? 'positive' : 'negative'}">${fmtCurrency(backtest.excessVsStatic * budgetScale)}</div></div>
        <div><div class="metric-label">${t('returnPct')}</div><div class="metric-value">${fmtPercent(backtest.totalReturnPct)}</div></div>
      </div>
      <div class="explanation tiny">${t('recentMonths')}: ${backtest.steps.slice(-4).map((step) => `${step.date} ${step.multiplier}×`).join(' · ')}</div>
      <h3 style="margin-top:18px;">${t('compound')}</h3>
      <div class="scenario-grid">
        ${compound.map((scenario) => `
          <div>
            <div class="metric-label">${scenario.annualReturnPct}%</div>
            <div class="tiny">${scenario.values.map((item) => `${item.years}${t('years')}: ${fmtCurrency(item.futureValue * budgetScale)}`).join(' · ')}</div>
          </div>
        `).join('')}
      </div>
      <div class="explanation tiny">${t('scenarioNote')}</div>
    </section>

    <section class="card">
      <h2>${t('chart')}</h2>
      ${buildChart(market.history)}
      <div class="tiny">1Y trend · ${fmtNumber(Math.min(...market.history.slice(-252).map((entry) => entry.close)))} → ${fmtNumber(Math.max(...market.history.slice(-252).map((entry) => entry.close)))}</div>
    </section>

    <section class="card">
      <h2>${t('news')}</h2>
      ${(news || []).length ? news.map((item) => `
        <a class="news-item" href="${item.url}" target="_blank" rel="noreferrer noopener">
          <div class="news-source">${item.source}</div>
          <div class="news-title">${item.title}</div>
          <div class="news-time">${fmtDate(item.publishedAt)}</div>
        </a>
      `).join('') : `<div class="muted">${t('noNews')}</div>`}
    </section>
  `;

  const saveButton = document.getElementById('saveHoldingButton');
  if (saveButton) saveButton.addEventListener('click', saveHoldingForm);
}

async function loadWorkstation() {
  try {
    const response = await fetch('/api/workstation');
    state.data = await response.json();
  } catch (error) {
    const app = document.getElementById('app');
    app.innerHTML = `<section class="card"><div class="metric-value">Error</div><div class="muted">${error.message}</div></section>`;
    return;
  }
  render();
}

document.getElementById('langToggle').addEventListener('click', () => {
  state.lang = state.lang === 'en' ? 'zh' : 'en';
  localStorage.setItem('sp500-lang', state.lang);
  render();
});

window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  loadWorkstation();
  setInterval(loadWorkstation, 15 * 60 * 1000);
});
