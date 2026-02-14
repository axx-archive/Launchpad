import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { BriefType } from "@/types/intelligence";

const VALID_BRIEF_TYPES: BriefType[] = ["daily_digest", "trend_deep_dive", "alert"];

// POST /api/intelligence/trends/[id]/brief — trigger brief generation for a trend
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Verify cluster exists and is active
  const { data: cluster, error: clusterError } = await adminClient
    .from("trend_clusters")
    .select("id, name, is_active, lifecycle, velocity_percentile")
    .eq("id", id)
    .single();

  if (clusterError || !cluster) {
    return NextResponse.json({ error: "trend cluster not found" }, { status: 404 });
  }

  if (!cluster.is_active) {
    return NextResponse.json({ error: "cluster is inactive" }, { status: 409 });
  }

  // Brief type (default: trend_deep_dive)
  const briefType = typeof body.brief_type === "string" && VALID_BRIEF_TYPES.includes(body.brief_type as BriefType)
    ? (body.brief_type as BriefType)
    : "trend_deep_dive";

  // Additional context/instructions for the brief
  const instructions = typeof body.instructions === "string"
    ? body.instructions.trim().slice(0, 2000)
    : null;

  // Check for already-running brief generation for this cluster
  const { data: runningJobs } = await adminClient
    .from("pipeline_jobs")
    .select("id")
    .in("job_type", ["auto-analyze-trends", "auto-generate-brief"])
    .in("status", ["queued", "running"])
    .contains("payload", { cluster_ids: [id] })
    .limit(1);

  if (runningJobs && runningJobs.length > 0) {
    return NextResponse.json(
      { error: "brief generation already in progress for this cluster" },
      { status: 409 },
    );
  }

  // Queue auto-analyze-trends job (analysis step)
  const { data: analyzeJob, error: analyzeError } = await adminClient
    .from("pipeline_jobs")
    .insert({
      job_type: "auto-analyze-trends",
      status: "queued",
      payload: {
        cluster_ids: [id],
        cluster_name: cluster.name,
        triggered_by: user.id,
      },
      attempts: 0,
      max_attempts: 3,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (analyzeError) {
    console.error("Failed to queue trend analysis:", analyzeError.message);
    return NextResponse.json({ error: "failed to queue analysis" }, { status: 500 });
  }

  // Queue auto-generate-brief job (generation step)
  const { data: briefJob, error: briefError } = await adminClient
    .from("pipeline_jobs")
    .insert({
      job_type: "auto-generate-brief",
      status: "queued",
      payload: {
        cluster_ids: [id],
        cluster_name: cluster.name,
        brief_type: briefType,
        instructions,
        triggered_by: user.id,
        depends_on_job: analyzeJob.id,
      },
      attempts: 0,
      max_attempts: 3,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (briefError) {
    console.error("Failed to queue brief generation:", briefError.message);
    return NextResponse.json({ error: "failed to queue brief generation" }, { status: 500 });
  }

  // Log the trigger
  await adminClient.from("automation_log").insert({
    event: "brief-generation-triggered",
    department: "intelligence",
    details: {
      cluster_id: id,
      cluster_name: cluster.name,
      brief_type: briefType,
      analyze_job_id: analyzeJob.id,
      brief_job_id: briefJob.id,
      triggered_by: user.id,
    },
  });

  return NextResponse.json({
    message: "brief generation queued",
    cluster_id: id,
    brief_type: briefType,
    jobs: {
      analyze: analyzeJob.id,
      generate: briefJob.id,
    },
  }, { status: 201 });
}
