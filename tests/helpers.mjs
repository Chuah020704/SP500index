/** Deterministic synthetic daily bars for tests (weekdays only, seeded noise). */
export function syntheticSeries(count, { start = 3000, drift = 0.0003, vol = 0.01, seed = 42 } = {}) {
  let value = start;
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648 - 0.5;
  };
  const bars = [];
  const date = new Date(Date.UTC(2016, 0, 4));
  while (bars.length < count) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      const change = drift + rand() * 2 * vol;
      const open = value;
      value = Math.max(1, value * (1 + change));
      bars.push({
        date: date.toISOString().slice(0, 10),
        open,
        high: Math.max(open, value) * 1.002,
        low: Math.min(open, value) * 0.998,
        close: value,
      });
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return bars;
}
