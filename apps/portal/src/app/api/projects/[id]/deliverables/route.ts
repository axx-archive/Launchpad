import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { NextResponse } from "next/server";

interface DeliverableJob {
  id: string;
  job_type: string;
  status: string;
  result: Record<string, unknown> | null;
  completed_at: string | null;
}

// GET /api/projects/[id]/deliverables — fetch one-pager and email deliverables
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const client = createAdminClient();

  // Fetch deliverable pipeline jobs (most recent of each type)
  const { data: jobs, error } = await client
    .from("pipeline_jobs")
    .select("id,job_type,status,result,completed_at")
    .eq("project_id", id)
    .in("job_type", ["auto-one-pager", "auto-emails"])
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get the most recent completed job of each type
  const deliverables: Record<string, {
    status: string;
    content?: string;
    html?: string;
    data?: Record<string, unknown>;
    completed_at?: string;
  }> = {};

  const typedJobs = (jobs ?? []) as DeliverableJob[];

  for (const job of typedJobs) {
    const key = job.job_type === "auto-one-pager" ? "one_pager" : "emails";

    // Only take the first (most recent) job per type
    if (deliverables[key]) continue;

    if (job.status === "completed" && job.result) {
      const result = job.result as Record<string, unknown>;
      deliverables[key] = {
        status: "ready",
        content: (key === "one_pager" ? result.one_pager_md : result.emails_md) as string | undefined,
        html: key === "one_pager" ? result.one_pager_html as string | undefined : undefined,
        data: key === "one_pager" ? result.one_pager_data as Record<string, unknown> | undefined : undefined,
        completed_at: job.completed_at ?? undefined,
      };
    } else if (job.status === "running") {
      deliverables[key] = { status: "generating" };
    } else if (job.status === "queued" || job.status === "pending") {
      deliverables[key] = { status: "queued" };
    } else if (job.status === "failed") {
      deliverables[key] = { status: "failed" };
    }
  }

  return NextResponse.json({ deliverables });
}
