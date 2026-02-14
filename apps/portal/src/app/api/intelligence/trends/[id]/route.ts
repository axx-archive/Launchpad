import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/intelligence/trends/[id] — trend cluster detail with velocity history
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clusterId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // Fetch cluster detail
  const { data: cluster, error: clusterError } = await adminClient
    .from("trend_clusters")
    .select("*")
    .eq("id", clusterId)
    .single();

  if (clusterError || !cluster) {
    return NextResponse.json(
      { error: "trend cluster not found" },
      { status: 404 },
    );
  }

  // Fetch velocity history (last 30 days)
  const { data: velocityHistory } = await adminClient
    .from("velocity_scores")
    .select("score_date, engagement_z, signal_freq_z, velocity, percentile, signal_count, lifecycle")
    .eq("cluster_id", clusterId)
    .order("score_date", { ascending: false })
    .limit(30);

  // Fetch recent signals (top 10 by confidence)
  const { data: assignments } = await adminClient
    .from("signal_cluster_assignments")
    .select("signal_id, confidence, is_primary, signals!inner(id, title, source, source_url, published_at, upvotes, comments, views, likes)")
    .eq("cluster_id", clusterId)
    .order("created_at", { ascending: false })
    .limit(10);

  const recentSignals = (assignments ?? []).map((a) => ({
    ...(a.signals as unknown as Record<string, unknown>),
    _cluster_confidence: a.confidence,
    _cluster_is_primary: a.is_primary,
  }));

  // Fetch linked projects
  const { data: projectLinks } = await adminClient
    .from("project_trend_links")
    .select("project_id, link_type, notes, created_at, projects!inner(id, project_name, status)")
    .eq("cluster_id", clusterId);

  // Fetch related entities
  const { data: entityLinks } = await adminClient
    .from("entity_signal_links")
    .select("entity_id, entities!inner(id, name, entity_type, signal_count)")
    .in(
      "signal_id",
      (assignments ?? []).map((a) => a.signal_id),
    )
    .limit(20);

  // Deduplicate entities
  const entityMap = new Map<string, Record<string, unknown>>();
  for (const link of entityLinks ?? []) {
    const entity = link.entities as unknown as Record<string, unknown>;
    if (entity && typeof entity.id === "string") {
      entityMap.set(entity.id, entity);
    }
  }

  return NextResponse.json({
    cluster,
    velocity_history: velocityHistory ?? [],
    recent_signals: recentSignals,
    linked_projects: projectLinks ?? [],
    related_entities: Array.from(entityMap.values()),
  });
}
