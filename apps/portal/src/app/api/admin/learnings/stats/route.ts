import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/learnings/stats
 * Aggregate stats: total active, by department, discovered this week.
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

  // Total active
  const { count: totalActive } = await admin
    .from("system_learnings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  // By department
  const { data: allActive } = await admin
    .from("system_learnings")
    .select("department")
    .eq("status", "active");

  const byDepartment: Record<string, number> = {};
  for (const l of allActive ?? []) {
    byDepartment[l.department] = (byDepartment[l.department] ?? 0) + 1;
  }

  // Discovered this week
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: discoveredThisWeek } = await admin
    .from("system_learnings")
    .select("id", { count: "exact", head: true })
    .gte("discovered_at", oneWeekAgo);

  // Total archived
  const { count: totalArchived } = await admin
    .from("system_learnings")
    .select("id", { count: "exact", head: true })
    .eq("status", "archived");

  // Admin overrides
  const { count: totalOverrides } = await admin
    .from("system_learnings")
    .select("id", { count: "exact", head: true })
    .eq("status", "admin_override");

  return NextResponse.json({
    totalActive: totalActive ?? 0,
    byDepartment,
    discoveredThisWeek: discoveredThisWeek ?? 0,
    totalArchived: totalArchived ?? 0,
    totalOverrides: totalOverrides ?? 0,
  });
}
