import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess, getAdminUserIds, getProjectMemberIds } from "@/lib/auth";
import { NextResponse } from "next/server";

type ResearchAction = "approve" | "reject";

const VALID_ACTIONS: ResearchAction[] = ["approve", "reject"];

// POST /api/strategy/projects/[id]/research/review — approve or reject research
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id, "owner");

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const user = access.user;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const action = body.action as ResearchAction;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `invalid action. must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }

  if (action === "reject" && !notes) {
    return NextResponse.json(
      { error: "notes are required when rejecting research" },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  // Load the project
  const { data: project, error: projectError } = await adminClient
    .from("projects")
    .select("id, user_id, status, project_name, company_name, department")
    .eq("id", id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  if (project.department !== "strategy") {
    return NextResponse.json({ error: "not a strategy project" }, { status: 400 });
  }

  if (project.status !== "research_review") {
    return NextResponse.json(
      { error: "research review actions are only available when the project is in research review" },
      { status: 409 },
    );
  }

  // Fetch the current draft research
  const { data: researchRows, error: researchError } = await adminClient
    .from("project_research")
    .select("*")
    .eq("project_id", id)
    .eq("status", "draft")
    .order("version", { ascending: false })
    .limit(1);

  if (researchError || !researchRows || researchRows.length === 0) {
    return NextResponse.json(
      { error: "no research pending review" },
      { status: 409 },
    );
  }

  const research = researchRows[0];

  if (action === "approve") {
    // Update research status (CAS guard)
    const { data: updated, error: updateError } = await adminClient
      .from("project_research")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", research.id)
      .eq("status", "draft")
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: "research has already been reviewed" },
        { status: 409 },
      );
    }

    // Update project status to research_complete
    await adminClient
      .from("projects")
      .update({ status: "research_complete" })
      .eq("id", id);

    // Log to automation_log
    await adminClient.from("automation_log").insert({
      project_id: id,
      department: "strategy",
      event: "research-approved",
      details: {
        research_id: research.id,
        version: research.version,
        approved_by: user.id,
      },
    });

    // Notify project members
    const memberIds = await getProjectMemberIds(id, user.id);
    if (memberIds.length > 0) {
      await adminClient.from("notifications").insert(
        memberIds.map((memberId) => ({
          user_id: memberId,
          project_id: id,
          type: "research_approved",
          title: "research approved",
          body: `${project.project_name} — research is complete and ready for export or promotion.`,
        })),
      );
    }

    // Notify admins
    const adminIds = await getAdminUserIds(adminClient);
    if (adminIds.length > 0) {
      await adminClient.from("notifications").insert(
        adminIds.map((adminId) => ({
          user_id: adminId,
          project_id: id,
          type: "research_approved",
          title: "research approved",
          body: `${project.company_name} approved research for "${project.project_name}".`,
        })),
      );
    }

    return NextResponse.json({
      status: "research_complete",
      message: "research approved",
    });
  }

  if (action === "reject") {
    // Update research status with revision notes (CAS guard)
    const { data: updatedReject, error: rejectError } = await adminClient
      .from("project_research")
      .update({
        status: "superseded",
        revision_notes: notes,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", research.id)
      .eq("status", "draft")
      .select()
      .single();

    if (rejectError || !updatedReject) {
      return NextResponse.json(
        { error: "research has already been reviewed" },
        { status: 409 },
      );
    }

    // Log to automation_log
    await adminClient.from("automation_log").insert({
      project_id: id,
      department: "strategy",
      event: "research-rejected",
      details: {
        research_id: research.id,
        version: research.version,
        rejected_by: user.id,
        revision_notes: notes,
      },
    });

    // Queue a new auto-research job with revision notes
    await adminClient.from("pipeline_jobs").insert({
      project_id: id,
      job_type: "auto-research",
      status: "queued",
      payload: {
        revision_notes: notes,
        previous_research_id: research.id,
        previous_version: research.version,
      },
      attempts: 0,
      max_attempts: 3,
      created_at: new Date().toISOString(),
    });

    // Update project status back to researching
    await adminClient
      .from("projects")
      .update({ status: "researching" })
      .eq("id", id);

    // Notify admins
    const adminIds = await getAdminUserIds(adminClient);
    if (adminIds.length > 0) {
      await adminClient.from("notifications").insert(
        adminIds.map((adminId) => ({
          user_id: adminId,
          project_id: id,
          type: "research_rejected",
          title: "research revision requested",
          body: `${project.company_name} requested changes on "${project.project_name}": ${notes}`,
        })),
      );
    }

    return NextResponse.json({
      status: "researching",
      message: "research revision requested",
    });
  }

  return NextResponse.json({ error: "unhandled action" }, { status: 400 });
}
