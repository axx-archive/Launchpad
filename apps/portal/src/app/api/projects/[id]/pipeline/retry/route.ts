import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess, getAdminUserIds } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// POST /api/projects/[id]/pipeline/retry — retry a failed pipeline job (owner/editor)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const access = await verifyProjectAccess(id, "editor");
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let jobId: string;
  try {
    const body = await request.json();
    jobId = body.jobId;
  } catch {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Verify the job belongs to this project and is failed
  const { data: job, error: jobError } = await adminClient
    .from("pipeline_jobs")
    .select("id,job_type,status,payload,project_id")
    .eq("id", jobId)
    .eq("project_id", id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  if (job.status !== "failed") {
    return NextResponse.json(
      { error: "only failed jobs can be retried" },
      { status: 409 },
    );
  }

  // Create a new queued job of the same type
  const { data: newJob, error: insertError } = await adminClient
    .from("pipeline_jobs")
    .insert({
      project_id: id,
      job_type: job.job_type,
      status: "queued",
      payload: job.payload || {},
      attempts: 0,
      max_attempts: 3,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: "failed to create retry job" }, { status: 500 });
  }

  // Log the retry
  await adminClient.from("automation_log").insert({
    project_id: id,
    event: "job-retried",
    details: {
      original_job_id: jobId,
      new_job_id: newJob.id,
      job_type: job.job_type,
      triggered_by: access.user.id,
    },
  });

  return NextResponse.json({
    job_id: newJob.id,
    message: "retry queued",
  });
}
