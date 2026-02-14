import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/projects/[id]/pipeline — pipeline jobs for a project (any member)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Always use admin client for pipeline_jobs (no user-scoped RLS on this table)
  const client = createAdminClient();

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
