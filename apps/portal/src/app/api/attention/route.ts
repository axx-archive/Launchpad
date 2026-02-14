import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

interface AttentionItem {
  id: string;
  department: string;
  type: string;
  title: string;
  description: string;
  entity_id: string;
  entity_type: string;
  priority: "high" | "medium" | "low";
  action_url: string;
  created_at: string;
}

// GET /api/attention — attention queue: items requiring user action
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = isAdmin(user.email);
  const adminClient = createAdminClient();

  // Get user's project IDs (for non-admins, scope to membership)
  let projectIds: string[] | null = null;
  if (!admin) {
    const { data: memberships } = await adminClient
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);
    projectIds = (memberships ?? []).map((m) => m.project_id);
  }

  const items: AttentionItem[] = [];

  // --- 1. High-velocity trends with no brief (Intelligence) ---
  // Clusters with velocity_percentile > 70 that don't have a recent brief
  const { data: hotClusters } = await adminClient
    .from("trend_clusters")
    .select("id, name, velocity_percentile, lifecycle, updated_at")
    .eq("is_active", true)
    .gt("velocity_percentile", 70)
    .order("velocity_percentile", { ascending: false })
    .limit(20);

  if (hotClusters && hotClusters.length > 0) {
    // Check which clusters already have briefs
    const clusterIds = hotClusters.map((c) => c.id);
    const { data: briefs } = await adminClient
      .from("intelligence_briefs")
      .select("cluster_ids")
      .order("created_at", { ascending: false })
      .limit(50);

    const briefedClusterIds = new Set<string>();
    for (const brief of briefs ?? []) {
      for (const cid of (brief.cluster_ids as string[]) ?? []) {
        briefedClusterIds.add(cid);
      }
    }

    for (const cluster of hotClusters) {
      if (!briefedClusterIds.has(cluster.id)) {
        items.push({
          id: `trend-no-brief-${cluster.id}`,
          department: "intelligence",
          type: "trend_needs_brief",
          title: `"${cluster.name}" trending — no brief generated`,
          description: `${cluster.lifecycle} trend at ${Math.round(cluster.velocity_percentile)}th percentile with no associated brief.`,
          entity_id: cluster.id,
          entity_type: "trend_cluster",
          priority: cluster.velocity_percentile > 90 ? "high" : "medium",
          action_url: `/intelligence/trends/${cluster.id}`,
          created_at: cluster.updated_at,
        });
      }
    }
  }

  // --- 2. Completed research not promoted (Strategy) ---
  let researchCompleteQuery = adminClient
    .from("projects")
    .select("id, company_name, project_name, updated_at")
    .eq("department", "strategy")
    .eq("status", "research_complete");

  if (projectIds) {
    researchCompleteQuery = researchCompleteQuery.in("id", projectIds);
  }

  const { data: researchComplete } = await researchCompleteQuery.limit(20);

  for (const project of researchComplete ?? []) {
    // Check if already promoted
    const { count } = await adminClient
      .from("cross_department_refs")
      .select("id", { count: "exact", head: true })
      .eq("source_type", "project")
      .eq("source_id", project.id)
      .eq("relationship", "promoted_to");

    if (!count || count === 0) {
      items.push({
        id: `research-not-promoted-${project.id}`,
        department: "strategy",
        type: "research_not_promoted",
        title: `"${project.project_name}" research complete — not promoted`,
        description: `${project.company_name} — approved research ready to promote to Creative.`,
        entity_id: project.id,
        entity_type: "project",
        priority: "medium",
        action_url: `/project/${project.id}`,
        created_at: project.updated_at,
      });
    }
  }

  // --- 3. Narratives pending review (Creative) ---
  let narrativePendingQuery = adminClient
    .from("projects")
    .select("id, company_name, project_name, updated_at")
    .eq("department", "creative")
    .eq("status", "narrative_review");

  if (projectIds) {
    narrativePendingQuery = narrativePendingQuery.in("id", projectIds);
  }

  const { data: narrativePending } = await narrativePendingQuery.limit(20);

  for (const project of narrativePending ?? []) {
    items.push({
      id: `narrative-review-${project.id}`,
      department: "creative",
      type: "narrative_pending_review",
      title: `"${project.project_name}" narrative awaiting review`,
      description: `${project.company_name} — narrative ready for approval or revision.`,
      entity_id: project.id,
      entity_type: "project",
      priority: "high",
      action_url: `/project/${project.id}`,
      created_at: project.updated_at,
    });
  }

  // --- 4. Research pending review (Strategy) ---
  let researchReviewQuery = adminClient
    .from("projects")
    .select("id, company_name, project_name, updated_at")
    .eq("department", "strategy")
    .eq("status", "research_review");

  if (projectIds) {
    researchReviewQuery = researchReviewQuery.in("id", projectIds);
  }

  const { data: researchReview } = await researchReviewQuery.limit(20);

  for (const project of researchReview ?? []) {
    items.push({
      id: `research-review-${project.id}`,
      department: "strategy",
      type: "research_pending_review",
      title: `"${project.project_name}" research awaiting review`,
      description: `${project.company_name} — research ready for approval or revision.`,
      entity_id: project.id,
      entity_type: "project",
      priority: "high",
      action_url: `/project/${project.id}`,
      created_at: project.updated_at,
    });
  }

  // --- 5. PitchApps pending review (Creative) ---
  let pitchappReviewQuery = adminClient
    .from("projects")
    .select("id, company_name, project_name, pitchapp_url, updated_at")
    .eq("department", "creative")
    .eq("status", "review");

  if (projectIds) {
    pitchappReviewQuery = pitchappReviewQuery.in("id", projectIds);
  }

  const { data: pitchappReview } = await pitchappReviewQuery.limit(20);

  for (const project of pitchappReview ?? []) {
    items.push({
      id: `pitchapp-review-${project.id}`,
      department: "creative",
      type: "pitchapp_pending_review",
      title: `"${project.project_name}" PitchApp awaiting review`,
      description: `${project.company_name} — PitchApp deployed and ready for review.`,
      entity_id: project.id,
      entity_type: "project",
      priority: "high",
      action_url: `/project/${project.id}`,
      created_at: project.updated_at,
    });
  }

  // Sort by priority (high > medium > low), then by created_at descending
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return NextResponse.json({
    items,
    total: items.length,
  });
}
