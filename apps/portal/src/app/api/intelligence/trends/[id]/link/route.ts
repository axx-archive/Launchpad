import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const VALID_LINK_TYPES = ["reference", "inspiration", "tracking"];

// POST /api/intelligence/trends/[id]/link — link a trend cluster to a project
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clusterId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const projectId = body.project_id;
  if (typeof projectId !== "string" || !projectId.trim()) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  // Verify user has access to the project (any member can link trends)
  const access = await verifyProjectAccess(projectId as string);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const linkType = typeof body.link_type === "string" && VALID_LINK_TYPES.includes(body.link_type)
    ? body.link_type
    : "reference";

  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : null;

  const adminClient = createAdminClient();

  // Verify cluster exists
  const { data: cluster, error: clusterError } = await adminClient
    .from("trend_clusters")
    .select("id, name")
    .eq("id", clusterId)
    .single();

  if (clusterError || !cluster) {
    return NextResponse.json({ error: "trend cluster not found" }, { status: 404 });
  }

  // Insert link (unique constraint on project_id + cluster_id handles dupes)
  const { data: link, error: linkError } = await adminClient
    .from("project_trend_links")
    .insert({
      project_id: projectId,
      cluster_id: clusterId,
      link_type: linkType,
      notes,
    })
    .select()
    .single();

  if (linkError) {
    if (linkError.code === "23505") {
      return NextResponse.json({ error: "trend already linked to this project" }, { status: 409 });
    }
    console.error("Failed to link trend:", linkError.message);
    return NextResponse.json({ error: "failed to link trend" }, { status: 500 });
  }

  // Also create a cross_department_refs entry for provenance
  await adminClient.from("cross_department_refs").insert({
    source_department: "intelligence",
    source_type: "trend",
    source_id: clusterId,
    target_department: access.project.department || "creative",
    target_type: "project",
    target_id: projectId,
    relationship: "references",
    metadata: {
      link_type: linkType,
      linked_by: user.id,
      cluster_name: cluster.name,
    },
  });

  return NextResponse.json({
    link,
    message: "trend linked to project",
  }, { status: 201 });
}
