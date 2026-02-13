import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/versions?project_id=uuid
 * Returns version history for a project.
 * Auth: user must own the project or be admin.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Check project ownership or admin
  if (!isAdmin(user.email)) {
    const { data: project } = await admin
      .from("projects")
      .select("user_id")
      .eq("id", projectId)
      .single();

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const { data: versions, error } = await admin
    .from("pitchapp_versions")
    .select("*")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ versions: versions ?? [] });
}
