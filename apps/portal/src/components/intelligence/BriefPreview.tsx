"use client";

import Link from "next/link";
import LifecycleBadge from "@/components/intelligence/LifecycleBadge";
import { formatRelativeTime } from "@/lib/format";
import type { ClusterLifecycle, BriefType } from "@/types/intelligence";

const BRIEF_TYPE_LABELS: Record<BriefType, string> = {
  daily_digest: "daily digest",
  trend_deep_dive: "deep dive",
  alert: "alert",
};

const BRIEF_TYPE_STYLES: Record<BriefType, string> = {
  daily_digest: "text-[#4D8EFF]/70 bg-[#4D8EFF]/8 border-[#4D8EFF]/12",
  trend_deep_dive: "text-accent/70 bg-accent/8 border-accent/12",
  alert: "text-[#ef4444]/70 bg-[#ef4444]/8 border-[#ef4444]/12",
};

interface BriefCluster {
  id: string;
  name: string;
  lifecycle: ClusterLifecycle;
}

interface BriefPreviewProps {
  id: string;
  briefType: BriefType;
  title: string;
  summary?: string;
  clusterIds: string[];
  clusters?: BriefCluster[];
  createdAt: string;
  onPromote?: (clusterId: string) => void;
}

export default function BriefPreview({
  id,
  briefType,
  title,
  summary,
  clusters,
  createdAt,
  onPromote,
}: BriefPreviewProps) {
  const typeLabel = BRIEF_TYPE_LABELS[briefType] ?? briefType;
  const typeStyle = BRIEF_TYPE_STYLES[briefType] ?? BRIEF_TYPE_STYLES.daily_digest;

  return (
    <div className="bg-bg-card border border-white/[0.04] rounded-md p-4 hover:border-white/[0.08] transition-colors">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`font-mono text-[9px] tracking-[1px] uppercase px-1.5 py-0.5 rounded-[2px] border ${typeStyle}`}>
          {typeLabel}
        </span>
        <span className="font-mono text-[10px] text-text-muted/40">
          {formatRelativeTime(createdAt)}
        </span>
      </div>

      {/* Title */}
      <Link
        href={`/intelligence/brief/${id}`}
        className="text-[13px] text-text hover:text-[#4D8EFF]/90 transition-colors block mb-1"
      >
        {title}
      </Link>

      {/* Summary */}
      {summary && (
        <p className="font-mono text-[10px] text-text-muted/50 line-clamp-2 mb-3">
          {summary}
        </p>
      )}

      {/* Linked clusters */}
      {clusters && clusters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="font-mono text-[9px] text-text-muted/40">trends:</span>
          {clusters.map((cluster) => (
            <Link
              key={cluster.id}
              href={`/intelligence/trend/${cluster.id}`}
              className="inline-flex items-center gap-1"
            >
              <LifecycleBadge lifecycle={cluster.lifecycle} size="sm" />
              <span className="font-mono text-[10px] text-text-muted/60 hover:text-text-muted transition-colors truncate max-w-[100px]">
                {cluster.name}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Link
          href={`/intelligence/brief/${id}`}
          className="font-mono text-[11px] text-[#4D8EFF]/70 hover:text-[#4D8EFF] transition-colors"
        >
          read brief &rarr;
        </Link>
        {onPromote && clusters && clusters.length > 0 && (
          <button
            onClick={() => onPromote(clusters[0].id)}
            className="font-mono text-[10px] text-text-muted/40 hover:text-accent/70 transition-colors cursor-pointer"
          >
            promote to strategy
          </button>
        )}
      </div>
    </div>
  );
}
