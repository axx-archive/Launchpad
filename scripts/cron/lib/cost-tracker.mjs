/**
 * Cost Tracker + Circuit Breaker for pipeline automation.
 *
 * Tracks estimated costs per job and enforces safety limits:
 * - Daily cap: $500 (configurable via DAILY_COST_CAP_CENTS env var)
 * - Per-build cap: $100 (configurable via BUILD_COST_CAP_CENTS env var)
 * - Max concurrent builds: 3
 * - Max builds per hour: 20
 */

import { dbGet, dbPost, logAutomation } from "./supabase.mjs";

const DAILY_COST_CAP_CENTS = parseInt(process.env.DAILY_COST_CAP_CENTS || "50000", 10);  // $500
const BUILD_COST_CAP_CENTS = parseInt(process.env.BUILD_COST_CAP_CENTS || "10000", 10);  // $100
const MAX_CONCURRENT_BUILDS = parseInt(process.env.MAX_CONCURRENT_BUILDS || "3", 10);
const MAX_BUILDS_PER_HOUR = parseInt(process.env.MAX_BUILDS_PER_HOUR || "20", 10);

// Per-department daily cost caps (in cents)
const DEPARTMENT_CAPS = {
  creative:     parseInt(process.env.CREATIVE_DAILY_CAP_CENTS || "40000", 10),     // $400
  intelligence: parseInt(process.env.INTELLIGENCE_DAILY_CAP_CENTS || "5000", 10),  // $50
  strategy:     parseInt(process.env.STRATEGY_DAILY_CAP_CENTS || "5000", 10),      // $50
};

/**
 * Per-model pricing in cents per 1M tokens.
 * Opus for creative/judgment tasks, Sonnet for code/structured tasks.
 */
const MODEL_PRICING = {
  "claude-opus-4-6":            { input: 1500, output: 7500 },
  "claude-sonnet-4-5-20250929": { input: 300,  output: 1500 },
  "claude-haiku-4-5-20251001":  { input: 100,  output: 500  },
};
const DEFAULT_PRICING = MODEL_PRICING["claude-sonnet-4-5-20250929"];

/**
 * Estimate cost in cents from Anthropic API token usage.
 * Pass the model ID to get accurate per-model pricing.
 */
export function estimateCostCents(usage, model) {
  if (!usage) return 0;
  const pricing = (model && MODEL_PRICING[model]) || DEFAULT_PRICING;
  const inputCost = ((usage.input_tokens || 0) / 1_000_000) * pricing.input;
  const outputCost = ((usage.output_tokens || 0) / 1_000_000) * pricing.output;
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
    // H10: Include ALL AI job types in concurrent build check
    const jobs = await dbGet(
      "pipeline_jobs",
      `select=id&status=eq.running&job_type=in.(auto-build,auto-copy,auto-narrative,auto-research,auto-build-html,auto-review,auto-revise,auto-one-pager,auto-emails,auto-cluster,auto-generate-brief,auto-analyze-trends)`
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
    // H10: Include ALL AI job types in hourly rate check
    const jobs = await dbGet(
      "pipeline_jobs",
      `select=id&job_type=in.(auto-build,auto-copy,auto-narrative,auto-research,auto-build-html,auto-review,auto-revise,auto-one-pager,auto-emails,auto-cluster,auto-generate-brief,auto-analyze-trends)&started_at=gte.${oneHourAgo.toISOString()}`
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

/**
 * Check if a department has budget remaining for today.
 * Returns { allowed, remaining_cents, used_cents, cap_cents }
 */
export async function checkDepartmentBudget(department) {
  const cap = DEPARTMENT_CAPS[department] || DEPARTMENT_CAPS.creative;
  const used = await getDailyCostByDepartment(department);

  return {
    allowed: used < cap,
    remaining_cents: Math.max(0, cap - used),
    used_cents: used,
    cap_cents: cap,
  };
}

/**
 * Get total cost incurred today for a specific department (in cents).
 */
export async function getDailyCostByDepartment(department) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const logs = await dbGet(
      "automation_log",
      `select=details&event=eq.cost-incurred&department=eq.${department}&created_at=gte.${today.toISOString()}`
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
 * Get daily cost breakdown by all departments.
 * Returns { creative: cents, intelligence: cents, strategy: cents }
 */
export async function getDailyCostAllDepartments() {
  const result = {};
  for (const dept of Object.keys(DEPARTMENT_CAPS)) {
    result[dept] = await getDailyCostByDepartment(dept);
  }
  return result;
}
