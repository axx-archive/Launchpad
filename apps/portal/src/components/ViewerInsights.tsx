"use client";

import { useEffect, useState, useCallback } from "react";

interface SectionEngagement {
  section_id: string;
  views: number;
  avg_dwell_ms: number;
  pct_sessions: number;
}

interface InsightsData {
  summary: {
    total_views: number;
    unique_sessions: number;
    avg_scroll_depth: number;
    avg_duration: number;
    top_device: string;
    engagement_score: number;
  };
  daily_views: { date: string; count: number }[];
  scroll_distribution: Record<string, number>;
  referrers: { source: string; count: number }[];
  device_breakdown: Record<string, number>;
  section_engagement: SectionEngagement[];
  bounce_section: string | null;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatDwell(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ViewerInsights({ projectId }: { projectId: string }) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/insights?project_id=${projectId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setData(null);
          setLoading(false);
          return;
        }
        throw new Error("failed to load");
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('[ViewerInsights] Failed to load insights:', err);
      setError("could not load viewer insights");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (loading) {
    return (
      <div className="bg-bg-card border border-border rounded-lg p-6">
        <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
          viewer insights
        </p>
        <p className="text-[13px] text-text-muted/70 animate-pulse">loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-bg-card border border-border rounded-lg p-6">
        <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
          viewer insights
        </p>
        <p className="text-[13px] text-text-muted/70">{error}</p>
      </div>
    );
  }

  if (!data || data.summary.total_views === 0) {
    return (
      <div className="bg-bg-card border border-border rounded-lg p-6">
        <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
          viewer insights
        </p>
        <p className="text-[13px] text-text-muted/70">
          no views yet. analytics will appear once someone visits your pitchapp.
        </p>
      </div>
    );
  }

  const { summary, daily_views, scroll_distribution, referrers, section_engagement, bounce_section } = data;
  const maxDailyCount = Math.max(...daily_views.map((d) => d.count), 1);

  return (
    <div className="bg-bg-card border border-border rounded-lg p-6">
      <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-6">
        viewer insights
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <SummaryCard label="total views" value={String(summary.total_views)} />
        <SummaryCard label="unique viewers" value={String(summary.unique_sessions)} />
        <SummaryCard label="avg scroll depth" value={`${summary.avg_scroll_depth}%`} />
        <SummaryCard label="avg duration" value={formatDuration(summary.avg_duration)} />
        <SummaryCard label="top device" value={summary.top_device} />
        <SummaryCard label="engagement" value={`${summary.engagement_score}/100`} />
      </div>

      {/* Daily views chart — CSS bar chart */}
      <div className="mb-8">
        <p className="font-mono text-[10px] tracking-[2px] lowercase text-text-muted mb-3">
          daily views (30d)
        </p>
        <div className="flex items-end gap-[2px] h-16">
          {daily_views.map((day) => (
            <div
              key={day.date}
              className="flex-1 bg-accent/20 hover:bg-accent/40 transition-colors rounded-t-[1px] relative group"
              style={{ height: `${Math.max((day.count / maxDailyCount) * 100, 2)}%` }}
            >
              {day.count > 0 && (
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[9px] text-accent opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {day.count}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="font-mono text-[9px] text-text-muted/70">30d ago</span>
          <span className="font-mono text-[9px] text-text-muted/70">today</span>
        </div>
      </div>

      {/* Scroll depth distribution */}
      <div className="mb-8">
        <p className="font-mono text-[10px] tracking-[2px] lowercase text-text-muted mb-3">
          scroll depth
        </p>
        <div className="space-y-2">
          {Object.entries(scroll_distribution).map(([range, count]) => {
            const total = Object.values(scroll_distribution).reduce((a, b) => a + b, 0);
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={range} className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-text-muted w-12 text-right">{range}%</span>
                <div className="flex-1 h-2 bg-white/[0.03] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent/40 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-text-muted/70 w-8">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section engagement */}
      {section_engagement && section_engagement.length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-[10px] tracking-[2px] lowercase text-text-muted mb-3">
            section engagement
          </p>
          <div className="space-y-2">
            {section_engagement.map((sec) => {
              const maxDwell = Math.max(...section_engagement.map((s) => s.avg_dwell_ms), 1);
              const pct = Math.round((sec.avg_dwell_ms / maxDwell) * 100);
              return (
                <div key={sec.section_id} className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-text-muted w-24 truncate text-right">
                    {sec.section_id}
                  </span>
                  <div className="flex-1 h-2 bg-white/[0.03] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent/40 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-text-muted/70 w-16 text-right">
                    {formatDwell(sec.avg_dwell_ms)}
                  </span>
                  <span className="font-mono text-[9px] text-text-muted/70 w-10">
                    {sec.pct_sessions}%
                  </span>
                </div>
              );
            })}
          </div>
          {bounce_section && (
            <p className="font-mono text-[10px] text-text-muted/70 mt-3">
              <span className="text-warning">{"\u25BE"}</span> most viewers drop off at:{" "}
              <span className="text-text">{bounce_section}</span>
            </p>
          )}
        </div>
      )}

      {/* Referrers */}
      {referrers.length > 0 && (
        <div>
          <p className="font-mono text-[10px] tracking-[2px] lowercase text-text-muted mb-3">
            traffic sources
          </p>
          <div className="space-y-1.5">
            {referrers.map((ref) => (
              <div key={ref.source} className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-text truncate max-w-[200px]">
                  {ref.source}
                </span>
                <span className="font-mono text-[10px] text-accent">{ref.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.04] rounded-md p-3">
      <p className="font-mono text-[9px] tracking-[1px] lowercase text-text-muted/70 mb-1">
        {label}
      </p>
      <p className="font-mono text-[16px] text-accent font-medium">{value}</p>
    </div>
  );
}
