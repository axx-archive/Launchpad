import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

// GET /api/intelligence/velocity — velocity leaderboard (top movers)
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);

  // Pagination
  const page = Math.max(
    1,
    parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
  );
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(
      1,
      parseInt(
        url.searchParams.get("page_size") ?? String(DEFAULT_PAGE_SIZE),
        10,
      ) || DEFAULT_PAGE_SIZE,
    ),
  );
  const offset = (page - 1) * pageSize;

  // Filters
  const lifecycle = url.searchParams.get("lifecycle");
  const category = url.searchParams.get("category");
  const minPercentile = parseFloat(
    url.searchParams.get("min_percentile") ?? "",
  );
  const days = Math.min(
    30,
    Math.max(1, parseInt(url.searchParams.get("days") ?? "7", 10) || 7),
  );

  const adminClient = createAdminClient();

  // Get clusters sorted by velocity percentile (descending = top movers first)
  let query = adminClient
    .from("trend_clusters")
    .select(
      "id, name, summary, category, tags, lifecycle, velocity_score, velocity_percentile, signal_count, first_seen_at, last_signal_at",
      { count: "exact" },
    )
    .eq("is_active", true);

  if (lifecycle) {
    query = query.eq("lifecycle", lifecycle);
  }

  if (category) {
    query = query.eq("category", category);
  }

  if (!isNaN(minPercentile)) {
    query = query.gte("velocity_percentile", minPercentile);
  }

  const { data: clusters, count, error } = await query
    .order("velocity_percentile", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("Failed to load velocity leaderboard:", error.message);
    return NextResponse.json(
      { error: "failed to load velocity leaderboard" },
      { status: 500 },
    );
  }

  // For the top clusters, fetch velocity history for sparkline rendering
  const clusterIds = (clusters ?? []).map((c) => c.id);
  let velocityHistories: Record<string, Array<Record<string, unknown>>> = {};

  if (clusterIds.length > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data: histories } = await adminClient
      .from("velocity_scores")
      .select("cluster_id, score_date, velocity, percentile, lifecycle")
      .in("cluster_id", clusterIds)
      .gte("score_date", cutoffDate.toISOString().split("T")[0])
      .order("score_date", { ascending: true });

    // Group by cluster_id
    for (const h of histories ?? []) {
      const cid = h.cluster_id as string;
      if (!velocityHistories[cid]) velocityHistories[cid] = [];
      velocityHistories[cid].push(h);
    }
  }

  // Merge history into cluster data
  const leaderboard = (clusters ?? []).map((c) => ({
    ...c,
    velocity_history: velocityHistories[c.id] ?? [],
  }));

  // Lifecycle distribution (for dashboard widget)
  const { data: allClusters } = await adminClient
    .from("trend_clusters")
    .select("lifecycle")
    .eq("is_active", true);

  const lifecycleDist: Record<string, number> = {};
  for (const c of allClusters ?? []) {
    lifecycleDist[c.lifecycle] = (lifecycleDist[c.lifecycle] || 0) + 1;
  }

  return NextResponse.json({
    leaderboard,
    page,
    page_size: pageSize,
    total: count ?? 0,
    lifecycle_distribution: lifecycleDist,
  });
}
