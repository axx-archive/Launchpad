import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { EntityType } from "@/types/intelligence";

const VALID_ENTITY_TYPES: EntityType[] = [
  "person",
  "brand",
  "product",
  "event",
  "place",
];

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

// GET /api/intelligence/entities — entity list with signal counts
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
  const entityType = url.searchParams.get("type") as EntityType | null;
  const search = url.searchParams.get("q");
  const minSignals = parseInt(url.searchParams.get("min_signals") ?? "", 10);
  const sortBy = url.searchParams.get("sort") ?? "signal_count";
  const sortAsc = url.searchParams.get("order") === "asc";

  const adminClient = createAdminClient();

  let query = adminClient
    .from("entities")
    .select("*", { count: "exact" });

  if (entityType && VALID_ENTITY_TYPES.includes(entityType)) {
    query = query.eq("entity_type", entityType);
  }

  if (search && search.trim()) {
    const term = search.trim().slice(0, 200);
    query = query.ilike("name", `%${term}%`);
  }

  if (!isNaN(minSignals) && minSignals > 0) {
    query = query.gte("signal_count", minSignals);
  }

  // Sort
  const validSorts = ["signal_count", "name", "created_at"];
  const sortColumn = validSorts.includes(sortBy) ? sortBy : "signal_count";

  const { data, count, error } = await query
    .order(sortColumn, { ascending: sortAsc })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("Failed to load entities:", error.message);
    return NextResponse.json(
      { error: "failed to load entities" },
      { status: 500 },
    );
  }

  // Type distribution for dashboard widget
  const { data: allEntities } = await adminClient
    .from("entities")
    .select("entity_type");

  const typeDist: Record<string, number> = {};
  for (const e of allEntities ?? []) {
    typeDist[e.entity_type] = (typeDist[e.entity_type] || 0) + 1;
  }

  return NextResponse.json({
    entities: data ?? [],
    page,
    page_size: pageSize,
    total: count ?? 0,
    type_distribution: typeDist,
  });
}
