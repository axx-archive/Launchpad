import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/projects/[id]/pipeline — pipeline jobs for a project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Verify user owns this project (or is admin)
  const admin = isAdmin(user.email);
  if (!admin) {
    const { data: project } = await supabase
      .from("projects")
      .select("user_id")
      .eq("id", id)
      .single();

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const client = admin ? createAdminClient() : supabase;

  const { data: jobs, error } = await client
    .from("pipeline_jobs")
    .select("id,job_type,status,started_at,completed_at,created_at,last_error")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: jobs ?? [] });
}
