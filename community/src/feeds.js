// Reads the YouTube and article feeds (plain Atom/RSS, no API keys).
import { ARTICLES, YOUTUBE } from './config.js';

const UA = { 'User-Agent': 'Mozilla/5.0 EngineeringStudyHubBot/1.0' };
const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const tag = (xml, name) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]);

export async function latestVideos() {
  const out = [];
  for (const ch of YOUTUBE) {
    const xml = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`, { headers: UA }).then((r) => r.text()).catch(() => '');
    for (const entry of xml.split('<entry>').slice(1, 6)) {
      const id = entry.match(/<yt:videoId>([^<]+)/)?.[1];
      if (!id || /shorts/i.test(entry.match(/<link[^>]+href="([^"]+)"/)?.[1] || '')) continue;
      out.push({ id, channel: ch.name, title: tag(entry, 'title'), published: tag(entry, 'published'), description: tag(entry, 'media:description').slice(0, 600) });
    }
  }
  return out.sort((a, b) => b.published.localeCompare(a.published));
}

export async function latestArticles() {
  const out = [];
  for (const feed of ARTICLES) {
    const xml = await fetch(feed.url, { headers: UA }).then((r) => r.text()).catch(() => '');
    for (const item of xml.split(/<entry>|<item>/).slice(1, 26)) {
      const link = item.match(/<link[^>]*href="([^"]+)"/)?.[1] || tag(item, 'link') || tag(item, 'id');
      const title = tag(item, 'title');
      if (!link || !title) continue;
      out.push({ source: feed.name, title, link, summary: (tag(item, 'summary') || tag(item, 'description')).slice(0, 700) });
    }
  }
  return out;
}
