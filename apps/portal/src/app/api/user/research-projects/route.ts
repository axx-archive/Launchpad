import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/user/research-projects — user's Strategy projects with research_complete status
// Used by the promote-to-creative flow to attach existing research.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // Fetch user's strategy projects that have completed research
  const { data: memberships, error: memberError } = await adminClient
    .from("project_members")
    .select("project_id, projects(id, project_name, company_name, department, status)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (memberError) {
    console.error("Failed to fetch research projects:", memberError.message);
    return NextResponse.json({ error: "failed to fetch projects" }, { status: 500 });
  }

  // Filter to strategy + research_complete
  const strategyProjects: { id: string; project_name: string; company_name: string }[] = [];

  for (const m of memberships ?? []) {
    const p = m.projects as unknown as Record<string, unknown> | null;
    if (!p) continue;
    if (p.department === "strategy" && p.status === "research_complete") {
      strategyProjects.push({
        id: p.id as string,
        project_name: p.project_name as string,
        company_name: p.company_name as string,
      });
    }
  }

  // Fetch latest polished research summary for each project
  const projectsWithSummary = await Promise.all(
    strategyProjects.map(async (proj) => {
      try {
        const { data: research } = await adminClient
          .from("project_research")
          .select("content")
          .eq("project_id", proj.id)
          .eq("is_polished", true)
          .order("created_at", { ascending: false })
          .limit(1);

        const content = research?.[0]?.content as string | undefined;
        return {
          ...proj,
          research_summary: content ? content.slice(0, 200) : null,
        };
      } catch {
        return { ...proj, research_summary: null };
      }
    })
  );

  return NextResponse.json({ projects: projectsWithSummary });
}
