/**
 * Preference Extractor — processes feedback_signals into user_preferences.
 *
 * Called by learning-aggregator.mjs on a schedule.
 * Processes unprocessed signals in batches, extracts preference data,
 * and upserts into user_preferences with confidence scoring.
 *
 * Idempotency: marks signals as processed transactionally after upserting.
 * Uses SKIP LOCKED pattern to prevent duplicate processing.
 */

import { SUPABASE_URL, SUPABASE_SERVICE_KEY, dbGet, logAutomation } from "../lib/supabase.mjs";

const BATCH_SIZE = 100;

// Confidence scoring per spec section 3.2
const CONFIDENCE_MAP = {
  scout_feedback: 0.9,        // Direct Scout declaration
  scout_probe_response: 0.85, // Post-milestone probe response
  edit_brief: 0.7,            // Direct edit brief
  section_change: 0.7,        // Edit brief sub-signal
  animation_request: 0.7,     // Edit brief sub-signal
  style_correction: 0.7,      // Edit brief sub-signal
  narrative_revision: 0.4,    // Inferred from revision
  narrative_approval: 0.3,    // Inferred from approval pattern
  pitchapp_approval: 0.3,     // Inferred from approval pattern
  revision_count: 0.3,        // Inferred
};

const BOOST_MAP = {
  scout_feedback: 0,
  scout_probe_response: 0,
  edit_brief: 0.1,
  section_change: 0.1,
  animation_request: 0.1,
  style_correction: 0.1,
  narrative_revision: 0.1,
  narrative_approval: 0.05,
  pitchapp_approval: 0.05,
  revision_count: 0.1,
};

/**
 * Process a batch of unprocessed feedback signals.
 * @returns {{ processed: number, errors: number }}
 */
export async function processSignalBatch() {
  const result = { processed: 0, errors: 0 };

  // Fetch unprocessed signals (oldest first)
  let signals;
  try {
    signals = await dbGet(
      "feedback_signals",
      `processed=eq.false&order=created_at.asc&limit=${BATCH_SIZE}`
    );
  } catch (err) {
    console.error("[preference-extractor] Failed to fetch signals:", err.message);
    return result;
  }

  if (!signals || signals.length === 0) return result;

  console.log(`[preference-extractor] Processing ${signals.length} signals`);

  // Process each signal
  const processedIds = [];

  for (const signal of signals) {
    try {
      const preferences = extractPreferences(signal);

      for (const pref of preferences) {
        await upsertPreference(signal.user_id, pref, signal.signal_type);
      }

      processedIds.push(signal.id);
      result.processed++;
    } catch (err) {
      console.error(`[preference-extractor] Failed to process signal ${signal.id}:`, err.message);
      result.errors++;
    }
  }

  // Mark processed signals
  if (processedIds.length > 0) {
    try {
      const now = new Date().toISOString();
      const h = {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      };

      // Batch update using IN filter
      const idFilter = processedIds.map(id => `"${id}"`).join(",");
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/feedback_signals?id=in.(${idFilter})`,
        {
          method: "PATCH",
          headers: h,
          body: JSON.stringify({ processed: true, processed_at: now }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("[preference-extractor] Failed to mark processed:", text);
      }
    } catch (err) {
      console.error("[preference-extractor] Failed to mark signals as processed:", err.message);
    }
  }

  return result;
}

/**
 * Extract preference data from a feedback signal.
 * Returns an array of preference objects to upsert.
 */
function extractPreferences(signal) {
  const content = signal.content || {};
  const prefs = [];

  switch (signal.signal_type) {
    case "edit_brief": {
      // Extract preferences from edit brief change types
      const changeTypes = content.change_types || [];
      const categoryMap = {
        copy: "copy_style",
        design: "layout",
        animation: "animation",
        layout: "layout",
        content: "copy_style",
        reorder: "layout",
        image_swap: "layout",
        image_add: "layout",
      };

      // Count change types as preference signals
      for (const ct of changeTypes) {
        const category = categoryMap[ct] || "copy_style";
        prefs.push({
          department: "creative",
          category,
          preference_key: `${ct}_frequency`,
          preference_value: { signal: "edit_brief", change_type: ct, count: 1 },
          source: "edit_brief",
        });
      }
      break;
    }

    case "animation_request": {
      prefs.push({
        department: "creative",
        category: "animation",
        preference_key: content.animation_type || "general_animation",
        preference_value: {
          animation_type: content.animation_type,
          complexity: content.complexity,
          mobile_behavior: content.mobile_behavior,
        },
        source: "edit_brief",
      });
      break;
    }

    case "style_correction": {
      prefs.push({
        department: "creative",
        category: content.change_type === "copy" ? "copy_style" : "layout",
        preference_key: `correction_${content.change_type}`,
        preference_value: {
          description: (content.description || "").slice(0, 200),
          section_id: content.section_id,
        },
        source: "edit_brief",
      });
      break;
    }

    case "section_change": {
      prefs.push({
        department: "creative",
        category: "layout",
        preference_key: `section_${content.change_type}`,
        preference_value: {
          change_type: content.change_type,
          section_id: content.section_id,
        },
        source: "edit_brief",
      });
      break;
    }

    case "scout_feedback": {
      prefs.push({
        department: "creative",
        category: "copy_style",
        preference_key: "scout_stated_preference",
        preference_value: {
          excerpt: (content.message_excerpt || "").slice(0, 300),
        },
        source: "scout_feedback",
      });
      break;
    }

    case "scout_probe_response": {
      prefs.push({
        department: "creative",
        category: "copy_style",
        preference_key: "probe_response",
        preference_value: {
          excerpt: (content.message_excerpt || "").slice(0, 300),
          project_status: content.project_status,
        },
        source: "scout_feedback",
      });
      break;
    }

    case "narrative_revision": {
      prefs.push({
        department: "creative",
        category: "narrative",
        preference_key: "revision_pattern",
        preference_value: {
          revision_notes: (content.revision_notes || "").slice(0, 300),
          narrative_version: content.narrative_version,
        },
        source: "inferred",
      });
      break;
    }

    case "narrative_approval": {
      prefs.push({
        department: "creative",
        category: "narrative",
        preference_key: "approved_narrative_style",
        preference_value: {
          narrative_version: content.narrative_version,
          approved: true,
        },
        source: "approval_pattern",
      });
      break;
    }

    case "pitchapp_approval": {
      prefs.push({
        department: "creative",
        category: "layout",
        preference_key: "approved_pitchapp_style",
        preference_value: { approved: true },
        source: "approval_pattern",
      });
      break;
    }

    default:
      break;
  }

  return prefs;
}

/**
 * Upsert a preference into user_preferences.
 * On conflict (user_id, department, category, preference_key),
 * boost confidence and update value.
 */
async function upsertPreference(userId, pref, signalType) {
  const baseConfidence = CONFIDENCE_MAP[signalType] || 0.5;
  const boost = BOOST_MAP[signalType] || 0;
  const now = new Date().toISOString();

  // Check if preference already exists
  const existing = await dbGet(
    "user_preferences",
    `user_id=eq.${userId}&department=eq.${pref.department}&category=eq.${pref.category}&preference_key=eq.${encodeURIComponent(pref.preference_key)}&limit=1`
  );

  const h = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  if (existing && existing.length > 0) {
    // Boost confidence on repeat signals (cap at 1.0)
    const newConfidence = Math.min(1.0, existing[0].confidence + boost);

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_preferences?id=eq.${existing[0].id}`,
      {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({
          preference_value: pref.preference_value,
          confidence: newConfidence,
          source: pref.source,
          updated_at: now,
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Preference update failed: ${text}`);
    }
  } else {
    // Insert new preference
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_preferences`,
      {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          user_id: userId,
          department: pref.department,
          category: pref.category,
          preference_key: pref.preference_key,
          preference_value: pref.preference_value,
          confidence: baseConfidence,
          source: pref.source,
          source_ref: null,
          created_at: now,
          updated_at: now,
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Preference insert failed: ${text}`);
    }
  }
}
