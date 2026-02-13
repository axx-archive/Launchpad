import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const VALID_EVENT_TYPES = ["page_view", "scroll_depth", "session_end"];

const VIEW_THRESHOLDS = [1, 5, 10, 25, 50, 100];

/* ── Simple in-memory rate limiter (100 req/min per IP) ── */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 100;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// Periodic cleanup to prevent memory leak (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000);

/**
 * POST /api/analytics — receive analytics events from PitchApp viewer script.
 * No auth required (public endpoint — the script runs on deployed PitchApps).
 * Uses service role to write to analytics_events table.
 */
export async function POST(request: Request) {
  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const projectId = body.project_id;
  const sessionId = body.session_id;
  const eventType = body.event_type;

  // Validate required fields
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }
  if (!eventType || !VALID_EVENT_TYPES.includes(eventType as string)) {
    return NextResponse.json({ error: "invalid event_type" }, { status: 400 });
  }

  // Validate UUID format (basic check)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(projectId as string)) {
    return NextResponse.json({ error: "invalid project_id format" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify project exists
  const { data: project, error: projErr } = await admin
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // Store event
  const { error: insertErr } = await admin.from("analytics_events").insert({
    project_id: projectId,
    session_id: (sessionId as string).substring(0, 100),
    event_type: eventType,
    data: body.data ?? {},
    device_type: typeof body.device_type === "string" ? body.device_type.substring(0, 20) : null,
    referrer: typeof body.referrer === "string" ? body.referrer.substring(0, 500) : null,
    viewport_width: typeof body.viewport_width === "number" ? Math.min(body.viewport_width, 10000) : null,
  });

  if (insertErr) {
    console.error("Analytics insert error:", insertErr.message);
    return NextResponse.json({ error: "storage error" }, { status: 500 });
  }

  // Check view thresholds for notifications (only on page_view events)
  if (eventType === "page_view") {
    try {
      await checkViewThresholds(admin, projectId as string, project.user_id);
    } catch (e) {
      // Non-critical — don't fail the analytics event
      console.error("Threshold check error:", e);
    }
  }

  return NextResponse.json({ ok: true }, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/**
 * OPTIONS — CORS preflight for cross-origin analytics requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/**
 * Check if unique session count just crossed a notification threshold.
 * Uses a bounded query (.limit(500)) to avoid O(n) full table scans on every write.
 * If 500+ rows are returned, skip threshold check (approximate — thresholds max at 100).
 */
async function checkViewThresholds(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  userId: string,
) {
  const { data: sessions } = await admin
    .from("analytics_events")
    .select("session_id")
    .eq("project_id", projectId)
    .eq("event_type", "page_view")
    .limit(500);

  if (!sessions) return;

  // If we hit the limit, we're well past the max threshold (100) — skip
  if (sessions.length >= 500) return;

  const uniqueCount = new Set(sessions.map((s) => s.session_id)).size;

  // Check if we just crossed a threshold
  const crossedThreshold = VIEW_THRESHOLDS.find((t) => uniqueCount === t);
  if (!crossedThreshold) return;

  // Check if we already sent a notification for this threshold
  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("project_id", projectId)
    .eq("type", `views_${crossedThreshold}`)
    .limit(1);

  if (existing && existing.length > 0) return;

  // Get project name for the notification
  const { data: proj } = await admin
    .from("projects")
    .select("project_name, company_name")
    .eq("id", projectId)
    .single();

  const name = proj?.project_name || proj?.company_name || "your PitchApp";

  const titles: Record<number, string> = {
    1: "first viewer",
    5: "5 viewers",
    10: "10 viewers",
    25: "25 viewers",
    50: "50 viewers",
    100: "100 viewers",
  };

  await admin.from("notifications").insert({
    user_id: userId,
    project_id: projectId,
    type: `views_${crossedThreshold}`,
    title: titles[crossedThreshold] || `${crossedThreshold} viewers`,
    body: crossedThreshold === 1
      ? `someone just viewed ${name}. your pitchapp is live and getting attention.`
      : `${crossedThreshold} people have viewed ${name}. momentum is building.`,
    read: false,
  });
}
