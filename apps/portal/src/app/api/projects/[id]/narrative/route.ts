import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { ProjectNarrative } from "@/types/database";

// GET /api/projects/[id]/narrative — fetch current narrative + version history
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
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

  // Load the project (RLS ensures user owns it)
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // Fetch all narratives ordered by version descending
  const { data: narratives, error: narrativeError } = await supabase
    .from("project_narratives")
    .select("*")
    .eq("project_id", id)
    .order("version", { ascending: false });

  if (narrativeError) {
    return NextResponse.json({ error: narrativeError.message }, { status: 500 });
  }

  if (!narratives || narratives.length === 0) {
    return NextResponse.json({ error: "no narrative found" }, { status: 404 });
  }

  const typedNarratives = narratives as ProjectNarrative[];

  // Current = latest non-superseded
  const current = typedNarratives.find((n) => n.status !== "superseded") ?? typedNarratives[0];

  return NextResponse.json({
    current,
    versions: typedNarratives,
  });
}
