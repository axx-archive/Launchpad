import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import TriptychHome from "@/components/TriptychHome";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/sign-in");
  }

  const adminClient = createAdminClient();

  // Fetch department counts + home screen data in parallel
  const [intResult, creResult, strResult, attentionResult, reviewProjects, activityLog, recentProjects] = await Promise.all([
    adminClient
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("department", "intelligence")
      .not("status", "eq", "archived"),
    adminClient
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("department", "creative")
      .not("status", "eq", "archived"),
    adminClient
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("department", "strategy")
      .not("status", "eq", "archived"),
    adminClient
      .from("trend_clusters")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    // Projects needing review (attention items)
    adminClient
      .from("projects")
      .select("id, project_name, company_name, department, status, updated_at")
      .in("status", ["research_review", "narrative_review", "review"])
      .not("status", "eq", "archived")
      .order("updated_at", { ascending: false })
      .limit(5),
    // Recent activity from automation_log
    adminClient
      .from("automation_log")
      .select("id, department, event, details, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    // Active projects per department (most recent)
    adminClient
      .from("projects")
      .select("id, project_name, status, department")
      .not("status", "in", "(archived,on_hold)")
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);

  // Also count active intelligence trends as "active" for intelligence
  const intCount = (intResult.count ?? 0) + (attentionResult.count ?? 0);

  // Transform attention items
  const hrefForDept = (dept: string, id: string) => {
    if (dept === "strategy") return `/strategy/research/${id}`;
    if (dept === "intelligence") return `/intelligence`;
    return `/project/${id}`;
  };

  const attentionItems = (reviewProjects.data ?? []).map((p) => ({
    id: p.id,
    department: p.department ?? "creative",
    title: p.project_name ?? p.company_name ?? "untitled",
    href: hrefForDept(p.department ?? "creative", p.id),
    priority: p.status === "review" ? "high" : "medium",
  }));

  // Transform recent activity
  const recentActivity = (activityLog.data ?? []).map((e) => ({
    id: e.id,
    department: e.department ?? "creative",
    title: (e.details as Record<string, string> | null)?.title ?? e.event ?? "event",
    created_at: e.created_at,
  }));

  // Group active projects by department, limit 2 per dept
  const activeProjectsByDept: Record<string, { id: string; name: string; status: string; href: string }[]> = {};
  for (const p of recentProjects.data ?? []) {
    const dept = p.department ?? "creative";
    if (!activeProjectsByDept[dept]) activeProjectsByDept[dept] = [];
    if (activeProjectsByDept[dept].length < 2) {
      activeProjectsByDept[dept].push({
        id: p.id,
        name: p.project_name ?? "untitled",
        status: p.status ?? "unknown",
        href: hrefForDept(dept, p.id),
      });
    }
  }

  // Extract first name from email or profile
  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? user.email ?? "";
  const firstName = displayName.includes(" ")
    ? displayName.split(" ")[0]
    : displayName.split("@")[0];

  return (
    <TriptychHome
      firstName={firstName}
      counts={{
        intelligence: intCount,
        creative: creResult.count ?? 0,
        strategy: strResult.count ?? 0,
      }}
      attentionCount={attentionItems.length}
      attentionItems={attentionItems}
      recentActivity={recentActivity}
      activeProjects={activeProjectsByDept}
    />
  );
}
