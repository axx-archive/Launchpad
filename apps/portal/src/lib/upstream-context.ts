/**
 * Upstream context helpers for cross-department promotion.
 *
 * Used by both /api/promote and /api/projects POST routes to fetch
 * and forward research/trend context when a project is promoted
 * from one department to another.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Department } from "@/types/database";

const MAX_UPSTREAM_TOKENS = 4000;

/** Truncate text to approximate token budget (1 token ~ 4 chars). */
export function truncateToTokens(text: string, maxTokens: number = MAX_UPSTREAM_TOKENS): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[... truncated to fit token budget]";
}

/** Estimate token count (rough: 1 token ~ 4 chars). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface UpstreamContext {
  /** Full research content (for cross_department_refs.metadata) */
  research: string | null;
  /** Research quality scores */
  qualityScores: Record<string, unknown> | null;
  /** Trend context summary */
  trendContext: string | null;
}

/**
 * Fetch upstream context for a source project being promoted.
 * Returns research content, quality scores, and linked trend data.
 */
export async function fetchProjectUpstreamContext(
  adminClient: SupabaseClient,
  sourceProjectId: string,
  sourceDepartment: string,
): Promise<UpstreamContext> {
  const ctx: UpstreamContext = {
    research: null,
    qualityScores: null,
    trendContext: null,
  };

  // Fetch upstream research content for strategy projects
  if (sourceDepartment === "strategy") {
    const { data: research } = await adminClient
      .from("project_research")
      .select("content, quality_scores")
      .eq("project_id", sourceProjectId)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (research) {
      ctx.research = research.content as string | null;
      ctx.qualityScores = research.quality_scores as Record<string, unknown> | null;
    }
  }

  // Fetch linked trend context if source project has trend links
  const { data: trendLinks } = await adminClient
    .from("project_trend_links")
    .select("trend_clusters(name, description, lifecycle, velocity_score)")
    .eq("project_id", sourceProjectId)
    .limit(3);

  if (trendLinks && trendLinks.length > 0) {
    const trendSummaries = trendLinks
      .map((link: Record<string, unknown>) => {
        const tc = link.trend_clusters as Record<string, unknown> | null;
        if (!tc) return null;
        return `- ${tc.name}${tc.lifecycle ? ` (${tc.lifecycle})` : ""}${tc.velocity_score != null ? ` — velocity: ${tc.velocity_score}` : ""}`;
      })
      .filter(Boolean);
    if (trendSummaries.length > 0) {
      ctx.trendContext = `Linked Trends:\n${trendSummaries.join("\n")}`;
    }
  }

  return ctx;
}

/**
 * Build the metadata object for cross_department_refs with full upstream content.
 */
export function buildRefMetadata(
  promotedBy: string,
  ctx: UpstreamContext,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    promoted_by: promotedBy,
    forwarded_at: new Date().toISOString(),
  };
  if (ctx.research) {
    metadata.upstream_research = ctx.research;
    metadata.token_count = estimateTokens(ctx.research);
  }
  if (ctx.qualityScores) {
    metadata.upstream_quality_scores = ctx.qualityScores;
  }
  if (ctx.trendContext) {
    metadata.upstream_trend_context = ctx.trendContext;
  }
  return metadata;
}

/**
 * Build the source_context JSONB for the target project.
 * Research is truncated to MAX_UPSTREAM_TOKENS for pipeline prompt injection.
 */
export function buildSourceContext(
  sourceDepartment: string,
  sourceId: string,
  ctx: UpstreamContext,
): Record<string, unknown> | null {
  if (!ctx.research && !ctx.trendContext) return null;

  const sourceContext: Record<string, unknown> = {
    source_department: sourceDepartment,
    source_project_id: sourceId,
    forwarded_at: new Date().toISOString(),
  };
  if (ctx.research) {
    sourceContext.research_summary = truncateToTokens(ctx.research);
  }
  if (ctx.trendContext) {
    sourceContext.trend_context = ctx.trendContext;
  }
  if (ctx.qualityScores) {
    sourceContext.quality_scores = ctx.qualityScores;
  }
  return sourceContext;
}
