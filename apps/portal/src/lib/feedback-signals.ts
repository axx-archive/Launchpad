/**
 * Feedback signal capture helpers for Smart Memory.
 *
 * All functions are NON-BLOCKING: they catch errors internally and log on failure.
 * All use admin client (service role) to bypass RLS on feedback_signals inserts.
 * Owner-only rule: callers must verify the user is the project owner before calling.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EditChange, FeedbackSignalType } from "@/types/database";

// ---------------------------------------------------------------------------
// Core insert helper (non-blocking)
// ---------------------------------------------------------------------------

async function insertSignal(
  adminClient: SupabaseClient,
  userId: string,
  projectId: string | null,
  signalType: FeedbackSignalType,
  content: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await adminClient.from("feedback_signals").insert({
      user_id: userId,
      project_id: projectId,
      signal_type: signalType,
      content,
    });
    if (error) {
      console.error(`[feedback] Failed to insert ${signalType}:`, error.message);
    }
  } catch (err) {
    console.error(`[feedback] Unexpected error inserting ${signalType}:`, err);
  }
}

// ---------------------------------------------------------------------------
// 1. Edit brief signals (edit_brief + section_change + animation_request + style_correction)
// ---------------------------------------------------------------------------

/**
 * Capture feedback signals from a submitted edit brief.
 * Extracts: edit_brief (always), plus section_change / animation_request / style_correction
 * from individual changes.
 */
export async function captureEditBriefSignals(
  adminClient: SupabaseClient,
  userId: string,
  projectId: string,
  summary: string,
  changes: EditChange[],
): Promise<void> {
  // Primary signal: the edit brief itself
  await insertSignal(adminClient, userId, projectId, "edit_brief", {
    summary,
    change_count: changes.length,
    change_types: changes.map((c) => c.change_type),
    sections_touched: changes.map((c) => c.section_id),
  });

  // Secondary signals: extract per-change signals
  for (const change of changes) {
    if (change.change_type === "animation" && change.animation_spec) {
      await insertSignal(adminClient, userId, projectId, "animation_request", {
        section_id: change.section_id,
        description: change.description,
        animation_type: change.animation_spec.animation_type,
        complexity: change.animation_spec.complexity,
        mobile_behavior: change.animation_spec.mobile_behavior ?? null,
      });
    } else if (["copy", "design"].includes(change.change_type)) {
      await insertSignal(adminClient, userId, projectId, "style_correction", {
        section_id: change.section_id,
        change_type: change.change_type,
        description: change.description,
        priority: change.priority ?? null,
      });
    } else if (["reorder", "add", "remove", "layout"].includes(change.change_type)) {
      await insertSignal(adminClient, userId, projectId, "section_change", {
        section_id: change.section_id,
        change_type: change.change_type,
        description: change.description,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Narrative signals (narrative_revision + narrative_approval)
// ---------------------------------------------------------------------------

export async function captureNarrativeRevision(
  adminClient: SupabaseClient,
  userId: string,
  projectId: string,
  revisionNotes: string,
  narrativeVersion: number,
): Promise<void> {
  await insertSignal(adminClient, userId, projectId, "narrative_revision", {
    revision_notes: revisionNotes,
    narrative_version: narrativeVersion,
  });
}

export async function captureNarrativeApproval(
  adminClient: SupabaseClient,
  userId: string,
  projectId: string,
  narrativeVersion: number,
): Promise<void> {
  await insertSignal(adminClient, userId, projectId, "narrative_approval", {
    narrative_version: narrativeVersion,
    approved: true,
  });
}

// ---------------------------------------------------------------------------
// 3. PitchApp approval signal
// ---------------------------------------------------------------------------

export async function capturePitchAppApproval(
  adminClient: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<void> {
  await insertSignal(adminClient, userId, projectId, "pitchapp_approval", {
    approved: true,
  });
}

// ---------------------------------------------------------------------------
// 4. Scout feedback signal (explicit feedback in chat)
// ---------------------------------------------------------------------------

/**
 * Check if a Scout message contains explicit feedback and capture it.
 * Looks for patterns like "I prefer", "always use", "never use", "I like", "I don't like".
 */
export async function captureScoutFeedback(
  adminClient: SupabaseClient,
  userId: string,
  projectId: string,
  message: string,
): Promise<void> {
  const feedbackPatterns = [
    /\bi\s+(?:always\s+)?prefer\b/i,
    /\balways\s+use\b/i,
    /\bnever\s+use\b/i,
    /\bi\s+(?:really\s+)?(?:like|love|hate|dislike)\b/i,
    /\bfrom now on\b/i,
    /\bfor future\s+(?:builds|projects)\b/i,
    /\bmy\s+(?:style|preference|brand)\b/i,
  ];

  const hasExplicitFeedback = feedbackPatterns.some((p) => p.test(message));
  if (!hasExplicitFeedback) return;

  await insertSignal(adminClient, userId, projectId, "scout_feedback", {
    message_excerpt: message.slice(0, 500),
    detected_patterns: feedbackPatterns
      .filter((p) => p.test(message))
      .map((p) => p.source),
  });
}

// ---------------------------------------------------------------------------
// 5. Scout probe response (response to post-milestone probing)
// ---------------------------------------------------------------------------

/** Post-milestone statuses where probing is active */
const PROBE_STATUSES = new Set(["brand_collection", "live"]);

/**
 * Capture a scout probe response when the project is in a post-milestone status.
 * The probe instruction in the system prompt causes Scout to ask preference questions;
 * this captures the user's response at higher confidence (0.85).
 */
export async function captureProbeResponse(
  adminClient: SupabaseClient,
  userId: string,
  projectId: string,
  projectStatus: string,
  message: string,
): Promise<void> {
  // Only capture when project is in a probe-active status
  if (!PROBE_STATUSES.has(projectStatus)) return;

  // Must contain preference-like content (not just "ok" or "looks good")
  if (message.length < 15) return;

  const preferenceIndicators = [
    /\bi\s+(?:always\s+)?(?:prefer|want|like|love|need)\b/i,
    /\bnext\s+time\b/i,
    /\bin\s+(?:the\s+)?future\b/i,
    /\bmore\s+(?:of|like)\b/i,
    /\bless\s+(?:of|like)\b/i,
    /\bkeep\s+(?:the|this|that)\b/i,
    /\bchange\s+(?:the|this|that)\b/i,
    /\btone|style|font|color|animation|layout|structure\b/i,
  ];

  const hasPreferenceContent = preferenceIndicators.some((p) => p.test(message));
  if (!hasPreferenceContent) return;

  try {
    const { error } = await adminClient.from("feedback_signals").insert({
      user_id: userId,
      project_id: projectId,
      signal_type: "scout_probe_response",
      content: {
        message_excerpt: message.slice(0, 500),
        project_status: projectStatus,
        confidence: 0.85,
      },
    });
    if (error) {
      console.error("[feedback] Failed to insert scout_probe_response:", error.message);
    }
  } catch (err) {
    console.error("[feedback] Unexpected error inserting scout_probe_response:", err);
  }
}
