import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const SCORE_EVENT = "trend-scored";

// Scoring dimensions — each scored 1-5
const VALID_DIMENSIONS = [
  "relevance",
  "momentum",
  "audience_fit",
  "content_potential",
  "timing",
];

// POST /api/intelligence/trends/[id]/score — submit scoring results for a trend
export async function POST(
  request: Request,
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Verify cluster exists
  const { data: cluster, error: clusterError } = await adminClient
    .from("trend_clusters")
    .select("id, name")
    .eq("id", id)
    .single();

  if (clusterError || !cluster) {
    return NextResponse.json({ error: "trend cluster not found" }, { status: 404 });
  }

  // Validate scoring payload
  const errors: string[] = [];

  // Knockout answers (optional boolean gates)
  const knockouts = body.knockouts as Record<string, boolean> | undefined;

  // Dimension scores (required: object with dimension -> score 1-5)
  const dimensions = body.dimensions as Record<string, number> | undefined;
  if (!dimensions || typeof dimensions !== "object") {
    errors.push("dimensions object is required");
  } else {
    for (const dim of VALID_DIMENSIONS) {
      const score = dimensions[dim];
      if (score === undefined || score === null) continue; // optional dimensions
      if (typeof score !== "number" || score < 1 || score > 5 || !Number.isInteger(score)) {
        errors.push(`${dim} must be an integer between 1 and 5`);
      }
    }
  }

  // Final score (optional — computed on frontend, stored for record)
  const finalScore = typeof body.final_score === "number" ? body.final_score : null;

  // Notes (optional)
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null;

  if (errors.length > 0) {
    return NextResponse.json({ error: "validation failed", details: errors }, { status: 400 });
  }

  // Store scoring in automation_log (append-only)
  const scorePayload = {
    cluster_id: id,
    cluster_name: cluster.name,
    scored_by: user.id,
    knockouts: knockouts ?? {},
    dimensions: dimensions ?? {},
    final_score: finalScore,
    notes,
  };

  const { error: insertError } = await adminClient.from("automation_log").insert({
    event: SCORE_EVENT,
    department: "intelligence",
    details: scorePayload,
  });

  if (insertError) {
    console.error("Failed to store trend score:", insertError.message);
    return NextResponse.json({ error: "failed to store score" }, { status: 500 });
  }

  return NextResponse.json({
    message: "score recorded",
    cluster_id: id,
    final_score: finalScore,
  }, { status: 201 });
}

// GET /api/intelligence/trends/[id]/score — scoring history for a trend
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

  const adminClient = createAdminClient();

  // Verify cluster exists
  const { data: cluster, error: clusterError } = await adminClient
    .from("trend_clusters")
    .select("id, name")
    .eq("id", id)
    .single();

  if (clusterError || !cluster) {
    return NextResponse.json({ error: "trend cluster not found" }, { status: 404 });
  }

  // Fetch scoring events for this specific cluster using JSONB filter
  const { data: scoreLogs, error: logError } = await adminClient
    .from("automation_log")
    .select("id, details, created_at")
    .eq("event", SCORE_EVENT)
    .eq("details->>cluster_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (logError) {
    console.error("Failed to load scores:", logError.message);
    return NextResponse.json({ error: "failed to load scores" }, { status: 500 });
  }

  const scores = (scoreLogs ?? []).map((log) => ({
    id: log.id,
    ...(log.details as Record<string, unknown>),
    created_at: log.created_at,
  }));

  // Latest score (most recent)
  const latest = scores.length > 0 ? scores[0] : null;

  return NextResponse.json({
    cluster_id: id,
    cluster_name: cluster.name,
    latest,
    history: scores,
  });
}
