import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { NextResponse } from "next/server";

// Phase labels for grouping automation events
const PHASE_MAP: Record<string, string> = {
  "build-started": "build",
  "narrative-approved": "narrative",
  "narrative-rejected": "narrative",
  "job-retried": "recovery",
  "job-escalated": "recovery",
};

// Human-readable event descriptions
const EVENT_LABELS: Record<string, string> = {
  "build-started": "build initiated",
  "narrative-approved": "narrative approved",
  "narrative-rejected": "narrative sent back for revision",
  "job-retried": "job retried after failure",
  "job-escalated": "job escalated for manual review",
};

interface CreditEvent {
  id: string;
  event: string;
  label: string;
  phase: string;
  timestamp: string;
  cost_usd: number | null;
}

interface PhaseSummary {
  phase: string;
  event_count: number;
  total_cost_usd: number;
  events: CreditEvent[];
}

// GET /api/projects/[id]/credits — automation history for a project (any member)
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

  // Fetch automation_log entries for this project
  const { data: logs, error: logError } = await client
    .from("automation_log")
    .select("id,event,cost_usd,created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  // Fetch pipeline_jobs for duration/status stats
  const { data: jobs, error: jobError } = await client
    .from("pipeline_jobs")
    .select("id,job_type,status,started_at,completed_at,created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 });
  }

  // Map automation events to credit entries
  const events: CreditEvent[] = (logs ?? []).map((log) => ({
    id: log.id,
    event: log.event,
    label: EVENT_LABELS[log.event] ?? log.event.replace(/-/g, " "),
    phase: PHASE_MAP[log.event] ?? "pipeline",
    timestamp: log.created_at,
    cost_usd: log.cost_usd,
  }));

  // Group by phase
  const phaseOrder = ["narrative", "build", "pipeline", "recovery"];
  const phaseGroups: Record<string, CreditEvent[]> = {};
  for (const e of events) {
    if (!phaseGroups[e.phase]) phaseGroups[e.phase] = [];
    phaseGroups[e.phase].push(e);
  }

  const phases: PhaseSummary[] = phaseOrder
    .filter((p) => phaseGroups[p])
    .map((phase) => {
      const phaseEvents = phaseGroups[phase];
      return {
        phase,
        event_count: phaseEvents.length,
        total_cost_usd: phaseEvents.reduce((sum, e) => sum + (e.cost_usd ?? 0), 0),
        events: phaseEvents,
      };
    });

  // Add any phases not in predefined order
  for (const [phase, phaseEvents] of Object.entries(phaseGroups)) {
    if (!phaseOrder.includes(phase)) {
      phases.push({
        phase,
        event_count: phaseEvents.length,
        total_cost_usd: phaseEvents.reduce((sum, e) => sum + (e.cost_usd ?? 0), 0),
        events: phaseEvents,
      });
    }
  }

  // Pipeline job stats
  const completedJobs = (jobs ?? []).filter((j) => j.status === "completed");
  const failedJobs = (jobs ?? []).filter((j) => j.status === "failed");

  // Total build duration (first job start to last job completion)
  let totalDurationSec: number | null = null;
  const startsAndEnds = (jobs ?? [])
    .filter((j) => j.started_at && j.completed_at)
    .map((j) => ({
      start: new Date(j.started_at!).getTime(),
      end: new Date(j.completed_at!).getTime(),
    }));

  if (startsAndEnds.length > 0) {
    const earliest = Math.min(...startsAndEnds.map((s) => s.start));
    const latest = Math.max(...startsAndEnds.map((s) => s.end));
    totalDurationSec = Math.round((latest - earliest) / 1000);
  }

  // Total cost across all events
  const totalCost = events.reduce((sum, e) => sum + (e.cost_usd ?? 0), 0);

  return NextResponse.json({
    timeline: events,
    phases,
    stats: {
      total_events: events.length,
      total_jobs: (jobs ?? []).length,
      completed_jobs: completedJobs.length,
      failed_jobs: failedJobs.length,
      retries: events.filter((e) => e.event === "job-retried").length,
      total_duration_sec: totalDurationSec,
      total_cost_usd: Math.round(totalCost * 100) / 100,
    },
  });
}
