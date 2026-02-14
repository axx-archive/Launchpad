/**
 * RSS Platform Adapter for Intelligence signal ingestion.
 *
 * Uses rss-parser to fetch and parse RSS/Atom feeds from curated publications.
 * Runs on a 4-6 hour cycle, processing feeds in rotating batches.
 *
 * Key features:
 * - SHA-256 content hashing for cross-source dedup (same story on multiple outlets)
 * - 50-100 curated publication feeds (tech, culture, business, entertainment)
 * - Published date extraction (original publish time, not fetch time)
 * - Batch rotation: processes ~25 feeds per cycle, rotating through full list
 *
 * Install: npm install rss-parser (in scripts/cron or root)
 */

import { generateContentHash } from "../signal-dedup.mjs";

// Track rotation position across cycles (in-memory, resets on restart)
let rotationIndex = 0;

// Rate limiter: small delay between fetches to be polite
const REQUEST_DELAY_MS = 500;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Fetch signals from RSS feeds.
 *
 * @param {Object} config
 * @param {Array<{url: string, name: string, category?: string}>} config.feeds - RSS feed URLs
 * @param {number} config.feeds_per_cycle - How many feeds to process per cycle
 * @param {number} config.items_per_feed - Max items to take per feed
 * @param {number} config.max_age_days - Ignore articles older than this
 * @param {Object} dependencies
 * @returns {Promise<{signals: Object[], quota_used: number, errors: string[]}>}
 */
export async function fetchSignals(config, dependencies) {
  const result = { signals: [], quota_used: 0, errors: [] };

  let RSSParser;
  try {
    RSSParser = (await import("rss-parser")).default;
  } catch {
    result.errors.push("rss-parser not installed. Run: npm install rss-parser");
    return result;
  }

  const parser = new RSSParser({
    timeout: 15000, // 15 second timeout per feed
    headers: {
      "User-Agent": "launchpad-intel/1.0 (cultural trend analysis)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
  });

  const feeds = config.feeds || getDefaultFeeds();
  const perCycle = config.feeds_per_cycle || 25;
  const itemsPerFeed = config.items_per_feed || 15;
  const maxAgeDays = config.max_age_days || 7;
  const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

  // Select feeds for this cycle (rotate through list)
  const startIdx = rotationIndex % feeds.length;
  const batch = [];
  for (let i = 0; i < perCycle && i < feeds.length; i++) {
    batch.push(feeds[(startIdx + i) % feeds.length]);
  }
  rotationIndex = (startIdx + perCycle) % feeds.length;

  // Fetch each feed
  for (const feed of batch) {
    try {
      const feedData = await parser.parseURL(feed.url);
      result.quota_used += 1;

      const items = (feedData.items || []).slice(0, itemsPerFeed);

      for (const item of items) {
        // Skip items without a title
        if (!item.title) continue;

        // Skip items older than cutoff
        const pubDate = item.pubDate || item.isoDate;
        if (pubDate) {
          const published = new Date(pubDate);
          if (published < cutoffDate) continue;
        }

        const signal = transformRSSItem(item, feed);
        result.signals.push(signal);
      }

      await sleep(REQUEST_DELAY_MS);
    } catch (err) {
      result.errors.push(`${feed.name} (${feed.url}): ${err.message}`);
    }
  }

  return result;
}

/**
 * Transform an RSS item into the signal format.
 */
function transformRSSItem(item, feed) {
  const title = (item.title || "").trim();
  const snippet = (
    item.contentSnippet ||
    item.content ||
    item.summary ||
    item.description ||
    ""
  ).slice(0, 500).trim();

  // Build a stable source_id from the item's guid, link, or title hash
  const sourceId = item.guid || item.link || `rss-${generateContentHash(title, snippet)}`;

  // Parse publish date
  const pubDate = item.pubDate || item.isoDate;
  const publishedAt = pubDate ? new Date(pubDate).toISOString() : null;

  return {
    source: "rss",
    source_id: sourceId,
    title,
    content_snippet: snippet || null,
    author: item.creator || item.author || feed.name || null,
    subreddit: null,
    channel_id: null,
    upvotes: 0,
    comments: 0,
    views: 0,
    likes: 0,
    // SHA-256 content hash for cross-source dedup
    // (same story published on TechCrunch + The Verge → same hash)
    content_hash: generateContentHash(title, snippet),
    published_at: publishedAt,
    source_url: item.link || null,
  };
}

/**
 * Default RSS feeds — curated publications covering culture, tech, business,
 * entertainment, and trending topics. Will move to DB in Phase 7.
 */
function getDefaultFeeds() {
  return [
    // Tech & Startups
    { url: "https://techcrunch.com/feed/", name: "TechCrunch", category: "tech" },
    { url: "https://www.theverge.com/rss/index.xml", name: "The Verge", category: "tech" },
    { url: "https://feeds.arstechnica.com/arstechnica/index", name: "Ars Technica", category: "tech" },
    { url: "https://www.wired.com/feed/rss", name: "Wired", category: "tech" },
    { url: "https://mashable.com/feeds/rss/all", name: "Mashable", category: "tech" },

    // Business & Marketing
    { url: "https://feeds.hbr.org/harvardbusiness", name: "Harvard Business Review", category: "business" },
    { url: "https://www.fastcompany.com/latest/rss", name: "Fast Company", category: "business" },
    { url: "https://adage.com/rss/all", name: "Ad Age", category: "marketing" },
    { url: "https://digiday.com/feed/", name: "Digiday", category: "marketing" },
    { url: "https://www.adweek.com/feed/", name: "Adweek", category: "marketing" },

    // Culture & Entertainment
    { url: "https://www.rollingstone.com/feed/", name: "Rolling Stone", category: "culture" },
    { url: "https://pitchfork.com/feed/feed-news/rss", name: "Pitchfork", category: "music" },
    { url: "https://www.billboard.com/feed/", name: "Billboard", category: "music" },
    { url: "https://variety.com/feed/", name: "Variety", category: "entertainment" },
    { url: "https://deadline.com/feed/", name: "Deadline", category: "entertainment" },
    { url: "https://www.hollywoodreporter.com/feed/", name: "Hollywood Reporter", category: "entertainment" },

    // Gen Z & Social Media
    { url: "https://www.tubefilter.com/feed/", name: "Tubefilter", category: "social" },
    { url: "https://later.com/blog/feed/", name: "Later Blog", category: "social" },
    { url: "https://blog.hootsuite.com/feed/", name: "Hootsuite Blog", category: "social" },

    // Design & Creative
    { url: "https://www.creativebloq.com/feed", name: "Creative Bloq", category: "design" },
    { url: "https://www.itsnicethat.com/rss", name: "It's Nice That", category: "design" },

    // Sports
    { url: "https://www.espn.com/espn/rss/news", name: "ESPN", category: "sports" },
    { url: "https://bleacherreport.com/articles/feed", name: "Bleacher Report", category: "sports" },

    // General News & Trends
    { url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", name: "NYT Technology", category: "tech" },
    { url: "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml", name: "NYT Arts", category: "culture" },
    { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", name: "BBC Tech", category: "tech" },
    { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", name: "BBC Entertainment", category: "entertainment" },

    // Food & Lifestyle
    { url: "https://www.eater.com/rss/index.xml", name: "Eater", category: "food" },
    { url: "https://www.refinery29.com/en-us/feed.xml", name: "Refinery29", category: "lifestyle" },

    // Fashion
    { url: "https://www.vogue.com/feed/rss", name: "Vogue", category: "fashion" },
    { url: "https://hypebeast.com/feed", name: "Hypebeast", category: "fashion" },
  ];
}
