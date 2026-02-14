import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

const VALID_SOURCES = ["reddit", "youtube", "x", "rss"];

// POST /api/admin/intelligence/ingest — manual ingestion trigger (admin-only)
export async function POST(request: Request) {
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

  // Optional: scope to specific source(s)
  const sources = Array.isArray(body.sources)
    ? (body.sources as string[]).filter((s) => VALID_SOURCES.includes(s))
    : VALID_SOURCES;

  if (sources.length === 0) {
    return NextResponse.json({ error: "no valid sources specified" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Check for already-running ingest jobs to prevent duplicate triggers
  const { data: runningJobs } = await adminClient
    .from("pipeline_jobs")
    .select("id, job_type, status")
    .eq("job_type", "auto-ingest")
    .in("status", ["queued", "running"])
    .limit(1);

  if (runningJobs && runningJobs.length > 0) {
    return NextResponse.json(
      { error: "an ingestion job is already running or queued", job: runningJobs[0] },
      { status: 409 },
    );
  }

  // Queue an auto-ingest pipeline job
  const { data: job, error: jobError } = await adminClient
    .from("pipeline_jobs")
    .insert({
      job_type: "auto-ingest",
      status: "queued",
      payload: {
        sources,
        triggered_by: user.id,
        manual: true,
      },
      attempts: 0,
      max_attempts: 3,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (jobError) {
    console.error("Failed to queue ingestion job:", jobError.message);
    return NextResponse.json({ error: "failed to queue ingestion" }, { status: 500 });
  }

  // Log the manual trigger
  await adminClient.from("automation_log").insert({
    event: "manual-ingest-triggered",
    department: "intelligence",
    details: {
      sources,
      triggered_by: user.id,
      job_id: job.id,
    },
  });

  return NextResponse.json({
    message: "ingestion queued",
    job_id: job.id,
    sources,
  }, { status: 201 });
}
