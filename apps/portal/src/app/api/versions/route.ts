import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/versions?project_id=uuid
 * Returns version history for a project.
 * Auth: user must be a project member or admin.
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const access = await verifyProjectAccess(projectId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const admin = createAdminClient();

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
