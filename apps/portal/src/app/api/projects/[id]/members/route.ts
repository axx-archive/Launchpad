import { verifyProjectAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/projects/[id]/members — list members + pending invitations
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const adminClient = createAdminClient();

  // Fetch members with profile info
  const { data: members, error: membersError } = await adminClient
    .from("project_members")
    .select("id, user_id, role, created_at, user_profiles(email, display_name, avatar_url)")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  if (membersError) {
    console.error("Failed to list members:", membersError.message);
    return NextResponse.json({ error: "failed to list members" }, { status: 500 });
  }

  // Flatten profile join into member objects
  const flatMembers = (members ?? []).map((m) => {
    const profile = m.user_profiles as unknown as {
      email: string;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
    return {
      id: m.id,
      user_id: m.user_id,
      email: profile?.email ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      role: m.role,
      created_at: m.created_at,
    };
  });

  // Fetch pending invitations (only for owners — others see members only)
  let pendingInvitations: {
    id: string;
    email: string;
    role: string;
    invited_by: string;
    expires_at: string;
    created_at: string;
  }[] = [];

  if (access.isAdmin || access.role === "owner") {
    const { data: invitations } = await adminClient
      .from("project_invitations")
      .select("id, email, role, invited_by, expires_at, created_at")
      .eq("project_id", id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });

    pendingInvitations = invitations ?? [];
  }

  return NextResponse.json({
    members: flatMembers,
    pending_invitations: pendingInvitations,
    currentUserId: access.user.id,
  });
}
