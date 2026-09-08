const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { runBacktest, buildCompoundScenarios, scoreToMultiplier } = require('./src/lib/backtest');
const { computeScoreModel } = require('./src/lib/scoring');
const { getMarketDataset } = require('./src/services/market');
const { fetchNews } = require('./src/services/news');

const publicDir = path.join(__dirname, 'public');
const cache = new Map();

function getMimeType(filePath) {
  const ext = path.extname(filePath);
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
  }[ext] || 'application/octet-stream';
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function getCached(key, maxAgeMs, loader) {
  const existing = cache.get(key);
  if (existing && (Date.now() - existing.at) < maxAgeMs) {
    return existing.value;
  }
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function workstationPayload() {
  const [market, news] = await Promise.all([
    getCached('market', 15 * 60 * 1000, () => getMarketDataset()),
    getCached('news', 30 * 60 * 1000, () => fetchNews()),
  ]);

  const scoreModel = computeScoreModel(market.history);
  const suggestedMultiplier = scoreToMultiplier(scoreModel.totalScore);
  const backtest = runBacktest(market.history, 1000);
  const compound = buildCompoundScenarios(1000 * suggestedMultiplier, 0);

  return {
    fetchedAt: new Date().toISOString(),
    market,
    score: {
      ...scoreModel,
      suggestedMultiplier,
    },
    backtest,
    compound,
    news,
  };
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': safePath === '/sw.js' ? 'no-store' : 'public, max-age=300',
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/workstation') {
      json(res, 200, await workstationPayload());
      return;
    }
    if (url.pathname === '/api/health') {
      json(res, 200, { ok: true, at: new Date().toISOString() });
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

const port = Number(process.env.PORT || 3000);
if (require.main === module) {
  server.listen(port, () => {
    console.log(`SP500 workstation running at http://localhost:${port}`);
  });
}

module.exports = {
  server,
  workstationPayload,
};
