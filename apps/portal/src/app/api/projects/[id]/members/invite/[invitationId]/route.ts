import { verifyProjectAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// DELETE /api/projects/[id]/members/invite/[invitationId] — revoke pending invitation
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; invitationId: string }> },
) {
  const { id, invitationId } = await params;
  const access = await verifyProjectAccess(id, "owner");

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const adminClient = createAdminClient();

  // Verify invitation exists and is pending
  const { data: invitation } = await adminClient
    .from("project_invitations")
    .select("id, status")
    .eq("id", invitationId)
    .eq("project_id", id)
    .single();

  if (!invitation) {
    return NextResponse.json({ error: "invitation not found" }, { status: 404 });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json(
      { error: "invitation is no longer pending" },
      { status: 400 },
    );
  }

  // Set status to revoked
  const { error } = await adminClient
    .from("project_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId);

  if (error) {
    console.error("Failed to revoke invitation:", error.message);
    return NextResponse.json({ error: "failed to revoke invitation" }, { status: 500 });
  }

  return NextResponse.json({ revoked: true });
}
