/**
 * Learning Aggregator — weekly cron for Smart Memory.
 *
 * 1. Runs preference extraction (feedback_signals → user_preferences)
 * 2. Runs decay logic on stale learnings and preferences
 * 3. Logs aggregation results
 *
 * Schedule: weekly (Sunday 3 AM UTC via PM2)
 */

import { dbGet, dbPatch, logAutomation, isAutomationEnabled, SUPABASE_URL, SUPABASE_SERVICE_KEY } from "./lib/supabase.mjs";
import { processSignalBatch } from "./lib/preference-extractor.mjs";

const DECAY_MULTIPLIER = 0.95;
const DECAY_FLOOR = 0.1;
const STALE_DAYS = 30;
const PREF_DECAY_RATE = 0.05; // 5% confidence decrease per month

async function main() {
  if (!isAutomationEnabled()) {
    console.log("[learning-aggregator] Automation disabled — skipping");
    process.exit(0);
  }

  console.log("[learning-aggregator] Starting weekly aggregation");
  const startTime = Date.now();
  const summary = { preferences_processed: 0, preferences_errors: 0, learnings_decayed: 0, preferences_decayed: 0 };

  // ---------------------------------------------------------------
  // Phase 1: Process feedback signals → user preferences
  // ---------------------------------------------------------------
  try {
    // Process in batches until no more unprocessed signals
    let totalProcessed = 0;
    let totalErrors = 0;
    let batch;
    let rounds = 0;
    const MAX_ROUNDS = 10; // Safety cap

    do {
      batch = await processSignalBatch();
      totalProcessed += batch.processed;
      totalErrors += batch.errors;
      rounds++;
    } while (batch.processed > 0 && rounds < MAX_ROUNDS);

    summary.preferences_processed = totalProcessed;
    summary.preferences_errors = totalErrors;

    if (totalProcessed > 0) {
      console.log(`[learning-aggregator] Processed ${totalProcessed} signals (${totalErrors} errors)`);
    }
  } catch (err) {
    console.error("[learning-aggregator] Preference extraction failed:", err.message);
  }

  // ---------------------------------------------------------------
  // Phase 2: Decay stale system learnings
  // ---------------------------------------------------------------
  try {
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Fetch stale active learnings
    const staleLearnings = await dbGet(
      "system_learnings",
      `status=eq.active&last_validated_at=lt.${cutoff}&select=id,decay_weight`
    );

    if (staleLearnings && staleLearnings.length > 0) {
      const h = {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      };
      const now = new Date().toISOString();

      for (const learning of staleLearnings) {
        const newWeight = Math.max(DECAY_FLOOR, learning.decay_weight * DECAY_MULTIPLIER);

        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/system_learnings?id=eq.${learning.id}`,
          {
            method: "PATCH",
            headers: h,
            body: JSON.stringify({ decay_weight: newWeight, updated_at: now }),
          }
        );

        if (res.ok) {
          summary.learnings_decayed++;
        } else {
          console.error(`[learning-aggregator] Failed to decay learning ${learning.id}`);
        }
      }

      if (summary.learnings_decayed > 0) {
        console.log(`[learning-aggregator] Decayed ${summary.learnings_decayed} stale learnings`);
      }
    }
  } catch (err) {
    console.error("[learning-aggregator] Learning decay failed:", err.message);
  }

  // ---------------------------------------------------------------
  // Phase 3: Decay stale user preferences
  // ---------------------------------------------------------------
  try {
    const prefCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch preferences not updated in 30 days with confidence > 0.1
    const stalePrefs = await dbGet(
      "user_preferences",
      `updated_at=lt.${prefCutoff}&confidence=gt.0.1&select=id,confidence`
    );

    if (stalePrefs && stalePrefs.length > 0) {
      const h = {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      };
      const now = new Date().toISOString();

      for (const pref of stalePrefs) {
        const newConfidence = Math.max(0.1, pref.confidence - PREF_DECAY_RATE);

        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/user_preferences?id=eq.${pref.id}`,
          {
            method: "PATCH",
            headers: h,
            body: JSON.stringify({ confidence: newConfidence, updated_at: now }),
          }
        );

        if (res.ok) {
          summary.preferences_decayed++;
        }
      }

      if (summary.preferences_decayed > 0) {
        console.log(`[learning-aggregator] Decayed ${summary.preferences_decayed} stale preferences`);
      }
    }
  } catch (err) {
    console.error("[learning-aggregator] Preference decay failed:", err.message);
  }

  // ---------------------------------------------------------------
  // Log results
  // ---------------------------------------------------------------
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[learning-aggregator] Done in ${elapsed}s`, JSON.stringify(summary));

  await logAutomation("learning-aggregation", {
    ...summary,
    elapsed_seconds: parseFloat(elapsed),
  });

  process.exit(0);
}

main().catch((err) => {
  console.error("[learning-aggregator] Fatal error:", err);
  process.exit(1);
});
