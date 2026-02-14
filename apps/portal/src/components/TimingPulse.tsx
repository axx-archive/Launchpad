"use client";

import { useState, useEffect } from "react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import type { ClusterLifecycle } from "@/types/intelligence";

const LIFECYCLE_CONFIG: Record<
  ClusterLifecycle,
  { label: string; bars: number; color: string; window: string }
> = {
  emerging: {
    label: "emerging",
    bars: 2,
    color: "text-[#4D8EFF]",
    window: "early — monitor before acting",
  },
  peaking: {
    label: "still peaking",
    bars: 5,
    color: "text-[#ef4444]",
    window: "optimal window: 5-10 days",
  },
  cooling: {
    label: "cooling off",
    bars: 3,
    color: "text-accent",
    window: "act soon — window closing",
  },
  evergreen: {
    label: "evergreen",
    bars: 4,
    color: "text-[#8B9A6B]",
    window: "no urgency — stable signal",
  },
  dormant: {
    label: "dormant",
    bars: 1,
    color: "text-text-muted/50",
    window: "low activity — may not be timely",
  },
};

interface LinkedCluster {
  id: string;
  name: string;
  lifecycle: ClusterLifecycle;
  velocity_score: number;
  velocity_percentile: number;
  signal_count: number;
}

interface TimingPulseProps {
  projectId: string;
  /** Pre-fetched from /api/projects/[id]/references linked_clusters */
  initialClusters?: LinkedCluster[];
}

export default function TimingPulse({
  projectId,
  initialClusters,
}: TimingPulseProps) {
  const [clusters, setClusters] = useState<LinkedCluster[]>(
    initialClusters ?? [],
  );
  const [loading, setLoading] = useState(!initialClusters);

  // Fetch linked clusters if not passed as props
  useEffect(() => {
    if (initialClusters) return;

    async function fetchClusters() {
      try {
        const res = await fetch(`/api/projects/${projectId}/references`);
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        setClusters(data.linked_clusters ?? []);
      } catch (err) {
        console.error("Failed to load trend links:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchClusters();
  }, [projectId, initialClusters]);

  // Subscribe to realtime updates on trend_clusters
  useRealtimeSubscription({
    table: "trend_clusters",
    events: ["UPDATE"],
    enabled: clusters.length > 0,
    onEvent: (payload) => {
      const updated = payload.new as Record<string, unknown>;
      if (!updated?.id) return;

      setClusters((prev) =>
        prev.map((c) =>
          c.id === updated.id
            ? {
                ...c,
                lifecycle: (updated.lifecycle as ClusterLifecycle) ?? c.lifecycle,
                velocity_score:
                  (updated.velocity_score as number) ?? c.velocity_score,
                velocity_percentile:
                  (updated.velocity_percentile as number) ??
                  c.velocity_percentile,
                signal_count:
                  (updated.signal_count as number) ?? c.signal_count,
              }
            : c,
        ),
      );
    },
  });

  if (loading || clusters.length === 0) return null;

  // Show the highest-velocity cluster as the primary signal
  const primary = clusters.reduce((best, c) =>
    c.velocity_percentile > best.velocity_percentile ? c : best,
  );

  const config = LIFECYCLE_CONFIG[primary.lifecycle] ?? LIFECYCLE_CONFIG.dormant;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-[#4D8EFF]/10 bg-[#4D8EFF]/[0.03]">
      {/* Pulse dot */}
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          primary.lifecycle === "peaking"
            ? "bg-[#ef4444] animate-pulse"
            : primary.lifecycle === "cooling"
            ? "bg-accent animate-pulse"
            : "bg-[#4D8EFF]/60"
        }`}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] tracking-[1px] text-[#4D8EFF]/60">
            trend:
          </span>
          <span className={`font-mono text-[11px] ${config.color}`}>
            {config.label}
          </span>

          {/* Velocity bars */}
          <span className="inline-flex items-center gap-px">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={`inline-block w-1 rounded-[1px] ${
                  i < config.bars
                    ? primary.lifecycle === "peaking"
                      ? "bg-[#ef4444]/70 h-2.5"
                      : primary.lifecycle === "cooling"
                      ? "bg-accent/70 h-2"
                      : "bg-[#4D8EFF]/50 h-1.5"
                    : "bg-text-muted/15 h-1"
                }`}
              />
            ))}
          </span>

          <span className="font-mono text-[10px] text-text-muted/40">
            &mdash; {config.window}
          </span>
        </div>

        {/* Cluster name + velocity */}
        <p className="font-mono text-[10px] text-text-muted/50 truncate mt-0.5">
          {primary.name}
          <span className="text-text-muted/30 mx-1">&middot;</span>
          {Math.round(primary.velocity_percentile)}th pctl
          <span className="text-text-muted/30 mx-1">&middot;</span>
          {primary.signal_count} signal{primary.signal_count !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}
