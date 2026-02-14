import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { NextResponse } from "next/server";

// DELETE /api/intelligence/trends/[id]/link/[projectId] — unlink a trend from a project
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: clusterId, projectId } = await params;

  // Verify user has access to the project
  const access = await verifyProjectAccess(projectId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const adminClient = createAdminClient();

  // Delete the link
  const { error: deleteError } = await adminClient
    .from("project_trend_links")
    .delete()
    .eq("project_id", projectId)
    .eq("cluster_id", clusterId);

  if (deleteError) {
    console.error("Failed to unlink trend:", deleteError.message);
    return NextResponse.json({ error: "failed to unlink trend" }, { status: 500 });
  }

  return NextResponse.json({ message: "trend unlinked from project" });
}
