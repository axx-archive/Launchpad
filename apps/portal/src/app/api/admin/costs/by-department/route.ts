import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/admin/costs/by-department — cost breakdown per department (admin-only)
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const daysBack = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") ?? "30", 10) || 30));

  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  const adminClient = createAdminClient();

  // Fetch automation_log entries with cost data
  const { data: logs, error } = await adminClient
    .from("automation_log")
    .select("department, event, details, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load cost logs:", error.message);
    return NextResponse.json({ error: "failed to load costs" }, { status: 500 });
  }

  // Aggregate costs by department
  interface DeptCost {
    total_cents: number;
    job_count: number;
    by_event: Record<string, { cents: number; count: number }>;
  }

  const departments: Record<string, DeptCost> = {};

  for (const log of logs ?? []) {
    const dept = (log.department as string) ?? "unknown";
    const event = (log.event as string) ?? "unknown";
    const details = log.details as Record<string, unknown> | null;
    const costCents = typeof details?.cost_cents === "number" ? details.cost_cents : 0;

    if (!departments[dept]) {
      departments[dept] = { total_cents: 0, job_count: 0, by_event: {} };
    }

    departments[dept].total_cents += costCents;
    departments[dept].job_count += 1;

    if (!departments[dept].by_event[event]) {
      departments[dept].by_event[event] = { cents: 0, count: 0 };
    }
    departments[dept].by_event[event].cents += costCents;
    departments[dept].by_event[event].count += 1;
  }

  // Format output
  const breakdown = Object.entries(departments).map(([dept, data]) => ({
    department: dept,
    total_cost: Math.round(data.total_cents) / 100,
    job_count: data.job_count,
    by_event: Object.entries(data.by_event).map(([event, eventData]) => ({
      event,
      cost: Math.round(eventData.cents) / 100,
      count: eventData.count,
    })),
  }));

  // Sort by total cost descending
  breakdown.sort((a, b) => b.total_cost - a.total_cost);

  const totalCost = breakdown.reduce((sum, d) => sum + d.total_cost, 0);

  return NextResponse.json({
    period_days: daysBack,
    since,
    total_cost: Math.round(totalCost * 100) / 100,
    departments: breakdown,
  });
}
