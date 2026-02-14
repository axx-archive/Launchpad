import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, getAdminUserIds } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { ProjectType, AutonomyLevel } from "@/types/database";

const VALID_STRATEGY_TYPES: ProjectType[] = [
  "market_research",
  "competitive_analysis",
  "funding_landscape",
];

const VALID_TIMELINES = ["no rush", "2-3 weeks", "asap"];
const VALID_CLIENT_AUTONOMY: AutonomyLevel[] = ["manual", "full_auto"];

function safeString(val: unknown, maxLen = 500): string | null {
  if (val == null) return null;
  if (typeof val !== "string") return null;
  return val.trim().slice(0, maxLen) || null;
}

// GET /api/strategy/projects — list strategy projects for authenticated user (or all for admin)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = isAdmin(user.email);
  const adminClient = createAdminClient();

  if (admin) {
    const { data, error } = await adminClient
      .from("projects")
      .select("*")
      .eq("department", "strategy")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to list strategy projects:", error.message);
      return NextResponse.json({ error: "failed to load projects" }, { status: 500 });
    }

    return NextResponse.json({ projects: data, isAdmin: true });
  }

  // Non-admin: fetch through project_members join
  const { data: memberships, error: memberError } = await adminClient
    .from("project_members")
    .select("role, projects!inner(*)")
    .eq("user_id", user.id)
    .eq("projects.department", "strategy")
    .order("created_at", { ascending: false });

  if (memberError) {
    console.error("Failed to list strategy projects:", memberError.message);
    return NextResponse.json({ error: "failed to load projects" }, { status: 500 });
  }

  const projects = (memberships ?? [])
    .filter((m) => m.projects)
    .map((m) => {
      const project = m.projects as unknown as Record<string, unknown>;
      return {
        ...project,
        _userRole: m.role,
        _isShared: m.role !== "owner",
      };
    })
    .sort((a, b) => {
      const aTime = new Date((a as Record<string, unknown>).updated_at as string).getTime();
      const bTime = new Date((b as Record<string, unknown>).updated_at as string).getTime();
      return bTime - aTime;
    });

  return NextResponse.json({ projects, isAdmin: false });
}

// POST /api/strategy/projects — create a new strategy research project
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  // Validate required fields
  const errors: Record<string, string> = {};

  if (
    !body.company_name ||
    typeof body.company_name !== "string" ||
    !body.company_name.trim()
  ) {
    errors.company_name = "company is required";
  }

  if (
    !body.project_name ||
    typeof body.project_name !== "string" ||
    !body.project_name.trim()
  ) {
    errors.project_name = "project name is required";
  }

  if (!body.type || !VALID_STRATEGY_TYPES.includes(body.type as ProjectType)) {
    errors.type = "pick a valid research type";
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation failed", fields: errors }, { status: 400 });
  }

  const timelinePref = safeString(body.timeline_preference);
  const validatedTimeline =
    timelinePref && VALID_TIMELINES.includes(timelinePref) ? timelinePref : null;

  const autonomyLevel: AutonomyLevel =
    typeof body.autonomy_level === "string" && VALID_CLIENT_AUTONOMY.includes(body.autonomy_level as AutonomyLevel)
      ? (body.autonomy_level as AutonomyLevel)
      : "full_auto";

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      company_name: (body.company_name as string).trim().slice(0, 200),
      project_name: (body.project_name as string).trim().slice(0, 200),
      type: body.type,
      department: "strategy",
      pipeline_mode: "strategy",
      target_audience: safeString(body.target_audience, 500),
      timeline_preference: validatedTimeline,
      autonomy_level: autonomyLevel,
      notes: safeString(body.notes, 2000),
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create strategy project:", error.message);
    return NextResponse.json({ error: "failed to create project" }, { status: 500 });
  }

  // Notify admins
  try {
    const admin = createAdminClient();
    const adminIds = await getAdminUserIds(admin);

    if (adminIds.length > 0) {
      const notifications = adminIds.map((adminId) => ({
        user_id: adminId,
        project_id: data.id,
        type: "project_created",
        title: "new strategy research requested",
        body: `${data.company_name} submitted research project "${data.project_name}".`,
      }));

      await admin.from("notifications").insert(notifications);
    }
  } catch (err) {
    console.error("Failed to send admin notification:", err);
  }

  return NextResponse.json({ project: data }, { status: 201 });
}
