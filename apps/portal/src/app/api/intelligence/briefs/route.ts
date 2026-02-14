import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { BriefType } from "@/types/intelligence";

const VALID_BRIEF_TYPES: BriefType[] = ["daily_digest", "trend_deep_dive", "alert"];
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

// GET /api/intelligence/briefs — list intelligence briefs (paginated, filterable)
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
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get("page_size") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  );
  const offset = (page - 1) * pageSize;

  // Filters
  const briefType = url.searchParams.get("type") as BriefType | null;
  const clusterId = url.searchParams.get("cluster_id");

  const adminClient = createAdminClient();

  let query = adminClient
    .from("intelligence_briefs")
    .select("*", { count: "exact" });

  if (briefType && VALID_BRIEF_TYPES.includes(briefType)) {
    query = query.eq("brief_type", briefType);
  }

  if (clusterId) {
    query = query.contains("cluster_ids", [clusterId]);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("Failed to load briefs:", error.message);
    return NextResponse.json({ error: "failed to load briefs" }, { status: 500 });
  }

  return NextResponse.json({
    briefs: data ?? [],
    page,
    page_size: pageSize,
    total: count ?? 0,
  });
}
