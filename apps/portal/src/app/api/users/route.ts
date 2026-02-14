import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/users — List all registered user profiles.
 * Used by the invite form to populate the email dropdown.
 * Requires authentication (middleware handles this).
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data: profiles, error } = await supabase
    .from("user_profiles")
    .select("id, email, display_name")
    .order("email");

  if (error) {
    return NextResponse.json({ error: "failed to load users" }, { status: 500 });
  }

  // Exclude the current user from the list (can't invite yourself)
  const others = (profiles ?? []).filter((p) => p.id !== user.id);

  return NextResponse.json({ users: others });
}
