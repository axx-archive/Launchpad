# Intelligence Signal Ingestion — API Requirements Audit

> **Date:** 2026-02-15
> **Author:** Data Architect (Spark Platform Planning)
> **Status:** Draft for team review

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State of Implementation](#current-state-of-implementation)
3. [Source 1: YouTube Data API v3](#source-1-youtube-data-api-v3)
4. [Source 2: Reddit API](#source-2-reddit-api)
5. [Source 3: X/Twitter API v2](#source-3-xtwitter-api-v2)
6. [Source 4: RSS Feeds](#source-4-rss-feeds)
7. [Additional Sources Worth Considering](#additional-sources-worth-considering)
8. [Environment Variables Summary](#environment-variables-summary)
9. [Cost Projection](#cost-projection)
10. [Recommendations](#recommendations)

---

## Executive Summary

The Intelligence department's signal ingestion pipeline currently has **3 adapters implemented** (YouTube, Reddit, RSS) and **1 missing** (X/Twitter). The database schema already supports all 4 sources via the `signals` table CHECK constraint: `source IN ('reddit', 'youtube', 'x', 'rss')`.

**Key findings:**

| Source | Adapter Status | Monthly Cost | Complexity | Risk |
|--------|---------------|-------------|------------|------|
| YouTube | Implemented | $0 (free tier) | Low | Low — 10K units/day is generous |
| Reddit | Implemented | $0 (free tier*) | Medium | **HIGH — pre-approval required since Nov 2025** |
| X/Twitter | **NOT implemented** | $200/mo minimum | High | **HIGH — expensive, restrictive TOS** |
| RSS | Implemented | $0 | Low | Low — no API needed |

**Critical issue:** Reddit killed self-service API keys in November 2025. All new OAuth tokens now require manual pre-approval. The existing adapter uses `snoowrap` (last updated 5 years ago) with password-based OAuth, which may not work under the new approval regime. This needs immediate investigation.

---

## Current State of Implementation

### Existing Architecture

```
signal-ingester.mjs (PM2 long-running process)
├── Tick loop (60s interval)
├── Source schedules (reddit: 90min, youtube: 120min, rss: 240min)
├── Quota tracking via api_quota_tracking table
├── Dynamic adapter loading: ./lib/adapters/{source}-adapter.mjs
└── Auto-cluster queuing when unclustered > 200
```

### Adapter Interface

All adapters export `fetchSignals(config, dependencies)` returning:
```javascript
{ signals: [], quota_used: 0, errors: [] }
```

### Signal Object Shape (from adapter-interface.md)

```javascript
{
  source: "reddit" | "youtube" | "x" | "rss",
  source_id: "platform_unique_id",
  title: "Signal title",
  content_snippet: "First ~500 chars",
  author: "username or channel",
  subreddit: null,        // Reddit only
  channel_id: null,       // YouTube only
  upvotes: 0, comments: 0, views: 0, likes: 0,
  content_hash: "sha256",
  published_at: "ISO8601",
  source_url: "https://..."
}
```

### Database Schema (signals table)

The `signals` table includes: `source`, `source_id` (unique per source), `title`, `content_snippet`, `author`, `subreddit`, `channel_id`, `upvotes`, `comments`, `views`, `likes`, `engagement_delta` (JSONB), `pull_count`, `is_clustered`, `content_hash`, `ingested_at`, `published_at` (not in migration — needs adding), `source_url` (not in migration — needs adding).

**Schema gap:** The adapter interface returns `published_at` and `source_url` fields, but the `signals` table migration (`20260215_intelligence_core.sql`) does not include these columns. A migration is needed to add them.

### Quota Tracker

- YouTube: daily period (midnight-to-midnight UTC), 10K unit default limit
- Reddit: hourly period, 6K unit default limit (100 req/min × 60)
- Hard stop at 95% quota usage
- Tracking persisted in `api_quota_tracking` table

---

## Source 1: YouTube Data API v3

### API Details

| Field | Value |
|-------|-------|
| **API Name** | YouTube Data API v3 |
| **Base URL** | `https://www.googleapis.com/youtube/v3/` |
| **Docs** | https://developers.google.com/youtube/v3 |
| **Auth Method** | API Key (for read-only public data) |
| **Required Scopes** | None (API key auth has no scopes) |

### Rate Limits & Quotas

| Tier | Daily Quota | Cost |
|------|------------|------|
| Default (free) | 10,000 units/day | $0 |
| Increased (on request) | Varies | $0 (but requires justification + compliance audit) |

**Quota costs per operation:**

| Operation | Units | Notes |
|-----------|-------|-------|
| `videos.list` (chart=mostPopular) | 1 | Trending videos |
| `videos.list` (id=...) | 1 | Video details (up to 50 per call) |
| `search.list` | 100 | **Expensive** — keyword search |
| `commentThreads.list` | 1 | Top-level comments |
| `channels.list` | 1 | Channel metadata |

### Current Budget Strategy (from youtube-adapter.mjs)

```
Trending (videos.list chart=mostPopular): 1 unit × 12 cycles/day = 12 units
Search (search.list): 100 units × 10 keywords × 6 cycles/day = 6,000 units
Video details (videos.list id): ~500 units/day
────────────────────────────────────────────
Total: ~6,500 units/day (3,500 buffer)
Hard stop: 9,500 units
```

### Data Fields Available

- `snippet`: title, description, channelTitle, channelId, publishedAt, thumbnails, tags, categoryId
- `statistics`: viewCount, likeCount, commentCount, favoriteCount
- `contentDetails`: duration, dimension, definition
- `topicDetails`: topicCategories (Wikipedia URLs)

### Legal/TOS Considerations

- Must display YouTube branding when showing data
- Cannot store data indefinitely — must refresh within 30 days
- Cannot use data to train AI/ML models
- Must comply with YouTube API Services Terms of Service
- Quota audit possible if usage patterns look unusual

### Recommended Node.js Library

**`googleapis`** (official Google client) — already used in youtube-adapter.mjs

```bash
npm install googleapis
```

### Gotchas

1. **search.list is expensive** (100 units) — the adapter already optimizes by fetching `id` part only, then batch-fetching details
2. **Quota resets at midnight Pacific Time**, not UTC (despite Google's docs being ambiguous)
3. **Quota increase requests** require a compliance audit and can take weeks
4. **No streaming/webhook** — polling only
5. **Comments API** is not currently used but could add sentiment signal

### Assessment: LOW RISK, WELL IMPLEMENTED

The YouTube adapter is solid. The quota budget strategy is conservative with 35% buffer. No changes needed for Phase 1.

---

## Source 2: Reddit API

### API Details

| Field | Value |
|-------|-------|
| **API Name** | Reddit Data API |
| **Base URL** | `https://oauth.reddit.com/` |
| **Docs** | https://www.reddit.com/dev/api/ |
| **Auth Method** | OAuth2 (script app type — password grant) |
| **Required Scopes** | `read` (for fetching posts), `identity` (optional) |

### Rate Limits & Quotas

| Tier | Rate Limit | Monthly Limit | Cost |
|------|-----------|--------------|------|
| Free (non-commercial) | 100 req/min (OAuth) | ~10,000/month* | $0 |
| Free (unauthenticated) | 10 req/min | N/A | $0 |
| Commercial | Custom | Custom | Negotiated |

*Reddit's free tier monthly limit has been reported as low as 10,000 total requests/month in recent reports, down from previously unlimited. This is a significant change from 2024.

### Authentication Setup

Reddit script-type OAuth requires:
1. Create an app at https://www.reddit.com/prefs/apps
2. App type: "script" (for server-to-server, no user consent flow)
3. Credentials: `client_id`, `client_secret`, `username`, `password`

### Current Implementation (reddit-adapter.mjs)

- Uses `snoowrap` with password-based OAuth
- Fetches `/rising` and `/hot` from configurable subreddits
- 5 subreddits per cycle, rotating through 28 total
- Self-enforced rate limit: 700ms between requests (~85 req/min)
- Deduplication within batch (same post in rising + hot)

### Data Fields Available

- `title`, `selftext` (post body), `author`, `subreddit`
- `ups` (upvotes), `num_comments`, `created_utc`
- `url` (for link posts), `permalink`
- `over_18` (NSFW flag), `spoiler`
- `link_flair_text` (post category)

### Legal/TOS Considerations

**CRITICAL CHANGES (November 2025):**

1. **Pre-approval now required.** Reddit ended self-service API key creation. All new OAuth tokens require manual review and approval via Reddit's Developer Support form.
2. **Commercial use requires a contract.** If Spark is a commercial product (it is), Reddit may require paid API access.
3. **Responsible Builder Policy** must be followed — no scraping beyond API, no circumventing rate limits.
4. **Data usage restrictions:** Cannot use Reddit data to train AI/ML models. Cannot sell or sublicense Reddit data.
5. **User content attribution** required when displaying Reddit content.

### Recommended Node.js Library

**Current: `snoowrap`** — Last published 5 years ago (v1.23.0). Still functional but unmaintained.

**Alternative: Direct OAuth2 + fetch** — Given snoowrap's age and Reddit's API changes, consider building a lightweight adapter using native `fetch` with OAuth2 token management. The Reddit API is simple enough that a wrapper library isn't strictly necessary.

**Alternative: `reddit-wrapper`** or manual implementation using the REST API directly.

### Gotchas

1. **Pre-approval blocker:** The existing credentials may stop working if Reddit revokes legacy tokens. Need to verify current token status immediately.
2. **snoowrap uses password grant** — this OAuth flow is deprecated by many platforms. Reddit may phase it out.
3. **Rate limit headers:** Reddit returns `X-Ratelimit-Used`, `X-Ratelimit-Remaining`, `X-Ratelimit-Reset` headers. snoowrap reads these automatically, but a custom implementation should too.
4. **Subreddit access:** Some subreddits may be restricted or quarantined. The adapter should handle 403/404 gracefully (it currently does via try/catch).
5. **NSFW content:** No filtering currently. Consider adding `over_18` filter.

### Assessment: HIGH RISK

The Reddit adapter works today but faces existential risk from the November 2025 API access changes. **Action items:**

1. **Immediate:** Verify that existing Reddit credentials still work
2. **Immediate:** Submit a pre-approval application for Spark's use case via Reddit's Developer Support form
3. **Short-term:** Prepare fallback to scrape Reddit's public JSON endpoints (`/r/{sub}/hot.json`) if API access is denied — but note this may violate TOS
4. **Medium-term:** Consider replacing snoowrap with a direct fetch-based implementation

---

## Source 3: X/Twitter API v2

### API Details

| Field | Value |
|-------|-------|
| **API Name** | X API v2 |
| **Base URL** | `https://api.x.com/2/` |
| **Docs** | https://docs.x.com/x-api |
| **Auth Method** | OAuth 2.0 Bearer Token (app-only) or OAuth 2.0 PKCE (user context) |
| **Required Scopes** | `tweet.read`, `users.read` (for app-only: Bearer token, no scopes needed) |

### Pricing Tiers

| Tier | Monthly Cost | Tweet Read Quota | Key Endpoints |
|------|-------------|-----------------|---------------|
| **Free** | $0 | **0 reads** (write-only: 1,500 tweets/mo) | Post tweets only |
| **Basic** | $200/mo ($175/mo annual) | 10,000 tweets/mo | Search, user lookup, timeline |
| **Pro** | $5,000/mo | 1,000,000 tweets/mo | Full search, streaming, analytics |
| **Enterprise** | Custom ($10K+/mo) | Unlimited | Full archive, compliance streams |

**The Free tier cannot read tweets.** For Intelligence signal ingestion, **Basic ($200/mo) is the minimum viable tier.**

### Rate Limits (Basic Tier)

| Endpoint | Rate Limit | Notes |
|----------|-----------|-------|
| `GET /2/tweets/search/recent` | 60 req/15min | Recent tweets (last 7 days) |
| `GET /2/tweets/:id` | 300 req/15min | Single tweet lookup |
| `GET /2/users/:id/tweets` | 900 req/15min per user | User timeline |
| `GET /2/tweets/counts/recent` | 300 req/15min | Tweet volume counts |

**Monthly quota is the real constraint:** 10,000 tweets/month across ALL read endpoints. Each tweet returned by search or lookup counts against this quota.

### Endpoint Details for Intelligence

**Primary: Recent Search (`/2/tweets/search/recent`)**
- Search tweets from the last 7 days
- Query operators: keyword, hashtag, mention, from/to user, language, is:retweet, has:links, etc.
- Returns: tweet text, author_id, created_at, public_metrics (retweets, likes, replies, quotes)
- Pagination: `next_token` for subsequent pages
- Expansions: author details, referenced tweets, media

**Secondary: Tweet Counts (`/2/tweets/counts/recent`)**
- Returns volume of tweets matching a query over time (no actual tweet content)
- Useful for velocity tracking without consuming tweet quota
- 1 request = time-bucketed counts, NOT individual tweets

**Optional: Filtered Stream (`/2/tweets/search/stream`)**
- Real-time streaming of tweets matching rules
- Basic tier: 25 stream rules, 1 concurrent connection
- Pro tier: 1,000 rules, 2 concurrent connections
- **Each streamed tweet counts against monthly quota**

### Data Fields Available

- `text` — tweet content (up to 280 chars, or 4,000 for long-form)
- `author_id` — author's user ID (expand for username, name, followers)
- `created_at` — ISO 8601 timestamp
- `public_metrics` — `retweet_count`, `reply_count`, `like_count`, `quote_count`, `impression_count`
- `entities` — hashtags, mentions, urls, cashtags
- `context_annotations` — Twitter's own topic/entity classification
- `referenced_tweets` — retweet/quote/reply relationships
- `lang` — BCP47 language tag
- `geo` — location (if available)

### Legal/TOS Considerations

**SERIOUS RESTRICTIONS:**

1. **No AI/ML training.** "You may not use X Content to fine-tune or train a foundation or frontier model" — Grok is the only exception.
2. **Data storage limits.** Cannot store tweets indefinitely. Must delete tweets that are deleted on X within 24 hours.
3. **Display requirements.** Must show tweets in their original format with attribution.
4. **No benchmarking.** Cannot use X data to measure X's availability or performance for competitive purposes.
5. **Distribution limits.** Cannot distribute more than 1,500,000 Tweet IDs to any entity within 30 days.
6. **No commercial resale.** Cannot sublicense or sell X data.
7. **Content moderation.** Must have a mechanism to handle content flagged by X.

**For Spark Intelligence:** Using X data for internal trend analysis (not displaying raw tweets, not training models, not reselling) should be permissible under the Developer Agreement, but the TOS is aggressive and X has historically enforced it inconsistently. The "no benchmarking for competitive purposes" clause is vague enough to be concerning.

### Recommended Node.js Library

**`twitter-api-v2`** — Actively maintained (v1.29.0, published ~1 month ago), 238 dependents, officially recommended by X Developer Platform.

```bash
npm install twitter-api-v2
```

Features:
- Full v2 endpoint coverage
- OAuth 1.0a, OAuth 2.0, Bearer token auth
- Stream support
- Built-in rate limit handling
- TypeScript types

### Proposed Adapter Design

```javascript
// x-adapter.mjs — Proposed implementation approach

// Budget strategy for Basic tier (10,000 tweets/month):
// - 4 search queries per cycle × 25 results = 100 tweets
// - 2 cycles per day × 30 days = 6,000 tweets/month
// - Trending topic monitoring: ~2,000 tweets/month
// - Buffer: 2,000 tweets/month
//
// Use tweets/counts endpoint (doesn't consume tweet quota)
// for velocity tracking between search cycles.
```

### Gotchas

1. **Monthly quota is tiny on Basic.** 10,000 tweets/month means you must be extremely selective about what you search for. No broad monitoring possible.
2. **No free read access.** Unlike YouTube and Reddit, there's no free tier for reading.
3. **Filtered Stream counts against quota.** Don't leave a stream running — it will burn through 10K tweets in hours.
4. **Rate limit != quota.** You can make 60 search requests per 15 minutes, but you'll hit the 10K tweet monthly cap long before hitting rate limits.
5. **7-day search window on Basic.** Only recent tweets. Full archive search requires Pro ($5K/mo) or Enterprise.
6. **Tweet deletion compliance.** Must track and delete tweets that users delete on X. This requires periodic re-checking.
7. **Context annotations** are extremely valuable for entity extraction (X does it for you) — make sure to request the `tweet.fields=context_annotations` expansion.

### Assessment: HIGH COST, MODERATE VALUE

X/Twitter provides unique real-time signal value (breaking trends, cultural moments), but the cost-to-data ratio is poor on the Basic tier. **Recommendation:**

- **Phase 1:** Skip X integration. Use RSS feeds from X-aggregator sites (e.g., Nitter mirrors if available, social media news outlets) as a proxy.
- **Phase 2:** If Intelligence proves valuable, add Basic tier ($200/mo) with very targeted keyword searches.
- **Alternative:** Investigate the new pay-per-credit model (in beta as of Dec 2025) which may be more cost-effective for low-volume use cases.
- **Alternative:** Third-party X data providers (twitterapi.io, etc.) offer cheaper access but add another vendor dependency and TOS risk.

---

## Source 4: RSS Feeds

### API Details

| Field | Value |
|-------|-------|
| **API Name** | N/A — RSS/Atom is a protocol, not an API |
| **Base URL** | Per-feed (see default feed list) |
| **Docs** | https://www.rssboard.org/rss-specification |
| **Auth Method** | None (public feeds) |
| **Required Scopes** | N/A |

### Rate Limits & Quotas

| Constraint | Value |
|-----------|-------|
| Rate limit | None (per-feed, be polite — 500ms delay implemented) |
| Monthly cost | $0 |
| Quota | Unlimited |

### Current Implementation (rss-adapter.mjs)

- Uses `rss-parser` npm package
- 32 curated feeds across tech, business, culture, entertainment, social media, design, sports, fashion, lifestyle
- 25 feeds per cycle, rotating through full list
- 15 items per feed, max 7-day age filter
- SHA-256 content hash for cross-source dedup
- 500ms delay between fetches

### Data Fields Available

- `title`, `contentSnippet` / `content` / `summary` / `description`
- `creator` / `author`
- `pubDate` / `isoDate` (original publish time)
- `link` (source URL)
- `guid` (unique identifier)
- `categories` (topic tags, feed-dependent)
- `enclosure` (media attachments)

### Legal/TOS Considerations

- RSS is designed for syndication — feeds are explicitly public
- Respect `robots.txt` and feed-specific terms
- Some feeds may have rate limiting or IP blocking for aggressive crawling
- Content attribution required when displaying
- `<copyright>` element in feed should be respected

### Recommended Node.js Library

**`rss-parser`** — Already in use. Lightweight, well-maintained, handles RSS 2.0 and Atom.

```bash
npm install rss-parser
```

### Feed Curation Strategy

The current 32 feeds are a solid starting point. Consider expanding to ~50-75 feeds with:

**Missing categories to add:**
- **AI/ML:** The Gradient, Import AI, The Batch (Andrew Ng)
- **Newsletter aggregators:** Substack trending, Beehiiv trending
- **Finance:** Bloomberg Technology, Reuters Tech
- **Gaming/Youth culture:** Kotaku, Polygon, IGN
- **Podcasts RSS:** NPR, This American Life (as cultural signal)

### Assessment: LOW RISK, WELL IMPLEMENTED

RSS is the most reliable and cost-effective signal source. The adapter is solid. Only improvement needed is expanding the feed list and potentially adding categories to the signal metadata.

---

## Additional Sources Worth Considering

### Tier 1: High Value, Easy Integration

#### Hacker News API

| Field | Value |
|-------|-------|
| **API** | Official HN API (Firebase-based) |
| **Base URL** | `https://hacker-news.firebaseio.com/v0/` |
| **Docs** | https://github.com/HackerNews/API |
| **Auth** | None |
| **Rate Limits** | No official limits (be respectful) |
| **Cost** | $0 |
| **Value** | Tech/startup trends, early signal detection |

**Key endpoints:**
- `/v0/topstories.json` — Top 500 story IDs
- `/v0/newstories.json` — New stories
- `/v0/beststories.json` — Best stories
- `/v0/item/{id}.json` — Story/comment details (score, title, url, kids)
- `/v0/maxitem.json` — Latest item ID

**Recommendation: IMPLEMENT IN PHASE 1.** Zero cost, no auth, trivial adapter. Excellent signal source for tech/startup trends. Would take ~2 hours to build adapter.

**Node.js library:** None needed — simple `fetch()` to Firebase REST endpoints.

---

#### Google Trends API (Alpha)

| Field | Value |
|-------|-------|
| **API** | Google Trends API (Alpha — launched July 2025) |
| **Base URL** | TBD (alpha access) |
| **Docs** | https://developers.google.com/search/apis/trends |
| **Auth** | Google Cloud OAuth2 |
| **Rate Limits** | Unknown (alpha) — expected to be tight |
| **Cost** | Unknown (alpha) — likely free tier available |
| **Value** | **Extremely high** — direct search interest data |

**Status:** Limited alpha, application required. Data covers rolling 5 years, grouped by day/week/month/year, includes regional breakdowns. Freshness ~48 hours.

**Recommendation: APPLY FOR ALPHA ACCESS NOW.** Even if we can't use it in Phase 1, getting in the queue is free. Google Trends data would be the highest-signal source for cultural trend detection.

**Fallback:** `pytrends` (Python, unofficial) or SerpAPI's Google Trends endpoint ($50/mo for 5,000 searches).

---

### Tier 2: Medium Value, Moderate Effort

#### Product Hunt API

| Field | Value |
|-------|-------|
| **API** | Product Hunt API v2 (GraphQL) |
| **Base URL** | `https://api.producthunt.com/v2/api/graphql` |
| **Docs** | https://api.producthunt.com/v2/docs |
| **Auth** | OAuth2 (client credentials) |
| **Rate Limits** | 6,250 complexity points / 15 minutes |
| **Cost** | $0 (non-commercial), negotiated (commercial) |
| **Value** | Product/startup launch trends, tech ecosystem signal |

**Recommendation: PHASE 2.** Useful for tracking product launches and tech ecosystem, but limited to product-centric signals. Commercial use requires contacting PH.

---

#### LinkedIn API

| Field | Value |
|-------|-------|
| **API** | LinkedIn Marketing API / Community Management API |
| **Docs** | https://learn.microsoft.com/en-us/linkedin/ |
| **Auth** | OAuth 2.0 (3-legged) |
| **Rate Limits** | Varies by endpoint and partnership level |
| **Cost** | Free for basic access, partnership required for bulk data |
| **Value** | Professional/business trends, hiring signals, industry movement |

**Recommendation: PHASE 3 or SKIP.** LinkedIn's API is extremely restrictive. Most useful data (trending posts, article engagement) requires partnership-level access. Not worth the effort for Phase 1-2.

---

#### Crunchbase API

| Field | Value |
|-------|-------|
| **API** | Crunchbase Data API |
| **Base URL** | `https://api.crunchbase.com/api/v4/` |
| **Docs** | https://data.crunchbase.com/docs |
| **Auth** | API Key |
| **Rate Limits** | 200 req/min |
| **Cost** | $0 (Basic), $499/mo (Pro), $2,999/mo (Enterprise) |
| **Value** | Funding rounds, company data, M&A signals |

**Recommendation: PHASE 2-3.** The free tier is very limited. Pro at $499/mo is expensive but provides funding round data that's highly relevant for Intelligence (tracking which companies are raising, sector trends). Consider only if Intelligence department proves high-value to users.

---

### Tier 3: Nice-to-Have

| Source | API | Cost | Value for Intelligence |
|--------|-----|------|----------------------|
| **TechCrunch** | RSS (already included) | $0 | Already covered |
| **Mastodon/Fediverse** | ActivityPub / Mastodon API | $0 | Niche, growing — low priority |
| **Bluesky** | AT Protocol API | $0 | Growing platform, easy API — worth watching |
| **Spotify Charts** | No public API | N/A | Would need scraping — skip |
| **TikTok** | Research API (academics only) | $0 | Restricted to researchers — skip |
| **Twitch** | Twitch API | $0 | Gaming/streaming trends — niche |
| **GitHub Trending** | No API (scrape or RSS) | $0 | Dev ecosystem signals — low priority |

---

## Environment Variables Summary

### Currently Used

```env
# YouTube (youtube-adapter.mjs)
YOUTUBE_API_KEY=              # Google Cloud API key
YOUTUBE_DAILY_QUOTA=10000     # Optional override (default: 10000)

# Reddit (reddit-adapter.mjs)
REDDIT_CLIENT_ID=             # Reddit OAuth app client ID
REDDIT_CLIENT_SECRET=         # Reddit OAuth app client secret
REDDIT_USERNAME=              # Reddit account username
REDDIT_PASSWORD=              # Reddit account password
REDDIT_USER_AGENT=            # User agent string (default: launchpad-intel/1.0)
```

### Needed for X/Twitter (if implemented)

```env
# X/Twitter (x-adapter.mjs)
X_BEARER_TOKEN=               # App-only Bearer token
X_API_KEY=                    # OAuth 2.0 client ID (if using user-context auth)
X_API_SECRET=                 # OAuth 2.0 client secret
X_MONTHLY_TWEET_QUOTA=10000   # Basic tier default
```

### Needed for Hacker News (recommended)

```env
# No env vars needed — public API, no auth
```

---

## Cost Projection

### Phase 1 (Current + HN)

| Source | Monthly Cost | Annual Cost |
|--------|-------------|------------|
| YouTube | $0 | $0 |
| Reddit | $0* | $0* |
| RSS | $0 | $0 |
| Hacker News | $0 | $0 |
| **Total** | **$0** | **$0** |

*Reddit may require paid access if pre-approval classifies Spark as commercial.

### Phase 2 (Add X/Twitter Basic)

| Source | Monthly Cost | Annual Cost |
|--------|-------------|------------|
| YouTube | $0 | $0 |
| Reddit | $0–??? | $0–??? |
| RSS | $0 | $0 |
| Hacker News | $0 | $0 |
| X/Twitter Basic | $200 | $2,100 (annual discount) |
| **Total** | **$200** | **$2,100** |

### Phase 3 (Full Intelligence Suite)

| Source | Monthly Cost | Annual Cost |
|--------|-------------|------------|
| All Phase 2 sources | $200 | $2,100 |
| Google Trends | TBD | TBD |
| Product Hunt | $0–negotiated | TBD |
| Crunchbase Pro | $499 | $5,988 |
| **Total** | **$699+** | **$8,088+** |

---

## Recommendations

### Immediate (This Week)

1. **Verify Reddit credentials.** Test that existing `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` still work. If they fail, submit pre-approval application immediately.
2. **Add `published_at` and `source_url` columns to `signals` table.** The adapters return these fields but the schema doesn't have them.
3. **Build HackerNews adapter.** Zero cost, zero auth, ~2 hours of work. Add to `SOURCE_SCHEDULES` at 60-minute intervals.

### Short-Term (Phase 1, Next 2 Weeks)

4. **Replace snoowrap with direct fetch.** The library is 5 years unmaintained. A lightweight OAuth2 + fetch wrapper is more reliable and maintainable.
5. **Add NSFW/content filtering** to Reddit adapter (check `over_18` field).
6. **Expand RSS feed list** to 50+ feeds (add AI/ML, gaming, finance categories).
7. **Apply for Google Trends API alpha** access.

### Medium-Term (Phase 2, Month 2-3)

8. **Evaluate X/Twitter.** If Intelligence proves valuable to users, add Basic tier. Design the adapter with extreme quota consciousness (use counts endpoint for velocity, minimize actual tweet fetches).
9. **Add Product Hunt adapter** for product/startup launch signals.
10. **Build admin UI** for managing feed lists, keywords, and subreddits (currently hardcoded — CLAUDE.md mentions "will move to DB in Phase 7").

### Long-Term (Phase 3)

11. **Evaluate Crunchbase** for funding/M&A intelligence.
12. **Monitor Bluesky/Mastodon** ecosystem growth — may become relevant.
13. **Consider Google Trends** once alpha opens up.

### Architecture Note

The current adapter pattern is well-designed and extensible. Adding new sources requires only:
1. Create `{source}-adapter.mjs` with `fetchSignals()` export
2. Add source to `SOURCE_SCHEDULES` in `signal-ingester.mjs`
3. Add source to `getSourceConfig()` function
4. Update the `signals.source` CHECK constraint in the database

No changes to the ingestion loop, quota tracker, or clustering pipeline are needed.
