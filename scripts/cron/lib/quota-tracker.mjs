/**
 * API Quota Tracker for Intelligence signal ingestion.
 *
 * Tracks external API usage (YouTube, Reddit) against daily/periodic limits.
 * Uses the api_quota_tracking table to persist quota state across restarts.
 */

import { dbGet, dbPost, dbPatch } from "./supabase.mjs";

/**
 * Get the current period boundaries for a source.
 * YouTube: daily (midnight UTC to midnight UTC)
 * Reddit: per-minute (rolling, but tracked hourly for simplicity)
 */
function getCurrentPeriod(apiSource) {
  const now = new Date();
  if (apiSource === "youtube") {
    // Daily period: midnight to midnight UTC
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
  // Default: hourly period
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(end.getUTCHours() + 1);
  return { start, end };
}

/**
 * Check if there's enough quota remaining for a source.
 * Returns { allowed: boolean, remaining: number, used: number, limit: number }
 */
export async function checkQuota(apiSource, unitsNeeded = 1) {
  const { start, end } = getCurrentPeriod(apiSource);

  try {
    const rows = await dbGet(
      "api_quota_tracking",
      `select=*&api_source=eq.${apiSource}&period_start=eq.${start.toISOString()}&limit=1`
    );

    if (rows.length === 0) {
      // No tracking row yet — quota is fresh
      const defaultLimits = {
        youtube: parseInt(process.env.YOUTUBE_DAILY_QUOTA || "10000", 10),
        reddit: 6000, // 100 req/min * 60 min (hourly period)
      };
      const limit = defaultLimits[apiSource] || 10000;
      return {
        allowed: unitsNeeded <= limit,
        remaining: limit,
        used: 0,
        limit,
      };
    }

    const row = rows[0];
    const remaining = row.units_limit - row.units_used;
    return {
      allowed: unitsNeeded <= remaining,
      remaining,
      used: row.units_used,
      limit: row.units_limit,
    };
  } catch (err) {
    console.error(JSON.stringify({ error: "quota-check-failed", apiSource, message: err.message }));
    // Fail open — allow the request but log the error
    return { allowed: true, remaining: -1, used: -1, limit: -1 };
  }
}

/**
 * Consume quota units for a source.
 * Creates or updates the tracking row for the current period.
 */
export async function consumeQuota(apiSource, units) {
  const { start, end } = getCurrentPeriod(apiSource);

  const defaultLimits = {
    youtube: parseInt(process.env.YOUTUBE_DAILY_QUOTA || "10000", 10),
    reddit: 6000,
  };
  const limit = defaultLimits[apiSource] || 10000;

  try {
    const rows = await dbGet(
      "api_quota_tracking",
      `select=id,units_used&api_source=eq.${apiSource}&period_start=eq.${start.toISOString()}&limit=1`
    );

    if (rows.length === 0) {
      // Create new tracking row
      await dbPost("api_quota_tracking", {
        api_source: apiSource,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        units_used: units,
        units_limit: limit,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else {
      // Update existing row
      await dbPatch("api_quota_tracking", `id=eq.${rows[0].id}`, {
        units_used: rows[0].units_used + units,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(JSON.stringify({ error: "quota-consume-failed", apiSource, units, message: err.message }));
  }
}

/**
 * Get quota status for all tracked sources.
 * Returns object keyed by api_source with usage info.
 */
export async function getQuotaStatus() {
  const status = {};
  for (const source of ["youtube", "reddit", "rss"]) {
    const result = await checkQuota(source, 0);
    status[source] = result;
  }
  return status;
}
