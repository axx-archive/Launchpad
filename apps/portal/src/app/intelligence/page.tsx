import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import IntelligenceDashboard from "@/components/intelligence/IntelligenceDashboard";
import type { TrendCluster } from "@/types/intelligence";

export default async function IntelligencePage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/sign-in");
  }

  const admin = isAdmin(user.email);
  const adminClient = createAdminClient();

  // Fetch active trends, ordered by velocity
  const { data: trendsData } = await adminClient
    .from("trend_clusters")
    .select("*")
    .eq("is_active", true)
    .order("velocity_percentile", { ascending: false })
    .limit(100);

  const trends = (trendsData ?? []) as TrendCluster[];

  // Compute lifecycle distribution
  const lifecycleDistribution: Record<string, number> = {};
  for (const t of trends) {
    lifecycleDistribution[t.lifecycle] = (lifecycleDistribution[t.lifecycle] ?? 0) + 1;
  }

  return (
    <IntelligenceDashboard
      trends={trends}
      isAdmin={admin}
      lifecycleDistribution={lifecycleDistribution}
    />
  );
}
