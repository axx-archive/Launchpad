import { verifyProjectAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { MemberRole } from "@/types/database";

const VALID_ROLES: MemberRole[] = ["editor", "viewer"];

// DELETE /api/projects/[id]/members/[userId] — remove a member
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id, userId } = await params;
  const access = await verifyProjectAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const isOwner = access.isAdmin || access.role === "owner";
  const isSelf = access.user.id === userId;

  // Only owners can remove others; members can remove themselves (leave)
  if (!isOwner && !isSelf) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Prevent owner from removing themselves
  if (isSelf && access.role === "owner") {
    return NextResponse.json(
      { error: "project must have an owner. transfer ownership before leaving." },
      { status: 403 },
    );
  }

  const adminClient = createAdminClient();

  // Verify target is actually a member
  const { data: targetMember } = await adminClient
    .from("project_members")
    .select("id, role")
    .eq("project_id", id)
    .eq("user_id", userId)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: "member not found" }, { status: 404 });
  }

  // Prevent removing the last owner
  if (targetMember.role === "owner") {
    return NextResponse.json(
      { error: "cannot remove the project owner" },
      { status: 403 },
    );
  }

  const { error } = await adminClient
    .from("project_members")
    .delete()
    .eq("project_id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to remove member:", error.message);
    return NextResponse.json({ error: "failed to remove member" }, { status: 500 });
  }

  return NextResponse.json({ removed: true });
}

// PATCH /api/projects/[id]/members/[userId] — change member role
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id, userId } = await params;
  const access = await verifyProjectAccess(id, "owner");

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: { role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const newRole = body.role as MemberRole | undefined;

  if (!newRole || !VALID_ROLES.includes(newRole)) {
    return NextResponse.json(
      { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  // Prevent changing own role
  if (access.user.id === userId) {
    return NextResponse.json(
      { error: "cannot change your own role" },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  // Verify target is a member and not the owner
  const { data: targetMember } = await adminClient
    .from("project_members")
    .select("id, role")
    .eq("project_id", id)
    .eq("user_id", userId)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: "member not found" }, { status: 404 });
  }

  if (targetMember.role === "owner") {
    return NextResponse.json(
      { error: "cannot change the owner's role. use ownership transfer instead." },
      { status: 400 },
    );
  }

  const { data: updated, error } = await adminClient
    .from("project_members")
    .update({ role: newRole })
    .eq("project_id", id)
    .eq("user_id", userId)
    .select("user_id, role")
    .single();

  if (error || !updated) {
    console.error("Failed to update role:", error?.message);
    return NextResponse.json({ error: "failed to update role" }, { status: 500 });
  }

  return NextResponse.json({ member: updated });
}
