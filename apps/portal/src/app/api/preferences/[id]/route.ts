import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * DELETE /api/preferences/[id]
 * Delete a specific user preference (only own preferences).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  // Verify ownership before deleting
  const { data: pref } = await admin
    .from("user_preferences")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (!pref) {
    return NextResponse.json({ error: "preference not found" }, { status: 404 });
  }

  if (pref.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await admin
    .from("user_preferences")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete preference:", error);
    return NextResponse.json({ error: "failed to delete preference" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
