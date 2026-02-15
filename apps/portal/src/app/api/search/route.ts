import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

const MAX_RESULTS_PER_TYPE = 10;

// GET /api/search — universal search across departments
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: "query must be at least 2 characters" },
      { status: 400 },
    );
  }

  // Cap search term length
  const term = query.slice(0, 200);
  const pattern = `%${term}%`;

  const admin = isAdmin(user.email);
  const adminClient = createAdminClient();

  // --- Projects ---
  // Admins see all projects; non-admins see only their projects via membership
  let projectResults: Record<string, unknown>[] = [];

  if (admin) {
    const { data } = await adminClient
      .from("projects")
      .select("id, company_name, project_name, department, status, type, updated_at")
      .or(`company_name.ilike.${pattern},project_name.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(MAX_RESULTS_PER_TYPE);
    projectResults = data ?? [];
  } else {
    // Non-admin: search through project_members join
    const { data: memberships } = await adminClient
      .from("project_members")
      .select("role, projects!inner(id, company_name, project_name, department, status, type, updated_at)")
      .eq("user_id", user.id)
      .or(
        `projects.company_name.ilike.${pattern},projects.project_name.ilike.${pattern}`,
      )
      .limit(MAX_RESULTS_PER_TYPE);

    projectResults = (memberships ?? [])
      .filter((m) => m.projects)
      .map((m) => {
        const project = m.projects as unknown as Record<string, unknown>;
        return { ...project, _userRole: m.role };
      });
  }

  // --- Trend Clusters (Intelligence) ---
  const { data: clusterResults } = await adminClient
    .from("trend_clusters")
    .select("id, name, summary, category, lifecycle, velocity_percentile, signal_count")
    .eq("is_active", true)
    .or(`name.ilike.${pattern},summary.ilike.${pattern},category.ilike.${pattern}`)
    .order("velocity_percentile", { ascending: false })
    .limit(MAX_RESULTS_PER_TYPE);

  // --- Entities (Intelligence) ---
  const { data: entityResults } = await adminClient
    .from("entities")
    .select("id, name, entity_type, normalized_name, signal_count")
    .ilike("name", pattern)
    .order("signal_count", { ascending: false })
    .limit(MAX_RESULTS_PER_TYPE);

  // --- Project Research (Strategy) ---
  // Only search research for projects the user can access
  let researchResults: Record<string, unknown>[] = [];

  if (admin) {
    const { data } = await adminClient
      .from("project_research")
      .select("id, project_id, version, research_type, status, created_at")
      .ilike("content", pattern)
      .order("created_at", { ascending: false })
      .limit(MAX_RESULTS_PER_TYPE);
    researchResults = data ?? [];
  } else {
    // Non-admin: filter to projects they have membership on
    const { data: memberProjects } = await adminClient
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);

    const memberProjectIds = (memberProjects ?? []).map((m) => m.project_id);

    if (memberProjectIds.length > 0) {
      const { data } = await adminClient
        .from("project_research")
        .select("id, project_id, version, research_type, status, created_at")
        .in("project_id", memberProjectIds)
        .ilike("content", pattern)
        .order("created_at", { ascending: false })
        .limit(MAX_RESULTS_PER_TYPE);
      researchResults = data ?? [];
    }
  }

  // Enrich research results with project context
  const researchProjectIds = [...new Set(researchResults.map((r) => r.project_id as string))];
  let researchProjects: Record<string, Record<string, unknown>> = {};
  if (researchProjectIds.length > 0) {
    const { data } = await adminClient
      .from("projects")
      .select("id, company_name, project_name, department")
      .in("id", researchProjectIds);
    for (const p of data ?? []) {
      researchProjects[p.id] = p;
    }
  }

  const enrichedResearch = researchResults.map((r) => ({
    ...r,
    _project: researchProjects[r.project_id as string] ?? null,
  }));

  // Boost user's own projects to the top of results
  // Fetch user's project memberships for relevance boosting
  const { data: userMemberships } = await adminClient
    .from("project_members")
    .select("project_id")
    .eq("user_id", user.id);
  const userProjectIds = new Set((userMemberships ?? []).map((m) => m.project_id));

  // Sort: user's projects first, then by updated_at
  projectResults.sort((a, b) => {
    const aIsMember = userProjectIds.has(a.id as string) ? 0 : 1;
    const bIsMember = userProjectIds.has(b.id as string) ? 0 : 1;
    if (aIsMember !== bIsMember) return aIsMember - bIsMember;
    const aTime = new Date(a.updated_at as string).getTime();
    const bTime = new Date(b.updated_at as string).getTime();
    return bTime - aTime;
  });

  // Annotate results with membership flag
  for (const p of projectResults) {
    p._isMember = userProjectIds.has(p.id as string);
  }

  // Fetch cross-department refs for search results to show provenance
  const resultProjectIds = projectResults.map((p) => p.id as string).filter(Boolean);
  let resultRefs: Record<string, unknown>[] = [];
  if (resultProjectIds.length > 0) {
    const { data: refs } = await adminClient
      .from("cross_department_refs")
      .select("source_department, source_id, target_department, target_id, relationship")
      .or(`source_id.in.(${resultProjectIds.join(",")}),target_id.in.(${resultProjectIds.join(",")})`)
      .limit(50);
    resultRefs = refs ?? [];
  }

  // Group results by department
  const projectsByDept: Record<string, Record<string, unknown>[]> = {
    intelligence: [],
    strategy: [],
    creative: [],
  };

  for (const p of projectResults) {
    const dept = (p.department as string) ?? "creative";
    if (!projectsByDept[dept]) projectsByDept[dept] = [];
    projectsByDept[dept].push(p);
  }

  const totalResults =
    projectResults.length +
    (clusterResults?.length ?? 0) +
    (entityResults?.length ?? 0) +
    enrichedResearch.length;

  return NextResponse.json({
    query: term,
    total_results: totalResults,
    results: {
      projects: projectsByDept,
      clusters: clusterResults ?? [],
      entities: entityResults ?? [],
      research: enrichedResearch,
      refs: resultRefs,
    },
  });
}
