import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/admin/learnings
 * List all system learnings, filterable by department/category/status.
 * Admin-only.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { searchParams } = new URL(req.url);

  const department = searchParams.get("department");
  const category = searchParams.get("category");
  const status = searchParams.get("status") || "active";

  let query = admin
    .from("system_learnings")
    .select("*")
    .order("confidence", { ascending: false });

  if (department) query = query.eq("department", department);
  if (category) query = query.eq("category", category);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query.limit(200);

  if (error) {
    console.error("Failed to fetch learnings:", error);
    return NextResponse.json({ error: "failed to fetch learnings" }, { status: 500 });
  }

  return NextResponse.json({ learnings: data ?? [] });
}
