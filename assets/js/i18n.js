/**
 * Bilingual dictionary (English / 简体中文) and formatting helpers.
 * Every visible string goes through `t()`, so the whole workstation can be
 * switched between languages instantly.
 */

export const LANGS = ['zh', 'en'];

const DICT = {
  appTitle: { zh: '标普500 定投工作台', en: 'S&P 500 DCA Workstation' },
  appTagline: {
    zh: '资本部署系统 · 不是买卖预测',
    en: 'A capital deployment system, not a buy/sell predictor',
  },
  tabHome: { zh: '首页', en: 'Home' },
  tabBacktest: { zh: '回测', en: 'Backtest' },
  tabWealth: { zh: '财富', en: 'Wealth' },
  tabNews: { zh: '资讯', en: 'News' },
  refresh: { zh: '刷新数据', en: 'Refresh data' },
  loading: { zh: '正在获取真实行情…', en: 'Loading real market data…' },
  loadFailed: { zh: '行情获取失败', en: 'Market data unavailable' },
  retry: { zh: '重试', en: 'Retry' },
  dataSource: { zh: '数据来源', en: 'Source' },
  cachedData: { zh: '使用本地缓存', en: 'Served from local cache' },
  staleData: { zh: '网络失败，显示上次缓存数据', en: 'Network failed — showing last cached data' },
  live: { zh: '交易中', en: 'Live session' },
  lastClose: { zh: '最近收盘', en: 'Last close' },
  updated: { zh: '更新于', en: 'Updated' },

  scoreTitle: { zh: '定投温度', en: 'DCA Temperature' },
  scoreOutOf: { zh: '分 / 100', en: '/ 100' },
  subScores: { zh: '各项子分', en: 'Sub-scores' },
  partPrice: { zh: '价格位置', en: 'Price position' },
  partDailyRsi: { zh: '日线 RSI', en: 'Daily RSI' },
  partWeeklyRsi: { zh: '周线 RSI', en: 'Weekly RSI' },
  partDrawdown: { zh: '阶段回撤', en: 'Drawdown' },
  partMonthly: { zh: '本月位置', en: 'Monthly position' },
  total: { zh: '总分', en: 'Total' },
  whyThisScore: { zh: '为什么是这个分数？', en: 'Why this score?' },
  regime: { zh: '市场状态', en: 'Market regime' },
  regimeNormal: { zh: '🟢 正常 / 牛市', en: '🟢 Normal / bull' },
  regimeCorrection: { zh: '🟡 回调', en: '🟡 Correction' },
  regimeBear: { zh: '🟠 熊市', en: '🟠 Bear market' },
  regimeStress: { zh: '🔴 极端压力', en: '🔴 Stress / crash' },
  bandDeep: { zh: '深度回调', en: 'Deep pull-back' },
  bandCheapish: { zh: '偏便宜', en: 'Cheap-ish' },
  bandSlightlyCheap: { zh: '略偏便宜', en: 'Slightly cheap' },
  bandFair: { zh: '中性', en: 'Fair' },
  bandSlightlyExpensive: { zh: '略偏贵', en: 'Slightly expensive' },
  bandExpensive: { zh: '相对贵', en: 'Relatively expensive' },
  dcaIntensity: { zh: '建议部署强度', en: 'Suggested DCA intensity' },
  intensityNote: {
    zh: '这是"部署强度"，不是买卖信号。分数越高代表回调越充分，分数越低代表相对贵。',
    en: 'This is deployment intensity, not a buy/sell signal. Higher = pull-back is more complete; lower = relatively expensive.',
  },

  monthlyTitle: { zh: '本月价格位置', en: 'Position within this month' },
  monthlyRank: { zh: '本月第 {rank} / {total} 个交易日便宜', en: 'The {rank} cheapest of {total} trading days this month' },
  monthlyCheaperThan: {
    zh: '今天比本月 {pct} 的交易日更便宜',
    en: "Today is cheaper than {pct} of this month's trading days",
  },
  monthHigh: { zh: '本月最高', en: 'Month high' },
  monthLow: { zh: '本月最低', en: 'Month low' },
  today: { zh: '今日', en: 'Today' },

  holdingsTitle: { zh: '我的定投', en: 'My plan' },
  holdingsUnits: { zh: '持有份额 / 单位', en: 'Units held' },
  holdingsAvgCost: { zh: '平均成本 (指数点位)', en: 'Average cost (index level)' },
  holdingsCurrency: { zh: '货币', en: 'Currency' },
  holdingsBase: { zh: '正常月投入', en: 'Normal monthly contribution' },
  holdingsSuggested: { zh: '本月建议投入', en: 'Suggested contribution this month' },
  holdingsValue: { zh: '当前市值', en: 'Current value' },
  holdingsPnl: { zh: '浮动盈亏', en: 'Unrealised P/L' },
  holdingsSaved: { zh: '已保存在本机', en: 'Saved on this device' },
  ladderTitle: { zh: '部署强度阶梯', en: 'Intensity ladder' },
  ladderScore: { zh: '评分', en: 'Score' },
  ladderMultiplier: { zh: '倍数', en: 'Multiplier' },

  chartTitle: { zh: '指数走势', en: 'Index trend' },
  chartScoreOverlay: { zh: '评分曲线', en: 'Score line' },
  range1y: { zh: '1年', en: '1Y' },
  range3y: { zh: '3年', en: '3Y' },
  range5y: { zh: '5年', en: '5Y' },
  range10y: { zh: '10年', en: '10Y' },

  newsTitle: { zh: '财经资讯', en: 'Market news' },
  newsNote: {
    zh: '资讯仅供参考，不参与评分计算。',
    en: 'News is context only and never feeds the score.',
  },
  newsEmpty: { zh: '暂时无法加载资讯', en: 'News feeds are unavailable right now' },
  newsFailed: { zh: '以下来源加载失败：{sources}', en: 'Failed sources: {sources}' },
  topicFed: { zh: '美联储', en: 'Fed' },
  topicInflation: { zh: '通胀', en: 'Inflation' },
  topicRates: { zh: '利率', en: 'Rates' },
  topicEarnings: { zh: '财报', en: 'Earnings' },
  topicAi: { zh: 'AI', en: 'AI' },
  topicValuation: { zh: '估值', en: 'Valuation' },
  topicGeopolitics: { zh: '地缘', en: 'Geopolitics' },

  backtestTitle: { zh: '评分有效性回测', en: 'Score validation backtest' },
  backtestIntro: {
    zh: '如果这套评分历史上就存在，高分之后的走势真的更好吗？以下使用真实历史数据计算，全部为前视安全（只用当日及之前的数据）。',
    en: 'If this score had existed historically, did high readings actually lead to better forward returns? Computed on real history with no look-ahead.',
  },
  bucket: { zh: '评分区间', en: 'Score bucket' },
  samples: { zh: '样本', en: 'Samples' },
  fwd3m: { zh: '未来3个月', en: 'Next 3M' },
  fwd6m: { zh: '未来6个月', en: 'Next 6M' },
  fwd12m: { zh: '未来12个月', en: 'Next 12M' },
  winRate: { zh: '上涨概率', en: 'Win rate' },
  correlationTitle: { zh: '子分相关性（是否重复计票）', en: 'Sub-score correlation (double counting check)' },
  correlationNote: {
    zh: '日线 RSI、周线 RSI 与回撤可能都在衡量"市场下跌"这同一件事。相关性越接近 1，重复计票越严重。',
    en: 'Daily RSI, weekly RSI and drawdown can all measure the same "the market went down" event. The closer to 1, the more the score double-counts it.',
  },
  dcaBacktestTitle: { zh: '动态定投 vs 固定定投', en: 'Dynamic DCA vs fixed DCA' },
  planFixed: { zh: '固定定投', en: 'Fixed DCA' },
  planDynamic: { zh: '动态定投（按评分）', en: 'Dynamic DCA (score-driven)' },
  invested: { zh: '累计投入', en: 'Invested' },
  finalValue: { zh: '期末市值', en: 'Final value' },
  totalReturn: { zh: '总回报率', en: 'Total return' },
  avgCost: { zh: '平均买入点位', en: 'Average entry level' },
  avgCostEdge: { zh: '平均成本优势', en: 'Average-cost edge' },
  period: { zh: '回测区间', en: 'Period' },
  timeMachineTitle: { zh: '时光机：如果今天是历史上的那一天', en: 'Time machine: if today were that day' },
  timeMachineHint: { zh: '拖动时间轴查看任意历史日期的评分与之后的真实走势', en: 'Drag the timeline to inspect any historical day and what actually followed' },
  suggestedThen: { zh: '当时的建议投入', en: 'Suggested contribution then' },
  whatFollowed: { zh: '之后真实走势', en: 'What actually followed' },
  notEnoughHistory: { zh: '数据不足', en: 'Not enough history' },

  wealthTitle: { zh: '我的财富计划', en: 'My wealth plan' },
  wealthNote: {
    zh: '情景模拟，不是收益预测。真实市场不会每年都给相同的回报。',
    en: 'Scenario simulation, not a return forecast. Real markets never deliver the same return every year.',
  },
  startingCapital: { zh: '当前投资资产', en: 'Starting capital' },
  monthlyContribution: { zh: '每月投入', en: 'Monthly contribution' },
  scenario: { zh: '情景', en: 'Scenario' },
  conservative: { zh: '保守 5%', en: 'Conservative 5%' },
  base: { zh: '基准 8%', en: 'Base 8%' },
  optimistic: { zh: '乐观 11%', en: 'Optimistic 11%' },
  years5: { zh: '5年', en: '5Y' },
  years10: { zh: '10年', en: '10Y' },
  years20: { zh: '20年', en: '20Y' },
  contributions: { zh: '本金投入', en: 'Your contributions' },
  gains: { zh: '投资增长', en: 'Investment gains' },

  disclaimer: {
    zh: '本工作台仅用于个人研究与资本部署规划，不构成投资建议。',
    en: 'For personal research and capital-deployment planning only. Not investment advice.',
  },
  installHint: {
    zh: '手机浏览器点击「分享 → 添加到主屏幕」即可像 App 一样打开。',
    en: 'On mobile, tap Share → Add to Home Screen to open it like an app.',
  },
};

export function t(key, lang = 'zh', params = {}) {
  const entry = DICT[key];
  let text = entry ? entry[lang] ?? entry.en ?? key : key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replaceAll(`{${k}}`, v);
  }
  return text;
}

export function bandLabel(band, lang) {
  const map = {
    deep: 'bandDeep',
    cheapish: 'bandCheapish',
    slightlyCheap: 'bandSlightlyCheap',
    fair: 'bandFair',
    slightlyExpensive: 'bandSlightlyExpensive',
    expensive: 'bandExpensive',
  };
  return t(map[band] || 'bandFair', lang);
}

export function regimeLabel(regime, lang) {
  const map = {
    normal: 'regimeNormal',
    correction: 'regimeCorrection',
    bear: 'regimeBear',
    stress: 'regimeStress',
  };
  return t(map[regime] || 'regimeNormal', lang);
}

export function formatNumber(value, lang, options = {}) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    ...options,
  }).format(value);
}

export function formatPercent(value, lang, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function formatDateTime(ts, lang) {
  if (!Number.isFinite(ts)) return '—';
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ts));
}

/**
 * Build the plain-language explanation of today's score.
 * The explanation is generated from the same numbers that produced the score,
 * so it can never drift away from the model.
 */
export function explainScore(snapshot, lang) {
  const m = snapshot.metrics;
  const pct = (v) => `${Math.round(v)}%`;
  const dd = (snapshot.metrics.drawdown * 100).toFixed(1);
  const monthly = snapshot.monthly;
  if (lang === 'en') {
    return [
      `The index is trading above ${pct(m.pricePercentile)} of its 5-year price distribution, which converts to ${snapshot.points.price.toFixed(1)}/${snapshot.weights.price} price points.`,
      `Daily RSI is ${m.dailyRsi.toFixed(1)} and weekly RSI (built from true calendar-week candles) is ${m.weeklyRsi.toFixed(1)}, so short- and medium-term momentum contribute ${snapshot.points.dailyRsi.toFixed(1)}/${snapshot.weights.dailyRsi} and ${snapshot.points.weeklyRsi.toFixed(1)}/${snapshot.weights.weeklyRsi}.`,
      `The index is ${dd}% below its 12-month peak, deeper than ${pct(100 - m.drawdownPercentile)} of the drawdowns seen in the last 5 years (${snapshot.points.drawdown.toFixed(1)}/${snapshot.weights.drawdown}).`,
      `Within ${monthly.month} today is the ${monthly.rank} cheapest of ${monthly.total} trading days (${snapshot.points.monthly.toFixed(1)}/${snapshot.weights.monthly}).`,
      `Note: this measures how complete the pull-back is, not valuation. Price level is not the same thing as forward P/E or earnings yield.`,
    ].join(' ');
  }
  return [
    `当前点位处于过去5年价格分布的第 ${pct(m.pricePercentile)} 分位，折算为价格分 ${snapshot.points.price.toFixed(1)}/${snapshot.weights.price}。`,
    `日线 RSI 为 ${m.dailyRsi.toFixed(1)}，周线 RSI（按真实自然周 K 线聚合）为 ${m.weeklyRsi.toFixed(1)}，因此短期与中期动能分别贡献 ${snapshot.points.dailyRsi.toFixed(1)}/${snapshot.weights.dailyRsi} 与 ${snapshot.points.weeklyRsi.toFixed(1)}/${snapshot.weights.weeklyRsi}。`,
    `距离近12个月高点回撤 ${dd}%，比过去5年 ${pct(100 - m.drawdownPercentile)} 的时间更深（${snapshot.points.drawdown.toFixed(1)}/${snapshot.weights.drawdown}）。`,
    `在 ${monthly.month} 中，今天是第 ${monthly.rank} / ${monthly.total} 个便宜的交易日（${snapshot.points.monthly.toFixed(1)}/${snapshot.weights.monthly}）。`,
    `注意：这衡量的是"回调是否充分"，不是估值。价格位置不等于远期市盈率或盈利收益率。`,
  ].join('');
}
