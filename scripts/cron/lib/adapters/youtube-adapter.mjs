/**
 * YouTube Platform Adapter for Intelligence signal ingestion.
 *
 * Uses googleapis (YouTube Data API v3) with API key auth.
 *
 * Quota budget strategy (10,000 units/day):
 * - videos.list(chart=mostPopular): 1 unit, every 2h → 12 units/day
 * - search.list(q=keyword): 100 units each, 10 keywords/cycle, 6 cycles/day → 6,000/day
 * - videos.list(id=...) for velocity re-checks: ~500 units/day
 * - Total: ~6,500 units/day (3,500 buffer)
 * - Hard stop at 9,500 units
 *
 * Install: npm install googleapis (in scripts/cron or root)
 */

import { generateContentHash } from "../signal-dedup.mjs";

/**
 * Fetch signals from YouTube.
 *
 * @param {Object} config
 * @param {string} config.api_key - YouTube Data API key
 * @param {string[]} config.keywords - Search keywords
 * @param {number} config.keywords_per_cycle - Keywords to search per cycle
 * @param {number} config.daily_quota - Total daily quota units
 * @param {number} config.hard_stop_units - Stop fetching at this usage level
 * @param {Object} dependencies
 * @returns {Promise<{signals: Object[], quota_used: number, errors: string[]}>}
 */
export async function fetchSignals(config, dependencies) {
  const result = { signals: [], quota_used: 0, errors: [] };

  if (!config.api_key) {
    result.errors.push("YouTube API key not configured (YOUTUBE_API_KEY)");
    return result;
  }

  let google;
  try {
    google = (await import("googleapis")).google;
  } catch {
    result.errors.push("googleapis not installed. Run: npm install googleapis");
    return result;
  }

  const youtube = google.youtube({ version: "v3", auth: config.api_key });
  const hardStop = config.hard_stop_units || 9500;

  // Check current quota before starting
  const quotaCheck = await dependencies.checkQuota(100);
  if (!quotaCheck.allowed) {
    result.errors.push(`YouTube quota exhausted: ${quotaCheck.used}/${quotaCheck.limit}`);
    return result;
  }

  // 1. Fetch trending/most popular videos (1 unit)
  try {
    const trending = await fetchTrending(youtube);
    result.quota_used += 1;

    for (const video of trending) {
      result.signals.push(transformYouTubeVideo(video));
    }
  } catch (err) {
    result.errors.push(`Trending fetch failed: ${err.message}`);
  }

  // 2. Search by keywords (100 units per search)
  const keywords = config.keywords || [];
  const perCycle = config.keywords_per_cycle || 10;
  const searchKeywords = keywords.slice(0, perCycle);

  for (const keyword of searchKeywords) {
    // Check if we're approaching hard stop
    const currentQuota = await dependencies.checkQuota(100);
    if (currentQuota.used + result.quota_used + 100 >= hardStop) {
      result.errors.push(`Approaching hard stop (${currentQuota.used + result.quota_used}/${hardStop}), stopping searches`);
      break;
    }

    try {
      const searchResults = await searchVideos(youtube, keyword);
      result.quota_used += 100;

      // Get full video details for search results (1 unit per 50 videos)
      if (searchResults.length > 0) {
        const videoIds = searchResults.map(v => v.id?.videoId).filter(Boolean);
        if (videoIds.length > 0) {
          const details = await fetchVideoDetails(youtube, videoIds);
          result.quota_used += 1;

          for (const video of details) {
            result.signals.push(transformYouTubeVideo(video));
          }
        }
      }
    } catch (err) {
      result.errors.push(`Search "${keyword}" failed: ${err.message}`);
    }
  }

  return result;
}

/**
 * Fetch trending/most popular videos.
 * Cost: 1 unit (videos.list with chart parameter)
 */
async function fetchTrending(youtube) {
  try {
    const response = await youtube.videos.list({
      part: "snippet,statistics",
      chart: "mostPopular",
      regionCode: "US",
      maxResults: 25,
    });
    return response.data.items || [];
  } catch (err) {
    throw new Error(`videos.list(mostPopular) failed: ${err.message}`);
  }
}

/**
 * Search for videos by keyword.
 * Cost: 100 units (search.list)
 */
async function searchVideos(youtube, keyword) {
  try {
    const response = await youtube.search.list({
      part: "id",
      q: keyword,
      type: "video",
      order: "date",
      publishedAfter: getRecentDate(7), // Last 7 days
      maxResults: 25,
    });
    return response.data.items || [];
  } catch (err) {
    throw new Error(`search.list("${keyword}") failed: ${err.message}`);
  }
}

/**
 * Fetch full video details by IDs.
 * Cost: 1 unit per 50 videos (videos.list with id parameter)
 */
async function fetchVideoDetails(youtube, videoIds) {
  try {
    const response = await youtube.videos.list({
      part: "snippet,statistics",
      id: videoIds.join(","),
    });
    return response.data.items || [];
  } catch (err) {
    throw new Error(`videos.list(id) failed: ${err.message}`);
  }
}

/**
 * Transform a YouTube video into the signal format.
 */
function transformYouTubeVideo(video) {
  const snippet = video.snippet || {};
  const stats = video.statistics || {};
  const title = snippet.title || "";
  const description = (snippet.description || "").slice(0, 500);

  const videoId = video.id?.videoId || video.id || "";

  return {
    source: "youtube",
    source_id: videoId,
    title,
    content_snippet: description || null,
    author: snippet.channelTitle || null,
    subreddit: null,
    channel_id: snippet.channelId || null,
    upvotes: 0,
    comments: parseInt(stats.commentCount || "0", 10),
    views: parseInt(stats.viewCount || "0", 10),
    likes: parseInt(stats.likeCount || "0", 10),
    content_hash: generateContentHash(title, description),
    published_at: snippet.publishedAt || null,
    source_url: videoId ? `https://youtube.com/watch?v=${videoId}` : null,
  };
}

/**
 * Get an ISO date string for N days ago (for publishedAfter filter).
 */
function getRecentDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}
