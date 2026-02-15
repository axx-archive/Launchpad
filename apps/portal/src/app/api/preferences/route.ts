import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/preferences
 * Get current user's preferences. Optional ?department= filter.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { searchParams } = new URL(req.url);
  const department = searchParams.get("department");

  let query = admin
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.id)
    .order("confidence", { ascending: false });

  if (department) query = query.eq("department", department);

  const { data, error } = await query.limit(100);

  if (error) {
    console.error("Failed to fetch preferences:", error);
    return NextResponse.json({ error: "failed to fetch preferences" }, { status: 500 });
  }

  return NextResponse.json({ preferences: data ?? [] });
}

/**
 * PUT /api/preferences
 * Upsert an explicit user preference.
 * Body: { department, category, preference_key, preference_value }
 */
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const body = await req.json();

  const { department, category, preference_key, preference_value } = body;

  if (!department || !category || !preference_key || preference_value === undefined) {
    return NextResponse.json(
      { error: "department, category, preference_key, and preference_value are required" },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("user_preferences")
    .upsert(
      {
        user_id: user.id,
        department,
        category,
        preference_key,
        preference_value,
        confidence: 1.0, // explicit user-set = max confidence
        source: "explicit",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,department,category,preference_key" },
    )
    .select()
    .single();

  if (error) {
    console.error("Failed to upsert preference:", error);
    return NextResponse.json({ error: "failed to save preference" }, { status: 500 });
  }

  return NextResponse.json({ preference: data });
}
