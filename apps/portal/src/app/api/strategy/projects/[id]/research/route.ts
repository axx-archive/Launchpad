import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/strategy/projects/[id]/research — get versioned research for a strategy project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const adminClient = createAdminClient();

  // Verify this is a strategy project
  const { data: project, error: projectError } = await adminClient
    .from("projects")
    .select("id, department")
    .eq("id", id)
    .eq("department", "strategy")
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "strategy project not found" }, { status: 404 });
  }

  // Fetch all research versions, newest first
  const { data: research, error: researchError } = await adminClient
    .from("project_research")
    .select("*")
    .eq("project_id", id)
    .order("version", { ascending: false });

  if (researchError) {
    console.error("Failed to load research:", researchError.message);
    return NextResponse.json({ error: "failed to load research" }, { status: 500 });
  }

  return NextResponse.json({ research: research ?? [] });
}
