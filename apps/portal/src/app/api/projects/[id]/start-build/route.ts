import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess, getAdminUserIds, getProjectMemberIds } from "@/lib/auth";
import { NextResponse } from "next/server";

// POST /api/projects/[id]/start-build — transition from brand_collection to in_progress (owner only)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Read optional skipAssets flag from body
  let skipAssets = false;
  try {
    const body = await request.json();
    skipAssets = body.skipAssets === true;
  } catch {
    // No body or invalid JSON — default to including assets
  }
  const access = await verifyProjectAccess(id, "owner");

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const user = access.user;
  const adminClient = createAdminClient();

  // Load the project details
  const { data: project, error: projectError } = await adminClient
    .from("projects")
    .select("id, user_id, status, project_name, company_name, autonomy_level")
    .eq("id", id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  if (project.status !== "brand_collection") {
    return NextResponse.json(
      { error: "project must be in brand_collection status to start a build" },
      { status: 409 }
    );
  }

  // Fetch the approved narrative for the build payload
  const { data: narratives } = await adminClient
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
  const buildJobStatus = project.autonomy_level === "supervised" ? "pending" : "queued";
  await adminClient.from("pipeline_jobs").insert({
    project_id: id,
    job_type: "auto-build",
    status: buildJobStatus,
    payload: { narrative_id: narrativeId, skip_assets: skipAssets },
    attempts: 0,
    max_attempts: 3,
    created_at: new Date().toISOString(),
  });

  // Create deliverable jobs in parallel with build (one-pager + email sequence)
  // These run independently — they only need the narrative, not the PitchApp build
  const deliverableStatus = project.autonomy_level === "supervised" ? "pending" : "queued";
  await adminClient.from("pipeline_jobs").insert([
    {
      project_id: id,
      job_type: "auto-one-pager",
      status: deliverableStatus,
      payload: { narrative_id: narrativeId },
      attempts: 0,
      max_attempts: 3,
      created_at: new Date().toISOString(),
    },
    {
      project_id: id,
      job_type: "auto-emails",
      status: deliverableStatus,
      payload: { narrative_id: narrativeId },
      attempts: 0,
      max_attempts: 3,
      created_at: new Date().toISOString(),
    },
  ]);

  // Log to automation_log
  await adminClient.from("automation_log").insert({
    project_id: id,
    event: "build-started",
    details: {
      triggered_by: user.id,
      narrative_id: narrativeId,
      skip_assets: skipAssets,
    },
  });

  // Notify other project members about build start
  const memberIds = await getProjectMemberIds(id, user.id);
  if (memberIds.length > 0) {
    await adminClient.from("notifications").insert(
      memberIds.map((memberId) => ({
        user_id: memberId,
        project_id: id,
        type: "build_started",
        title: "build started",
        body: `${project.project_name} — the build is underway.`,
      }))
    );
  }

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

  // Notify the acting user (personal ack)
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
