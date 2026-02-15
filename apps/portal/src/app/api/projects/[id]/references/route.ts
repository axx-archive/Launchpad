import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/projects/[id]/references — cross-department reference chain for a project
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

  // Fetch references where this project is the source
  const { data: outgoing, error: outError } = await adminClient
    .from("cross_department_refs")
    .select("*")
    .eq("source_id", id)
    .order("created_at", { ascending: false });

  if (outError) {
    console.error("Failed to load outgoing references:", outError.message);
    return NextResponse.json({ error: "failed to load references" }, { status: 500 });
  }

  // Fetch references where this project is the target
  const { data: incoming, error: inError } = await adminClient
    .from("cross_department_refs")
    .select("*")
    .eq("target_id", id)
    .order("created_at", { ascending: false });

  if (inError) {
    console.error("Failed to load incoming references:", inError.message);
    return NextResponse.json({ error: "failed to load references" }, { status: 500 });
  }

  // Collect all referenced project IDs for enrichment
  const refProjectIds = new Set<string>();
  for (const ref of outgoing ?? []) {
    if (ref.target_type === "project") refProjectIds.add(ref.target_id);
  }
  for (const ref of incoming ?? []) {
    if (ref.source_type === "project") refProjectIds.add(ref.source_id);
  }
  refProjectIds.delete(id); // exclude the current project

  // Fetch referenced project summaries
  let relatedProjects: Record<string, unknown>[] = [];
  if (refProjectIds.size > 0) {
    const { data } = await adminClient
      .from("projects")
      .select("id, company_name, project_name, department, status, type")
      .in("id", Array.from(refProjectIds));
    relatedProjects = data ?? [];
  }

  // Fetch trend links for this project
  const { data: trendLinks, error: trendError } = await adminClient
    .from("project_trend_links")
    .select("id, cluster_id, link_type, notes, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  if (trendError) {
    console.error("Failed to load trend links:", trendError.message);
  }

  // Enrich trend links with cluster summaries
  let linkedClusters: Record<string, unknown>[] = [];
  const clusterIds = (trendLinks ?? []).map((tl) => tl.cluster_id);
  if (clusterIds.length > 0) {
    const { data } = await adminClient
      .from("trend_clusters")
      .select("id, name, lifecycle, velocity_score, velocity_percentile, signal_count")
      .in("id", clusterIds);
    linkedClusters = data ?? [];
  }

  return NextResponse.json({
    outgoing: outgoing ?? [],
    incoming: incoming ?? [],
    related_projects: relatedProjects,
    trend_links: trendLinks ?? [],
    linked_clusters: linkedClusters,
  });
}
