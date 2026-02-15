/**
 * Pipeline Learnings Injection — reads system learnings from DB
 * and formats them for injection into Claude pipeline prompts.
 *
 * Only active learnings with confidence >= 0.5 and decay_weight >= 0.3 are included.
 * Sorted by a composite relevance score: confidence * decay_weight * success_rate.
 */

import { dbGet } from "./supabase.mjs";
import { enforceTokenCap } from "./preferences.mjs";

const MAX_LEARNINGS_TOKENS = 1000;

/**
 * Build a system learnings context block for pipeline prompt injection.
 *
 * @param {string} department - 'creative', 'strategy', 'intelligence', or 'global'
 * @param {string} stage - Pipeline stage (for context, not filtering)
 * @param {object} [projectContext] - Optional { company_type, target_audience, etc. }
 * @returns {Promise<string>} Formatted learnings block (top 10 most relevant) or empty string
 */
export async function buildLearningsBlock(department, stage, projectContext = {}) {
  if (!department) return "";

  try {
    // Query active learnings for this department + global, with minimum confidence and decay
    const deptLearnings = await dbGet(
      "system_learnings",
      `select=*&status=eq.active&confidence=gte.0.5&decay_weight=gte.0.3&or=(department.eq.${department},department.eq.global)&order=confidence.desc&limit=30`
    );

    if (!deptLearnings || deptLearnings.length === 0) return "";

    // Sort by composite relevance score:
    // confidence * decay_weight * (success_count / max(usage_count, 1))
    const scored = deptLearnings.map((l) => ({
      ...l,
      relevance: l.confidence * l.decay_weight * (l.success_count / Math.max(l.usage_count, 1)),
    }));

    scored.sort((a, b) => b.relevance - a.relevance);

    // Take top 10
    const top = scored.slice(0, 10);

    // Format as structured text
    const lines = top.map((l) => {
      const contentStr = typeof l.content === "object"
        ? (l.content.summary || l.content.description || JSON.stringify(l.content))
        : String(l.content);
      const deptTag = l.department === "global" ? "[global]" : `[${l.department}]`;
      return `- ${deptTag} ${l.title}: ${contentStr} (confidence: ${l.confidence.toFixed(2)}, used: ${l.usage_count}x)`;
    });

    const block = `## System Learnings\nThese are patterns and techniques discovered across previous builds. Apply relevant learnings to improve quality — they represent proven approaches.\n\n${lines.join("\n")}`;

    return enforceTokenCap(block, MAX_LEARNINGS_TOKENS);
  } catch (err) {
    console.error("Failed to build learnings block:", err.message);
    return "";
  }
}
