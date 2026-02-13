import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUserIds } from "@/lib/auth";
import { NextResponse } from "next/server";
import { sendStatusChangeEmail } from "@/lib/email";

type ApprovalAction = "approve" | "request_changes" | "escalate";

const VALID_ACTIONS: ApprovalAction[] = ["approve", "request_changes", "escalate"];

// POST /api/projects/[id]/approve — client approval action
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

  const action = body.action as ApprovalAction;
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : null;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `invalid action. must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  // Load the project (RLS ensures user owns it)
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, user_id, status, project_name, company_name, pitchapp_url")
    .eq("id", id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // Verify the requesting user owns this project
  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Only allowed when status is "review"
  if (project.status !== "review") {
    return NextResponse.json(
      { error: "approval actions are only available when the project is in review" },
      { status: 409 }
    );
  }

  const adminClient = createAdminClient();

  if (action === "approve") {
    // Set status to "live"
    const { error: updateError } = await adminClient
      .from("projects")
      .update({ status: "live" })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Notify the project owner
    await adminClient.from("notifications").insert({
      user_id: user.id,
      project_id: id,
      type: "status_live",
      title: "your pitchapp is live",
      body: `${project.project_name} has been approved and is now live.`,
    });

    // Notify admins
    const adminIds = await getAdminUserIds(adminClient);
    if (adminIds.length > 0) {
      await adminClient.from("notifications").insert(
        adminIds.map((adminId) => ({
          user_id: adminId,
          project_id: id,
          type: "client_approved",
          title: "client approved — now live",
          body: `${project.company_name} approved "${project.project_name}".`,
        }))
      );
    }

    // Send email notification
    if (user.email) {
      await sendStatusChangeEmail(
        user.email,
        project.project_name,
        "live",
        project.pitchapp_url,
      ).catch((err) => console.error("Failed to send approval email:", err));
    }

    return NextResponse.json({ status: "live", message: "pitchapp is now live" });
  }

  if (action === "request_changes") {
    // Set status to "revision"
    const { error: updateError } = await adminClient
      .from("projects")
      .update({ status: "revision" })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Notify admins about requested changes
    const adminIds = await getAdminUserIds(adminClient);
    if (adminIds.length > 0) {
      await adminClient.from("notifications").insert(
        adminIds.map((adminId) => ({
          user_id: adminId,
          project_id: id,
          type: "changes_requested",
          title: "client requested changes",
          body: message
            ? `${project.company_name} requested changes on "${project.project_name}": ${message}`
            : `${project.company_name} requested changes on "${project.project_name}".`,
        }))
      );
    }

    // Confirm to the project owner
    await adminClient.from("notifications").insert({
      user_id: user.id,
      project_id: id,
      type: "changes_requested_ack",
      title: "change request received",
      body: "we got your feedback — the build team will start revisions.",
    });

    return NextResponse.json({ status: "revision", message: "change request submitted" });
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
          title: "needs human attention",
          body: message
            ? `${project.company_name} escalated "${project.project_name}": ${message}`
            : `${project.company_name} escalated "${project.project_name}" — needs human review.`,
        }))
      );
    }

    // Confirm to the project owner
    await adminClient.from("notifications").insert({
      user_id: user.id,
      project_id: id,
      type: "escalation_ack",
      title: "we're on it",
      body: "your concern has been flagged — a team member will follow up directly.",
    });

    return NextResponse.json({ status: "review", message: "escalation submitted" });
  }

  return NextResponse.json({ error: "unhandled action" }, { status: 400 });
}
