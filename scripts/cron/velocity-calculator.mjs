#!/usr/bin/env node

/**
 * Velocity Calculator — Intelligence department daily velocity scoring.
 *
 * PM2 cron job that runs daily at 6 AM UTC.
 * Executes the calculate_daily_velocity() PostgreSQL function and
 * runs cluster maintenance tasks.
 *
 * Pipeline:
 * 1. Call calculate_daily_velocity(CURRENT_DATE) RPC
 * 2. Run cluster maintenance (deactivate dormant, detect merges)
 * 3. Log results to automation_log
 *
 * The RPC function handles:
 * - Raw engagement score calculation per cluster (last 24h)
 * - Z-score normalization (engagement + signal frequency)
 * - Velocity blend: 0.7 * engagement_z + 0.3 * signal_freq_z
 * - Percentile ranking
 * - Lifecycle assignment (emerging/peaking/cooling/evergreen/dormant)
 * - Propagation to trend_clusters table
 */

import { dbRpc, logAutomation, isAutomationEnabled } from "./lib/supabase.mjs";
import { runClusterMaintenance } from "./lib/cluster-engine.mjs";
import { checkDepartmentBudget } from "./lib/cost-tracker.mjs";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();

  console.log(JSON.stringify({
    event: "velocity-calculator-start",
    timestamp: new Date().toISOString(),
  }));

  if (!isAutomationEnabled()) {
    console.log(JSON.stringify({ event: "skipped", reason: "automation-disabled" }));
    process.exit(0);
  }

  const results = {
    velocity: { clusters_scored: 0, error: null },
    maintenance: { deactivated: 0, merged: 0, renamed: 0, errors: [] },
    duration_ms: 0,
  };

  // 1. Run velocity scoring via PostgreSQL RPC
  try {
    const scored = await dbRpc("calculate_daily_velocity", {
      p_date: todayDateString(),
    });

    results.velocity.clusters_scored = scored || 0;

    console.log(JSON.stringify({
      event: "velocity-scoring-complete",
      clusters_scored: results.velocity.clusters_scored,
    }));
  } catch (err) {
    results.velocity.error = err.message;
    console.error(JSON.stringify({
      error: "velocity-scoring-failed",
      message: err.message,
    }));
  }

  // 2. Run cluster maintenance
  try {
    const maintenance = await runClusterMaintenance();
    results.maintenance = maintenance;

    console.log(JSON.stringify({
      event: "cluster-maintenance-complete",
      deactivated: maintenance.deactivated,
      merged: maintenance.merged,
      renamed: maintenance.renamed,
    }));
  } catch (err) {
    results.maintenance.errors.push(err.message);
    console.error(JSON.stringify({
      error: "cluster-maintenance-failed",
      message: err.message,
    }));
  }

  // 3. Log summary
  results.duration_ms = Date.now() - startTime;

  await logAutomation("velocity-calculator-complete", {
    ...results,
    department: "intelligence",
  }, null);

  console.log(JSON.stringify({
    event: "velocity-calculator-done",
    ...results,
  }));

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Get today's date as a YYYY-MM-DD string (for the RPC p_date parameter).
 */
function todayDateString() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

main();
