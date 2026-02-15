/**
 * Reddit Platform Adapter for Intelligence signal ingestion.
 *
 * Uses direct fetch + OAuth2 app-only flow (replaces deprecated snoowrap).
 * Pulls /rising + /hot from configurable subreddits.
 * Processes 5 subreddits per cycle, rotating through the full list.
 *
 * Auth: OAuth2 app-only flow (client_credentials grant)
 *   POST https://www.reddit.com/api/v1/access_token
 *   Basic auth with client_id:client_secret
 *   grant_type=client_credentials (or password for script apps)
 *
 * Rate limit: self-enforced at 85 req/min (Reddit allows 100).
 * NSFW filtering: enabled by default (over_18 field check).
 * Retry-After: respects 429 responses.
 *
 * No external dependencies — uses built-in fetch.
 */

import { generateContentHash } from "../signal-dedup.mjs";

// Track rotation position across cycles (in-memory, resets on restart)
let rotationIndex = 0;

// Rate limiting
const REQUEST_INTERVAL_MS = 700; // ~85 req/min (under 100 limit)
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Token cache (in-memory, resets on restart)
let cachedToken = null;
let tokenExpiresAt = 0;

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
 * @param {boolean} [config.allow_nsfw=false] - Whether to include NSFW posts
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

  // Authenticate (get or refresh token)
  let token;
  try {
    token = await getAccessToken(config);
  } catch (err) {
    result.errors.push(`Reddit auth failed: ${err.message}`);
    return result;
  }

  // Select subreddits for this cycle (rotate through list)
  const subreddits = config.subreddits || [];
  const perCycle = config.subreddits_per_cycle || 5;
  const postsPerFeed = config.posts_per_feed || 25;
  const allowNsfw = config.allow_nsfw ?? false;

  if (subreddits.length === 0) {
    result.errors.push("No subreddits configured");
    return result;
  }

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
      const rising = await fetchSubredditFeed(token, config.user_agent, sub, "rising", postsPerFeed);
      result.quota_used += 1;
      await sleep(REQUEST_INTERVAL_MS);

      // Fetch hot posts
      const hot = await fetchSubredditFeed(token, config.user_agent, sub, "hot", postsPerFeed);
      result.quota_used += 1;
      await sleep(REQUEST_INTERVAL_MS);

      // Transform to signal format, deduplicate within batch
      const seen = new Set();
      for (const post of [...rising, ...hot]) {
        if (seen.has(post.data.id)) continue;
        seen.add(post.data.id);

        // NSFW filter
        if (!allowNsfw && post.data.over_18) continue;

        const signal = transformRedditPost(post.data, sub);
        result.signals.push(signal);
      }
    } catch (err) {
      // Handle rate limiting
      if (err.retryAfter) {
        result.errors.push(`r/${sub}: Rate limited — retry after ${err.retryAfter}s`);
        // Wait out the rate limit for remaining subreddits
        await sleep(err.retryAfter * 1000);
      } else if (err.status === 401 || err.status === 403) {
        // Token expired or revoked — try to refresh
        try {
          token = await getAccessToken(config, true);
          result.errors.push(`r/${sub}: Token refreshed after ${err.status}`);
        } catch (refreshErr) {
          result.errors.push(`r/${sub}: Auth failed on refresh: ${refreshErr.message}`);
          break; // Stop processing if we can't authenticate
        }
      } else {
        result.errors.push(`r/${sub}: ${err.message}`);
      }
    }
  }

  return result;
}

/**
 * Get a Reddit OAuth2 access token.
 * Uses password grant for script apps (client_id + client_secret + username + password).
 * Falls back to client_credentials grant if username/password not provided.
 *
 * Caches token in memory and refreshes when expired or forced.
 */
async function getAccessToken(config, forceRefresh = false) {
  const now = Date.now();

  // Return cached token if still valid
  if (!forceRefresh && cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const credentials = Buffer.from(`${config.client_id}:${config.client_secret}`).toString("base64");

  // Use password grant if username/password available (script app flow)
  // Otherwise use client_credentials (app-only, no user context)
  const params = new URLSearchParams();
  if (config.username && config.password) {
    params.set("grant_type", "password");
    params.set("username", config.username);
    params.set("password", config.password);
  } else {
    params.set("grant_type", "client_credentials");
  }

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": config.user_agent || "launchpad-intel/1.0",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OAuth2 token request failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (!data.access_token) {
    throw new Error(`OAuth2 response missing access_token: ${JSON.stringify(data)}`);
  }

  // Cache the token (Reddit tokens typically expire in 3600s)
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 3600) * 1000;

  return cachedToken;
}

/**
 * Fetch a specific feed from a subreddit via Reddit's OAuth API.
 */
async function fetchSubredditFeed(token, userAgent, subredditName, feedType, limit) {
  const url = `https://oauth.reddit.com/r/${encodeURIComponent(subredditName)}/${feedType}.json?limit=${limit}&raw_json=1`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": userAgent || "launchpad-intel/1.0",
    },
  });

  // Handle rate limiting (429 with Retry-After header)
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "60", 10);
    const err = new Error(`Rate limited on r/${subredditName}/${feedType}`);
    err.retryAfter = retryAfter;
    err.status = 429;
    throw err;
  }

  // Handle auth errors
  if (res.status === 401 || res.status === 403) {
    const err = new Error(`Auth error on r/${subredditName}/${feedType}: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Reddit API error: ${res.status} on r/${subredditName}/${feedType}`);
  }

  const data = await res.json();

  // Reddit returns { kind: "Listing", data: { children: [...] } }
  return data?.data?.children || [];
}

/**
 * Transform a Reddit post (API JSON) into the signal format.
 */
function transformRedditPost(post, subredditName) {
  const title = (post.title || "").trim();
  const snippet = (post.selftext || "").slice(0, 500).trim();

  return {
    source: "reddit",
    source_id: `t3_${post.id}`,
    title,
    content_snippet: snippet || null,
    author: post.author || null,
    subreddit: subredditName,
    channel_id: null,
    upvotes: post.ups || 0,
    comments: post.num_comments || 0,
    views: 0,
    likes: 0,
    content_hash: generateContentHash(title, snippet),
    published_at: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
    source_url: post.id ? `https://reddit.com/r/${subredditName}/comments/${post.id}` : null,
    metadata: {
      reddit_id: post.id,
      permalink: post.permalink || null,
      link_flair_text: post.link_flair_text || null,
      is_self: post.is_self ?? null,
      domain: post.domain || null,
      url: post.url || null,
    },
  };
}
