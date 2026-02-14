import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

// Intelligence source configuration — stored in automation_log as config events.
// In Phase 2, these drive which sources the ingestion workers pull from.

interface SourceConfig {
  source: string;
  enabled: boolean;
  subreddits?: string[];
  channels?: string[];
  keywords?: string[];
  pull_interval_minutes?: number;
}

const CONFIG_EVENT = "intelligence-source-config";

// GET /api/admin/intelligence/config — get current source configs (admin-only)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // Fetch the latest config entry for each source from automation_log
  const { data: configLogs, error } = await adminClient
    .from("automation_log")
    .select("event, details, created_at")
    .eq("event", CONFIG_EVENT)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Failed to load intelligence config:", error.message);
    return NextResponse.json({ error: "failed to load config" }, { status: 500 });
  }

  // Dedupe: keep only the latest config per source
  const latestBySource: Record<string, SourceConfig & { updated_at: string }> = {};

  for (const log of configLogs ?? []) {
    const details = log.details as Record<string, unknown> | null;
    const source = details?.source as string | undefined;
    if (source && !latestBySource[source]) {
      latestBySource[source] = {
        ...(details as unknown as SourceConfig),
        updated_at: log.created_at as string,
      };
    }
  }

  // Default configs for sources that haven't been configured yet
  const defaults: Record<string, SourceConfig> = {
    reddit: { source: "reddit", enabled: false, subreddits: [], keywords: [], pull_interval_minutes: 15 },
    youtube: { source: "youtube", enabled: false, channels: [], keywords: [], pull_interval_minutes: 60 },
    x: { source: "x", enabled: false, keywords: [], pull_interval_minutes: 30 },
    rss: { source: "rss", enabled: false, keywords: [], pull_interval_minutes: 120 },
  };

  const configs = Object.entries(defaults).map(([key, defaultConfig]) => ({
    ...defaultConfig,
    ...(latestBySource[key] ?? {}),
    source: key,
  }));

  return NextResponse.json({ configs });
}

// PATCH /api/admin/intelligence/config — update source configs (admin-only)
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const configs = body.configs;
  if (!Array.isArray(configs) || configs.length === 0) {
    return NextResponse.json({ error: "configs array is required" }, { status: 400 });
  }

  const validSources = ["reddit", "youtube", "x", "rss"];
  const adminClient = createAdminClient();
  const saved: string[] = [];

  for (const config of configs) {
    const source = typeof config === "object" && config !== null ? (config as Record<string, unknown>).source : null;
    if (typeof source !== "string" || !validSources.includes(source)) {
      continue;
    }

    // Store as automation_log event (append-only, latest wins on read)
    const { error: insertError } = await adminClient.from("automation_log").insert({
      event: CONFIG_EVENT,
      department: "intelligence",
      details: config,
    });

    if (insertError) {
      console.error(`Failed to save config for ${source}:`, insertError.message);
    } else {
      saved.push(source);
    }
  }

  return NextResponse.json({
    saved,
    message: `updated ${saved.length} source config(s)`,
  });
}
