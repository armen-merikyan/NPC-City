import { defineConfig } from 'vite';

const allowedRssHosts = new Set([
  'www.coindesk.com',
  'cointelegraph.com',
  'finance.yahoo.com',
  'www.cnbc.com',
  'www.tmz.com',
  'pagesix.com',
  'www.eonline.com',
  'www.etonline.com',
  'variety.com',
  'www.hollywoodreporter.com',
  'news.google.com',
  'rss.politico.com'
]);

const liveTopicFeeds = [
  { name: 'Crypto - CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Crypto - Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Markets - Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
  { name: 'Markets - CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { name: 'Gossip - TMZ', url: 'https://www.tmz.com/rss.xml' },
  { name: 'Gossip - Page Six', url: 'https://pagesix.com/feed/' },
  { name: 'Gossip - E! News', url: 'https://www.eonline.com/syndication/feeds/rssfeeds/topstories.xml' },
  { name: 'Entertainment - ET', url: 'https://www.etonline.com/news/rss' },
  { name: 'Entertainment - Variety', url: 'https://variety.com/feed/' },
  { name: 'Entertainment - Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/' },
  { name: 'Entertainment - Google News', url: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-US&gl=US&ceid=US:en' },
  { name: 'Gossip - Google News', url: 'https://news.google.com/rss/search?q=TMZ+celebrity+gossip&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Politics - Politico', url: 'https://rss.politico.com/politics-news.xml' },
  { name: 'Politics - Google News', url: 'https://news.google.com/rss/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en' }
];

const rssHeaders = {
  Accept: 'application/rss+xml, application/xml, text/xml, */*',
  'User-Agent': 'NPC City local RSS reader'
};

function decodeEntities(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(value) {
  return decodeEntities(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function readXmlField(block, fieldNames) {
  for (const fieldName of fieldNames) {
    const match = block.match(new RegExp(`<${fieldName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${fieldName}>`, 'i'));
    if (match) return stripTags(match[1]);
  }
  return '';
}

function parseFeedItemsFromXml(xmlText, source) {
  const blocks = [...String(xmlText || '').matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)]
    .map((match) => match[2]);

  return blocks.slice(0, 8).map((block) => {
    const title = readXmlField(block, ['title']);
    const summary = readXmlField(block, ['description', 'summary', 'content']);
    return title ? { source, title, summary } : null;
  }).filter(Boolean);
}

async function fetchFeedText(feedUrl) {
  const url = new URL(feedUrl);
  if (!allowedRssHosts.has(url.hostname)) {
    throw new Error(`RSS host is not allowed: ${url.hostname}`);
  }

  const response = await fetch(url, {
    headers: rssHeaders,
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`RSS request failed: ${response.status}`);
  return response.text();
}

async function fetchPriceContext() {
  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,dogecoin&vs_currencies=usd&include_24hr_change=true';
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'NPC City local price reader' },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`price request failed: ${response.status}`);
    const data = await response.json();
    const labels = {
      bitcoin: 'BTC',
      ethereum: 'ETH',
      solana: 'SOL',
      ripple: 'XRP',
      dogecoin: 'DOGE'
    };
    return Object.entries(labels).map(([id, label]) => {
      const price = data[id]?.usd;
      const change = data[id]?.usd_24h_change;
      if (!Number.isFinite(price)) return null;
      const formattedPrice = price >= 1 ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${price.toFixed(4)}`;
      const formattedChange = Number.isFinite(change) ? ` (${change >= 0 ? '+' : ''}${change.toFixed(2)}% 24h)` : '';
      return `${label} ${formattedPrice}${formattedChange}`;
    }).filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

export default defineConfig({
  server: {
    host: '127.0.0.1'
  },
  plugins: [
    {
      name: 'npc-city-rss-proxy',
      configureServer(server) {
        server.middlewares.use('/api/live-topics', async (_request, response) => {
          try {
            const [feedResults, priceContext] = await Promise.all([
              Promise.allSettled(liveTopicFeeds.map(async (feed) => {
                const xml = await fetchFeedText(feed.url);
                return parseFeedItemsFromXml(xml, feed.name);
              })),
              fetchPriceContext()
            ]);

            const topics = feedResults
              .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
              .slice(0, 96);

            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(JSON.stringify({
              topics,
              priceContext,
              loadedAt: new Date().toISOString()
            }));
          } catch (error) {
            response.statusCode = 500;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ error: error.message, topics: [], priceContext: '' }));
          }
        });

        server.middlewares.use('/api/rss', async (request, response) => {
          try {
            const requestUrl = new URL(request.url, 'http://127.0.0.1');
            const feedUrl = new URL(requestUrl.searchParams.get('url') || '');
            if (!allowedRssHosts.has(feedUrl.hostname)) {
              response.statusCode = 403;
              response.end('RSS host is not allowed.');
              return;
            }

            const feedResponse = await fetch(feedUrl, {
              headers: rssHeaders,
              signal: AbortSignal.timeout(10000)
            });
            const text = await feedResponse.text();
            response.statusCode = feedResponse.ok ? 200 : feedResponse.status;
            response.setHeader('Content-Type', feedResponse.headers.get('content-type') || 'text/xml; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(text);
          } catch (error) {
            response.statusCode = 500;
            response.end(error.message);
          }
        });
      }
    }
  ]
});
