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

  // Fetch scout messages for this project
  const { data: scoutMessages } = await supabase
    .from("scout_messages")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  // Fetch edit briefs (scout messages with non-null edit_brief_md)
  const { data: editBriefs } = await supabase
    .from("scout_messages")
    .select("*")
    .eq("project_id", id)
    .not("edit_brief_md", "is", null)
    .order("created_at", { ascending: false });

  return (
    <ProjectDetailClient
      project={project}
      initialMessages={scoutMessages ?? []}
      editBriefs={editBriefs ?? []}
      userId={user.id}
    />
  );
}
