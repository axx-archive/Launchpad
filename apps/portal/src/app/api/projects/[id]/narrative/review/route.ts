import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUserIds } from "@/lib/auth";
import { NextResponse } from "next/server";
import { sendStatusChangeEmail } from "@/lib/email";

type NarrativeAction = "approve" | "reject" | "escalate";

const VALID_ACTIONS: NarrativeAction[] = ["approve", "reject", "escalate"];

// POST /api/projects/[id]/narrative/review — client narrative approval action
export async function POST(
  request: Request,
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const action = body.action as NarrativeAction;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `invalid action. must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  if (action === "reject" && !notes) {
    return NextResponse.json(
      { error: "notes are required when rejecting a narrative" },
      { status: 400 }
    );
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

  if (project.status !== "narrative_review") {
    return NextResponse.json(
      { error: "narrative review actions are only available when the project is in story review" },
      { status: 409 }
    );
  }

  const adminClient = createAdminClient();

  // Fetch the current pending_review narrative
  const { data: narratives, error: narrativeError } = await supabase
    .from("project_narratives")
    .select("*")
    .eq("project_id", id)
    .eq("status", "pending_review")
    .order("version", { ascending: false })
    .limit(1);

  if (narrativeError || !narratives || narratives.length === 0) {
    return NextResponse.json(
      { error: "no narrative pending review" },
      { status: 409 }
    );
  }

  const narrative = narratives[0];

  if (action === "approve") {
    // Update narrative status (CAS guard: only update if still pending_review)
    const { data: updated, error: updateError } = await adminClient
      .from("project_narratives")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", narrative.id)
      .eq("status", "pending_review")
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: "narrative has already been reviewed" },
        { status: 409 }
      );
    }

    // Update project status to brand_collection (user uploads assets before build)
    await adminClient
      .from("projects")
      .update({ status: "brand_collection" })
      .eq("id", id);

    // Log to automation_log
    await adminClient.from("automation_log").insert({
      project_id: id,
      event: "narrative-approved",
      details: {
        narrative_id: narrative.id,
        version: narrative.version,
        approved_by: user.id,
      },
    });

    // Notify admins
    const adminIds = await getAdminUserIds(adminClient);
    if (adminIds.length > 0) {
      await adminClient.from("notifications").insert(
        adminIds.map((adminId) => ({
          user_id: adminId,
          project_id: id,
          type: "narrative_approved",
          title: "narrative approved — collecting brand assets",
          body: `${project.company_name} approved the narrative for "${project.project_name}".`,
        }))
      );
    }

    // Notify the project owner
    await adminClient.from("notifications").insert({
      user_id: user.id,
      project_id: id,
      type: "narrative_approved_ack",
      title: "narrative approved",
      body: "your story arc has been approved — add your brand assets to shape the build.",
    });

    // Send email
    if (user.email) {
      await sendStatusChangeEmail(
        user.email,
        project.project_name,
        "brand_collection",
      ).catch((err) => console.error("Failed to send narrative approval email:", err));
    }

    return NextResponse.json({
      status: "brand_collection",
      message: "narrative approved — add brand assets",
    });
  }

  if (action === "reject") {
    // Update narrative status with revision notes (CAS guard: only update if still pending_review)
    const { data: updatedReject, error: rejectUpdateError } = await adminClient
      .from("project_narratives")
      .update({
        status: "rejected",
        revision_notes: notes,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", narrative.id)
      .eq("status", "pending_review")
      .select()
      .single();

    if (rejectUpdateError || !updatedReject) {
      return NextResponse.json(
        { error: "narrative has already been reviewed" },
        { status: 409 }
      );
    }

    // Log to automation_log
    await adminClient.from("automation_log").insert({
      project_id: id,
      event: "narrative-rejected",
      details: {
        narrative_id: narrative.id,
        version: narrative.version,
        rejected_by: user.id,
        revision_notes: notes,
      },
    });

    // Create auto-narrative pipeline job with revision notes
    await adminClient.from("pipeline_jobs").insert({
      project_id: id,
      job_type: "auto-narrative",
      status: "queued",
      payload: {
        revision_notes: notes,
        previous_narrative_id: narrative.id,
        previous_version: narrative.version,
      },
      attempts: 0,
      max_attempts: 3,
      created_at: new Date().toISOString(),
    });

    // Notify admins
    const adminIds = await getAdminUserIds(adminClient);
    if (adminIds.length > 0) {
      await adminClient.from("notifications").insert(
        adminIds.map((adminId) => ({
          user_id: adminId,
          project_id: id,
          type: "narrative_rejected",
          title: "narrative rejected — reworking",
          body: `${project.company_name} requested narrative changes on "${project.project_name}": ${notes}`,
        }))
      );
    }

    // Confirm to the project owner
    await adminClient.from("notifications").insert({
      user_id: user.id,
      project_id: id,
      type: "narrative_rejected_ack",
      title: "feedback received",
      body: "noted — the team will rework the narrative.",
    });

    return NextResponse.json({
      status: "narrative_review",
      message: "narrative revision requested",
    });
  }

  if (action === "escalate") {
    // Don't change status — just notify admins with escalation flag
    const adminIds = await getAdminUserIds(adminClient);
    if (adminIds.length > 0) {
      await adminClient.from("notifications").insert(
        adminIds.map((adminId) => ({
          user_id: adminId,
          project_id: id,
          type: "escalation",
          title: "narrative review — needs human attention",
          body: notes
            ? `${project.company_name} escalated narrative review for "${project.project_name}": ${notes}`
            : `${project.company_name} escalated narrative review for "${project.project_name}" — needs human review.`,
        }))
      );
    }

    await adminClient.from("notifications").insert({
      user_id: user.id,
      project_id: id,
      type: "escalation_ack",
      title: "we're on it",
      body: "your concern has been flagged — a team member will follow up directly.",
    });

    return NextResponse.json({
      status: "narrative_review",
      message: "escalation submitted",
    });
  }

  return NextResponse.json({ error: "unhandled action" }, { status: 400 });
}
