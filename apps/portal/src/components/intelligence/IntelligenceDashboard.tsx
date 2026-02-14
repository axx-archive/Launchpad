"use client";

import { useState, useMemo, useCallback } from "react";
import Nav from "@/components/Nav";
import TrendCard from "@/components/intelligence/TrendCard";
import ToastContainer from "@/components/Toast";
import TerminalChrome from "@/components/TerminalChrome";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import type { TrendCluster, ClusterLifecycle } from "@/types/intelligence";

type LifecycleFilter = "all" | ClusterLifecycle;

const LIFECYCLE_TABS: { key: LifecycleFilter; label: string }[] = [
  { key: "all", label: "all" },
  { key: "peaking", label: "peaking" },
  { key: "emerging", label: "emerging" },
  { key: "cooling", label: "cooling" },
  { key: "evergreen", label: "evergreen" },
  { key: "dormant", label: "dormant" },
];

interface IntelligenceDashboardProps {
  trends: TrendCluster[];
  isAdmin: boolean;
  lifecycleDistribution?: Record<string, number>;
}

export default function IntelligenceDashboard({
  trends,
  isAdmin,
  lifecycleDistribution,
}: IntelligenceDashboardProps) {
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("all");
  const [search, setSearch] = useState("");
  const [liveTrends, setLiveTrends] = useState<TrendCluster[]>(trends);

  const mergeTrend = useCallback((updated: Partial<TrendCluster> & { id: string }) => {
    setLiveTrends((prev) => {
      const idx = prev.findIndex((t) => t.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...updated };
        return next;
      }
      // New trend cluster appeared
      if ((updated as TrendCluster).is_active) {
        return [updated as TrendCluster, ...prev];
      }
      return prev;
    });
  }, []);

  // Subscribe to trend_clusters for live updates
  useRealtimeSubscription({
    table: "trend_clusters",
    events: ["UPDATE", "INSERT"],
    enabled: true,
    onEvent: (payload) => {
      const updated = payload.new as TrendCluster | undefined;
      if (!updated?.id) return;
      mergeTrend(updated);
    },
  });

  const filtered = useMemo(() => {
    let result = liveTrends;

    if (lifecycleFilter !== "all") {
      result = result.filter((t) => t.lifecycle === lifecycleFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.summary ?? "").toLowerCase().includes(q) ||
          (t.category ?? "").toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    return result.sort(
      (a, b) => b.velocity_percentile - a.velocity_percentile,
    );
  }, [liveTrends, lifecycleFilter, search]);

  return (
    <>
      <Nav sectionLabel="intelligence &mdash; signal radar" isAdmin={isAdmin} />
      <ToastContainer />

      <main id="main-content" className="min-h-screen pt-24 px-[clamp(24px,5vw,64px)] pb-16 page-enter">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-7">
              <h1 className="font-display text-[clamp(24px,3vw,32px)] font-light text-text lowercase tracking-[1px]">
                signal radar
              </h1>
              {lifecycleDistribution && (
                <div className="hidden sm:flex items-center gap-3">
                  {Object.entries(lifecycleDistribution).map(([lifecycle, count]) => (
                    <span key={lifecycle} className="font-mono text-[10px] text-text-muted/40">
                      {lifecycle.slice(0, 4)}: <span className="text-text-muted/60">{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="font-mono text-[13px] text-text-muted tracking-[0.5px]">
              {liveTrends.length === 0
                ? "no active trends detected"
                : (
                  <>
                    {liveTrends.length} trend cluster{liveTrends.length !== 1 ? "s" : ""} tracked
                  </>
                )}
            </p>
          </div>

          {/* Filters */}
          {liveTrends.length > 0 && (
            <div className="mb-8 space-y-4">
              {/* Lifecycle filter tabs */}
              <div className="flex flex-wrap gap-1.5">
                {LIFECYCLE_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setLifecycleFilter(tab.key)}
                    className={`font-mono text-[11px] px-3 py-1.5 rounded-[3px] border transition-all cursor-pointer tracking-[0.5px] ${
                      lifecycleFilter === tab.key
                        ? "border-[#4D8EFF]/30 bg-[#4D8EFF]/10 text-[#4D8EFF]"
                        : "border-white/6 text-text-muted/70 hover:border-white/12 hover:text-text-muted"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="flex items-center gap-0 rounded-[3px] border border-white/8 bg-bg-card px-3 py-2 focus-within:border-[#4D8EFF]/30 transition-colors">
                <span className="text-[#4D8EFF] text-[12px] select-none">$ </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="search trends, tags, categories..."
                  className="flex-1 bg-transparent border-0 font-mono text-[12px] text-text pl-1 outline-none placeholder:text-text-muted/30"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-text-muted/70 hover:text-text-muted text-[12px] cursor-pointer"
                  >
                    clear
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Trend Cards */}
          {liveTrends.length > 0 ? (
            filtered.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map((trend) => (
                  <TrendCard
                    key={trend.id}
                    id={trend.id}
                    name={trend.name}
                    summary={trend.summary}
                    lifecycle={trend.lifecycle}
                    velocityScore={trend.velocity_score}
                    velocityPercentile={trend.velocity_percentile}
                    signalCount={trend.signal_count}
                    category={trend.category}
                    tags={trend.tags}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="font-mono text-[13px] text-text-muted/70">
                  no trends match your filter.
                </p>
              </div>
            )
          ) : (
            <WelcomeBlock />
          )}
        </div>

        {/* Footer */}
        <p className="text-center mt-24 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70">
          intelligence by bonfire labs
        </p>
      </main>
    </>
  );
}

function WelcomeBlock() {
  return (
    <TerminalChrome title="welcome to the signal radar" className="max-w-lg mx-auto">
      <div className="space-y-4">
        <p className="text-text text-[13px] leading-relaxed">
          the signal radar monitors online conversations across Reddit, YouTube, X,
          and RSS feeds — clustering related signals into actionable trend insights.
        </p>

        <div className="space-y-2">
          <p className="text-[#4D8EFF] text-[11px] tracking-[2px] uppercase">
            how it works
          </p>
          <ol className="space-y-1.5 text-[12px] text-text-muted leading-relaxed">
            <li className="flex gap-2">
              <span className="text-[#4D8EFF]/60 shrink-0">1.</span>
              <span>signals are ingested from configured sources on a schedule.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#4D8EFF]/60 shrink-0">2.</span>
              <span>an LLM clusters related signals into trend groups.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#4D8EFF]/60 shrink-0">3.</span>
              <span>velocity scoring tracks momentum — peaking trends surface first.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#4D8EFF]/60 shrink-0">4.</span>
              <span>promote hot trends to strategy or creative for action.</span>
            </li>
          </ol>
        </div>

        <p className="font-mono text-[10px] text-text-muted/40 pt-2">
          trends will appear here once signals are ingested.
        </p>
      </div>
    </TerminalChrome>
  );
}
