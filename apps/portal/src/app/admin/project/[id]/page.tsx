import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import AdminProjectDetailClient from "./AdminProjectDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    return { title: "launchpad — admin" };
  }

  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from("projects")
    .select("project_name")
    .eq("id", id)
    .single();

  return {
    title: data
      ? `launchpad — admin — ${data.project_name}`
      : "launchpad — admin",
  };
}

export default async function AdminProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    redirect("/dashboard");
  }

  // Service role client bypasses RLS — admin sees all projects
  const adminClient = createAdminClient();

  const { data: project, error } = await adminClient
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !project) notFound();

  // Fetch scout messages for read-only view
  const { data: messages } = await adminClient
    .from("scout_messages")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  return (
    <AdminProjectDetailClient
      project={project}
      messages={messages ?? []}
    />
  );
}
