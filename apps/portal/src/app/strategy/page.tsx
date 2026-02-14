import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import StrategyDashboard from "@/components/strategy/StrategyDashboard";
import type { Project } from "@/types/database";

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

  return <StrategyDashboard projects={projects} isAdmin={isAdminUser} />;
}
