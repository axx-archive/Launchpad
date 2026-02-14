import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/intelligence/trends/[id]/timeline — velocity score history for a cluster
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const daysBack = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") ?? "30", 10) || 30));
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const adminClient = createAdminClient();

  // Verify cluster exists
  const { data: cluster, error: clusterError } = await adminClient
    .from("trend_clusters")
    .select("id, name, lifecycle, velocity_score, velocity_percentile, signal_count, first_seen_at, last_signal_at, created_at")
    .eq("id", id)
    .single();

  if (clusterError || !cluster) {
    return NextResponse.json({ error: "trend cluster not found" }, { status: 404 });
  }

  // Fetch velocity score history
  const { data: scores, error: scoresError } = await adminClient
    .from("velocity_scores")
    .select("score_date, engagement_z, signal_freq_z, velocity, percentile, signal_count, lifecycle")
    .eq("cluster_id", id)
    .gte("score_date", since)
    .order("score_date", { ascending: true });

  if (scoresError) {
    console.error("Failed to load velocity timeline:", scoresError.message);
    return NextResponse.json({ error: "failed to load timeline" }, { status: 500 });
  }

  // Lifecycle transition events (where lifecycle changed between consecutive days)
  const transitions: { date: string; from: string; to: string }[] = [];
  const scoreList = scores ?? [];
  for (let i = 1; i < scoreList.length; i++) {
    if (scoreList[i].lifecycle !== scoreList[i - 1].lifecycle) {
      transitions.push({
        date: scoreList[i].score_date,
        from: scoreList[i - 1].lifecycle,
        to: scoreList[i].lifecycle,
      });
    }
  }

  // Summary stats
  const velocities = scoreList.map((s) => s.velocity);
  const peakVelocity = velocities.length > 0 ? Math.max(...velocities) : 0;
  const avgVelocity = velocities.length > 0
    ? Math.round((velocities.reduce((a, b) => a + b, 0) / velocities.length) * 100) / 100
    : 0;

  return NextResponse.json({
    cluster,
    period_days: daysBack,
    scores: scoreList,
    transitions,
    summary: {
      data_points: scoreList.length,
      peak_velocity: Math.round(peakVelocity * 100) / 100,
      avg_velocity: avgVelocity,
      current_lifecycle: cluster.lifecycle,
      lifecycle_changes: transitions.length,
    },
  });
}
