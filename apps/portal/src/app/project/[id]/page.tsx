import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import type { MemberRole, Collaborator } from "@/types/database";
import ProjectDetailClient from "./ProjectDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("project_name")
    .eq("id", id)
    .single();

  return {
    title: data ? `launchpad — ${data.project_name}` : "launchpad — project",
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !project) notFound();

  // Determine user role
  let userRole: MemberRole = "owner";
  if (project.user_id !== user.id) {
    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", id)
      .eq("user_id", user.id)
      .single();

    if (!membership) notFound();
    userRole = membership.role as MemberRole;
  }

  // Fetch scout messages, edit briefs, narrative, and collaborators in parallel
  const adminClient = createAdminClient();
  const [
    { data: scoutMessages },
    { data: editBriefs },
    { data: narratives },
    { data: members },
    { data: pendingInvitations },
  ] = await Promise.all([
    supabase
      .from("scout_messages")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("scout_messages")
      .select("*")
      .eq("project_id", id)
      .not("edit_brief_md", "is", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_narratives")
      .select("*")
      .eq("project_id", id)
      .neq("status", "superseded")
      .order("version", { ascending: false })
      .limit(1),
    // Fetch active members with their profile emails
    adminClient
      .from("project_members")
      .select("user_id, role, user_profiles(email)")
      .eq("project_id", id),
    // Fetch pending invitations
    adminClient
      .from("project_invitations")
      .select("email, role")
      .eq("project_id", id)
      .eq("status", "pending"),
  ]);

  const narrative = narratives && narratives.length > 0 ? narratives[0] : null;

  // Build collaborators list for the UI
  const collaborators: Collaborator[] = [
    ...(members ?? []).map((m) => ({
      user_id: m.user_id,
      email: (m.user_profiles as unknown as { email: string } | null)?.email ?? "unknown",
      role: m.role as MemberRole,
      status: "active" as const,
    })),
    ...(pendingInvitations ?? []).map((inv) => ({
      user_id: null,
      email: inv.email,
      role: inv.role as MemberRole,
      status: "pending" as const,
    })),
  ];

  return (
    <ProjectDetailClient
      project={project}
      initialMessages={scoutMessages ?? []}
      editBriefs={editBriefs ?? []}
      userId={user.id}
      narrative={narrative}
      userRole={userRole}
      collaborators={collaborators}
    />
  );
}
