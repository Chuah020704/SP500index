const { computeScoreModel, normalizeHistory, round } = require('./scoring');

function scoreToMultiplier(score) {
  if (!Number.isFinite(score)) return 1;
  if (score >= 85) return 2;
  if (score >= 70) return 1.5;
  if (score >= 50) return 1.25;
  if (score >= 30) return 1;
  return 0.75;
}

function takeMonthEndHistory(entries) {
  const normalized = normalizeHistory(entries);
  const monthMap = new Map();
  for (const entry of normalized) {
    const key = entry.date.slice(0, 7);
    monthMap.set(key, entry);
  }
  return Array.from(monthMap.values());
}

function runBacktest(entries, baseContribution = 1000) {
  const normalized = normalizeHistory(entries);
  const monthEnds = takeMonthEndHistory(normalized);
  let units = 0;
  let totalContributed = 0;
  const steps = [];

  for (const monthEnd of monthEnds) {
    const historyToDate = normalized.filter((entry) => entry.date <= monthEnd.date);
    const model = computeScoreModel(historyToDate);
    const multiplier = scoreToMultiplier(model.totalScore);
    const contribution = baseContribution * multiplier;
    const purchasedUnits = contribution / monthEnd.close;
    units += purchasedUnits;
    totalContributed += contribution;

    steps.push({
      date: monthEnd.date,
      close: round(monthEnd.close),
      score: model.totalScore,
      multiplier,
      contribution: round(contribution),
      units: round(units, 4),
      value: round(units * monthEnd.close),
    });
  }

  const endingClose = monthEnds.at(-1)?.close ?? null;
  const endingValue = endingClose == null ? 0 : units * endingClose;
  const simpleDcaContribution = monthEnds.length * baseContribution;
  const simpleDcaUnits = monthEnds.reduce((sum, monthEnd) => sum + (baseContribution / monthEnd.close), 0);
  const simpleDcaValue = endingClose == null ? 0 : simpleDcaUnits * endingClose;

  return {
    baseContribution,
    months: monthEnds.length,
    totalContributed: round(totalContributed),
    endingValue: round(endingValue),
    gainLoss: round(endingValue - totalContributed),
    totalReturnPct: totalContributed === 0 ? 0 : round(((endingValue / totalContributed) - 1) * 100),
    endingUnits: round(units, 4),
    simpleDcaContribution: round(simpleDcaContribution),
    simpleDcaValue: round(simpleDcaValue),
    excessVsStatic: round(endingValue - simpleDcaValue),
    steps: steps.slice(-24),
  };
}

function futureValueOfMonthlyContribution(monthlyContribution, annualReturn, years, initialValue = 0) {
  const monthlyRate = annualReturn / 12;
  const periods = years * 12;
  const recurring = monthlyRate === 0
    ? monthlyContribution * periods
    : monthlyContribution * (((1 + monthlyRate) ** periods - 1) / monthlyRate);
  return recurring + (initialValue * ((1 + monthlyRate) ** periods));
}

function buildCompoundScenarios(monthlyContribution, initialValue = 0) {
  const cases = [
    { key: 'conservative', annualReturn: 0.05 },
    { key: 'base', annualReturn: 0.08 },
    { key: 'optimistic', annualReturn: 0.11 },
  ];
  const horizons = [5, 10, 20];

  return cases.map((scenario) => ({
    ...scenario,
    annualReturnPct: round(scenario.annualReturn * 100, 1),
    values: horizons.map((years) => ({
      years,
      futureValue: round(futureValueOfMonthlyContribution(monthlyContribution, scenario.annualReturn, years, initialValue)),
    })),
  }));
}

module.exports = {
  buildCompoundScenarios,
  futureValueOfMonthlyContribution,
  runBacktest,
  scoreToMultiplier,
  takeMonthEndHistory,
};
