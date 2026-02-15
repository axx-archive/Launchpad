import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, getAdminUserIds } from "@/lib/auth";
import { fetchProjectUpstreamContext, buildRefMetadata, buildSourceContext } from "@/lib/upstream-context";
import { NextResponse } from "next/server";
import type { ProjectType, AutonomyLevel, ResearchMode } from "@/types/database";

const VALID_TYPES: ProjectType[] = [
  "investor_pitch",
  "client_proposal",
  "research_report",
  "website",
  "other",
];

const VALID_TIMELINES = ["no rush", "2-3 weeks", "asap"];
const VALID_CLIENT_AUTONOMY: AutonomyLevel[] = ["manual", "full_auto"];
const VALID_RESEARCH_MODES: ResearchMode[] = ["full", "skip", "attached"];

function safeString(val: unknown, maxLen = 500): string | null {
  if (val == null) return null;
  if (typeof val !== "string") return null;
  return val.trim().slice(0, maxLen) || null;
}

// GET /api/projects — list projects for authenticated user (or all for admin)
// Non-admin users see owned + shared projects with their role on each.
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

  if (admin) {
    // Admins use service role client to bypass RLS and see all projects
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to list projects:", error.message);
      return NextResponse.json({ error: "failed to load projects" }, { status: 500 });
    }

    return NextResponse.json({ projects: data, isAdmin: true });
  }

  // Non-admin: fetch projects through project_members join to get role info
  const adminClient = createAdminClient();
  const { data: memberships, error: memberError } = await adminClient
    .from("project_members")
    .select("role, projects(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (memberError) {
    console.error("Failed to list projects:", memberError.message);
    return NextResponse.json({ error: "failed to load projects" }, { status: 500 });
  }

  // Flatten memberships into project list with role annotations
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

// POST /api/projects — create a new project
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

  if (!body.type || !VALID_TYPES.includes(body.type as ProjectType)) {
    errors.type = "pick a valid type";
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation failed", fields: errors }, { status: 400 });
  }

  // Sanitize optional fields
  const timelinePref = safeString(body.timeline_preference);
  const validatedTimeline =
    timelinePref && VALID_TIMELINES.includes(timelinePref) ? timelinePref : null;

  const autonomyLevel: AutonomyLevel =
    typeof body.autonomy_level === "string" && VALID_CLIENT_AUTONOMY.includes(body.autonomy_level as AutonomyLevel)
      ? (body.autonomy_level as AutonomyLevel)
      : "full_auto";

  const researchMode: ResearchMode =
    typeof body.research_mode === "string" && VALID_RESEARCH_MODES.includes(body.research_mode as ResearchMode)
      ? (body.research_mode as ResearchMode)
      : "full";

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      company_name: (body.company_name as string).trim().slice(0, 200),
      project_name: (body.project_name as string).trim().slice(0, 200),
      type: body.type,
      target_audience: safeString(body.target_audience, 500),
      timeline_preference: validatedTimeline,
      autonomy_level: autonomyLevel,
      research_mode: researchMode,
      notes: safeString(body.notes, 2000),
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create project:", error.message);
    return NextResponse.json({ error: "failed to create project" }, { status: 500 });
  }

  // --- Cross-department promotion linkage (optional, non-blocking) ---
  const sourceProjectId = typeof body.source_project_id === "string" ? body.source_project_id.trim() : null;
  const sourceDepartment = typeof body.source_department === "string" ? body.source_department.trim() : null;

  if (sourceProjectId && sourceDepartment) {
    try {
      const adminXDept = createAdminClient();

      // Validate source project exists
      const { data: sourceProject } = await adminXDept
        .from("projects")
        .select("id, department")
        .eq("id", sourceProjectId)
        .single();

      if (sourceProject) {
        // Copy members from source project (skip current user — already owner)
        const { data: sourceMembers } = await adminXDept
          .from("project_members")
          .select("user_id, role")
          .eq("project_id", sourceProjectId);

        if (sourceMembers && sourceMembers.length > 0) {
          const membersToAdd = sourceMembers
            .filter((m) => m.user_id !== user.id)
            .map((m) => ({
              project_id: data.id,
              user_id: m.user_id,
              role: m.role === "owner" ? "editor" : m.role,
            }));

          if (membersToAdd.length > 0) {
            await adminXDept.from("project_members").insert(membersToAdd);
          }
        }

        // Fetch upstream research + trend context for forwarding
        const upstreamCtx = await fetchProjectUpstreamContext(
          adminXDept,
          sourceProjectId,
          sourceDepartment,
        );

        // Create cross_department_refs entry with upstream content in metadata
        await adminXDept.from("cross_department_refs").insert({
          source_department: sourceDepartment,
          source_type: "project",
          source_id: sourceProjectId,
          target_department: "creative",
          target_type: "project",
          target_id: data.id,
          relationship: "promoted_to",
          metadata: buildRefMetadata(user.id, upstreamCtx),
        });

        // Populate source_context on the new project for pipeline injection
        const sourceContext = buildSourceContext(sourceDepartment, sourceProjectId, upstreamCtx);
        if (sourceContext) {
          await adminXDept
            .from("projects")
            .update({ source_context: sourceContext })
            .eq("id", data.id);
        }

        // Log to automation_log
        await adminXDept.from("automation_log").insert({
          project_id: data.id,
          department: sourceDepartment,
          event: "project-promoted",
          details: {
            source_project_id: sourceProjectId,
            source_department: sourceDepartment,
            target_project_id: data.id,
            target_department: "creative",
            promoted_by: user.id,
            context_forwarded: !!sourceContext,
          },
        });
      }
    } catch (err) {
      // Non-blocking — project is already created
      console.error("Failed to create cross-dept linkage:", err);
    }
  }

  // --- Notify admins about new project (uses cached admin IDs) ---
  try {
    const admin = createAdminClient();
    const adminIds = await getAdminUserIds(admin);

    if (adminIds.length > 0) {
      const notifications = adminIds.map((adminId) => ({
        user_id: adminId,
        project_id: data.id,
        type: "project_created",
        title: "new project requested",
        body: `${data.company_name} submitted "${data.project_name}".`,
      }));

      await admin.from("notifications").insert(notifications);
    }
  } catch (err) {
    // Non-blocking — don't fail the request if notification fails
    console.error("Failed to send admin notification:", err);
  }

  return NextResponse.json({ project: data }, { status: 201 });
}
