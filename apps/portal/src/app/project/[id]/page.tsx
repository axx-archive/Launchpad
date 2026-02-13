import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
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

  // Fetch scout messages, edit briefs, and narrative in parallel
  const [{ data: scoutMessages }, { data: editBriefs }, { data: narratives }] =
    await Promise.all([
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
    ]);

  const narrative = narratives && narratives.length > 0 ? narratives[0] : null;

  return (
    <ProjectDetailClient
      project={project}
      initialMessages={scoutMessages ?? []}
      editBriefs={editBriefs ?? []}
      userId={user.id}
      narrative={narrative}
    />
  );
}
