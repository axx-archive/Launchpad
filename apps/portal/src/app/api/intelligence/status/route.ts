import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/intelligence/status — ingestion health overview (any authenticated user)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Run queries in parallel
  const [
    signalsResult,
    signals24hResult,
    clustersResult,
    activeClustersResult,
    unclusteredResult,
    quotaResult,
    recentJobsResult,
  ] = await Promise.all([
    // Total signals count
    adminClient
      .from("signals")
      .select("id", { count: "exact", head: true }),

    // Signals ingested in last 24h
    adminClient
      .from("signals")
      .select("id", { count: "exact", head: true })
      .gte("ingested_at", oneDayAgo),

    // Total clusters count
    adminClient
      .from("trend_clusters")
      .select("id", { count: "exact", head: true }),

    // Active clusters
    adminClient
      .from("trend_clusters")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),

    // Unclustered signals
    adminClient
      .from("signals")
      .select("id", { count: "exact", head: true })
      .eq("is_clustered", false),

    // Current quota usage
    adminClient
      .from("api_quota_tracking")
      .select("api_source, units_used, units_limit, period_start, period_end")
      .gte("period_end", now.toISOString())
      .order("period_start", { ascending: false }),

    // Recent pipeline jobs for intelligence
    adminClient
      .from("pipeline_jobs")
      .select("id, job_type, status, created_at, completed_at")
      .in("job_type", ["auto-ingest", "auto-cluster", "auto-score", "auto-analyze-trends", "auto-generate-brief"])
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Last ingestion time
  const { data: lastSignal } = await adminClient
    .from("signals")
    .select("ingested_at")
    .order("ingested_at", { ascending: false })
    .limit(1);

  // Signals per source (last 7 days) — count queries per source to avoid downloading all rows
  const SOURCES = ["reddit", "youtube", "x", "rss"] as const;
  const sourceCountResults = await Promise.all(
    SOURCES.map((source) =>
      adminClient
        .from("signals")
        .select("id", { count: "exact", head: true })
        .eq("source", source)
        .gte("ingested_at", oneWeekAgo)
        .then((res) => ({ source, count: res.count ?? 0 })),
    ),
  );

  const sourceCounts: Record<string, number> = {};
  for (const { source, count } of sourceCountResults) {
    if (count > 0) sourceCounts[source] = count;
  }

  // Top clusters by velocity
  const { data: topClusters } = await adminClient
    .from("trend_clusters")
    .select("id, name, lifecycle, velocity_score, velocity_percentile, signal_count")
    .eq("is_active", true)
    .order("velocity_percentile", { ascending: false })
    .limit(5);

  return NextResponse.json({
    counts: {
      total_signals: signalsResult.count ?? 0,
      signals_24h: signals24hResult.count ?? 0,
      total_clusters: clustersResult.count ?? 0,
      active_clusters: activeClustersResult.count ?? 0,
      unclustered_signals: unclusteredResult.count ?? 0,
    },
    last_ingestion_at: lastSignal?.[0]?.ingested_at ?? null,
    signals_by_source_7d: sourceCounts,
    quotas: quotaResult.data ?? [],
    top_clusters: topClusters ?? [],
    recent_jobs: recentJobsResult.data ?? [],
  });
}
