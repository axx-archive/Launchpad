import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/learnings/decay
 * Manually trigger decay cycle on stale learnings.
 * Reduces decay_weight by 5% for active learnings not validated in 30 days.
 * Floor: 0.1 (never fully forgotten).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Find stale active learnings
  const { data: stale } = await admin
    .from("system_learnings")
    .select("id, decay_weight")
    .eq("status", "active")
    .lt("last_validated_at", thirtyDaysAgo);

  if (!stale || stale.length === 0) {
    return NextResponse.json({ decayed: 0, message: "no stale learnings found" });
  }

  let decayedCount = 0;
  for (const learning of stale) {
    const newWeight = Math.max(0.1, learning.decay_weight * 0.95);
    const { error } = await admin
      .from("system_learnings")
      .update({
        decay_weight: newWeight,
        updated_at: new Date().toISOString(),
      })
      .eq("id", learning.id);

    if (!error) decayedCount++;
  }

  return NextResponse.json({
    decayed: decayedCount,
    total_stale: stale.length,
  });
}
