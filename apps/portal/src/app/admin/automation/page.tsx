import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AutomationDashboardClient from "./AutomationDashboardClient";

export const metadata: Metadata = {
  title: "launchpad — automation",
};

export default async function AutomationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    redirect("/dashboard");
  }

  return <AutomationDashboardClient />;
}
