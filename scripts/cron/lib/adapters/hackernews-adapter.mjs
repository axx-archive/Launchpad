/**
 * HackerNews Platform Adapter for Intelligence signal ingestion.
 *
 * Uses the free, public HN Firebase API:
 *   https://hacker-news.firebaseio.com/v0/
 *
 * Endpoints:
 *   /topstories.json   — top 500 story IDs
 *   /newstories.json   — newest 500 story IDs
 *   /beststories.json  — best 500 story IDs
 *   /item/{id}.json    — individual item detail
 *
 * Budget: Zero cost, no auth, no rate limits (be respectful).
 * Strategy: Fetch top 50 stories per cycle, 60-minute cycle interval.
 *           ~1,200 signals/day at peak.
 *
 * No dependencies beyond Node.js built-ins.
 */

import { generateContentHash } from "../signal-dedup.mjs";

const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";
const REQUEST_DELAY_MS = 100; // Small delay between item fetches to be polite

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch signals from HackerNews.
 *
 * @param {Object} config
 * @param {number} [config.stories_per_cycle=50] - How many stories to fetch per cycle
 * @param {string} [config.story_type="topstories"] - Which list: topstories, newstories, beststories
 * @param {number} [config.max_age_hours=24] - Ignore stories older than this
 * @param {Object} dependencies
 * @returns {Promise<{signals: Object[], quota_used: number, errors: string[]}>}
 */
export async function fetchSignals(config, dependencies) {
  const result = { signals: [], quota_used: 0, errors: [] };

  const storiesPerCycle = config.stories_per_cycle || 50;
  const storyType = config.story_type || "topstories";
  const maxAgeHours = config.max_age_hours || 24;
  const cutoffTime = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;

  // 1. Fetch story IDs from the chosen list
  let storyIds;
  try {
    const res = await fetch(`${HN_API_BASE}/${storyType}.json`);
    if (!res.ok) {
      result.errors.push(`HN API error fetching ${storyType}: ${res.status}`);
      return result;
    }
    storyIds = await res.json();
    result.quota_used += 1;
  } catch (err) {
    result.errors.push(`HN API fetch failed: ${err.message}`);
    return result;
  }

  if (!Array.isArray(storyIds) || storyIds.length === 0) {
    return result;
  }

  // Take the top N story IDs
  const batch = storyIds.slice(0, storiesPerCycle);

  // 2. Fetch each story's details
  for (const id of batch) {
    try {
      const item = await fetchItem(id);
      result.quota_used += 1;

      if (!item || item.deleted || item.dead) continue;
      if (!item.title) continue;

      // Skip stories older than cutoff
      if (item.time && item.time < cutoffTime) continue;

      // Only process stories and polls (skip comments, jobs)
      if (item.type !== "story" && item.type !== "poll") continue;

      const signal = transformHNItem(item);
      result.signals.push(signal);

      await sleep(REQUEST_DELAY_MS);
    } catch (err) {
      result.errors.push(`HN item ${id}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Fetch a single HN item by ID.
 */
async function fetchItem(id) {
  const res = await fetch(`${HN_API_BASE}/item/${id}.json`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Transform an HN item into the signal format matching the signals table schema.
 */
function transformHNItem(item) {
  const title = (item.title || "").trim();
  const snippet = (item.text || "").replace(/<[^>]*>/g, "").slice(0, 500).trim() || null;
  const sourceUrl = item.url || `https://news.ycombinator.com/item?id=${item.id}`;
  const publishedAt = item.time
    ? new Date(item.time * 1000).toISOString()
    : null;

  return {
    source: "hackernews",
    source_id: `hn-${item.id}`,
    title,
    content_snippet: snippet,
    author: item.by || null,
    subreddit: null,
    channel_id: null,
    upvotes: item.score || 0,
    comments: item.descendants || 0,
    views: 0,
    likes: 0,
    content_hash: generateContentHash(title, snippet),
    published_at: publishedAt,
    source_url: sourceUrl,
    metadata: {
      hn_id: item.id,
      hn_type: item.type,
      hn_url: item.url || null,
      hn_discussion: `https://news.ycombinator.com/item?id=${item.id}`,
    },
  };
}
