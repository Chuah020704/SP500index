const { demoNews } = require('../data/demoData');

async function fetchText(url, timeoutMs = 15000, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 SP500index Workstation',
        accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.8',
        ...headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRss(xml, source, limit = 4) {
  const items = [];
  const regex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?(?:<pubDate>(.*?)<\/pubDate>)?[\s\S]*?<\/item>/g;
  let match;
  while ((match = regex.exec(xml)) && items.length < limit) {
    items.push({
      source,
      title: stripHtml(match[1] || ''),
      url: (match[2] || '').trim(),
      publishedAt: match[3] ? new Date(match[3]).toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

function parseHtmlLinks(html, source, baseUrl, pattern, limit = 4) {
  const items = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = regex.exec(html)) && items.length < limit) {
    const title = stripHtml(match[2] || '');
    if (!title || !pattern.test(title)) continue;
    const url = match[1].startsWith('http') ? match[1] : new URL(match[1], baseUrl).toString();
    items.push({ source, title, url, publishedAt: new Date().toISOString() });
  }
  return items;
}

async function fetchNews() {
  const jobs = [
    (async () => {
      const xml = await fetchText('https://rss.sina.com.cn/finance/globalnews.xml');
      return parseRss(xml, 'Sina Finance');
    })(),
    (async () => {
      const html = await fetchText('https://www.jin10.com/');
      return parseHtmlLinks(html, 'Jin10', 'https://www.jin10.com/', /(S&P|美股|标普|Fed|CPI|inflation|Treasury)/i);
    })(),
    (async () => {
      const html = await fetchText('https://www.eastmoney.com/');
      return parseHtmlLinks(html, 'Eastmoney', 'https://www.eastmoney.com/', /(标普|美股|纳指|道指|通胀|降息|就业|美联储)/i);
    })(),
  ];

  const settled = await Promise.allSettled(jobs);
  const items = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  return items.length ? items.slice(0, 9) : demoNews();
}

module.exports = {
  fetchNews,
  parseHtmlLinks,
  parseRss,
  stripHtml,
};
