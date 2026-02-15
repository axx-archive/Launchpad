import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/user/my-projects — user's projects across all departments
// Used by Cmd+K recents and cross-project peripheral vision.
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

  // Fetch user's projects via membership join
  const { data: memberships, error: memberError } = await adminClient
    .from("project_members")
    .select("project_id, role, projects(id, project_name, company_name, department, status, updated_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (memberError) {
    console.error("Failed to fetch user projects:", memberError.message);
    return NextResponse.json({ error: "failed to fetch projects" }, { status: 500 });
  }

  // Build flat list with role + department grouping
  const projects: Record<string, unknown>[] = [];
  const projectIds: string[] = [];

  for (const m of memberships ?? []) {
    const p = m.projects as unknown as Record<string, unknown> | null;
    if (!p) continue;
    const dept = (p.department as string) ?? "creative";
    projectIds.push(p.id as string);
    projects.push({
      id: p.id,
      project_name: p.project_name,
      company_name: p.company_name,
      department: dept,
      status: p.status,
      updated_at: p.updated_at,
      role: m.role,
    });
  }

  // Fetch cross-department refs for provenance indicators
  let refs: Record<string, unknown>[] = [];
  if (projectIds.length > 0) {
    const { data: refData } = await adminClient
      .from("cross_department_refs")
      .select("source_department, source_id, source_type, target_department, target_id, target_type, relationship")
      .or(`source_id.in.(${projectIds.join(",")}),target_id.in.(${projectIds.join(",")})`)
      .limit(50);
    refs = refData ?? [];
  }

  // Group by department for convenience
  const byDepartment: Record<string, Record<string, unknown>[]> = {
    creative: [],
    strategy: [],
    intelligence: [],
  };

  for (const p of projects) {
    const dept = p.department as string;
    if (!byDepartment[dept]) byDepartment[dept] = [];
    byDepartment[dept].push(p);
  }

  return NextResponse.json({
    projects,
    byDepartment,
    refs,
    total: projects.length,
  });
}
