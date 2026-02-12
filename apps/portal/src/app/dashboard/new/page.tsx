import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import NewProjectClient from "./NewProjectClient";

export const metadata: Metadata = {
  title: "launchpad — new mission",
};

export default async function NewProjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  return <NewProjectClient />;
}
