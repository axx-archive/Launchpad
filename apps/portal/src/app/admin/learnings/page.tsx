import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import LearningsPageClient from "./LearningsPageClient";

export const metadata: Metadata = {
  title: "spark — system intelligence",
};

export default async function AdminLearningsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    redirect("/dashboard");
  }

  const admin = createAdminClient();

  // Fetch all active + override learnings for constellation
  const { data: learnings } = await admin
    .from("system_learnings")
    .select("*")
    .in("status", ["active", "admin_override"])
    .order("confidence", { ascending: false })
    .limit(200);

  // Fetch stats
  const { count: totalActive } = await admin
    .from("system_learnings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: discoveredThisWeek } = await admin
    .from("system_learnings")
    .select("id", { count: "exact", head: true })
    .gte("discovered_at", oneWeekAgo);

  // Department breakdown
  const { data: allActive } = await admin
    .from("system_learnings")
    .select("department")
    .eq("status", "active");

  const byDepartment: Record<string, number> = {};
  for (const l of allActive ?? []) {
    byDepartment[l.department] = (byDepartment[l.department] ?? 0) + 1;
  }

  return (
    <LearningsPageClient
      initialLearnings={learnings ?? []}
      stats={{
        totalActive: totalActive ?? 0,
        discoveredThisWeek: discoveredThisWeek ?? 0,
        byDepartment,
      }}
    />
  );
}
