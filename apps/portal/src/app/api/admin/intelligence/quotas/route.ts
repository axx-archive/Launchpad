import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/admin/intelligence/quotas — quota dashboard (admin-only)
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
  const now = new Date().toISOString();

  // Current active quotas (period_end > now)
  const { data: activeQuotas, error: activeError } = await adminClient
    .from("api_quota_tracking")
    .select("*")
    .gte("period_end", now)
    .order("api_source", { ascending: true })
    .order("period_start", { ascending: false });

  if (activeError) {
    console.error("Failed to load active quotas:", activeError.message);
    return NextResponse.json({ error: "failed to load quotas" }, { status: 500 });
  }

  // Dedupe: latest active period per source
  const currentBySource: Record<string, typeof activeQuotas[number]> = {};
  for (const q of activeQuotas ?? []) {
    if (!currentBySource[q.api_source]) {
      currentBySource[q.api_source] = q;
    }
  }

  // Historical quota usage (last 30 days, all sources)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: history, error: histError } = await adminClient
    .from("api_quota_tracking")
    .select("api_source, period_start, units_used, units_limit")
    .gte("period_start", thirtyDaysAgo)
    .order("period_start", { ascending: true });

  if (histError) {
    console.error("Failed to load quota history:", histError.message);
  }

  // Summary per source
  const summaries = Object.entries(currentBySource).map(([source, quota]) => ({
    source,
    units_used: quota.units_used,
    units_limit: quota.units_limit,
    usage_pct: quota.units_limit > 0
      ? Math.round((quota.units_used / quota.units_limit) * 10000) / 100
      : 0,
    period_start: quota.period_start,
    period_end: quota.period_end,
    is_warning: quota.units_limit > 0 && quota.units_used / quota.units_limit > 0.8,
    is_critical: quota.units_limit > 0 && quota.units_used / quota.units_limit > 0.95,
  }));

  return NextResponse.json({
    current: summaries,
    history: history ?? [],
  });
}
