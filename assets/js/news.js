/**
 * Financial news aggregation.
 *
 * IMPORTANT: news is presented for context only. It never feeds into the
 * score, so the workstation can never turn "market fell + scary headline" into
 * a higher reading without knowing whether the headline actually mattered.
 *
 * Each publisher is tried through its own feed first; a Google News RSS query
 * scoped to that publisher is used only as a fallback when the native feed is
 * unreachable from the browser.
 */

export const NEWS_SOURCES = [
  {
    id: 'sina',
    name: { zh: '新浪财经', en: 'Sina Finance' },
    feeds: [
      'https://rss.sina.com.cn/roll/finance/hot_roll.xml',
      'https://news.google.com/rss/search?q=%E7%BE%8E%E8%82%A1+OR+%E6%A0%87%E6%99%AE500+site:finance.sina.com.cn&hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
    ],
  },
  {
    id: 'jin10',
    name: { zh: '金十数据', en: 'Jin10' },
    feeds: [
      'https://www.jin10.com/rss.xml',
      'https://news.google.com/rss/search?q=%E7%BE%8E%E8%82%A1+OR+%E7%BE%8E%E8%81%94%E5%82%A8+site:jin10.com&hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
    ],
  },
  {
    id: 'eastmoney',
    name: { zh: '东方财富', en: 'East Money' },
    feeds: [
      'https://rss.eastmoney.com/rss_partener.xml',
      'https://news.google.com/rss/search?q=%E7%BE%8E%E8%82%A1+OR+%E6%A0%87%E6%99%AE500+site:eastmoney.com&hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
    ],
  },
];

const RELAYS = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

/** Keyword taxonomy used to tag each headline. */
export const NEWS_TOPICS = {
  fed: ['美联储', '联储', 'fed', 'fomc', 'powell', '鲍威尔', '降息', '加息'],
  inflation: ['通胀', 'cpi', 'pce', 'inflation', '物价'],
  rates: ['国债', '收益率', 'yield', 'treasury', '利率', 'bond'],
  earnings: ['财报', '业绩', 'earnings', 'eps', '盈利'],
  ai: ['ai', '人工智能', '英伟达', 'nvidia', '算力', '芯片'],
  valuation: ['估值', '市盈率', 'valuation', 'pe', '泡沫'],
  geopolitics: ['关税', '地缘', '战争', '制裁', 'tariff', 'geopolit', '中东'],
};

/** Tag a headline with zero or more topics. */
export function classifyHeadline(title = '') {
  const text = title.toLowerCase();
  const topics = [];
  for (const [topic, keywords] of Object.entries(NEWS_TOPICS)) {
    if (keywords.some((k) => text.includes(k))) topics.push(topic);
  }
  return topics;
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[【】\[\]（）()《》"'“”‘’,，。.!！?？:：|｜-]/g, '');
}

/** Drop duplicate stories that several outlets republished. */
export function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = normalizeTitle(item.title || '').slice(0, 40);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Newest first, undated items last. */
export function sortItems(items) {
  return [...items].sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
}

/**
 * Parse an RSS 2.0 / Atom document into news items.
 * `parse` lets Node tests inject a DOM parser; the browser uses DOMParser.
 */
export function parseFeedXml(xml, source, parse) {
  const doc = parse(xml);
  const nodes = [...doc.querySelectorAll('item'), ...doc.querySelectorAll('entry')];
  const items = [];
  for (const node of nodes) {
    const title = (node.querySelector('title')?.textContent || '').trim();
    if (!title) continue;
    const linkNode = node.querySelector('link');
    const link = (linkNode?.textContent || linkNode?.getAttribute?.('href') || '').trim();
    const dateText =
      node.querySelector('pubDate')?.textContent ||
      node.querySelector('updated')?.textContent ||
      node.querySelector('published')?.textContent ||
      '';
    const publishedAt = dateText ? Date.parse(dateText) || null : null;
    items.push({
      title: title.replace(/\s*-\s*[^-]{2,20}$/, (m) => m),
      link,
      publishedAt,
      sourceId: source.id,
      sourceName: source.name,
      topics: classifyHeadline(title),
    });
  }
  return items;
}

async function fetchFeed(url, parse) {
  for (const relay of RELAYS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(relay(url), { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.includes('<')) continue;
      return text;
    } catch {
      /* try the next relay */
    }
  }
  return null;
}

/**
 * Aggregate the configured publishers into one deduplicated, classified list.
 * Failures are reported per source instead of breaking the page.
 */
export async function loadNews({ limit = 12, parse } = {}) {
  const parser =
    parse || ((xml) => new DOMParser().parseFromString(xml, 'application/xml'));
  const collected = [];
  const failed = [];

  await Promise.all(
    NEWS_SOURCES.map(async (source) => {
      for (const feed of source.feeds) {
        const xml = await fetchFeed(feed, parser);
        if (!xml) continue;
        try {
          const items = parseFeedXml(xml, source, parser);
          if (items.length) {
            collected.push(...items.slice(0, 10));
            return;
          }
        } catch {
          /* malformed feed, try the fallback */
        }
      }
      failed.push(source.id);
    })
  );

  return { items: sortItems(dedupeItems(collected)).slice(0, limit), failed };
}
