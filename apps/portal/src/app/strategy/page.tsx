import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import StrategyDashboard from "@/components/strategy/StrategyDashboard";
import type { Project, Department } from "@/types/database";

interface ProvenanceData {
  [projectId: string]: { department: Department; label: string; href?: string }[];
}

export default async function StrategyPage() {
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

  let projects: Project[] = [];
  let isAdminUser = false;

  if (admin) {
    isAdminUser = true;
    const { data } = await adminClient
      .from("projects")
      .select("*")
      .eq("department", "strategy")
      .order("updated_at", { ascending: false });

    projects = (data ?? []) as Project[];
  } else {
    // Non-admin: fetch through project_members join
    const { data: memberships } = await adminClient
      .from("project_members")
      .select("role, projects!inner(*)")
      .eq("user_id", user.id)
      .eq("projects.department", "strategy")
      .order("created_at", { ascending: false });

    projects = (memberships ?? [])
      .filter((m) => m.projects)
      .map((m) => m.projects as unknown as Project)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  // Fetch provenance data for strategy projects (incoming refs from Intelligence)
  const provenance: ProvenanceData = {};
  if (projects.length > 0) {
    const projectIds = projects.map((p) => p.id);
    const { data: refs } = await adminClient
      .from("cross_department_refs")
      .select("target_id, source_department, source_type, source_id")
      .in("target_id", projectIds)
      .eq("target_department", "strategy");

    if (refs && refs.length > 0) {
      // Fetch source names for trend refs
      const trendIds = refs.filter((r) => r.source_type === "trend").map((r) => r.source_id);
      let trendNames: Record<string, string> = {};
      if (trendIds.length > 0) {
        const { data: trends } = await adminClient
          .from("trend_clusters")
          .select("id, name")
          .in("id", trendIds);
        trendNames = Object.fromEntries((trends ?? []).map((t) => [t.id, t.name]));
      }

      for (const ref of refs) {
        const label = ref.source_type === "trend"
          ? trendNames[ref.source_id] || "trend"
          : "project";
        const href = ref.source_type === "trend"
          ? `/intelligence/trend/${ref.source_id}`
          : undefined;

        if (!provenance[ref.target_id]) provenance[ref.target_id] = [];
        provenance[ref.target_id].push({
          department: ref.source_department as Department,
          label,
          href,
        });
      }
    }
  }

  return <StrategyDashboard projects={projects} isAdmin={isAdminUser} provenance={provenance} />;
}
