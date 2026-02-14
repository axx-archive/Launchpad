import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { SignalSource } from "@/types/intelligence";

const VALID_SOURCES: SignalSource[] = ["reddit", "youtube", "x", "rss"];
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

// GET /api/intelligence/signals — paginated, filterable signals feed (any authenticated user)
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
  const source = url.searchParams.get("source") as SignalSource | null;
  const clustered = url.searchParams.get("clustered"); // "true" | "false" | null
  const clusterId = url.searchParams.get("cluster_id");
  const search = url.searchParams.get("q");

  const adminClient = createAdminClient();

  // If filtering by cluster, join through signal_cluster_assignments
  if (clusterId) {
    const { data: assignments, error: assErr } = await adminClient
      .from("signal_cluster_assignments")
      .select("signal_id, confidence, is_primary, signals!inner(*)")
      .eq("cluster_id", clusterId)
      .order("confidence", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (assErr) {
      console.error("Failed to load cluster signals:", assErr.message);
      return NextResponse.json({ error: "failed to load signals" }, { status: 500 });
    }

    const { count } = await adminClient
      .from("signal_cluster_assignments")
      .select("signal_id", { count: "exact", head: true })
      .eq("cluster_id", clusterId);

    const signals = (assignments ?? []).map((a) => ({
      ...(a.signals as unknown as Record<string, unknown>),
      _cluster_confidence: a.confidence,
      _cluster_is_primary: a.is_primary,
    }));

    return NextResponse.json({
      signals,
      page,
      page_size: pageSize,
      total: count ?? 0,
    });
  }

  // Standard signals query
  let query = adminClient
    .from("signals")
    .select("*", { count: "exact" });

  if (source && VALID_SOURCES.includes(source)) {
    query = query.eq("source", source);
  }

  if (clustered === "true") {
    query = query.eq("is_clustered", true);
  } else if (clustered === "false") {
    query = query.eq("is_clustered", false);
  }

  if (search && search.trim()) {
    // Full-text search on title and content_snippet
    const term = search.trim().slice(0, 200);
    const safeTerm = term.replace(/[,().]/g, '');
    query = query.or(`title.ilike.%${safeTerm}%,content_snippet.ilike.%${safeTerm}%`);
  }

  const { data, count, error } = await query
    .order("ingested_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("Failed to load signals:", error.message);
    return NextResponse.json({ error: "failed to load signals" }, { status: 500 });
  }

  return NextResponse.json({
    signals: data ?? [],
    page,
    page_size: pageSize,
    total: count ?? 0,
  });
}
