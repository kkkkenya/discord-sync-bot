// Reads the YouTube, arXiv and news feeds (plain Atom/RSS, no API keys).
import { NEWS, YOUTUBE } from './config.js';

const UA = { 'User-Agent': 'Mozilla/5.0 EngineeringStudyHubBot/1.0' };
const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const tag = (xml, name) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]);
const get = (url) => fetch(url, { headers: UA }).then((r) => r.text()).catch(() => '');

export async function latestVideos() {
  const out = [];
  for (const ch of YOUTUBE) {
    for (const entry of (await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`)).split('<entry>').slice(1, 6)) {
      const id = entry.match(/<yt:videoId>([^<]+)/)?.[1];
      if (!id || /shorts/i.test(entry.match(/<link[^>]+href="([^"]+)"/)?.[1] || '')) continue;
      out.push({ id, channel: ch.name, title: tag(entry, 'title'), published: tag(entry, 'published'), description: tag(entry, 'media:description').slice(0, 600) });
    }
  }
  return out.sort((a, b) => b.published.localeCompare(a.published));
}

// Research papers from arXiv in the given categories, newest first.
export async function latestPapers(categories) {
  const q = categories.map((c) => `cat:${c}`).join('+OR+');
  const xml = await get(`https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=30`);
  return xml.split('<entry>').slice(1).map((e) => ({
    source: 'arXiv', title: tag(e, 'title'), link: tag(e, 'id').replace(/v\d+$/, ''), summary: tag(e, 'summary').slice(0, 700),
  })).filter((p) => p.title && p.link);
}

export async function latestNews() {
  const out = [];
  for (const feed of NEWS) {
    for (const item of (await get(feed.url)).split('<item>').slice(1, 16)) {
      const link = tag(item, 'link'); const title = tag(item, 'title');
      if (link && title) out.push({ source: feed.name, title, link, summary: tag(item, 'description').slice(0, 600) });
    }
  }
  return [...new Map(out.map((a) => [a.link, a])).values()];
}
