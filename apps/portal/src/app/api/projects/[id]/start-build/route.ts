import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUserIds } from "@/lib/auth";
import { NextResponse } from "next/server";

// POST /api/projects/[id]/start-build — transition from brand_collection to in_progress
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
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

  // Load the project (RLS ensures user owns it)
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, user_id, status, project_name, company_name, autonomy_level")
    .eq("id", id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (project.status !== "brand_collection") {
    return NextResponse.json(
      { error: "project must be in brand_collection status to start a build" },
      { status: 409 }
    );
  }

  const adminClient = createAdminClient();

  // Fetch the approved narrative for the build payload
  const { data: narratives } = await supabase
    .from("project_narratives")
    .select("id")
    .eq("project_id", id)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1);

  const narrativeId = narratives?.[0]?.id ?? null;

  // Update project status to in_progress
  await adminClient
    .from("projects")
    .update({ status: "in_progress" })
    .eq("id", id);

  // Create auto-build pipeline job (supervised projects need admin approval)
  const buildJobStatus = (project as any).autonomy_level === "supervised" ? "pending" : "queued";
  await adminClient.from("pipeline_jobs").insert({
    project_id: id,
    job_type: "auto-build",
    status: buildJobStatus,
    payload: { narrative_id: narrativeId },
    attempts: 0,
    max_attempts: 3,
    created_at: new Date().toISOString(),
  });

  // Log to automation_log
  await adminClient.from("automation_log").insert({
    project_id: id,
    event: "build-started",
    details: {
      triggered_by: user.id,
      narrative_id: narrativeId,
    },
  });

  // Notify admins
  const adminIds = await getAdminUserIds(adminClient);
  if (adminIds.length > 0) {
    await adminClient.from("notifications").insert(
      adminIds.map((adminId) => ({
        user_id: adminId,
        project_id: id,
        type: "build_started",
        title: "build started",
        body: `${project.company_name} started the build for "${project.project_name}".`,
      }))
    );
  }

  // Notify the project owner
  await adminClient.from("notifications").insert({
    user_id: user.id,
    project_id: id,
    type: "build_started_ack",
    title: "build started",
    body: "your launchpad build is underway.",
  });

  return NextResponse.json({
    status: "in_progress",
    message: "build started",
  });
}
