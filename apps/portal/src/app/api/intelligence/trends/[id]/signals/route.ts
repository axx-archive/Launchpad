import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

// GET /api/intelligence/trends/[id]/signals — paginated signals for a trend cluster
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clusterId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);

  // Pagination
  const page = Math.max(
    1,
    parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
  );
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(
      1,
      parseInt(
        url.searchParams.get("page_size") ?? String(DEFAULT_PAGE_SIZE),
        10,
      ) || DEFAULT_PAGE_SIZE,
    ),
  );
  const offset = (page - 1) * pageSize;

  // Filters
  const source = url.searchParams.get("source");
  const sortBy = url.searchParams.get("sort") ?? "confidence";
  const sortAsc = url.searchParams.get("order") === "asc";

  const adminClient = createAdminClient();

  // Verify cluster exists
  const { data: cluster, error: clusterError } = await adminClient
    .from("trend_clusters")
    .select("id, name")
    .eq("id", clusterId)
    .single();

  if (clusterError || !cluster) {
    return NextResponse.json(
      { error: "trend cluster not found" },
      { status: 404 },
    );
  }

  // Fetch assignments with full signal data
  let query = adminClient
    .from("signal_cluster_assignments")
    .select(
      "signal_id, confidence, is_primary, assigned_by, created_at, signals!inner(*)",
      { count: "exact" },
    )
    .eq("cluster_id", clusterId);

  // Filter by source if specified
  if (source) {
    query = query.eq("signals.source" as string, source);
  }

  // Sort
  const validSorts = ["confidence", "created_at"];
  const sortColumn = validSorts.includes(sortBy) ? sortBy : "confidence";

  const { data, count, error } = await query
    .order(sortColumn, { ascending: sortAsc })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("Failed to load cluster signals:", error.message);
    return NextResponse.json(
      { error: "failed to load cluster signals" },
      { status: 500 },
    );
  }

  const signals = (data ?? []).map((a) => ({
    ...(a.signals as unknown as Record<string, unknown>),
    _cluster_confidence: a.confidence,
    _cluster_is_primary: a.is_primary,
    _assigned_by: a.assigned_by,
    _assigned_at: a.created_at,
  }));

  return NextResponse.json({
    cluster: { id: cluster.id, name: cluster.name },
    signals,
    page,
    page_size: pageSize,
    total: count ?? 0,
  });
}
