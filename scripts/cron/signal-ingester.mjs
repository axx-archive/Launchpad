#!/usr/bin/env node

/**
 * Signal Ingester — Intelligence department signal collection worker.
 *
 * Long-running PM2 process that polls on an internal schedule.
 * Calls platform adapters (Reddit, YouTube) when due, upserts signals
 * via the upsert_signal() RPC, and queues auto-cluster jobs when
 * unclustered signals exceed a threshold.
 *
 * Architecture:
 * - Internal scheduler checks SOURCE_SCHEDULES every 60 seconds
 * - Each source has its own cycle interval and adapter
 * - Quota tracked via api_quota_tracking table
 * - Department: intelligence (all logs tagged)
 *
 * Safety:
 * - Per-source quota limits (YouTube 10K units/day, Reddit 100 req/min)
 * - Hard stop at 95% quota usage
 * - Graceful error handling per source (one failing doesn't block others)
 * - Circuit breaker: respects AUTOMATION_ENABLED env var
 */

import { dbGet, dbPost, dbRpc, logAutomation, isAutomationEnabled } from "./lib/supabase.mjs";
import { checkQuota, consumeQuota, getQuotaStatus } from "./lib/quota-tracker.mjs";
import { generateContentHash } from "./lib/signal-dedup.mjs";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TICK_INTERVAL_MS = 60 * 1000; // Check schedule every 60 seconds

// Minimum interval between runs for each source (in minutes)
const SOURCE_SCHEDULES = {
  reddit: {
    interval_minutes: 90,
    enabled: true,
  },
  youtube: {
    interval_minutes: 120,
    enabled: true,
  },
  rss: {
    interval_minutes: 240, // 4 hours
    enabled: true,
  },
  hackernews: {
    interval_minutes: 60,
    enabled: true,
  },
};

// Threshold: when unclustered signals exceed this, queue an auto-cluster job
const UNCLUSTERED_THRESHOLD = 200;

// Track last run times (in-memory, reset on restart)
const lastRunTimes = {};

// ---------------------------------------------------------------------------
// Core Loop
// ---------------------------------------------------------------------------

async function tick() {
  if (!isAutomationEnabled()) return;

  const now = Date.now();
  const results = {
    timestamp: new Date().toISOString(),
    sources_checked: [],
    signals_ingested: 0,
    errors: [],
  };

  for (const [source, schedule] of Object.entries(SOURCE_SCHEDULES)) {
    if (!schedule.enabled) continue;

    const lastRun = lastRunTimes[source] || 0;
    const elapsed = (now - lastRun) / (1000 * 60); // minutes

    if (elapsed < schedule.interval_minutes) continue;

    // Time to run this source
    try {
      const result = await ingestSource(source);
      lastRunTimes[source] = now;

      results.sources_checked.push({
        source,
        signals: result.signals_count,
        quota_used: result.quota_used,
        errors: result.errors,
      });
      results.signals_ingested += result.signals_count;

      await logAutomation("signal-ingestion-cycle", {
        source,
        signals_count: result.signals_count,
        quota_used: result.quota_used,
        errors: result.errors,
        department: "intelligence",
      }, null);
    } catch (err) {
      results.errors.push({ source, error: err.message });
      console.error(JSON.stringify({
        error: "ingestion-source-failed",
        source,
        message: err.message,
      }));

      await logAutomation("signal-ingestion-error", {
        source,
        error: err.message,
        department: "intelligence",
      }, null);
    }
  }

  // Check if we should queue an auto-cluster job
  if (results.signals_ingested > 0) {
    await maybeQueueClustering();
  }

  if (results.sources_checked.length > 0 || results.errors.length > 0) {
    console.log(JSON.stringify(results, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Source Ingestion
// ---------------------------------------------------------------------------

/**
 * Ingest signals from a single source.
 * Dynamically loads the adapter, checks quota, fetches, and upserts.
 */
async function ingestSource(source) {
  const result = { signals_count: 0, quota_used: 0, errors: [] };

  // Check quota before starting
  const quota = await checkQuota(source, 100); // Estimate minimum units needed
  if (!quota.allowed) {
    result.errors.push(`Quota exhausted for ${source}: ${quota.used}/${quota.limit}`);
    return result;
  }

  // Load adapter
  let adapter;
  try {
    adapter = await import(`./lib/adapters/${source}-adapter.mjs`);
  } catch (err) {
    result.errors.push(`Adapter not found: ${source}-adapter.mjs (${err.message})`);
    return result;
  }

  // Fetch signals from platform
  const dependencies = {
    checkQuota: (units) => checkQuota(source, units),
    consumeQuota: (units) => consumeQuota(source, units),
    generateContentHash,
  };

  let fetchResult;
  try {
    fetchResult = await adapter.fetchSignals(getSourceConfig(source), dependencies);
  } catch (err) {
    result.errors.push(`Adapter fetch failed: ${err.message}`);
    return result;
  }

  result.quota_used = fetchResult.quota_used || 0;
  result.errors.push(...(fetchResult.errors || []));

  // Record quota usage
  if (result.quota_used > 0) {
    await consumeQuota(source, result.quota_used);
  }

  // Upsert each signal via RPC
  for (const signal of fetchResult.signals || []) {
    try {
      await dbRpc("upsert_signal", { p_signal: signal });
      result.signals_count++;
    } catch (err) {
      result.errors.push(`Upsert failed for ${signal.source_id}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Get source-specific configuration.
 * In the future, this can be loaded from the database (admin-editable).
 */
function getSourceConfig(source) {
  if (source === "reddit") {
    return {
      subreddits: getRedditSubreddits(),
      subreddits_per_cycle: 5,
      posts_per_feed: 25,
      client_id: process.env.REDDIT_CLIENT_ID,
      client_secret: process.env.REDDIT_CLIENT_SECRET,
      username: process.env.REDDIT_USERNAME,
      password: process.env.REDDIT_PASSWORD,
      user_agent: process.env.REDDIT_USER_AGENT || "launchpad-intel/1.0",
    };
  }

  if (source === "youtube") {
    return {
      api_key: process.env.YOUTUBE_API_KEY,
      keywords: getYouTubeKeywords(),
      keywords_per_cycle: 10,
      daily_quota: parseInt(process.env.YOUTUBE_DAILY_QUOTA || "10000", 10),
      hard_stop_units: 9500,
    };
  }

  if (source === "rss") {
    return {
      feeds: null,            // null = use default feeds from adapter
      feeds_per_cycle: 25,
      items_per_feed: 15,
      max_age_days: 7,
    };
  }

  if (source === "hackernews") {
    return {
      stories_per_cycle: 50,
      story_type: "topstories",
      max_age_hours: 24,
    };
  }

  return {};
}

/**
 * Default subreddit list — configurable, will move to DB in Phase 7.
 */
function getRedditSubreddits() {
  return [
    // Culture & Trends
    "popular", "all", "trending",
    // Tech & Startups
    "technology", "startups", "entrepreneur", "SaaS",
    // Marketing & Content
    "marketing", "socialmedia", "content_marketing", "digital_marketing",
    // Media & Entertainment
    "entertainment", "movies", "television", "music",
    // Gen Z & Youth Culture
    "GenZ", "teenagers", "college",
    // Viral & Social
    "OutOfTheLoop", "explainlikeimfive", "todayilearned",
    // Industry-Specific
    "advertising", "PR", "branding",
    // Lifestyle & Culture
    "culture", "food", "fashion", "fitness",
  ];
}

/**
 * Default YouTube search keywords — configurable, will move to DB in Phase 7.
 */
function getYouTubeKeywords() {
  return [
    "viral trend 2026",
    "trending culture",
    "social media trend",
    "brand marketing trend",
    "gen z trend",
    "content creator trend",
    "emerging trend",
    "cultural moment",
    "internet culture",
    "what's trending",
  ];
}

// ---------------------------------------------------------------------------
// Clustering Queue
// ---------------------------------------------------------------------------

/**
 * Check unclustered signal count and queue auto-cluster job if threshold exceeded.
 */
async function maybeQueueClustering() {
  try {
    const unclustered = await dbGet(
      "signals",
      `select=id&is_clustered=eq.false&limit=${UNCLUSTERED_THRESHOLD + 1}`
    );

    if (unclustered.length >= UNCLUSTERED_THRESHOLD) {
      // Check if there's already a queued/running auto-cluster job
      const existingJobs = await dbGet(
        "pipeline_jobs",
        "select=id&job_type=eq.auto-cluster&status=in.(queued,running)&limit=1"
      );

      if (existingJobs.length === 0) {
        // Queue a new auto-cluster job (no project_id — Intelligence is global)
        await dbPost("pipeline_jobs", {
          project_id: null,
          job_type: "auto-cluster",
          status: "queued",
          attempts: 0,
          max_attempts: 3,
          payload: { unclustered_count: unclustered.length },
          created_at: new Date().toISOString(),
        });

        await logAutomation("auto-cluster-queued", {
          unclustered_count: unclustered.length,
          threshold: UNCLUSTERED_THRESHOLD,
          department: "intelligence",
        }, null);

        console.log(JSON.stringify({
          event: "auto-cluster-queued",
          unclustered_count: unclustered.length,
        }));
      }
    }
  } catch (err) {
    console.error(JSON.stringify({
      error: "cluster-queue-check-failed",
      message: err.message,
    }));
  }
}

// ---------------------------------------------------------------------------
// Main — Long-running polling loop
// ---------------------------------------------------------------------------

async function main() {
  console.log(JSON.stringify({
    status: "started",
    tick_interval_ms: TICK_INTERVAL_MS,
    sources: Object.entries(SOURCE_SCHEDULES)
      .filter(([, s]) => s.enabled)
      .map(([name, s]) => ({ name, interval_minutes: s.interval_minutes })),
  }));

  // Run immediately on startup, then tick
  await tick();

  while (true) {
    await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS));
    try {
      await tick();
    } catch (err) {
      console.error(JSON.stringify({ error: err.message, stack: err.stack }));
    }
  }
}

main();
