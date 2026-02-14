import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * POST /api/invitations/auto-accept
 *
 * Called from the auth callback after successful sign-in.
 * Checks for pending project invitations matching the authenticated user's
 * email and converts them into active project_members records.
 *
 * Uses the admin client (service role) because:
 * - The user isn't a project member yet, so RLS would block the INSERT
 * - Invitation status updates require admin-level access
 *
 * This endpoint is idempotent — calling it multiple times is safe.
 */
export async function POST() {
  // 1. Get the authenticated user from the session
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  try {
    // 2. Upsert user_profiles record (ensures profile exists for collaborator display)
    await adminClient.from("user_profiles").upsert(
      {
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.full_name ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
      },
      { onConflict: "id" }
    );

    // 3. Find pending invitations for this email
    const { data: invitations, error: invError } = await adminClient
      .from("project_invitations")
      .select("id, project_id, role")
      .eq("email", user.email.toLowerCase())
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString());

    if (invError) {
      console.error("[auto-accept] Failed to query invitations:", invError.message);
      return NextResponse.json({ accepted: 0 });
    }

    if (!invitations || invitations.length === 0) {
      return NextResponse.json({ accepted: 0 });
    }

    // 4. Convert each invitation into a project_members record
    let accepted = 0;

    for (const inv of invitations) {
      // Insert membership — use upsert to handle race conditions
      const { error: memberError } = await adminClient
        .from("project_members")
        .upsert(
          {
            project_id: inv.project_id,
            user_id: user.id,
            role: inv.role,
            invited_by: null, // Could be resolved from invitation but not critical
          },
          { onConflict: "project_id,user_id" }
        );

      if (memberError) {
        console.error(
          `[auto-accept] Failed to create membership for project ${inv.project_id}:`,
          memberError.message
        );
        continue;
      }

      // Mark invitation as accepted
      await adminClient
        .from("project_invitations")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", inv.id);

      accepted++;
    }

    return NextResponse.json({ accepted });
  } catch (err) {
    console.error("[auto-accept] Unexpected error:", err);
    // Return success with 0 accepted — never block sign-in
    return NextResponse.json({ accepted: 0 });
  }
}
