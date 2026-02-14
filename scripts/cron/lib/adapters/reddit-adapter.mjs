/**
 * Reddit Platform Adapter for Intelligence signal ingestion.
 *
 * Uses snoowrap (Reddit API wrapper with OAuth2).
 * Pulls /rising + /hot from configurable subreddits.
 * Processes 5 subreddits per cycle, rotating through the full list.
 *
 * Rate limit: self-enforced at 90 req/min (Reddit allows 100).
 *
 * Install: npm install snoowrap (in scripts/cron or root)
 */

import { generateContentHash } from "../signal-dedup.mjs";

// Track rotation position across cycles (in-memory, resets on restart)
let rotationIndex = 0;

// Simple rate limiter: max N requests per minute
const REQUEST_INTERVAL_MS = 700; // ~85 req/min (under 100 limit)
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Fetch signals from Reddit.
 *
 * @param {Object} config
 * @param {string[]} config.subreddits - List of subreddit names
 * @param {number} config.subreddits_per_cycle - How many subreddits to process per cycle
 * @param {number} config.posts_per_feed - Posts to fetch per feed (rising/hot)
 * @param {string} config.client_id
 * @param {string} config.client_secret
 * @param {string} config.username
 * @param {string} config.password
 * @param {string} config.user_agent
 * @param {Object} dependencies
 * @returns {Promise<{signals: Object[], quota_used: number, errors: string[]}>}
 */
export async function fetchSignals(config, dependencies) {
  const result = { signals: [], quota_used: 0, errors: [] };

  // Validate credentials
  if (!config.client_id || !config.client_secret) {
    result.errors.push("Reddit credentials not configured (REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET)");
    return result;
  }

  let snoowrap;
  try {
    snoowrap = (await import("snoowrap")).default;
  } catch {
    result.errors.push("snoowrap not installed. Run: npm install snoowrap");
    return result;
  }

  // Initialize Reddit client
  let reddit;
  try {
    reddit = new snoowrap({
      userAgent: config.user_agent,
      clientId: config.client_id,
      clientSecret: config.client_secret,
      username: config.username,
      password: config.password,
    });
    reddit.config({ requestDelay: REQUEST_INTERVAL_MS, continueAfterRatelimitError: false });
  } catch (err) {
    result.errors.push(`Reddit auth failed: ${err.message}`);
    return result;
  }

  // Select subreddits for this cycle (rotate through list)
  const subreddits = config.subreddits || [];
  const perCycle = config.subreddits_per_cycle || 5;
  const postsPerFeed = config.posts_per_feed || 25;

  const startIdx = rotationIndex % subreddits.length;
  const batch = [];
  for (let i = 0; i < perCycle && i < subreddits.length; i++) {
    batch.push(subreddits[(startIdx + i) % subreddits.length]);
  }
  rotationIndex = (startIdx + perCycle) % subreddits.length;

  // Fetch from each subreddit
  for (const sub of batch) {
    try {
      // Fetch rising posts
      const rising = await fetchSubredditFeed(reddit, sub, "rising", postsPerFeed);
      result.quota_used += 1;
      await sleep(REQUEST_INTERVAL_MS);

      // Fetch hot posts
      const hot = await fetchSubredditFeed(reddit, sub, "hot", postsPerFeed);
      result.quota_used += 1;
      await sleep(REQUEST_INTERVAL_MS);

      // Transform to signal format
      const seen = new Set();
      for (const post of [...rising, ...hot]) {
        // Deduplicate within this batch (same post can appear in rising + hot)
        if (seen.has(post.id)) continue;
        seen.add(post.id);

        const signal = transformRedditPost(post, sub);
        result.signals.push(signal);
      }
    } catch (err) {
      result.errors.push(`r/${sub}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Fetch a specific feed from a subreddit.
 */
async function fetchSubredditFeed(reddit, subredditName, feedType, limit) {
  try {
    const subreddit = reddit.getSubreddit(subredditName);
    if (feedType === "rising") {
      return await subreddit.getRising({ limit });
    } else if (feedType === "hot") {
      return await subreddit.getHot({ limit });
    }
    return [];
  } catch (err) {
    throw new Error(`${feedType} fetch failed: ${err.message}`);
  }
}

/**
 * Transform a Reddit post (snoowrap Submission) into the signal format.
 */
function transformRedditPost(post, subredditName) {
  const title = post.title || "";
  const snippet = (post.selftext || "").slice(0, 500);

  return {
    source: "reddit",
    source_id: `t3_${post.id}`,
    title,
    content_snippet: snippet || null,
    author: post.author?.name || post.author || null,
    subreddit: subredditName,
    channel_id: null,
    upvotes: post.ups || 0,
    comments: post.num_comments || 0,
    views: 0,
    likes: 0,
    content_hash: generateContentHash(title, snippet),
    published_at: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
    source_url: post.id ? `https://reddit.com/r/${subredditName}/comments/${post.id}` : null,
  };
}
