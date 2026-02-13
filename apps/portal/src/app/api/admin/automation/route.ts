import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/automation
 * Returns automation pipeline status: jobs, costs, health.
 * Admin-only.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Pipeline jobs (if table exists — gracefully handle if not yet created)
  let jobs: Record<string, unknown>[] = [];
  let jobsError = false;
  try {
    const { data, error } = await admin
      .from("pipeline_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) jobs = data;
    else jobsError = true;
  } catch {
    jobsError = true;
  }

  // Automation log (if table exists)
  let logs: Record<string, unknown>[] = [];
  try {
    const { data, error } = await admin
      .from("automation_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) logs = data;
  } catch {
    // Table may not exist yet
  }

  // Analytics overview — total events today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let analyticsToday = 0;
  try {
    const { count } = await admin
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", today.toISOString());
    analyticsToday = count ?? 0;
  } catch {
    // Table may not exist yet
  }

  // Live PitchApps count
  const { data: liveProjects } = await admin
    .from("projects")
    .select("id, pitchapp_url, company_name, project_name, status")
    .not("pitchapp_url", "is", null);

  // Aggregate job stats
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const activeJobs = jobs.filter((j) => j.status === "running" || j.status === "pending");
  const completedToday = jobs.filter(
    (j) => j.status === "completed" && new Date(j.completed_at as string) >= todayStart
  );
  const failedToday = jobs.filter(
    (j) => j.status === "failed" && new Date(j.completed_at as string) >= todayStart
  );

  // Cost aggregation from automation_log (cost stored as cost_cents in details JSONB)
  const extractCost = (l: Record<string, unknown>): number => {
    const details = l.details as Record<string, unknown> | null;
    const cents = typeof details?.cost_cents === "number" ? details.cost_cents : 0;
    return cents / 100;
  };
  const costToday = logs
    .filter((l) => new Date(l.created_at as string) >= todayStart)
    .reduce((sum, l) => sum + extractCost(l), 0);
  const costWeek = logs
    .filter((l) => new Date(l.created_at as string) >= weekStart)
    .reduce((sum, l) => sum + extractCost(l), 0);

  const automationEnabled = process.env.AUTOMATION_ENABLED !== "false";

  return NextResponse.json({
    overview: {
      active_jobs: activeJobs.length,
      completed_today: completedToday.length,
      failed_today: failedToday.length,
      analytics_events_today: analyticsToday,
      live_pitchapps: liveProjects?.length ?? 0,
      automation_enabled: automationEnabled,
    },
    costs: {
      today: Math.round(costToday * 100) / 100,
      this_week: Math.round(costWeek * 100) / 100,
    },
    recent_jobs: jobs.slice(0, 20),
    live_projects: (liveProjects ?? []).map((p) => ({
      id: p.id,
      name: p.company_name,
      project: p.project_name,
      url: p.pitchapp_url,
      status: p.status,
    })),
    jobs_table_exists: !jobsError,
  });
}
