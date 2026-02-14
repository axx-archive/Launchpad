import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/departments/overview — aggregate stats for all 3 departments (admin-only)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all projects with department + status
  const { data: allProjects, error: projError } = await adminClient
    .from("projects")
    .select("id, department, status, created_at, updated_at");

  if (projError) {
    console.error("Failed to load projects:", projError.message);
    return NextResponse.json({ error: "failed to load projects" }, { status: 500 });
  }

  const projects = allProjects ?? [];

  // Group by department
  type DeptStats = {
    total: number;
    by_status: Record<string, number>;
    created_7d: number;
    active: number;
  };

  const departments: Record<string, DeptStats> = {
    intelligence: { total: 0, by_status: {}, created_7d: 0, active: 0 },
    strategy: { total: 0, by_status: {}, created_7d: 0, active: 0 },
    creative: { total: 0, by_status: {}, created_7d: 0, active: 0 },
  };

  const terminalStatuses = new Set(["completed", "archived", "research_complete"]);

  for (const p of projects) {
    const dept = (p.department as string) ?? "creative";
    if (!departments[dept]) {
      departments[dept] = { total: 0, by_status: {}, created_7d: 0, active: 0 };
    }

    departments[dept].total += 1;
    const status = p.status as string;
    departments[dept].by_status[status] = (departments[dept].by_status[status] ?? 0) + 1;

    if (p.created_at && p.created_at >= oneWeekAgo) {
      departments[dept].created_7d += 1;
    }

    if (!terminalStatuses.has(status)) {
      departments[dept].active += 1;
    }
  }

  // Intelligence-specific: cluster + signal counts
  const [
    clusterCountResult,
    activeClustersResult,
    signals24hResult,
    signalsTotalResult,
  ] = await Promise.all([
    adminClient.from("trend_clusters").select("id", { count: "exact", head: true }),
    adminClient.from("trend_clusters").select("id", { count: "exact", head: true }).eq("is_active", true),
    adminClient.from("signals").select("id", { count: "exact", head: true }).gte("ingested_at", oneDayAgo),
    adminClient.from("signals").select("id", { count: "exact", head: true }),
  ]);

  // Strategy-specific: research counts
  const [
    researchTotalResult,
    researchDraftResult,
  ] = await Promise.all([
    adminClient.from("project_research").select("id", { count: "exact", head: true }),
    adminClient.from("project_research").select("id", { count: "exact", head: true }).eq("status", "draft"),
  ]);

  // Cross-department refs count
  const { count: refsCount } = await adminClient
    .from("cross_department_refs")
    .select("id", { count: "exact", head: true });

  // Recent automation activity (last 24h) per department
  const { data: recentLogs } = await adminClient
    .from("automation_log")
    .select("department, event")
    .gte("created_at", oneDayAgo);

  const activityByDept: Record<string, number> = {};
  for (const log of recentLogs ?? []) {
    const dept = (log.department as string) ?? "unknown";
    activityByDept[dept] = (activityByDept[dept] ?? 0) + 1;
  }

  return NextResponse.json({
    departments: {
      intelligence: {
        ...departments.intelligence,
        clusters_total: clusterCountResult.count ?? 0,
        clusters_active: activeClustersResult.count ?? 0,
        signals_total: signalsTotalResult.count ?? 0,
        signals_24h: signals24hResult.count ?? 0,
        activity_24h: activityByDept.intelligence ?? 0,
      },
      strategy: {
        ...departments.strategy,
        research_total: researchTotalResult.count ?? 0,
        research_pending_review: researchDraftResult.count ?? 0,
        activity_24h: activityByDept.strategy ?? 0,
      },
      creative: {
        ...departments.creative,
        activity_24h: activityByDept.creative ?? 0,
      },
    },
    cross_department_refs: refsCount ?? 0,
    total_projects: projects.length,
  });
}
