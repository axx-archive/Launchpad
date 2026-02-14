import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, getProjectMemberIds } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { ProjectStatus, AutonomyLevel } from "@/types/database";
import { sendStatusChangeEmail } from "@/lib/email";

const VALID_STATUSES: ProjectStatus[] = [
  "requested",
  "narrative_review",
  "brand_collection",
  "in_progress",
  "review",
  "revision",
  "live",
  "on_hold",
];

const VALID_AUTONOMY: AutonomyLevel[] = ["manual", "supervised", "full_auto"];

// PATCH /api/projects/[id]/status — update project status (admin only)
export async function PATCH(
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

  // Only admins can change project status directly
  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const newStatus = body.status as ProjectStatus;

  if (!VALID_STATUSES.includes(newStatus)) {
    return NextResponse.json(
      { error: `invalid status. must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // Admin operations use service role client to bypass RLS
  const adminClient = createAdminClient();
  const updates: Record<string, unknown> = { status: newStatus };

  if (body.autonomy_level !== undefined) {
    const level = body.autonomy_level as AutonomyLevel;
    if (!VALID_AUTONOMY.includes(level)) {
      return NextResponse.json(
        { error: `invalid autonomy_level. must be one of: ${VALID_AUTONOMY.join(", ")}` },
        { status: 400 }
      );
    }
    updates.autonomy_level = level;
  }

  if (body.pitchapp_url !== undefined) {
    const url = body.pitchapp_url as string;
    if (url && !url.startsWith("https://")) {
      return NextResponse.json(
        { error: "pitchapp_url must start with https://" },
        { status: 400 }
      );
    }
    updates.pitchapp_url = url || null;
  }

  // Fetch the project first to get the owner and previous status
  const { data: existingProject } = await adminClient
    .from("projects")
    .select("user_id, status, project_name, company_name")
    .eq("id", id)
    .single();

  const { data, error } = await adminClient
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify all project members on key status transitions
  if (existingProject && existingProject.status !== newStatus) {
    const notifyStatuses: Record<string, { title: string; body: string }> = {
      narrative_review: {
        title: "your story is ready for review",
        body: `${existingProject.project_name} — your narrative is ready. review it in your dashboard.`,
      },
      review: {
        title: "your pitchapp is ready for review",
        body: `${existingProject.project_name} is ready — check the preview link in your dashboard.`,
      },
      live: {
        title: "your pitchapp is live",
        body: `${existingProject.project_name} is live and ready to share.`,
      },
    };

    const notification = notifyStatuses[newStatus];
    if (notification) {
      // Notify all project members (status events go to everyone)
      const memberIds = await getProjectMemberIds(id);

      if (memberIds.length > 0) {
        await adminClient.from("notifications").insert(
          memberIds.map((memberId) => ({
            user_id: memberId,
            project_id: id,
            type: `status_${newStatus}`,
            title: notification.title,
            body: notification.body,
          }))
        );
      }

      // Send email notification for review/live transitions to the project owner
      try {
        const { data: userData } = await adminClient.auth.admin.getUserById(
          existingProject.user_id
        );
        if (userData?.user?.email) {
          const pitchappUrl = (data as Record<string, unknown>).pitchapp_url as string | null;
          sendStatusChangeEmail(
            userData.user.email,
            existingProject.project_name,
            newStatus,
            pitchappUrl,
          ).catch((err) => console.error("Failed to send status email:", err));
        }
      } catch (err) {
        console.error("Failed to resolve user email for notification:", err);
      }
    }
  }

  return NextResponse.json({ project: data });
}
