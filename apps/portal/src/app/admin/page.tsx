import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AdminDashboardClient from "./AdminDashboardClient";

export const metadata: Metadata = {
  title: "launchpad — admin",
};

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    redirect("/dashboard");
  }

  // Service role client bypasses RLS — admin sees all projects
  const adminClient = createAdminClient();
  const { data: projects } = await adminClient
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  return <AdminDashboardClient projects={projects ?? []} />;
}
