/**
 * Cost Tracker + Circuit Breaker for pipeline automation.
 *
 * Tracks estimated costs per job and enforces safety limits:
 * - Daily cap: $50 (configurable via DAILY_COST_CAP_CENTS env var)
 * - Per-build cap: $15 (configurable via BUILD_COST_CAP_CENTS env var)
 * - Max concurrent builds: 2
 * - Max builds per hour: 5
 */

import { dbGet, dbPost, logAutomation } from "./supabase.mjs";

const DAILY_COST_CAP_CENTS = parseInt(process.env.DAILY_COST_CAP_CENTS || "5000", 10);   // $50
const BUILD_COST_CAP_CENTS = parseInt(process.env.BUILD_COST_CAP_CENTS || "1500", 10);    // $15
const MAX_CONCURRENT_BUILDS = parseInt(process.env.MAX_CONCURRENT_BUILDS || "2", 10);
const MAX_BUILDS_PER_HOUR = parseInt(process.env.MAX_BUILDS_PER_HOUR || "5", 10);

/**
 * Estimate cost in cents from Anthropic API token usage.
 * Based on Claude Sonnet 4.5 pricing: $3/1M input, $15/1M output
 */
export function estimateCostCents(usage) {
  if (!usage) return 0;
  const inputCost = ((usage.input_tokens || 0) / 1_000_000) * 300;
  const outputCost = ((usage.output_tokens || 0) / 1_000_000) * 1500;
  return Math.ceil(inputCost + outputCost);
}

/**
 * Log cost for a pipeline job.
 */
export async function logCost(jobId, projectId, costCents, jobType) {
  await logAutomation("cost-incurred", {
    job_id: jobId,
    job_type: jobType,
    cost_cents: costCents,
  }, projectId);
}

/**
 * Get total cost incurred today (in cents).
 */
export async function getDailyCostCents() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const logs = await dbGet(
      "automation_log",
      `select=details&event=eq.cost-incurred&created_at=gte.${today.toISOString()}`
    );
    let total = 0;
    for (const log of logs) {
      total += log.details?.cost_cents || 0;
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Get number of currently running builds.
 */
export async function getRunningBuildCount() {
  try {
    const jobs = await dbGet(
      "pipeline_jobs",
      `select=id&status=eq.running&job_type=in.(auto-build,auto-narrative)`
    );
    return jobs.length;
  } catch {
    return 0;
  }
}

/**
 * Get number of builds started in the last hour.
 */
export async function getHourlyBuildCount() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  try {
    const jobs = await dbGet(
      "pipeline_jobs",
      `select=id&job_type=in.(auto-build,auto-narrative)&started_at=gte.${oneHourAgo.toISOString()}`
    );
    return jobs.length;
  } catch {
    return 0;
  }
}

/**
 * Check all circuit breaker conditions. Returns { allowed, reason } .
 * Call this before picking up a new job.
 */
export async function checkCircuitBreaker() {
  // 1. Daily cost cap
  const dailyCost = await getDailyCostCents();
  if (dailyCost >= DAILY_COST_CAP_CENTS) {
    await logAutomation("circuit-breaker-tripped", {
      reason: "daily-cost-cap",
      daily_cost_cents: dailyCost,
      cap_cents: DAILY_COST_CAP_CENTS,
    });
    return {
      allowed: false,
      reason: `Daily cost cap reached: $${(dailyCost / 100).toFixed(2)} / $${(DAILY_COST_CAP_CENTS / 100).toFixed(2)}`,
    };
  }

  // 2. Concurrent builds
  const running = await getRunningBuildCount();
  if (running >= MAX_CONCURRENT_BUILDS) {
    return {
      allowed: false,
      reason: `Max concurrent builds reached: ${running}/${MAX_CONCURRENT_BUILDS}`,
    };
  }

  // 3. Hourly rate
  const hourly = await getHourlyBuildCount();
  if (hourly >= MAX_BUILDS_PER_HOUR) {
    return {
      allowed: false,
      reason: `Hourly build cap reached: ${hourly}/${MAX_BUILDS_PER_HOUR}`,
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Check if a single build has exceeded its per-build cost cap.
 * Returns true if the build should be cancelled.
 */
export async function isBuildOverBudget(jobId) {
  try {
    const logs = await dbGet(
      "automation_log",
      `select=details&event=eq.cost-incurred&details->>job_id=eq.${jobId}`
    );
    let total = 0;
    for (const log of logs) {
      total += log.details?.cost_cents || 0;
    }
    return total >= BUILD_COST_CAP_CENTS;
  } catch {
    return false;
  }
}
