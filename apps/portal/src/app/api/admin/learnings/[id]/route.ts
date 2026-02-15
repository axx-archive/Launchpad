import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/learnings/[id]
 * Single learning with version history.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: learning, error } = await admin
    .from("system_learnings")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !learning) {
    return NextResponse.json({ error: "learning not found" }, { status: 404 });
  }

  // Fetch version history
  const { data: versions } = await admin
    .from("learning_versions")
    .select("*")
    .eq("learning_id", id)
    .order("version", { ascending: false });

  return NextResponse.json({ learning, versions: versions ?? [] });
}

/**
 * PATCH /api/admin/learnings/[id]
 * Admin override, archive, annotate.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const body = await req.json();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.status) updates.status = body.status;
  if (body.admin_notes !== undefined) updates.admin_notes = body.admin_notes;
  if (body.confidence !== undefined) updates.confidence = body.confidence;

  const { data, error } = await admin
    .from("system_learnings")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to update learning:", error);
    return NextResponse.json({ error: "failed to update learning" }, { status: 500 });
  }

  return NextResponse.json({ learning: data });
}
