#!/usr/bin/env node
/**
 * Fetches the S&P 500 daily history/quote server-side (from a GitHub Actions
 * runner, which has normal outbound network access and is not subject to
 * browser CORS restrictions) and writes it to `data/sp500.json`.
 *
 * The workstation (assets/js/data.js) fetches this file first, same-origin,
 * from GitHub Pages. That removes the hard dependency on public CORS relays
 * for the bulk of the history; the browser-side direct/relay fetch is then
 * only used as a "try to get something fresher" top-up.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchYahoo, fetchStooq } from '../assets/js/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(OUT_DIR, 'sp500.json');

async function main() {
  const errors = [];
  for (const loader of [fetchYahoo, fetchStooq]) {
    try {
      const payload = await loader();
      if (payload.bars.length < 300) throw new Error('history too short');
      const snapshot = { ...payload, generatedAt: Date.now() };
      await mkdir(OUT_DIR, { recursive: true });
      await writeFile(OUT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
      console.log(`Wrote ${OUT_FILE} (${payload.bars.length} bars, source: ${payload.source})`);
      return;
    } catch (err) {
      errors.push(`${loader.name}: ${err.message}`);
    }
  }
  throw new Error(`All sources failed: ${errors.join(' | ')}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
