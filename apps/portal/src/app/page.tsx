import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import TriptychHome from "@/components/TriptychHome";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/sign-in");
  }

  const adminClient = createAdminClient();

  // Fetch department counts in parallel
  const [intResult, creResult, strResult, attentionResult] = await Promise.all([
    adminClient
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("department", "intelligence")
      .not("status", "eq", "archived"),
    adminClient
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("department", "creative")
      .not("status", "eq", "archived"),
    adminClient
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("department", "strategy")
      .not("status", "eq", "archived"),
    adminClient
      .from("trend_clusters")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  // Also count active intelligence trends as "active" for intelligence
  const intCount = (intResult.count ?? 0) + (attentionResult.count ?? 0);

  // Extract first name from email or profile
  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name ?? user.email ?? "";
  const firstName = displayName.includes(" ")
    ? displayName.split(" ")[0]
    : displayName.split("@")[0];

  return (
    <TriptychHome
      firstName={firstName}
      counts={{
        intelligence: intCount,
        creative: creResult.count ?? 0,
        strategy: strResult.count ?? 0,
      }}
    />
  );
}
