import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/projects/[id]/pipeline — pipeline jobs for a project (any member)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Always use admin client for pipeline_jobs (no user-scoped RLS on this table)
  const client = createAdminClient();

  const { data: jobs, error } = await client
    .from("pipeline_jobs")
    .select("id,job_type,status,started_at,completed_at,created_at,last_error,progress")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Queue metadata for queued jobs
  let queueMeta: { position: number; estimated_wait_min: number } | null = null;
  const hasQueued = jobs?.some((j) => j.status === "queued" || j.status === "pending");
  if (hasQueued) {
    // Count all running + queued jobs globally (ahead in queue)
    const { data: globalQueue } = await client
      .from("pipeline_jobs")
      .select("id,created_at,job_type")
      .in("status", ["running", "queued"])
      .order("created_at", { ascending: true });

    // Find this project's earliest queued job
    const thisProjectQueued = jobs
      ?.filter((j) => j.status === "queued" || j.status === "pending")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (thisProjectQueued && thisProjectQueued.length > 0 && globalQueue) {
      const earliestQueued = thisProjectQueued[0];
      const position = globalQueue.filter(
        (j) => new Date(j.created_at).getTime() < new Date(earliestQueued.created_at).getTime()
      ).length;

      // Estimate wait based on average build duration (last 10 completed)
      const { data: recentCompleted } = await client
        .from("pipeline_jobs")
        .select("started_at,completed_at")
        .eq("status", "completed")
        .not("started_at", "is", null)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(10);

      let avgDurationMin = 10; // fallback
      if (recentCompleted && recentCompleted.length > 0) {
        const durations = recentCompleted.map((j) =>
          (new Date(j.completed_at!).getTime() - new Date(j.started_at!).getTime()) / 60000
        );
        avgDurationMin = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      }

      queueMeta = {
        position: position + 1,
        estimated_wait_min: Math.max(1, Math.round(position * avgDurationMin)),
      };
    }
  }

  return NextResponse.json({ jobs: jobs ?? [], queue: queueMeta });
}
