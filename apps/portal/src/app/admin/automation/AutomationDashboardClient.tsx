"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import ToastContainer from "@/components/Toast";

interface AutomationData {
  overview: {
    active_jobs: number;
    completed_today: number;
    failed_today: number;
    analytics_events_today: number;
    live_pitchapps: number;
    automation_enabled: boolean;
  };
  costs: {
    today: number;
    this_week: number;
  };
  recent_jobs: Record<string, unknown>[];
  live_projects: {
    id: string;
    name: string;
    project: string;
    url: string;
    status: string;
  }[];
  jobs_table_exists: boolean;
}

export default function AutomationDashboardClient() {
  const [data, setData] = useState<AutomationData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/automation");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <>
      <Nav sectionLabel="automation" isAdmin />
      <ToastContainer />

      <main className="min-h-screen pt-24 px-[clamp(24px,5vw,64px)] pb-16 page-enter">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-7">
              <Link
                href="/admin"
                className="font-mono text-[11px] text-text-muted hover:text-text transition-colors"
              >
                &larr; admin
              </Link>
              <span className="font-mono text-[11px] text-text-muted/30">/</span>
              <p className="font-mono text-[11px] font-normal tracking-[4px] lowercase text-accent">
                automation
              </p>
            </div>
            <h1 className="font-display text-[clamp(28px,4vw,42px)] font-light text-text mb-3">
              automation dashboard
            </h1>
            <p className="font-mono text-[13px] text-text-muted tracking-[0.5px]">
              pipeline status, costs, and live PitchApp health
            </p>
          </div>

          {loading ? (
            <p className="text-text-muted/70 text-[13px] animate-pulse">loading...</p>
          ) : data ? (
            <>
              {/* Kill Switch + Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
                <StatusCard
                  label="automation"
                  value={data.overview.automation_enabled ? "on" : "off"}
                  accent={data.overview.automation_enabled}
                />
                <StatusCard label="active jobs" value={String(data.overview.active_jobs)} />
                <StatusCard label="completed today" value={String(data.overview.completed_today)} />
                <StatusCard
                  label="failed today"
                  value={String(data.overview.failed_today)}
                  warning={data.overview.failed_today > 0}
                />
                <StatusCard label="analytics today" value={String(data.overview.analytics_events_today)} />
                <StatusCard label="live pitchapps" value={String(data.overview.live_pitchapps)} />
              </div>

              {/* Cost Summary */}
              <div className="bg-bg-card border border-border rounded-lg p-6 mb-8">
                <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
                  cost summary
                </p>
                <div className="flex gap-8">
                  <div>
                    <p className="font-mono text-[10px] text-text-muted/70 mb-1">today</p>
                    <p className="font-mono text-[18px] text-text">${data.costs.today.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] text-text-muted/70 mb-1">this week</p>
                    <p className="font-mono text-[18px] text-text">${data.costs.this_week.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* Pipeline Jobs */}
              {data.jobs_table_exists ? (
                <div className="bg-bg-card border border-border rounded-lg p-6 mb-8">
                  <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
                    recent jobs
                  </p>
                  {data.recent_jobs.length === 0 ? (
                    <p className="text-[13px] text-text-muted/70">no jobs yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="border-b border-white/[0.04]">
                            <th className="font-mono text-[10px] text-text-muted/70 text-left pb-2 pr-4">type</th>
                            <th className="font-mono text-[10px] text-text-muted/70 text-left pb-2 pr-4">project</th>
                            <th className="font-mono text-[10px] text-text-muted/70 text-left pb-2 pr-4">status</th>
                            <th className="font-mono text-[10px] text-text-muted/70 text-left pb-2 pr-4">attempts</th>
                            <th className="font-mono text-[10px] text-text-muted/70 text-left pb-2">started</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.recent_jobs.map((job, i) => (
                            <tr key={i} className="border-b border-white/[0.02]">
                              <td className="font-mono text-text py-2 pr-4">{String(job.job_type ?? "—")}</td>
                              <td className="font-mono text-text-muted py-2 pr-4">{String(job.project_id ?? "—").substring(0, 8)}</td>
                              <td className="font-mono py-2 pr-4">
                                <span className={
                                  job.status === "completed" ? "text-success" :
                                  job.status === "failed" ? "text-error" :
                                  job.status === "running" ? "text-accent" :
                                  "text-text-muted"
                                }>
                                  {String(job.status ?? "—")}
                                </span>
                              </td>
                              <td className="font-mono text-text-muted py-2 pr-4">{String(job.attempts ?? 0)}</td>
                              <td className="font-mono text-text-muted/70 py-2">{job.started_at ? new Date(job.started_at as string).toLocaleTimeString() : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-bg-card border border-border rounded-lg p-6 mb-8">
                  <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
                    pipeline jobs
                  </p>
                  <p className="text-[13px] text-text-muted/70">
                    pipeline_jobs table not yet created. run the migration to enable job tracking.
                  </p>
                </div>
              )}

              {/* Live PitchApps */}
              <div className="bg-bg-card border border-border rounded-lg p-6">
                <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
                  live pitchapps
                </p>
                {data.live_projects.length === 0 ? (
                  <p className="text-[13px] text-text-muted/70">no live pitchapps.</p>
                ) : (
                  <div className="space-y-3">
                    {data.live_projects.map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
                        <div>
                          <Link
                            href={`/admin/project/${p.id}`}
                            className="font-mono text-[12px] text-text hover:text-accent transition-colors"
                          >
                            {p.name}
                          </Link>
                          <p className="font-mono text-[10px] text-text-muted/70">{p.project}</p>
                        </div>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] text-accent hover:text-accent-light transition-colors"
                        >
                          visit &rarr;
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-text-muted/70 text-[13px]">failed to load automation data.</p>
          )}
        </div>

        <p className="text-center mt-24 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70">
          launchpad by bonfire labs
        </p>
      </main>
    </>
  );
}

function StatusCard({
  label,
  value,
  accent,
  warning,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-4">
      <p className="font-mono text-[9px] tracking-[1px] lowercase text-text-muted/70 mb-1">
        {label}
      </p>
      <p
        className={`font-mono text-[18px] font-medium ${
          warning ? "text-error" : accent ? "text-success" : "text-text"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
