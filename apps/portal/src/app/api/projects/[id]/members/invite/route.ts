import { verifyProjectAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInvitationEmail } from "@/lib/email";
import { NextResponse } from "next/server";
import type { MemberRole } from "@/types/database";

const MAX_MEMBERS_PER_PROJECT = 10;
const VALID_INVITE_ROLES: MemberRole[] = ["editor", "viewer"];

// POST /api/projects/[id]/members/invite — invite user by email (owner only)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id, "owner");

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: { email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const role = body.role as MemberRole | undefined;

  // Validate email format
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "valid email is required" }, { status: 400 });
  }

  // Validate role
  if (!role || !VALID_INVITE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${VALID_INVITE_ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  // Prevent self-invite
  if (email === access.user.email?.toLowerCase()) {
    return NextResponse.json({ error: "cannot invite yourself" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Check member cap (M6)
  const { count } = await adminClient
    .from("project_members")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id);

  if ((count ?? 0) >= MAX_MEMBERS_PER_PROJECT) {
    return NextResponse.json(
      { error: `project member limit reached (max ${MAX_MEMBERS_PER_PROJECT})` },
      { status: 400 },
    );
  }

  // Check if email belongs to an existing Launchpad user
  const { data: userData } = await adminClient.auth.admin.listUsers();
  const existingUser = (userData?.users ?? []).find(
    (u) => u.email?.toLowerCase() === email,
  );

  if (existingUser) {
    // Check if already a member (using user_id directly)
    const { data: memberCheck } = await adminClient
      .from("project_members")
      .select("id")
      .eq("project_id", id)
      .eq("user_id", existingUser.id)
      .single();

    if (memberCheck) {
      return NextResponse.json(
        { error: `${email} already has access` },
        { status: 409 },
      );
    }

    // Existing user: insert into project_members immediately
    const { data: membership, error: insertError } = await adminClient
      .from("project_members")
      .insert({
        project_id: id,
        user_id: existingUser.id,
        role,
        invited_by: access.user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to create membership:", insertError.message);
      return NextResponse.json({ error: "failed to add member" }, { status: 500 });
    }

    // Update project visibility to 'shared' if it isn't already
    await adminClient
      .from("projects")
      .update({ visibility: "shared" })
      .eq("id", id)
      .eq("visibility", "private");

    // Notify the invitee (in-app + email)
    await adminClient.from("notifications").insert({
      user_id: existingUser.id,
      project_id: id,
      type: "added_to_project",
      title: "you've been added to a project",
      body: `${access.user.email} added you as ${role} on a project.`,
    });

    const { data: proj } = await adminClient
      .from("projects")
      .select("project_name")
      .eq("id", id)
      .single();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://launchpad.bonfire.tools";
    sendInvitationEmail({
      to: email,
      inviterEmail: access.user.email ?? "a teammate",
      projectName: proj?.project_name ?? "a project",
      role,
      loginUrl: `${siteUrl}/project/${id}`,
    }).catch((err) => console.error("Failed to send invitation email:", err));

    return NextResponse.json(
      { status: "active", membership },
      { status: 201 },
    );
  }

  // Check for existing pending invitation
  const { data: existingInvitation } = await adminClient
    .from("project_invitations")
    .select("id")
    .eq("project_id", id)
    .eq("email", email)
    .eq("status", "pending")
    .single();

  if (existingInvitation) {
    return NextResponse.json(
      { error: `pending invitation already exists for ${email}` },
      { status: 409 },
    );
  }

  // Non-existing user: create invitation
  const { data: invitation, error: inviteError } = await adminClient
    .from("project_invitations")
    .insert({
      project_id: id,
      email,
      role,
      invited_by: access.user.id,
    })
    .select("id, email, role, expires_at, created_at")
    .single();

  if (inviteError) {
    console.error("Failed to create invitation:", inviteError.message);
    return NextResponse.json({ error: "failed to create invitation" }, { status: 500 });
  }

  // Update project visibility to 'shared'
  await adminClient
    .from("projects")
    .update({ visibility: "shared" })
    .eq("id", id)
    .eq("visibility", "private");

  // Send invitation email to the non-existing user
  const { data: proj } = await adminClient
    .from("projects")
    .select("project_name")
    .eq("id", id)
    .single();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://launchpad.bonfire.tools";
  sendInvitationEmail({
    to: email,
    inviterEmail: access.user.email ?? "a teammate",
    projectName: proj?.project_name ?? "a project",
    role,
    loginUrl: `${siteUrl}/sign-in`,
  }).catch((err) => console.error("Failed to send invitation email:", err));

  return NextResponse.json(
    { status: "pending", invitation },
    { status: 201 },
  );
}
