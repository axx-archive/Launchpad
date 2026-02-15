import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import ResearchDetail from "@/components/strategy/ResearchDetail";
import type { Project, MemberRole, Collaborator } from "@/types/database";
import type { ProjectResearch } from "@/types/strategy";

export default async function ResearchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  // Fetch the project
  const { data: project, error: projectError } = await adminClient
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("department", "strategy")
    .single();

  if (projectError || !project) {
    notFound();
  }

  // Check user access
  let userRole: MemberRole = "viewer";

  if (admin) {
    userRole = "owner";
  } else {
    const { data: membership } = await adminClient
      .from("project_members")
      .select("role")
      .eq("project_id", id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      notFound();
    }
    userRole = membership.role as MemberRole;
  }

  // Fetch research versions
  const { data: research } = await adminClient
    .from("project_research")
    .select("*")
    .eq("project_id", id)
    .order("version", { ascending: false });

  // Fetch collaborators (members + pending invitations)
  const [membersResult, invitationsResult] = await Promise.all([
    adminClient
      .from("project_members")
      .select("user_id, role, user_profiles(email, display_name, avatar_url)")
      .eq("project_id", id),
    adminClient
      .from("project_invitations")
      .select("id, email, role, status")
      .eq("project_id", id)
      .eq("status", "pending"),
  ]);

  const collaborators: Collaborator[] = [];

  // Active members
  for (const m of membersResult.data ?? []) {
    const profile = (m as Record<string, unknown>).user_profiles as { email: string; display_name: string | null; avatar_url: string | null } | null;
    collaborators.push({
      user_id: m.user_id,
      email: profile?.email ?? "",
      role: m.role as MemberRole,
      status: "active",
    });
  }

  // Pending invitations
  for (const inv of invitationsResult.data ?? []) {
    collaborators.push({
      user_id: null,
      email: inv.email,
      role: inv.role as Exclude<MemberRole, "owner">,
      status: "pending",
    });
  }

  return (
    <ResearchDetail
      project={project as Project}
      research={(research ?? []) as ProjectResearch[]}
      collaborators={collaborators}
      userRole={userRole}
      isAdmin={admin}
    />
  );
}
