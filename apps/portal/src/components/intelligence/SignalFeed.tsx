"use client";

import { useState, useEffect, useCallback } from "react";
import { formatRelativeTime } from "@/lib/format";
import type { SignalSource } from "@/types/intelligence";

const SOURCE_ICONS: Record<SignalSource, { icon: string; color: string }> = {
  reddit: { icon: "R", color: "text-[#FF4500]/70" },
  youtube: { icon: "\u25B6", color: "text-[#FF0000]/70" },
  x: { icon: "X", color: "text-text/70" },
  rss: { icon: "\u25CE", color: "text-[#FFA500]/70" },
};

interface SignalItem {
  id: string;
  title: string | null;
  content_snippet: string | null;
  source: SignalSource;
  source_url: string | null;
  published_at: string | null;
  upvotes: number;
  comments: number;
  views: number;
  likes: number;
  _cluster_confidence?: number;
  _cluster_is_primary?: boolean;
}

interface SignalFeedProps {
  /** Cluster ID — if provided, fetches signals for a specific cluster */
  clusterId?: string;
  /** Pre-loaded signals — bypasses API fetch */
  initialSignals?: SignalItem[];
  /** Page size */
  pageSize?: number;
  /** Source filter */
  sourceFilter?: SignalSource;
}

export default function SignalFeed({
  clusterId,
  initialSignals,
  pageSize = 25,
  sourceFilter,
}: SignalFeedProps) {
  const [signals, setSignals] = useState<SignalItem[]>(initialSignals ?? []);
  const [loading, setLoading] = useState(!initialSignals);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeSource, setActiveSource] = useState<SignalSource | "">(sourceFilter ?? "");

  const fetchSignals = useCallback(async (pageNum: number, source: string, append = false) => {
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        page_size: String(pageSize),
      });
      if (source) params.set("source", source);

      const endpoint = clusterId
        ? `/api/intelligence/trends/${clusterId}/signals?${params}`
        : `/api/intelligence/signals?${params}`;

      const res = await fetch(endpoint);
      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data = await res.json();
      const fetched: SignalItem[] = data.signals ?? [];
      setTotal(data.total ?? 0);

      if (append) {
        setSignals((prev) => [...prev, ...fetched]);
      } else {
        setSignals(fetched);
      }
    } catch (err) {
      console.error("Failed to load signals:", err);
    } finally {
      setLoading(false);
    }
  }, [clusterId, pageSize]);

  useEffect(() => {
    if (initialSignals) return;
    setPage(1);
    setLoading(true);
    fetchSignals(1, activeSource);
  }, [fetchSignals, activeSource, initialSignals]);

  function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchSignals(nextPage, activeSource, true);
  }

  function getEngagementLabel(signal: SignalItem): string {
    const parts: string[] = [];
    if (signal.upvotes > 0) parts.push(`${signal.upvotes}\u2191`);
    if (signal.comments > 0) parts.push(`${signal.comments}\u{1F4AC}`);
    if (signal.views > 0) parts.push(`${signal.views >= 1000 ? `${(signal.views / 1000).toFixed(1)}k` : signal.views}\u{1F441}`);
    if (signal.likes > 0) parts.push(`${signal.likes}\u2665`);
    return parts.join("  ");
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-md skeleton-shimmer" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Source filter tabs */}
      {!sourceFilter && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setActiveSource("")}
            className={`font-mono text-[10px] px-2.5 py-1 rounded-[3px] border transition-all cursor-pointer tracking-[0.5px] ${
              activeSource === ""
                ? "border-[#4D8EFF]/30 bg-[#4D8EFF]/10 text-[#4D8EFF]"
                : "border-white/6 text-text-muted/60 hover:border-white/12"
            }`}
          >
            all
          </button>
          {(Object.keys(SOURCE_ICONS) as SignalSource[]).map((src) => {
            const { icon, color } = SOURCE_ICONS[src];
            return (
              <button
                key={src}
                onClick={() => setActiveSource(src)}
                className={`font-mono text-[10px] px-2.5 py-1 rounded-[3px] border transition-all cursor-pointer tracking-[0.5px] inline-flex items-center gap-1 ${
                  activeSource === src
                    ? "border-[#4D8EFF]/30 bg-[#4D8EFF]/10 text-[#4D8EFF]"
                    : "border-white/6 text-text-muted/60 hover:border-white/12"
                }`}
              >
                <span className={color}>{icon}</span>
                {src}
              </button>
            );
          })}
        </div>
      )}

      {/* Signal list */}
      {signals.length === 0 ? (
        <div className="flex items-center gap-2 py-4">
          <span className="w-1.5 h-1.5 rounded-full bg-text-muted/20" />
          <p className="font-mono text-[11px] text-text-muted/40">no signals found</p>
        </div>
      ) : (
        <>
          {signals.map((signal) => {
            const src = SOURCE_ICONS[signal.source] ?? SOURCE_ICONS.rss;
            const engagement = getEngagementLabel(signal);

            return (
              <div
                key={signal.id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-md border border-white/[0.04] hover:border-white/[0.08] transition-colors group"
              >
                {/* Source icon */}
                <span className={`font-mono text-[12px] mt-0.5 w-5 text-center flex-shrink-0 ${src.color}`}>
                  {src.icon}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {signal.title && (
                    <p className="text-[12px] text-text truncate mb-0.5 group-hover:text-[#4D8EFF]/90 transition-colors">
                      {signal.source_url ? (
                        <a href={signal.source_url} target="_blank" rel="noopener noreferrer">
                          {signal.title}
                        </a>
                      ) : (
                        signal.title
                      )}
                    </p>
                  )}
                  {signal.content_snippet && (
                    <p className="font-mono text-[10px] text-text-muted/50 truncate">
                      {signal.content_snippet}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {engagement && (
                      <span className="font-mono text-[9px] text-text-muted/40">
                        {engagement}
                      </span>
                    )}
                    {signal.published_at && (
                      <span className="font-mono text-[9px] text-text-muted/30">
                        {formatRelativeTime(signal.published_at)}
                      </span>
                    )}
                    {signal._cluster_confidence !== undefined && (
                      <span className="font-mono text-[9px] text-[#4D8EFF]/40">
                        {Math.round(signal._cluster_confidence * 100)}% match
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Load more */}
          {signals.length < total && (
            <button
              onClick={loadMore}
              className="w-full py-2 font-mono text-[11px] text-text-muted/50 hover:text-text-muted transition-colors cursor-pointer"
            >
              load more... ({signals.length}/{total})
            </button>
          )}
        </>
      )}
    </div>
  );
}
