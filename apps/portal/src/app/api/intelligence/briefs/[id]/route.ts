import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/intelligence/briefs/[id] — single brief detail with enriched cluster data
export async function GET(
  _request: Request,
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

  const adminClient = createAdminClient();

  const { data: brief, error: briefError } = await adminClient
    .from("intelligence_briefs")
    .select("*")
    .eq("id", id)
    .single();

  if (briefError || !brief) {
    return NextResponse.json({ error: "brief not found" }, { status: 404 });
  }

  // Enrich with cluster details
  const clusterIds = (brief.cluster_ids as string[]) ?? [];
  let clusters: Record<string, unknown>[] = [];

  if (clusterIds.length > 0) {
    const { data } = await adminClient
      .from("trend_clusters")
      .select("id, name, lifecycle, velocity_score, velocity_percentile, signal_count, category, tags")
      .in("id", clusterIds);
    clusters = data ?? [];
  }

  // Fetch the source pipeline job if present
  let sourceJob: Record<string, unknown> | null = null;
  if (brief.source_job_id) {
    const { data } = await adminClient
      .from("pipeline_jobs")
      .select("id, job_type, status, created_at, completed_at")
      .eq("id", brief.source_job_id)
      .single();
    sourceJob = data;
  }

  return NextResponse.json({
    brief,
    clusters,
    source_job: sourceJob,
  });
}
