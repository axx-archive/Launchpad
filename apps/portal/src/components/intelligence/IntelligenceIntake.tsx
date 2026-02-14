"use client";

import { useState, useEffect, useCallback } from "react";
import TerminalChrome from "@/components/TerminalChrome";
import type { SignalSource } from "@/types/intelligence";

const SOURCE_CONFIG: Record<SignalSource, { icon: string; label: string; color: string }> = {
  reddit: { icon: "R", label: "Reddit", color: "text-[#FF4500]" },
  youtube: { icon: "\u25B6", label: "YouTube", color: "text-[#FF0000]" },
  x: { icon: "X", label: "X (Twitter)", color: "text-text" },
  rss: { icon: "\u25CE", label: "RSS Feeds", color: "text-[#FFA500]" },
};

interface SourceConfigData {
  source: string;
  enabled: boolean;
  subreddits?: string[];
  channels?: string[];
  keywords?: string[];
}

interface IngestionStatus {
  counts: {
    total_signals: number;
    signals_24h: number;
    total_clusters: number;
    active_clusters: number;
    unclustered_signals: number;
  };
  last_ingestion_at: string | null;
  signals_by_source_7d: Record<string, number>;
  quotas: {
    api_source: string;
    units_used: number;
    units_limit: number;
    period_start: string;
    period_end: string;
  }[];
  recent_jobs: {
    id: string;
    job_type: string;
    status: string;
    created_at: string;
    completed_at: string | null;
  }[];
}

interface IntelligenceIntakeProps {
  isAdmin?: boolean;
}

export default function IntelligenceIntake({ isAdmin = false }: IntelligenceIntakeProps) {
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceConfigs, setSourceConfigs] = useState<SourceConfigData[]>([]);
  const [savingSource, setSavingSource] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const fetches = [fetch("/api/intelligence/status")];
      if (isAdmin) {
        fetches.push(fetch("/api/admin/intelligence/config"));
      }

      const results = await Promise.all(fetches);

      if (results[0].ok) {
        const data = await results[0].json();
        setStatus(data);
      }

      if (isAdmin && results[1]?.ok) {
        const data = await results[1].json();
        setSourceConfigs(data.configs ?? []);
      }
    } catch (err) {
      console.error("Failed to load intelligence status:", err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleToggleSource(source: string, enabled: boolean) {
    setSavingSource(source);
    try {
      const res = await fetch("/api/admin/intelligence/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, enabled }),
      });
      if (res.ok) {
        setSourceConfigs((prev) =>
          prev.map((c) => (c.source === source ? { ...c, enabled } : c))
        );
      }
    } catch (err) {
      console.error("Failed to toggle source:", err);
    } finally {
      setSavingSource(null);
    }
  }

  async function handleManualIngest() {
    if (ingesting) return;
    setIngesting(true);
    setIngestMsg(null);

    try {
      const enabled = sourceConfigs.filter((c) => c.enabled).map((c) => c.source);
      const res = await fetch("/api/admin/intelligence/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: enabled.length > 0 ? enabled : undefined }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setIngestMsg({ type: "error", text: data.error ?? "failed to trigger ingestion." });
        setIngesting(false);
        return;
      }

      const data = await res.json();
      setIngestMsg({ type: "success", text: `ingestion queued — job ${data.job_id?.slice(0, 8)}...` });
      setTimeout(() => setIngesting(false), 3000);
    } catch {
      setIngestMsg({ type: "error", text: "network error. check your connection." });
      setIngesting(false);
    }
  }

  if (loading) {
    return (
      <TerminalChrome title="ingestion health">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4D8EFF]/30 animate-pulse" />
          <p className="font-mono text-[11px] text-text-muted/40">loading status...</p>
        </div>
      </TerminalChrome>
    );
  }

  if (!status) {
    return (
      <TerminalChrome title="ingestion health">
        <p className="font-mono text-[11px] text-text-muted/40">failed to load status.</p>
      </TerminalChrome>
    );
  }

  return (
    <div className="space-y-6">
      {/* Signal counts */}
      <TerminalChrome title="signal overview">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricBlock label="total signals" value={status.counts.total_signals} />
          <MetricBlock label="last 24h" value={status.counts.signals_24h} highlight />
          <MetricBlock label="clusters" value={status.counts.active_clusters} sub={`/ ${status.counts.total_clusters}`} />
          <MetricBlock label="unclustered" value={status.counts.unclustered_signals} warn={status.counts.unclustered_signals > 50} />
        </div>
        {status.last_ingestion_at && (
          <p className="font-mono text-[10px] text-text-muted/40 mt-3">
            last ingestion: {new Date(status.last_ingestion_at).toLocaleString()}
          </p>
        )}
      </TerminalChrome>

      {/* Admin: Source configuration */}
      {isAdmin && sourceConfigs.length > 0 && (
        <TerminalChrome title="source configuration">
          <div className="space-y-3">
            {sourceConfigs.map((config) => {
              const cfg = SOURCE_CONFIG[config.source as SignalSource];
              return (
                <div
                  key={config.source}
                  className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className={`font-mono text-[12px] w-5 text-center ${cfg?.color ?? "text-text-muted/50"}`}>
                      {cfg?.icon ?? "?"}
                    </span>
                    <div>
                      <p className="text-[12px] text-text">{cfg?.label ?? config.source}</p>
                      {config.subreddits && config.subreddits.length > 0 && (
                        <p className="font-mono text-[9px] text-text-muted/40">
                          r/{config.subreddits.slice(0, 3).join(", r/")}
                          {config.subreddits.length > 3 && ` +${config.subreddits.length - 3}`}
                        </p>
                      )}
                      {config.channels && config.channels.length > 0 && (
                        <p className="font-mono text-[9px] text-text-muted/40">
                          {config.channels.length} channel{config.channels.length !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleSource(config.source, !config.enabled)}
                    disabled={savingSource === config.source}
                    className={`font-mono text-[10px] px-3 py-1 rounded-[3px] border transition-all cursor-pointer disabled:opacity-50 ${
                      config.enabled
                        ? "text-success/80 border-success/20 bg-success/5 hover:border-success/40"
                        : "text-text-muted/50 border-white/8 hover:border-white/15"
                    }`}
                  >
                    {savingSource === config.source ? "saving..." : config.enabled ? "enabled" : "disabled"}
                  </button>
                </div>
              );
            })}
          </div>
        </TerminalChrome>
      )}

      {/* Admin: Manual ingestion trigger */}
      {isAdmin && (
        <TerminalChrome title="manual ingestion">
          <div className="space-y-3">
            <p className="text-[12px] text-text-muted leading-relaxed">
              trigger a manual ingestion run across all enabled sources.
            </p>
            <button
              onClick={handleManualIngest}
              disabled={ingesting}
              className="font-mono text-[12px] text-[#4D8EFF] border border-[#4D8EFF]/20 px-4 py-2 rounded-[3px] hover:border-[#4D8EFF]/50 hover:bg-[#4D8EFF]/5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-default"
            >
              {ingesting ? "ingesting..." : "trigger ingestion"}
            </button>
            {ingestMsg && (
              <p
                className={`font-mono text-[11px] ${ingestMsg.type === "error" ? "text-[#ef4444]" : "text-success/70"}`}
                role={ingestMsg.type === "error" ? "alert" : undefined}
              >
                {ingestMsg.text}
              </p>
            )}
          </div>
        </TerminalChrome>
      )}

      {/* Source breakdown — 7 day */}
      <TerminalChrome title="signals by source (7d)">
        <div className="space-y-2">
          {(Object.keys(SOURCE_CONFIG) as SignalSource[]).map((src) => {
            const count = status.signals_by_source_7d[src] ?? 0;
            const total7d = Object.values(status.signals_by_source_7d).reduce((a, b) => a + b, 0);
            const pct = total7d > 0 ? (count / total7d) * 100 : 0;
            const cfg = SOURCE_CONFIG[src];

            return (
              <div key={src} className="flex items-center gap-3">
                <span className={`font-mono text-[12px] w-5 text-center ${cfg.color}`}>{cfg.icon}</span>
                <span className="font-mono text-[11px] text-text-muted/70 w-[80px]">{cfg.label}</span>
                <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#4D8EFF]/40 rounded-full transition-all"
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-text-muted/50 w-[50px] text-right">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </TerminalChrome>

      {/* API quotas */}
      {status.quotas.length > 0 && (
        <TerminalChrome title="api quotas">
          <div className="space-y-3">
            {status.quotas.map((quota) => {
              const pct = quota.units_limit > 0 ? (quota.units_used / quota.units_limit) * 100 : 0;
              const isHigh = pct > 80;

              return (
                <div key={quota.api_source} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-text-muted/70">{quota.api_source}</span>
                    <span className={`font-mono text-[10px] ${isHigh ? "text-[#ef4444]/70" : "text-text-muted/50"}`}>
                      {quota.units_used.toLocaleString()} / {quota.units_limit.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isHigh ? "bg-[#ef4444]/50" : "bg-[#4D8EFF]/30"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </TerminalChrome>
      )}

      {/* Recent jobs */}
      {status.recent_jobs.length > 0 && (
        <TerminalChrome title="recent activity">
          <div className="space-y-1.5">
            {status.recent_jobs.slice(0, 10).map((job) => (
              <div key={job.id} className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    job.status === "completed" ? "bg-success/60"
                    : job.status === "running" ? "bg-[#4D8EFF]/60 animate-pulse"
                    : job.status === "failed" ? "bg-[#ef4444]/60"
                    : "bg-text-muted/30"
                  }`} />
                  <span className="font-mono text-[11px] text-text-muted/70">{job.job_type}</span>
                </div>
                <span className="font-mono text-[10px] text-text-muted/40">
                  {new Date(job.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </TerminalChrome>
      )}
    </div>
  );
}

function MetricBlock({
  label,
  value,
  sub,
  highlight,
  warn,
}: {
  label: string;
  value: number;
  sub?: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="text-center">
      <p className={`font-mono text-[20px] ${
        warn ? "text-[#ef4444]/80"
        : highlight ? "text-[#4D8EFF]/80"
        : "text-text"
      }`}>
        {value.toLocaleString()}
        {sub && <span className="text-[14px] text-text-muted/40">{sub}</span>}
      </p>
      <p className="font-mono text-[9px] tracking-[1px] uppercase text-text-muted/40 mt-1">
        {label}
      </p>
    </div>
  );
}
