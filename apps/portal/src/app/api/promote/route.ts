import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, getAdminUserIds } from "@/lib/auth";
import {
  fetchProjectUpstreamContext,
  buildRefMetadata,
  buildSourceContext,
  type UpstreamContext,
} from "@/lib/upstream-context";
import { NextResponse } from "next/server";
import type { Department } from "@/types/database";

const VALID_TARGETS: Department[] = ["strategy", "creative"];

// POST /api/promote — unified cross-department promotion (supports both project and trend sources)
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

  const sourceType = (body.source_type as string) || "project";
  const sourceId = body.source_id as string;
  const targetDepartment = body.target_department as Department;

  if (!sourceId) {
    return NextResponse.json({ error: "source_id is required" }, { status: 400 });
  }

  if (!targetDepartment || !VALID_TARGETS.includes(targetDepartment)) {
    return NextResponse.json(
      { error: `target_department must be one of: ${VALID_TARGETS.join(", ")}` },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  let sourceName: string;
  let sourceCompany: string;
  let sourceDept: Department;
  let sourceOwnerId: string;
  let sourceProjectId: string | null = null;
  let upstreamCtx: UpstreamContext = { research: null, qualityScores: null, trendContext: null };

  if (sourceType === "trend") {
    // Load trend cluster
    const { data: cluster, error: clusterError } = await adminClient
      .from("trend_clusters")
      .select("*")
      .eq("id", sourceId)
      .single();

    if (clusterError || !cluster) {
      return NextResponse.json({ error: "trend cluster not found" }, { status: 404 });
    }

    sourceName = cluster.name;
    sourceCompany = cluster.category || "Unknown";
    sourceDept = "intelligence";
    sourceOwnerId = user.id;

    // Build trend context for downstream pipeline injection
    const trendParts = [`Trend: ${cluster.name}`];
    if (cluster.description) trendParts.push(`Description: ${cluster.description}`);
    if (cluster.lifecycle) trendParts.push(`Lifecycle: ${cluster.lifecycle}`);
    if (cluster.velocity_score != null) trendParts.push(`Velocity Score: ${cluster.velocity_score}`);

    // Fetch top signals for this trend
    const { data: trendSignals } = await adminClient
      .from("signal_cluster_assignments")
      .select("signals(title, content_snippet)")
      .eq("cluster_id", sourceId)
      .order("confidence", { ascending: false })
      .limit(5);

    if (trendSignals && trendSignals.length > 0) {
      const signalSummaries = trendSignals
        .map((s: Record<string, unknown>) => {
          const sig = s.signals as Record<string, unknown> | null;
          return sig ? `- ${sig.title}` : null;
        })
        .filter(Boolean);
      if (signalSummaries.length > 0) {
        trendParts.push(`Top Signals:\n${signalSummaries.join("\n")}`);
      }
    }

    upstreamCtx.trendContext = trendParts.join("\n");
  } else {
    // Load source project (existing behavior)
    const { data: source, error: sourceError } = await adminClient
      .from("projects")
      .select("*")
      .eq("id", sourceId)
      .single();

    if (sourceError || !source) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }

    // Check user has access to this project
    const { data: membership } = await adminClient
      .from("project_members")
      .select("role")
      .eq("project_id", sourceId)
      .eq("user_id", user.id)
      .single();

    if (!membership && !isAdmin(user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (membership && !["owner", "editor"].includes(membership.role)) {
      return NextResponse.json({ error: "forbidden — insufficient role" }, { status: 403 });
    }

    sourceName = source.project_name;
    sourceCompany = source.company_name;
    sourceDept = source.department as Department;
    sourceOwnerId = source.user_id;
    sourceProjectId = source.id;

    if (sourceDept === "creative") {
      return NextResponse.json({ error: "creative projects cannot be promoted" }, { status: 400 });
    }

    // Fetch upstream research + trend context via shared helper
    upstreamCtx = await fetchProjectUpstreamContext(adminClient, sourceId, sourceDept);
  }

  // Validate promotion paths
  if (sourceDept === "strategy" && targetDepartment !== "creative") {
    return NextResponse.json(
      { error: "strategy projects can only be promoted to creative" },
      { status: 400 },
    );
  }

  // Build the new project
  const newProjectName =
    typeof body.project_name === "string" && body.project_name.trim()
      ? (body.project_name as string).trim().slice(0, 200)
      : sourceName;

  const CREATIVE_TYPES = ["investor_pitch", "client_proposal", "research_report", "website", "other"];
  const STRATEGY_TYPES = ["market_research", "competitive_analysis", "funding_landscape"];

  const newProject: Record<string, unknown> = {
    user_id: sourceOwnerId,
    company_name: sourceCompany,
    project_name: newProjectName,
    department: targetDepartment,
    pipeline_mode: targetDepartment,
    autonomy_level: "supervised",
    notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null,
  };

  if (targetDepartment === "creative") {
    newProject.type = "investor_pitch";
    newProject.status = "requested";
    if (typeof body.type === "string" && CREATIVE_TYPES.includes(body.type)) {
      newProject.type = body.type;
    }
  } else if (targetDepartment === "strategy") {
    newProject.type = "market_research";
    newProject.status = "research_queued";
    if (typeof body.type === "string" && STRATEGY_TYPES.includes(body.type)) {
      newProject.type = body.type;
    }
  }

  // Create project
  const { data: created, error: createError } = await adminClient
    .from("projects")
    .insert(newProject)
    .select()
    .single();

  if (createError) {
    console.error("Failed to create promoted project:", createError.message);
    return NextResponse.json({ error: "failed to create promoted project" }, { status: 500 });
  }

  // Copy membership if source is a project, otherwise add current user as owner
  if (sourceProjectId) {
    const { data: members } = await adminClient
      .from("project_members")
      .select("user_id, role")
      .eq("project_id", sourceProjectId);

    if (members && members.length > 0) {
      const { error: memberError } = await adminClient.from("project_members").insert(
        members.map((m) => ({
          project_id: created.id,
          user_id: m.user_id,
          role: m.role,
        })),
      );

      if (memberError) {
        console.error("Failed to copy members, rolling back:", memberError.message);
        await adminClient.from("projects").delete().eq("id", created.id);
        return NextResponse.json({ error: "failed to copy project membership" }, { status: 500 });
      }
    }
  } else {
    // For trend promotions, add the current user as owner
    const { error: memberError } = await adminClient.from("project_members").insert({
      project_id: created.id,
      user_id: user.id,
      role: "owner",
    });

    if (memberError) {
      console.error("Failed to add owner membership, rolling back:", memberError.message);
      await adminClient.from("projects").delete().eq("id", created.id);
      return NextResponse.json({ error: "failed to set project ownership" }, { status: 500 });
    }
  }

  // Create cross-department reference with upstream context in metadata
  const refMetadata = buildRefMetadata(user.id, upstreamCtx);

  const { error: refError } = await adminClient.from("cross_department_refs").insert({
    source_department: sourceDept,
    source_type: sourceType,
    source_id: sourceId,
    target_department: targetDepartment,
    target_type: "project",
    target_id: created.id,
    relationship: "promoted_to",
    metadata: refMetadata,
  });

  if (refError) {
    console.error("Failed to create cross-department ref, rolling back:", refError.message);
    await adminClient.from("project_members").delete().eq("project_id", created.id);
    await adminClient.from("projects").delete().eq("id", created.id);
    return NextResponse.json({ error: "failed to create provenance link" }, { status: 500 });
  }

  // Populate source_context on the new project (denormalized, truncated for pipeline reads)
  const sourceContext = buildSourceContext(sourceDept, sourceProjectId || sourceId, upstreamCtx);
  if (sourceContext) {
    const { error: ctxError } = await adminClient
      .from("projects")
      .update({ source_context: sourceContext })
      .eq("id", created.id);

    if (ctxError) {
      // Non-fatal — project exists, context forwarding is best-effort
      console.error("Failed to set source_context on promoted project:", ctxError.message);
    }
  }

  // Log to automation_log (non-critical)
  await adminClient
    .from("automation_log")
    .insert({
      project_id: sourceProjectId || created.id,
      department: sourceDept,
      event: "project-promoted",
      details: {
        source_type: sourceType,
        source_id: sourceId,
        target_project_id: created.id,
        source_department: sourceDept,
        target_department: targetDepartment,
        promoted_by: user.id,
      },
    })
    .then(null, (err: unknown) => console.error("Failed to log promotion:", err));

  // Notify admins (non-critical)
  try {
    const adminIds = await getAdminUserIds(adminClient);
    if (adminIds.length > 0) {
      await adminClient.from("notifications").insert(
        adminIds.map((adminId) => ({
          user_id: adminId,
          project_id: created.id,
          type: "project_promoted",
          title: `${sourceType} promoted to ${targetDepartment}`,
          body: `${sourceCompany} "${sourceName}" promoted from ${sourceDept} to ${targetDepartment}.`,
        })),
      );
    }
  } catch (err) {
    console.error("Failed to send promotion notification:", err);
  }

  return NextResponse.json(
    {
      project: created,
      source_id: sourceId,
      source_type: sourceType,
      relationship: "promoted_to",
    },
    { status: 201 },
  );
}
