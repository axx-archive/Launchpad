/**
 * Pipeline Preference Injection — reads user preferences from DB
 * and formats them for injection into Claude pipeline prompts.
 *
 * Only preferences with confidence >= 0.5 are included.
 * Only the project owner's preferences are queried (not collaborators).
 */

import { dbGet } from "./supabase.mjs";

const MAX_PREFERENCE_TOKENS = 500;

/** Which preference categories matter at each pipeline stage */
const STAGE_CATEGORIES = {
  "auto-narrative": ["copy_style", "narrative"],
  "auto-build": ["copy_style", "typography", "layout"],
  "auto-build-html": ["typography", "color", "layout", "animation"],
  "auto-research": ["research"],
  "auto-polish": ["copy_style", "research"],
  "auto-review": null, // all categories
};

/**
 * Build a preference context block for injection into pipeline prompts.
 * Only queries preferences for the project owner (not collaborators).
 *
 * @param {string} userId - The project owner's user ID
 * @param {string} department - 'creative', 'strategy', or 'intelligence'
 * @param {string} stage - Pipeline stage (determines which categories to include)
 * @returns {Promise<string>} Formatted preference block or empty string
 */
export async function buildPreferenceBlock(userId, department, stage) {
  if (!userId || !department) return "";

  try {
    // Query user_preferences for this user + department where confidence >= 0.5
    let query = `select=*&user_id=eq.${userId}&department=eq.${department}&confidence=gte.0.5&order=confidence.desc`;

    const prefs = await dbGet("user_preferences", query);
    if (!prefs || prefs.length === 0) return "";

    // Filter by stage categories
    const allowedCategories = STAGE_CATEGORIES[stage] || null;
    const filtered = allowedCategories
      ? prefs.filter((p) => allowedCategories.includes(p.category))
      : prefs;

    if (filtered.length === 0) return "";

    // Format as structured text
    const lines = filtered.map((p) => {
      const value = typeof p.preference_value === "object"
        ? JSON.stringify(p.preference_value)
        : String(p.preference_value);
      return `- ${p.category}/${p.preference_key}: ${value} (confidence: ${p.confidence.toFixed(2)})`;
    });

    const block = `## User Preferences (${department})\nThe project owner has expressed these preferences through previous interactions. Apply them where relevant — they reflect learned style preferences, not hard constraints.\n\n${lines.join("\n")}`;

    return enforceTokenCap(block, MAX_PREFERENCE_TOKENS);
  } catch (err) {
    console.error("Failed to build preference block:", err.message);
    return "";
  }
}

/**
 * Build user preferences block for Scout system prompt injection.
 * Uses the same logic but formats for conversational context.
 *
 * @param {string} userId
 * @param {string} department
 * @returns {Promise<string>}
 */
export async function buildUserPreferencesBlock(userId, department) {
  if (!userId || !department) return "";

  try {
    const prefs = await dbGet(
      "user_preferences",
      `select=*&user_id=eq.${userId}&department=eq.${department}&confidence=gte.0.5&order=confidence.desc&limit=20`
    );

    if (!prefs || prefs.length === 0) return "";

    const lines = prefs.map((p) => {
      const value = typeof p.preference_value === "object"
        ? JSON.stringify(p.preference_value)
        : String(p.preference_value);
      return `- ${p.category}/${p.preference_key}: ${value}`;
    });

    return lines.join("\n");
  } catch (err) {
    console.error("Failed to build Scout preferences block:", err.message);
    return "";
  }
}

/**
 * Enforce a rough token cap on text content.
 * Approximation: 1 token ≈ 4 characters.
 *
 * @param {string} text
 * @param {number} maxTokens
 * @returns {string}
 */
export function enforceTokenCap(text, maxTokens) {
  if (!text) return "";
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n[... truncated to fit token budget]";
}
