import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/analytics/insights?project_id=uuid
 * Returns aggregated analytics data for a project.
 * Auth: user must be a project member or admin.
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const access = await verifyProjectAccess(projectId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const admin = createAdminClient();

  // Fetch analytics events for this project (bounded to last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: events, error: eventsErr } = await admin
    .from("analytics_events")
    .select("*")
    .eq("project_id", projectId)
    .gte("created_at", ninetyDaysAgo.toISOString())
    .order("created_at", { ascending: true });

  if (eventsErr) {
    return NextResponse.json({ error: eventsErr.message }, { status: 500 });
  }

  const allEvents = events ?? [];

  // Calculate insights
  const pageViews = allEvents.filter((e) => e.event_type === "page_view");
  const sessionEnds = allEvents.filter((e) => e.event_type === "session_end");
  const scrollEvents = allEvents.filter((e) => e.event_type === "scroll_depth");

  // Unique sessions
  const uniqueSessions = new Set(pageViews.map((e) => e.session_id)).size;

  // Average scroll depth (from session_end events which have max_scroll_depth)
  const scrollDepths = sessionEnds
    .map((e) => (e.data as Record<string, number>)?.max_scroll_depth)
    .filter((d): d is number => typeof d === "number");
  const avgScrollDepth = scrollDepths.length > 0
    ? Math.round(scrollDepths.reduce((a, b) => a + b, 0) / scrollDepths.length)
    : 0;

  // Average session duration (from session_end events)
  const durations = sessionEnds
    .map((e) => (e.data as Record<string, number>)?.duration)
    .filter((d): d is number => typeof d === "number");
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // Device type breakdown
  const deviceCounts: Record<string, number> = {};
  pageViews.forEach((e) => {
    const dev = e.device_type || "unknown";
    deviceCounts[dev] = (deviceCounts[dev] || 0) + 1;
  });
  const topDevice = Object.entries(deviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "n/a";

  // Scroll depth distribution (from all scroll_depth and session_end events)
  const allScrollDepths = [
    ...scrollDepths,
    ...scrollEvents
      .map((e) => (e.data as Record<string, number>)?.depth)
      .filter((d): d is number => typeof d === "number"),
  ];
  // Use session-level max scroll (deduplicate by session)
  const sessionMaxScroll: Record<string, number> = {};
  [...scrollEvents, ...sessionEnds].forEach((e) => {
    const depth =
      (e.data as Record<string, number>)?.max_scroll_depth ??
      (e.data as Record<string, number>)?.depth ??
      0;
    const sid = e.session_id;
    if (!sessionMaxScroll[sid] || depth > sessionMaxScroll[sid]) {
      sessionMaxScroll[sid] = depth;
    }
  });
  const maxScrollValues = Object.values(sessionMaxScroll);
  const scrollDistribution = {
    "0-25": maxScrollValues.filter((d) => d >= 0 && d < 25).length,
    "25-50": maxScrollValues.filter((d) => d >= 25 && d < 50).length,
    "50-75": maxScrollValues.filter((d) => d >= 50 && d < 75).length,
    "75-100": maxScrollValues.filter((d) => d >= 75 && d <= 100).length,
  };

  // Referrer breakdown
  const referrerCounts: Record<string, number> = {};
  pageViews.forEach((e) => {
    let ref = e.referrer || "direct";
    if (ref !== "direct") {
      try {
        ref = new URL(ref).hostname;
      } catch {
        ref = "other";
      }
    }
    referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
  });
  const referrers = Object.entries(referrerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([source, count]) => ({ source, count }));

  // Daily views (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dailyViews: Record<string, number> = {};
  pageViews
    .filter((e) => new Date(e.created_at) >= thirtyDaysAgo)
    .forEach((e) => {
      const day = new Date(e.created_at).toISOString().split("T")[0];
      dailyViews[day] = (dailyViews[day] || 0) + 1;
    });
  // Fill in missing days
  const dailyViewsArray: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    dailyViewsArray.push({ date: key, count: dailyViews[key] || 0 });
  }

  // ── Section engagement (from section_view events) ──
  const sectionViewEvents = allEvents.filter((e) => e.event_type === "section_view");

  const sectionStats: Record<string, { views: number; totalDwell: number; sessions: Set<string>; indexSum: number; indexCount: number }> = {};
  sectionViewEvents.forEach((e) => {
    const data = e.data as Record<string, unknown>;
    const secId = data.section_id as string;
    if (!secId) return;
    if (!sectionStats[secId]) {
      sectionStats[secId] = { views: 0, totalDwell: 0, sessions: new Set(), indexSum: 0, indexCount: 0 };
    }
    sectionStats[secId].views++;
    sectionStats[secId].totalDwell += (data.dwell_ms as number) || 0;
    sectionStats[secId].sessions.add(e.session_id);
    if (typeof data.index === "number" && data.index >= 0) {
      sectionStats[secId].indexSum += data.index;
      sectionStats[secId].indexCount++;
    }
  });

  const totalSessionCount = uniqueSessions || 1;
  const sectionEngagement = Object.entries(sectionStats)
    .map(([section_id, stats]) => ({
      section_id,
      views: stats.views,
      avg_dwell_ms: stats.views > 0 ? Math.round(stats.totalDwell / stats.views) : 0,
      pct_sessions: Math.round((stats.sessions.size / totalSessionCount) * 100),
      avg_index: stats.indexCount > 0 ? Math.round(stats.indexSum / stats.indexCount) : 999,
    }))
    .sort((a, b) => a.avg_index - b.avg_index);

  // Bounce section — most common last_section from early exits (< 90% scroll)
  const bounceSections: Record<string, number> = {};
  sessionEnds.forEach((e) => {
    const data = e.data as Record<string, unknown>;
    const maxScroll = data.max_scroll_depth as number;
    const lastSec = data.last_section as string;
    if (typeof maxScroll === "number" && maxScroll < 90 && lastSec) {
      bounceSections[lastSec] = (bounceSections[lastSec] || 0) + 1;
    }
  });
  const bounceSection = Object.entries(bounceSections).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Engagement score (0–100): 40% scroll depth, 30% completion rate, 30% duration
  const completionRate = maxScrollValues.length > 0
    ? maxScrollValues.filter((d) => d >= 75).length / maxScrollValues.length
    : 0;
  const durationScore = Math.min(avgDuration / 120, 1);
  const engagementScore = Math.round(
    (avgScrollDepth / 100) * 40 +
    completionRate * 30 +
    durationScore * 30,
  );

  return NextResponse.json({
    summary: {
      total_views: pageViews.length,
      unique_sessions: uniqueSessions,
      avg_scroll_depth: avgScrollDepth,
      avg_duration: avgDuration,
      top_device: topDevice,
      engagement_score: engagementScore,
    },
    daily_views: dailyViewsArray,
    scroll_distribution: scrollDistribution,
    referrers,
    device_breakdown: deviceCounts,
    section_engagement: sectionEngagement,
    bounce_section: bounceSection,
  });
}
