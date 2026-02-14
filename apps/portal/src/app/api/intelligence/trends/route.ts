import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { ClusterLifecycle } from "@/types/intelligence";

const VALID_LIFECYCLES: ClusterLifecycle[] = [
  "emerging",
  "peaking",
  "cooling",
  "evergreen",
  "dormant",
];

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

// GET /api/intelligence/trends — list active trend clusters (filterable, paginated)
export async function GET(request: Request) {
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
  const lifecycle = url.searchParams.get("lifecycle") as ClusterLifecycle | null;
  const category = url.searchParams.get("category");
  const minVelocity = parseFloat(url.searchParams.get("min_velocity") ?? "");
  const search = url.searchParams.get("q");
  const sortBy = url.searchParams.get("sort") ?? "velocity_percentile";
  const sortAsc = url.searchParams.get("order") === "asc";

  const adminClient = createAdminClient();

  let query = adminClient
    .from("trend_clusters")
    .select("*", { count: "exact" })
    .eq("is_active", true);

  if (lifecycle && VALID_LIFECYCLES.includes(lifecycle)) {
    query = query.eq("lifecycle", lifecycle);
  }

  if (category && category.trim()) {
    query = query.eq("category", category.trim());
  }

  if (!isNaN(minVelocity)) {
    query = query.gte("velocity_percentile", minVelocity);
  }

  if (search && search.trim()) {
    const term = search.trim().slice(0, 200);
    const safeTerm = term.replace(/[,().]/g, '');
    query = query.or(
      `name.ilike.%${safeTerm}%,summary.ilike.%${safeTerm}%,category.ilike.%${safeTerm}%`,
    );
  }

  // Sort
  const validSorts = [
    "velocity_percentile",
    "signal_count",
    "first_seen_at",
    "last_signal_at",
    "name",
  ];
  const sortColumn = validSorts.includes(sortBy) ? sortBy : "velocity_percentile";

  const { data, count, error } = await query
    .order(sortColumn, { ascending: sortAsc })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("Failed to load trends:", error.message);
    return NextResponse.json(
      { error: "failed to load trends" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    trends: data ?? [],
    page,
    page_size: pageSize,
    total: count ?? 0,
  });
}
