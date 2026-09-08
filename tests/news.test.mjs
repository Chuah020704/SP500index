import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyHeadline,
  dedupeItems,
  sortItems,
  parseFeedXml,
  NEWS_SOURCES,
} from '../assets/js/news.js';

/** Minimal RSS parser shim so the pure feed logic can be tested without a DOM. */
function tinyParser(xml) {
  const node = (block) => ({
    querySelector(tag) {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      if (m) return { textContent: m[1].replace(/<!\[CDATA\[|\]\]>/g, ''), getAttribute: () => null };
      const selfClosing = block.match(new RegExp(`<${tag}[^>]*href="([^"]+)"[^>]*/?>`, 'i'));
      if (selfClosing) return { textContent: '', getAttribute: (a) => (a === 'href' ? selfClosing[1] : null) };
      return null;
    },
  });
  return {
    querySelectorAll(tag) {
      const blocks = xml.match(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi')) || [];
      return blocks.map(node);
    },
  };
}

test('classifyHeadline tags macro topics in both languages', () => {
  assert.deepEqual(classifyHeadline('美联储降息预期升温'), ['fed']);
  assert.deepEqual(classifyHeadline('US CPI inflation cools'), ['inflation']);
  assert.ok(classifyHeadline('英伟达财报超预期').includes('earnings'));
  assert.ok(classifyHeadline('英伟达财报超预期').includes('ai'));
  assert.deepEqual(classifyHeadline('随便一条无关新闻'), []);
});

test('dedupeItems removes republished duplicates', () => {
  const items = dedupeItems([
    { title: '美联储：维持利率不变' },
    { title: '美联储：维持利率不变 ' },
    { title: '【快讯】美股三大指数收跌' },
  ]);
  assert.equal(items.length, 2);
});

test('sortItems puts the newest story first', () => {
  const sorted = sortItems([
    { title: 'old', publishedAt: 1000 },
    { title: 'new', publishedAt: 5000 },
    { title: 'undated', publishedAt: null },
  ]);
  assert.deepEqual(sorted.map((i) => i.title), ['new', 'old', 'undated']);
});

test('parseFeedXml reads RSS items and attaches source + topics', () => {
  const xml = `<rss><channel>
      <item><title>美联储降息预期升温</title><link>https://finance.sina.com.cn/a</link><pubDate>Mon, 07 Sep 2026 09:00:00 GMT</pubDate></item>
      <item><title>标普500估值处于高位</title><link>https://finance.sina.com.cn/b</link><pubDate>Mon, 07 Sep 2026 08:00:00 GMT</pubDate></item>
    </channel></rss>`;
  const items = parseFeedXml(xml, NEWS_SOURCES[0], tinyParser);
  assert.equal(items.length, 2);
  assert.equal(items[0].sourceId, 'sina');
  assert.equal(items[0].sourceName.zh, '新浪财经');
  assert.deepEqual(items[0].topics, ['fed']);
  assert.equal(items[1].topics.includes('valuation'), true);
  assert.ok(items[0].publishedAt > 0);
});

test('all configured publishers have a primary feed and a fallback', () => {
  assert.deepEqual(NEWS_SOURCES.map((s) => s.id), ['sina', 'jin10', 'eastmoney']);
  for (const source of NEWS_SOURCES) {
    assert.ok(source.feeds.length >= 2, `${source.id} needs a fallback feed`);
    assert.ok(source.name.zh && source.name.en);
  }
});
