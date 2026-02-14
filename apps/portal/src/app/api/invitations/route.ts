import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/invitations — list current user's pending invitations
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!user.email) {
    return NextResponse.json({ invitations: [] });
  }

  const adminClient = createAdminClient();

  const { data: invitations, error } = await adminClient
    .from("project_invitations")
    .select("id, role, expires_at, created_at, project_id, projects(id, company_name, project_name)")
    .eq("email", user.email.toLowerCase())
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to list invitations:", error.message);
    return NextResponse.json({ error: "failed to list invitations" }, { status: 500 });
  }

  // Flatten project join
  const result = (invitations ?? []).map((inv) => {
    const project = inv.projects as unknown as {
      id: string;
      company_name: string;
      project_name: string;
    } | null;
    return {
      id: inv.id,
      project: project
        ? { id: project.id, company_name: project.company_name, project_name: project.project_name }
        : null,
      role: inv.role,
      expires_at: inv.expires_at,
      created_at: inv.created_at,
    };
  });

  return NextResponse.json({ invitations: result });
}
