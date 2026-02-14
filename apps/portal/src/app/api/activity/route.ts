import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { Department } from "@/types/database";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 30;
const VALID_DEPARTMENTS: Department[] = ["intelligence", "strategy", "creative"];

interface ActivityEvent {
  id: string;
  department: string;
  event_type: string;
  title: string;
  description: string | null;
  entity_id: string | null;
  entity_type: string | null;
  created_at: string;
  source: "automation_log" | "pipeline_job";
}

// Event title/description formatters
function formatLogEvent(log: Record<string, unknown>): Pick<ActivityEvent, "title" | "description" | "entity_type"> {
  const event = log.event as string;
  const details = log.details as Record<string, unknown> | null;

  switch (event) {
    case "research-approved":
      return {
        title: "research approved",
        description: `Version ${details?.version ?? "?"} approved`,
        entity_type: "research",
      };
    case "research-rejected":
      return {
        title: "research revision requested",
        description: details?.revision_notes as string ?? null,
        entity_type: "research",
      };
    case "project-promoted":
      return {
        title: `project promoted to ${details?.target_department ?? "?"}`,
        description: `From ${details?.source_department ?? "?"} to ${details?.target_department ?? "?"}`,
        entity_type: "project",
      };
    case "manual-ingest-triggered":
      return {
        title: "manual ingestion triggered",
        description: `Sources: ${(details?.sources as string[])?.join(", ") ?? "all"}`,
        entity_type: "job",
      };
    case "intelligence-source-config":
      return {
        title: `source config updated: ${details?.source ?? "?"}`,
        description: null,
        entity_type: "config",
      };
    default:
      return {
        title: event.replace(/-/g, " "),
        description: null,
        entity_type: null,
      };
  }
}

function formatJobEvent(job: Record<string, unknown>): Pick<ActivityEvent, "title" | "description" | "event_type"> {
  const jobType = job.job_type as string;
  const status = job.status as string;

  return {
    event_type: `job_${status}`,
    title: `${jobType.replace(/-/g, " ")} ${status}`,
    description: status === "failed" ? (job.error as string ?? "unknown error") : null,
  };
}

// GET /api/activity — unified activity feed across departments
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);

  // Pagination
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get("page_size") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  );

  // Filters
  const department = url.searchParams.get("department") as Department | null;
  const validDept = department && VALID_DEPARTMENTS.includes(department) ? department : null;

  const admin = isAdmin(user.email);
  const adminClient = createAdminClient();

  // For non-admins, scope activity to their projects
  let userProjectIds: string[] | null = null;
  if (!admin) {
    const { data: memberships } = await adminClient
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);
    userProjectIds = (memberships ?? []).map((m) => m.project_id);

    if (userProjectIds.length === 0) {
      return NextResponse.json({ events: [], page, page_size: pageSize, total: 0 });
    }
  }

  // Fetch automation_log events
  let logQuery = adminClient
    .from("automation_log")
    .select("id, project_id, department, event, details, created_at", { count: "exact" });

  if (validDept) {
    logQuery = logQuery.eq("department", validDept);
  }
  if (userProjectIds) {
    logQuery = logQuery.in("project_id", userProjectIds);
  }

  const { data: logs, count: logCount } = await logQuery
    .order("created_at", { ascending: false })
    .limit(pageSize * 2); // fetch extra since we'll merge with jobs

  // Fetch pipeline_jobs
  let jobQuery = adminClient
    .from("pipeline_jobs")
    .select("id, project_id, job_type, status, created_at, completed_at", { count: "exact" });

  if (userProjectIds) {
    jobQuery = jobQuery.in("project_id", userProjectIds);
  }

  // Filter jobs by department-specific job types if needed
  if (validDept === "intelligence") {
    jobQuery = jobQuery.in("job_type", ["auto-ingest", "auto-cluster", "auto-score", "auto-analyze-trends", "auto-generate-brief"]);
  } else if (validDept === "strategy") {
    jobQuery = jobQuery.in("job_type", ["auto-research"]);
  } else if (validDept === "creative") {
    jobQuery = jobQuery.in("job_type", ["auto-pull", "auto-narrative", "auto-build", "auto-build-html", "auto-review", "auto-push", "auto-one-pager", "auto-emails"]);
  }

  const { data: jobs, count: jobCount } = await jobQuery
    .order("created_at", { ascending: false })
    .limit(pageSize * 2);

  // Transform logs into ActivityEvents
  const logEvents: ActivityEvent[] = (logs ?? []).map((log) => {
    const formatted = formatLogEvent(log as Record<string, unknown>);
    return {
      id: log.id as string,
      department: (log.department as string) ?? "unknown",
      event_type: log.event as string,
      title: formatted.title,
      description: formatted.description,
      entity_id: log.project_id as string | null,
      entity_type: formatted.entity_type,
      created_at: log.created_at as string,
      source: "automation_log" as const,
    };
  });

  // Transform jobs into ActivityEvents — infer department from job_type
  const jobDeptMap: Record<string, string> = {
    "auto-ingest": "intelligence",
    "auto-cluster": "intelligence",
    "auto-score": "intelligence",
    "auto-analyze-trends": "intelligence",
    "auto-generate-brief": "intelligence",
    "auto-research": "strategy",
  };

  const jobEvents: ActivityEvent[] = (jobs ?? []).map((job) => {
    const formatted = formatJobEvent(job as Record<string, unknown>);
    const dept = jobDeptMap[job.job_type as string] ?? "creative";
    return {
      id: job.id as string,
      department: dept,
      event_type: formatted.event_type,
      title: formatted.title,
      description: formatted.description,
      entity_id: job.project_id as string | null,
      entity_type: "job",
      created_at: (job.completed_at ?? job.created_at) as string,
      source: "pipeline_job" as const,
    };
  });

  // Merge and sort by created_at descending
  const allEvents = [...logEvents, ...jobEvents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Paginate the merged results
  const offset = (page - 1) * pageSize;
  const paged = allEvents.slice(offset, offset + pageSize);
  const total = (logCount ?? 0) + (jobCount ?? 0);

  return NextResponse.json({
    events: paged,
    page,
    page_size: pageSize,
    total,
  });
}
