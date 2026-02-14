import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess, getAdminUserIds } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { Department } from "@/types/database";

const VALID_TARGETS: Department[] = ["strategy", "creative"];

// POST /api/projects/[id]/promote — promote a project between departments
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id, ["owner", "editor"]);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const user = access.user;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const targetDepartment = body.target_department as Department;

  if (!targetDepartment || !VALID_TARGETS.includes(targetDepartment)) {
    return NextResponse.json(
      { error: `target_department must be one of: ${VALID_TARGETS.join(", ")}` },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  // Load the source project
  const { data: source, error: sourceError } = await adminClient
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (sourceError || !source) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // Validate promotion paths
  const sourceDept = source.department as Department;

  if (sourceDept === "strategy" && targetDepartment !== "creative") {
    return NextResponse.json(
      { error: "strategy projects can only be promoted to creative" },
      { status: 400 },
    );
  }

  if (sourceDept === "intelligence" && !["strategy", "creative"].includes(targetDepartment)) {
    return NextResponse.json(
      { error: "intelligence projects can be promoted to strategy or creative" },
      { status: 400 },
    );
  }

  if (sourceDept === "creative") {
    return NextResponse.json(
      { error: "creative projects cannot be promoted" },
      { status: 400 },
    );
  }

  // Build the new project data based on target department
  const newProjectName = typeof body.project_name === "string" && body.project_name.trim()
    ? (body.project_name as string).trim().slice(0, 200)
    : source.project_name;

  const newProject: Record<string, unknown> = {
    user_id: source.user_id,
    company_name: source.company_name,
    project_name: newProjectName,
    department: targetDepartment,
    pipeline_mode: targetDepartment,
    autonomy_level: source.autonomy_level,
    target_audience: source.target_audience,
    notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : source.notes,
  };

  const CREATIVE_TYPES = ["investor_pitch", "client_proposal", "research_report", "website", "other"];
  const STRATEGY_TYPES = ["market_research", "competitive_analysis", "funding_landscape"];

  if (targetDepartment === "creative") {
    newProject.type = "investor_pitch"; // default creative type, can be overridden
    newProject.status = "requested";

    if (typeof body.type === "string") {
      if (!CREATIVE_TYPES.includes(body.type)) {
        return NextResponse.json(
          { error: `invalid type for creative. must be one of: ${CREATIVE_TYPES.join(", ")}` },
          { status: 400 },
        );
      }
      newProject.type = body.type;
    }
  } else if (targetDepartment === "strategy") {
    newProject.type = "market_research"; // default strategy type
    newProject.status = "research_queued";

    if (typeof body.type === "string") {
      if (!STRATEGY_TYPES.includes(body.type)) {
        return NextResponse.json(
          { error: `invalid type for strategy. must be one of: ${STRATEGY_TYPES.join(", ")}` },
          { status: 400 },
        );
      }
      newProject.type = body.type;
    }
  }

  // Create the new project
  const { data: created, error: createError } = await adminClient
    .from("projects")
    .insert(newProject)
    .select()
    .single();

  if (createError) {
    console.error("Failed to create promoted project:", createError.message);
    return NextResponse.json({ error: "failed to create promoted project" }, { status: 500 });
  }

  // Copy project membership from source to new project
  const { data: members } = await adminClient
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", id);

  if (members && members.length > 0) {
    await adminClient.from("project_members").insert(
      members.map((m) => ({
        project_id: created.id,
        user_id: m.user_id,
        role: m.role,
      })),
    );
  }

  // Create cross-department reference
  await adminClient.from("cross_department_refs").insert({
    source_department: sourceDept,
    source_type: "project",
    source_id: id,
    target_department: targetDepartment,
    target_type: "project",
    target_id: created.id,
    relationship: "promoted_to",
    metadata: {
      promoted_by: user.id,
      source_status: source.status,
    },
  });

  // Log to automation_log
  await adminClient.from("automation_log").insert({
    project_id: id,
    department: sourceDept,
    event: "project-promoted",
    details: {
      source_project_id: id,
      target_project_id: created.id,
      source_department: sourceDept,
      target_department: targetDepartment,
      promoted_by: user.id,
    },
  });

  // Notify admins
  try {
    const adminIds = await getAdminUserIds(adminClient);
    if (adminIds.length > 0) {
      await adminClient.from("notifications").insert(
        adminIds.map((adminId) => ({
          user_id: adminId,
          project_id: created.id,
          type: "project_promoted",
          title: `project promoted to ${targetDepartment}`,
          body: `${source.company_name} "${source.project_name}" promoted from ${sourceDept} to ${targetDepartment}.`,
        })),
      );
    }
  } catch (err) {
    console.error("Failed to send promotion notification:", err);
  }

  return NextResponse.json({
    project: created,
    source_project_id: id,
    relationship: "promoted_to",
  }, { status: 201 });
}
