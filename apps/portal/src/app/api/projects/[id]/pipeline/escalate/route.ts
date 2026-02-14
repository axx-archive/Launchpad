import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess, getAdminUserIds } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// POST /api/projects/[id]/pipeline/escalate — report a failed job to admins
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const access = await verifyProjectAccess(id);
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

  // Get the job details
  const { data: job, error: jobError } = await adminClient
    .from("pipeline_jobs")
    .select("id,job_type,status,last_error,project_id")
    .eq("id", jobId)
    .eq("project_id", id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  // Get project name for notification
  const { data: project } = await adminClient
    .from("projects")
    .select("project_name,company_name")
    .eq("id", id)
    .single();

  const projectLabel = project
    ? `${project.company_name} — ${project.project_name}`
    : id;

  // Notify all admins
  const adminIds = await getAdminUserIds(adminClient);
  if (adminIds.length > 0) {
    await adminClient.from("notifications").insert(
      adminIds.map((adminId) => ({
        user_id: adminId,
        project_id: id,
        type: "escalation",
        title: "issue reported",
        body: `${projectLabel}: ${job.job_type} failed — "${job.last_error || "unknown error"}". User escalated for help.`,
        read: false,
      })),
    );
  }

  // Log the escalation
  await adminClient.from("automation_log").insert({
    project_id: id,
    event: "job-escalated",
    details: {
      job_id: jobId,
      job_type: job.job_type,
      last_error: job.last_error,
      escalated_by: access.user.id,
    },
  });

  return NextResponse.json({ message: "issue reported to our team" });
}
