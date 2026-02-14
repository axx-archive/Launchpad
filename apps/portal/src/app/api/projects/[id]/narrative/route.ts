import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { ProjectNarrative } from "@/types/database";

// GET /api/projects/[id]/narrative — fetch current narrative + version history (any member)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const client = access.isAdmin ? createAdminClient() : await createClient();

  // Fetch all narratives ordered by version descending
  const { data: narratives, error: narrativeError } = await client
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
