/**
 * UI controller for the S&P 500 DCA workstation.
 *
 * Layers, in order:
 *   real data -> indicators -> score -> regime -> DCA intensity -> backtest
 * News is rendered but deliberately kept out of the scoring path.
 */

import { loadHistory, buildQuote } from './data.js';
import { computeSnapshot, DEFAULT_DCA_LADDER, dcaMultiplier, scoreBand } from './scoring.js';
import {
  bucketForwardReturns,
  componentCorrelations,
  dcaBacktest,
  historicalMoment,
  wealthScenarios,
} from './backtest.js';
import { loadNews } from './news.js';
import {
  t,
  bandLabel,
  regimeLabel,
  formatNumber,
  formatPercent,
  formatDateTime,
  explainScore,
} from './i18n.js';

const SETTINGS_KEY = 'sp500.settings.v1';
const DEFAULT_SETTINGS = {
  lang: 'zh',
  units: 0,
  avgCost: 0,
  currency: 'RM',
  monthlyBase: 1000,
  startingCapital: 0,
  chartRange: 5,
};

const state = {
  settings: loadSettings(),
  payload: null,
  quote: null,
  snapshot: null,
  news: null,
  timeMachineIndex: null,
};

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    merged.currency = String(merged.currency).replace(/[^\p{L}\p{Sc}.]/gu, '').slice(0, 4) || 'RM';
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    /* ignore private-mode storage errors */
  }
}

const lang = () => state.settings.lang;
const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Currency labels are user input, so they are sanitised on entry and escaped on output. */
const sanitizeCurrency = (value) => String(value).replace(/[^\p{L}\p{Sc}.]/gu, '').slice(0, 4);
const money = (value) =>
  `${esc(state.settings.currency)} ${formatNumber(value, lang(), { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;

/* ---------------------------------------------------------------- rendering */

function renderStaticText() {
  document.documentElement.lang = lang() === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n, lang());
  });
  document.getElementById('lang-toggle').textContent = lang() === 'zh' ? 'EN' : '中文';
}

function renderQuote() {
  const el = document.getElementById('quote');
  if (!state.quote) return;
  const q = state.quote;
  const dir = q.change > 0 ? 'up' : q.change < 0 ? 'down' : 'flat';
  const badge = q.isLive ? t('live', lang()) : `${t('lastClose', lang())} · ${q.lastCloseDate}`;
  const cacheNote = state.payload.stale
    ? `<span class="warn">${t('staleData', lang())}</span>`
    : state.payload.cached
      ? `<span class="muted">${t('cachedData', lang())}</span>`
      : '';
  el.innerHTML = `
    <div class="quote-main">
      <div class="quote-name">🟦 S&amp;P 500 <span class="muted">^GSPC</span></div>
      <div class="quote-price ${dir}">${formatNumber(q.price, lang())}</div>
      <div class="quote-change ${dir}">${formatPercent(q.changePct, lang())} (${formatNumber(q.change, lang())})</div>
    </div>
    <div class="quote-meta">
      <span class="pill ${q.isLive ? 'pill-live' : ''}">${badge}</span>
      <span class="muted">${t('updated', lang())} ${formatDateTime(q.asOf, lang())}</span>
      <span class="muted">${t('dataSource', lang())}: ${esc(q.source)}</span>
      ${cacheNote}
    </div>`;
}

function renderScoreCard() {
  const el = document.getElementById('score-card');
  const s = state.snapshot;
  if (!s) {
    el.innerHTML = `<p class="warn">${t('notEnoughHistory', lang())}</p>`;
    return;
  }
  const rows = [
    ['partPrice', s.points.price, s.weights.price],
    ['partDailyRsi', s.points.dailyRsi, s.weights.dailyRsi],
    ['partWeeklyRsi', s.points.weeklyRsi, s.weights.weeklyRsi],
    ['partDrawdown', s.points.drawdown, s.weights.drawdown],
    ['partMonthly', s.points.monthly, s.weights.monthly],
  ]
    .map(
      ([key, points, max]) => `
      <li>
        <span class="part-name">${t(key, lang())}</span>
        <span class="part-bar"><i style="width:${(points / max) * 100}%"></i></span>
        <span class="part-value">${points.toFixed(1)}/${max}</span>
      </li>`
    )
    .join('');

  el.innerHTML = `
    <h2>🎯 ${t('scoreTitle', lang())}</h2>
    <div class="score-hero band-${s.band}">
      <div class="score-value">${s.score.toFixed(0)}<small>${t('scoreOutOf', lang())}</small></div>
      <div class="score-band">${bandLabel(s.band, lang())}</div>
    </div>
    <div class="badge-row">
      <span class="badge">${t('regime', lang())}: ${regimeLabel(s.regime, lang())}</span>
      <span class="badge">${t('dcaIntensity', lang())}: ${s.dcaMultiplier.toFixed(2)}×</span>
    </div>
    <h3>${t('subScores', lang())}</h3>
    <ul class="parts">${rows}</ul>
    <div class="metrics-grid">
      <div><span>${t('partDailyRsi', lang())}</span><b>${s.metrics.dailyRsi.toFixed(1)}</b></div>
      <div><span>${t('partWeeklyRsi', lang())}</span><b>${s.metrics.weeklyRsi.toFixed(1)}</b></div>
      <div><span>${t('partDrawdown', lang())}</span><b>${formatPercent(s.metrics.drawdown, lang(), 1)}</b></div>
      <div><span>200D MA</span><b>${formatNumber(s.metrics.sma200, lang())}</b></div>
    </div>
    <details open>
      <summary>${t('whyThisScore', lang())}</summary>
      <p class="explain">${esc(explainScore(s, lang()))}</p>
    </details>
    <p class="muted small">${t('intensityNote', lang())}</p>`;
}

function renderMonthlyCard() {
  const el = document.getElementById('monthly-card');
  const s = state.snapshot;
  if (!s) return el.replaceChildren();
  const m = s.monthly;
  const bars = m.bars
    .map((bar) => {
      const span = (m.high - m.low) || 1;
      const height = 20 + ((bar.close - m.low) / span) * 80;
      const isToday = bar.date === s.date;
      return `<span class="mbar ${isToday ? 'today' : ''}" style="height:${height}%" title="${bar.date} · ${formatNumber(bar.close, lang())}"></span>`;
    })
    .join('');
  el.innerHTML = `
    <h2>📅 ${t('monthlyTitle', lang())}</h2>
    <p class="headline">${t('monthlyRank', lang(), { rank: m.rank, total: m.total })}</p>
    <p class="muted">${t('monthlyCheaperThan', lang(), { pct: `${Math.round(m.cheaperThanShare)}%` })}</p>
    <div class="month-chart">${bars}</div>
    <div class="metrics-grid">
      <div><span>${t('monthHigh', lang())}</span><b>${formatNumber(m.high, lang())}</b></div>
      <div><span>${t('today', lang())}</span><b>${formatNumber(s.close, lang())}</b></div>
      <div><span>${t('monthLow', lang())}</span><b>${formatNumber(m.low, lang())}</b></div>
    </div>`;
}

function renderHoldingsCard() {
  const el = document.getElementById('holdings-card');
  const s = state.snapshot;
  const cfg = state.settings;
  const price = state.quote ? state.quote.price : null;
  const value = Number.isFinite(price) ? cfg.units * price : null;
  const cost = cfg.units * cfg.avgCost;
  const pnl = Number.isFinite(value) ? value - cost : null;
  const multiplier = s ? s.dcaMultiplier : 1;
  const suggested = cfg.monthlyBase * multiplier;

  el.innerHTML = `
    <h2>💰 ${t('holdingsTitle', lang())}</h2>
    <div class="form-grid">
      <label>${t('holdingsUnits', lang())}
        <input type="number" step="0.0001" min="0" id="in-units" value="${cfg.units}" />
      </label>
      <label>${t('holdingsAvgCost', lang())}
        <input type="number" step="0.01" min="0" id="in-avgcost" value="${cfg.avgCost}" />
      </label>
      <label>${t('holdingsCurrency', lang())}
        <input type="text" maxlength="4" id="in-currency" value="${esc(cfg.currency)}" />
      </label>
      <label>${t('holdingsBase', lang())}
        <input type="number" step="50" min="0" id="in-monthly" value="${cfg.monthlyBase}" />
      </label>
    </div>
    <div class="metrics-grid">
      <div><span>${t('holdingsValue', lang())}</span><b>${value === null ? '—' : money(value)}</b></div>
      <div><span>${t('holdingsPnl', lang())}</span><b class="${pnl > 0 ? 'up' : pnl < 0 ? 'down' : ''}">${pnl === null ? '—' : money(pnl)}</b></div>
      <div><span>${t('dcaIntensity', lang())}</span><b>${multiplier.toFixed(2)}×</b></div>
      <div><span>${t('holdingsSuggested', lang())}</span><b class="accent">${money(suggested)}</b></div>
    </div>
    <p class="muted small">${t('holdingsSaved', lang())} · ${t('intensityNote', lang())}</p>`;

  bindNumber('in-units', 'units');
  bindNumber('in-avgcost', 'avgCost');
  bindNumber('in-monthly', 'monthlyBase');
  const currency = document.getElementById('in-currency');
  currency.addEventListener('change', () => {
    state.settings.currency = sanitizeCurrency(currency.value.trim()) || 'RM';
    saveSettings();
    renderHoldingsCard();
    renderWealthCard();
    renderDcaBacktestCard();
    renderTimeMachineCard();
  });
}

function bindNumber(id, key) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener('change', () => {
    const value = Number(input.value);
    state.settings[key] = Number.isFinite(value) && value >= 0 ? value : 0;
    saveSettings();
    renderHoldingsCard();
    renderWealthCard();
    renderDcaBacktestCard();
    renderTimeMachineCard();
  });
}

function renderChartCard() {
  const el = document.getElementById('chart-card');
  const s = state.snapshot;
  if (!s) return el.replaceChildren();
  const years = state.settings.chartRange;
  const bars = s.bars.slice(-Math.round(years * 252));
  const scores = s.series.slice(-bars.length);

  const width = 640;
  const height = 220;
  const closes = bars.map((b) => b.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const x = (i) => (i / Math.max(1, bars.length - 1)) * width;
  const y = (v) => height - ((v - min) / ((max - min) || 1)) * (height - 10) - 5;
  const path = closes.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(' ');
  const scorePath = scores
    .map((p, i) => (p ? `${i && scores[i - 1] ? 'L' : 'M'}${x(i).toFixed(1)},${(height - (p.score / 100) * height).toFixed(1)}` : ''))
    .filter(Boolean)
    .join(' ');

  const ranges = [
    [1, 'range1y'],
    [3, 'range3y'],
    [5, 'range5y'],
    [10, 'range10y'],
  ]
    .map(
      ([value, key]) =>
        `<button class="chip ${years === value ? 'active' : ''}" data-range="${value}">${t(key, lang())}</button>`
    )
    .join('');

  el.innerHTML = `
    <h2>📈 ${t('chartTitle', lang())}</h2>
    <div class="chips">${ranges}</div>
    <svg viewBox="0 0 ${width} ${height}" class="line-chart" preserveAspectRatio="none" role="img">
      <path d="${path}" class="price-line" />
      <path d="${scorePath}" class="score-line" />
    </svg>
    <div class="legend">
      <span><i class="swatch price"></i>S&amp;P 500</span>
      <span><i class="swatch score"></i>${t('chartScoreOverlay', lang())} (0-100)</span>
      <span class="muted">${bars[0].date} → ${bars[bars.length - 1].date}</span>
    </div>`;

  el.querySelectorAll('[data-range]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.settings.chartRange = Number(btn.dataset.range);
      saveSettings();
      renderChartCard();
    })
  );
}

/** Only http(s) links from feeds are rendered, so a hostile feed cannot inject a javascript: URL. */
function safeUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '#';
  } catch {
    return '#';
  }
}

function newsItemHtml(item) {
  const topics = item.topics
    .map((topic) => `<span class="tag">${t(`topic${topic[0].toUpperCase()}${topic.slice(1)}`, lang())}</span>`)
    .join('');
  const time = item.publishedAt ? formatDateTime(item.publishedAt, lang()) : '';
  const source = item.sourceName[lang()] || item.sourceName.en;
  return `<li>
      <a href="${esc(safeUrl(item.link))}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>
      <div class="news-meta"><span class="src">${esc(source)}</span><span class="muted">${time}</span>${topics}</div>
    </li>`;
}

function renderNewsCards() {
  const containers = [document.getElementById('news-card'), document.getElementById('home-news-card')];
  const news = state.news;
  const body = !news
    ? `<p class="muted">${t('loading', lang())}</p>`
    : news.items.length
      ? `<ul class="news-list">${news.items.map(newsItemHtml).join('')}</ul>`
      : `<p class="warn">${t('newsEmpty', lang())}</p>`;
  const failed = news?.failed?.length
    ? `<p class="muted small">${t('newsFailed', lang(), { sources: news.failed.join(', ') })}</p>`
    : '';
  containers.forEach((el, i) => {
    if (!el) return;
    el.innerHTML = `
      <h2>📰 ${t('newsTitle', lang())}</h2>
      ${i === 1 && news?.items?.length ? `<ul class="news-list">${news.items.slice(0, 5).map(newsItemHtml).join('')}</ul>` : body}
      ${failed}
      <p class="muted small">${t('newsNote', lang())}</p>`;
  });
}

function renderBacktestCard() {
  const el = document.getElementById('backtest-card');
  const s = state.snapshot;
  if (!s) return el.replaceChildren();
  const buckets = bucketForwardReturns(s.series, s.bars);
  const rows = buckets
    .map(
      (b) => `<tr>
        <td>${b.min}–${Math.round(b.max)}</td>
        <td>${b.count}</td>
        <td>${formatPercent(b.horizons.m3.avg, lang(), 1)}</td>
        <td>${formatPercent(b.horizons.m6.avg, lang(), 1)}</td>
        <td>${formatPercent(b.horizons.m12.avg, lang(), 1)}</td>
        <td>${b.horizons.m12.positiveRate === null ? '—' : `${Math.round(b.horizons.m12.positiveRate * 100)}%`}</td>
      </tr>`
    )
    .join('');
  el.innerHTML = `
    <h2>🔬 ${t('backtestTitle', lang())}</h2>
    <p class="muted small">${t('backtestIntro', lang())}</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${t('bucket', lang())}</th><th>${t('samples', lang())}</th>
          <th>${t('fwd3m', lang())}</th><th>${t('fwd6m', lang())}</th>
          <th>${t('fwd12m', lang())}</th><th>${t('winRate', lang())}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="muted small">${t('period', lang())}: ${s.bars[0].date} → ${s.bars[s.bars.length - 1].date}</p>`;
}

function renderCorrelationCard() {
  const el = document.getElementById('correlation-card');
  const s = state.snapshot;
  if (!s) return el.replaceChildren();
  const { keys, matrix } = componentCorrelations(s.series);
  const labelOf = { price: 'partPrice', dailyRsi: 'partDailyRsi', weeklyRsi: 'partWeeklyRsi', drawdown: 'partDrawdown', monthly: 'partMonthly' };
  const header = keys.map((k) => `<th>${t(labelOf[k], lang())}</th>`).join('');
  const rows = keys
    .map(
      (a) => `<tr><th>${t(labelOf[a], lang())}</th>${keys
        .map((b) => {
          const v = matrix[a][b];
          const level = v === null ? '' : Math.abs(v) > 0.7 ? 'hot' : Math.abs(v) > 0.4 ? 'warm' : '';
          return `<td class="${level}">${v === null ? '—' : v.toFixed(2)}</td>`;
        })
        .join('')}</tr>`
    )
    .join('');
  el.innerHTML = `
    <h2>🧪 ${t('correlationTitle', lang())}</h2>
    <div class="table-wrap"><table><thead><tr><th></th>${header}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small">${t('correlationNote', lang())}</p>`;
}

function renderDcaBacktestCard() {
  const el = document.getElementById('dca-backtest-card');
  const s = state.snapshot;
  if (!s) return el.replaceChildren();
  const result = dcaBacktest(s.series, s.bars, { monthlyAmount: state.settings.monthlyBase || 1000 });
  if (!result) return el.replaceChildren();
  const row = (label, plan) => `<tr>
      <td>${label}</td>
      <td>${money(plan.invested)}</td>
      <td>${money(plan.value)}</td>
      <td>${formatPercent(plan.returnPct, lang(), 1)}</td>
      <td>${formatNumber(plan.avgCost, lang(), { maximumFractionDigits: 0, minimumFractionDigits: 0 })}</td>
    </tr>`;
  el.innerHTML = `
    <h2>⚖️ ${t('dcaBacktestTitle', lang())}</h2>
    <div class="table-wrap"><table>
      <thead><tr><th></th><th>${t('invested', lang())}</th><th>${t('finalValue', lang())}</th><th>${t('totalReturn', lang())}</th><th>${t('avgCost', lang())}</th></tr></thead>
      <tbody>${row(t('planFixed', lang()), result.fixed)}${row(t('planDynamic', lang()), result.dynamic)}</tbody>
    </table></div>
    <div class="metrics-grid">
      <div><span>${t('period', lang())}</span><b>${result.from} → ${result.to}</b></div>
      <div><span>${t('avgCostEdge', lang())}</span><b class="${result.avgCostEdge > 0 ? 'up' : result.avgCostEdge < 0 ? 'down' : ''}">${formatPercent(result.avgCostEdge, lang(), 2)}</b></div>
    </div>
    <p class="muted small">${t('wealthNote', lang())}</p>`;
}

function renderTimeMachineCard() {
  const el = document.getElementById('time-machine-card');
  const s = state.snapshot;
  if (!s) return el.replaceChildren();
  const scored = s.series.filter(Boolean);
  if (!scored.length) return el.replaceChildren();
  if (state.timeMachineIndex === null || state.timeMachineIndex >= scored.length) {
    state.timeMachineIndex = Math.max(0, scored.length - 1);
  }
  const point = scored[state.timeMachineIndex];
  const moment = historicalMoment(s.series, s.bars, point.date);
  const multiplier = dcaMultiplier(moment.score, DEFAULT_DCA_LADDER);

  el.innerHTML = `
    <h2>🕰️ ${t('timeMachineTitle', lang())}</h2>
    <p class="muted small">${t('timeMachineHint', lang())}</p>
    <input type="range" id="tm-range" min="0" max="${scored.length - 1}" value="${state.timeMachineIndex}" />
    <div class="tm-head">
      <b>${moment.date}</b>
      <span>S&amp;P 500 ${formatNumber(moment.close, lang())}</span>
      <span class="badge band-${scoreBand(moment.score)}">${moment.score.toFixed(0)} / 100 · ${bandLabel(scoreBand(moment.score), lang())}</span>
      <span class="badge">${regimeLabel(moment.regime, lang())}</span>
    </div>
    <div class="metrics-grid">
      <div><span>${t('partDailyRsi', lang())}</span><b>${moment.metrics.dailyRsi.toFixed(1)}</b></div>
      <div><span>${t('partWeeklyRsi', lang())}</span><b>${moment.metrics.weeklyRsi.toFixed(1)}</b></div>
      <div><span>${t('partDrawdown', lang())}</span><b>${formatPercent(moment.metrics.drawdown, lang(), 1)}</b></div>
      <div><span>${t('suggestedThen', lang())}</span><b class="accent">${money((state.settings.monthlyBase || 0) * multiplier)} (${multiplier.toFixed(2)}×)</b></div>
    </div>
    <h3>${t('whatFollowed', lang())}</h3>
    <div class="metrics-grid">
      <div><span>${t('fwd3m', lang())}</span><b class="${moment.forward.m3 > 0 ? 'up' : 'down'}">${formatPercent(moment.forward.m3, lang(), 1)}</b></div>
      <div><span>${t('fwd6m', lang())}</span><b class="${moment.forward.m6 > 0 ? 'up' : 'down'}">${formatPercent(moment.forward.m6, lang(), 1)}</b></div>
      <div><span>${t('fwd12m', lang())}</span><b class="${moment.forward.m12 > 0 ? 'up' : 'down'}">${formatPercent(moment.forward.m12, lang(), 1)}</b></div>
    </div>`;

  const range = document.getElementById('tm-range');
  range.addEventListener('input', () => {
    state.timeMachineIndex = Number(range.value);
    renderTimeMachineCard();
    document.getElementById('tm-range').focus();
  });
}

function renderWealthCard() {
  const el = document.getElementById('wealth-card');
  const cfg = state.settings;
  const price = state.quote ? state.quote.price : null;
  const holdingsValue = Number.isFinite(price) ? cfg.units * price : 0;
  const initial = cfg.startingCapital || holdingsValue;
  const scenarios = wealthScenarios({ initial, monthly: cfg.monthlyBase });
  const names = { conservative: 'conservative', base: 'base', optimistic: 'optimistic' };
  const rows = Object.entries(scenarios.grid)
    .map(
      ([key, cells]) => `<tr>
        <td>${t(names[key], lang())}</td>
        ${cells.map((c) => `<td><b>${money(c.value)}</b><br /><span class="muted small">${t('gains', lang())} ${money(c.gain)}</span></td>`).join('')}
      </tr>`
    )
    .join('');

  el.innerHTML = `
    <h2>🏦 ${t('wealthTitle', lang())}</h2>
    <div class="form-grid">
      <label>${t('startingCapital', lang())}
        <input type="number" step="500" min="0" id="in-capital" value="${cfg.startingCapital || Math.round(holdingsValue)}" />
      </label>
      <label>${t('monthlyContribution', lang())}
        <input type="number" step="50" min="0" id="in-monthly2" value="${cfg.monthlyBase}" />
      </label>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>${t('scenario', lang())}</th><th>${t('years5', lang())}</th><th>${t('years10', lang())}</th><th>${t('years20', lang())}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="muted small">${t('contributions', lang())} (20Y): ${money(scenarios.grid.base[2].contributions)}</p>
    <p class="muted small">${t('wealthNote', lang())}</p>`;

  const capital = document.getElementById('in-capital');
  capital.addEventListener('change', () => {
    state.settings.startingCapital = Math.max(0, Number(capital.value) || 0);
    saveSettings();
    renderWealthCard();
  });
  const monthly = document.getElementById('in-monthly2');
  monthly.addEventListener('change', () => {
    state.settings.monthlyBase = Math.max(0, Number(monthly.value) || 0);
    saveSettings();
    renderHoldingsCard();
    renderWealthCard();
    renderDcaBacktestCard();
    renderTimeMachineCard();
  });
}

function renderLadderCard() {
  const el = document.getElementById('ladder-card');
  const rows = DEFAULT_DCA_LADDER.map(
    (step) => `<tr>
      <td>${step.min}–${Math.min(100, Math.round(step.max))}</td>
      <td>${step.multiplier.toFixed(2)}×</td>
      <td>${money((state.settings.monthlyBase || 0) * step.multiplier)}</td>
    </tr>`
  ).join('');
  el.innerHTML = `
    <h2>🎚️ ${t('ladderTitle', lang())}</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>${t('ladderScore', lang())}</th><th>${t('ladderMultiplier', lang())}</th><th>${t('holdingsSuggested', lang())}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="muted small">${t('intensityNote', lang())}</p>`;
}

function renderAll() {
  renderStaticText();
  renderQuote();
  renderScoreCard();
  renderMonthlyCard();
  renderHoldingsCard();
  renderChartCard();
  renderNewsCards();
  renderBacktestCard();
  renderCorrelationCard();
  renderDcaBacktestCard();
  renderTimeMachineCard();
  renderWealthCard();
  renderLadderCard();
}

/* -------------------------------------------------------------------- boot */

async function refresh({ force = false } = {}) {
  const quoteEl = document.getElementById('quote');
  quoteEl.innerHTML = `<div class="quote-loading">${t('loading', lang())}</div>`;
  try {
    const payload = await loadHistory({ force });
    state.payload = payload;
    state.quote = buildQuote(payload);
    state.snapshot = computeSnapshot(payload.bars);
    state.timeMachineIndex = null;
    renderAll();
  } catch (err) {
    quoteEl.innerHTML = `
      <div class="quote-error">
        <strong>${t('loadFailed', lang())}</strong>
        <span class="muted small">${esc(err.message)}</span>
        <button id="retry" class="ghost-btn">${t('retry', lang())}</button>
      </div>`;
    document.getElementById('retry').addEventListener('click', () => refresh({ force: true }));
  }
}

async function refreshNews() {
  try {
    state.news = await loadNews({ limit: 12 });
  } catch {
    state.news = { items: [], failed: ['all'] };
  }
  renderNewsCards();
}

function initTabs() {
  document.querySelectorAll('.tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t2) => t2.classList.toggle('active', t2 === tab));
      document.querySelectorAll('.panel').forEach((panel) =>
        panel.classList.toggle('active', panel.id === `panel-${tab.dataset.tab}`)
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    })
  );
}

function init() {
  initTabs();
  renderStaticText();
  document.getElementById('lang-toggle').addEventListener('click', () => {
    state.settings.lang = lang() === 'zh' ? 'en' : 'zh';
    saveSettings();
    renderAll();
  });
  document.getElementById('refresh').addEventListener('click', () => {
    refresh({ force: true });
    refreshNews();
  });

  refresh();
  refreshNews();

  // Auto-update while the tab stays open.
  setInterval(() => refresh(), 10 * 60 * 1000);
  setInterval(() => refreshNews(), 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

init();
