import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { ProjectStatus } from "@/types/database";

const VALID_STATUSES: ProjectStatus[] = [
  "requested",
  "in_progress",
  "review",
  "revision",
  "live",
  "on_hold",
];

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

  const { data, error } = await adminClient
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: data });
}
