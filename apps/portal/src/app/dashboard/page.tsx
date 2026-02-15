import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import type { Metadata } from "next";
import type { ProjectWithRole } from "@/types/database";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "spark — dashboard",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  // Fetch owned projects and shared memberships in parallel
  const [{ data: projects }, { data: memberships }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("department", "creative")
      .order("updated_at", { ascending: false }),
    supabase
      .from("project_members")
      .select("role, project:projects(*)")
      .eq("user_id", user.id)
      .neq("role", "owner"),
  ]);

  // Resolve owner emails for shared projects
  const sharedProjectIds = (memberships ?? [])
    .filter((m) => m.project)
    .map((m) => (m.project as unknown as { user_id: string }).user_id);

  let ownerEmailMap: Record<string, string> = {};
  if (sharedProjectIds.length > 0) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminClient = createAdminClient();
    const { data: profiles } = await adminClient
      .from("user_profiles")
      .select("id, email")
      .in("id", sharedProjectIds);
    ownerEmailMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p.email])
    );
  }

  // Transform shared memberships to ProjectWithRole[]
  const sharedProjects: ProjectWithRole[] = (memberships ?? [])
    .filter((m) => m.project)
    .map((m) => {
      const project = m.project as unknown as ProjectWithRole;
      return {
        ...project,
        userRole: m.role as Exclude<ProjectWithRole["userRole"], "owner">,
        ownerEmail: ownerEmailMap[project.user_id] ?? "unknown",
      };
    });

  const admin = isAdmin(user.email);

  return (
    <DashboardClient
      projects={projects ?? []}
      sharedProjects={sharedProjects}
      isAdmin={admin}
    />
  );
}
