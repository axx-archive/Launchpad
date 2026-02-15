"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import TerminalChrome from "@/components/TerminalChrome";
import LifecycleBadge from "@/components/intelligence/LifecycleBadge";
import VelocityChart from "@/components/intelligence/VelocityChart";
import SignalFeed from "@/components/intelligence/SignalFeed";
import EntityTag from "@/components/intelligence/EntityTag";
import PromoteModal from "@/components/strategy/PromoteModal";
import ScoringFlow from "@/components/intelligence/ScoringFlow";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { formatRelativeTime } from "@/lib/format";
import type { TrendCluster, VelocityScore, Entity, SignalSource } from "@/types/intelligence";

interface LinkedProject {
  project_id: string;
  link_type: string;
  notes: string | null;
  created_at: string;
  projects: { id: string; project_name: string; status: string };
}

interface RecentSignal {
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

interface TrendDetailProps {
  cluster: TrendCluster;
  velocityHistory: VelocityScore[];
  recentSignals: RecentSignal[];
  linkedProjects: LinkedProject[];
  relatedEntities: (Entity & { signal_count: number })[];
  isAdmin: boolean;
}

export default function TrendDetail({
  cluster: initialCluster,
  velocityHistory,
  recentSignals,
  linkedProjects,
  relatedEntities,
  isAdmin,
}: TrendDetailProps) {
  const router = useRouter();
  const [cluster, setCluster] = useState(initialCluster);
  const [briefRequested, setBriefRequested] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showScoringFlow, setShowScoringFlow] = useState(false);

  // Subscribe to cluster updates
  useRealtimeSubscription({
    table: "trend_clusters",
    events: ["UPDATE"],
    filter: { column: "id", value: cluster.id },
    onEvent: (payload) => {
      const updated = payload.new as TrendCluster | undefined;
      if (updated) setCluster((prev) => ({ ...prev, ...updated }));
    },
  });

  const handleGenerateBrief = useCallback(async () => {
    if (briefRequested) return;
    setBriefRequested(true);
    setBriefError("");

    try {
      const res = await fetch(`/api/intelligence/trends/${cluster.id}/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief_type: "trend_deep_dive" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBriefError(data.error ?? "failed to queue brief generation.");
        setBriefRequested(false);
      }
    } catch {
      setBriefError("network error. check your connection.");
      setBriefRequested(false);
    }
  }, [cluster.id, briefRequested]);

  const velocityChartData = velocityHistory.map((v) => ({
    score_date: v.score_date,
    velocity: v.velocity,
    percentile: v.percentile,
    lifecycle: v.lifecycle,
  }));

  return (
    <>
      <Nav sectionLabel="intelligence &mdash; trend" isAdmin={isAdmin} />

      {showPromoteModal && (
        <PromoteModal
          projectId={cluster.id}
          projectName={cluster.name}
          sourceDepartment="intelligence"
          sourceType="trend"
          onClose={() => setShowPromoteModal(false)}
          onSuccess={(newId) => {
            setShowPromoteModal(false);
            router.push(`/strategy/research/${newId}`);
          }}
        />
      )}

      {showScoringFlow && (
        <ScoringFlow
          clusterId={cluster.id}
          clusterName={cluster.name}
          aiConfidence={cluster.velocity_percentile}
          onClose={() => setShowScoringFlow(false)}
          onComplete={() => setShowScoringFlow(false)}
        />
      )}

      <main id="main-content" className="min-h-screen pt-24 px-[clamp(24px,5vw,64px)] pb-16 page-enter">
        <div className="max-w-[1120px] mx-auto">
          {/* Breadcrumb */}
          <Link
            href="/intelligence"
            className="inline-flex items-center gap-2 font-mono text-[12px] text-text-muted hover:text-text transition-colors mb-6"
          >
            &larr; signal radar
          </Link>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <LifecycleBadge lifecycle={cluster.lifecycle} size="md" />
              {cluster.category && (
                <span className="font-mono text-[10px] text-text-muted/50 tracking-[1px]">
                  {cluster.category}
                </span>
              )}
            </div>
            <h1 className="font-display text-[clamp(24px,3vw,36px)] font-light text-text tracking-[1px] mb-2">
              {cluster.name}
            </h1>
            {cluster.summary && (
              <p className="text-[14px] text-text-muted leading-relaxed max-w-[720px]">
                {cluster.summary}
              </p>
            )}
          </div>

          {/* Main content — split layout */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left panel */}
            <div className="flex-1 min-w-0 space-y-6">
              {/* Velocity chart */}
              {velocityChartData.length > 0 && (
                <TerminalChrome title="velocity timeline">
                  <VelocityChart data={velocityChartData} height={80} showLabels />
                  <div className="flex items-center gap-4 mt-3">
                    <span className="font-mono text-[10px] text-text-muted/50">
                      score: <span className="text-[#4D8EFF]/80">{cluster.velocity_score.toFixed(1)}</span>
                    </span>
                    <span className="font-mono text-[10px] text-text-muted/50">
                      percentile: <span className="text-[#4D8EFF]/80">{Math.round(cluster.velocity_percentile)}th</span>
                    </span>
                    <span className="font-mono text-[10px] text-text-muted/50">
                      signals: <span className="text-text/70">{cluster.signal_count}</span>
                    </span>
                  </div>
                </TerminalChrome>
              )}

              {/* Signals */}
              <TerminalChrome title={`signals (${cluster.signal_count})`}>
                <SignalFeed
                  clusterId={cluster.id}
                  initialSignals={recentSignals}
                  pageSize={15}
                />
              </TerminalChrome>

              {/* Actions */}
              <div className="flex items-center gap-4 flex-wrap">
                {isAdmin && (
                  <button
                    onClick={handleGenerateBrief}
                    disabled={briefRequested}
                    className="font-mono text-[12px] text-[#4D8EFF] border border-[#4D8EFF]/20 px-4 py-2 rounded-[3px] hover:border-[#4D8EFF]/50 hover:bg-[#4D8EFF]/5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-default"
                  >
                    {briefRequested ? "brief queued..." : "generate brief"}
                  </button>
                )}
                <button
                  onClick={() => setShowPromoteModal(true)}
                  className="font-mono text-[12px] text-accent border border-accent/20 px-4 py-2 rounded-[3px] hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer tracking-[0.5px]"
                >
                  promote to strategy &rarr;
                </button>
                {briefError && (
                  <span className="font-mono text-[11px] text-[#ef4444]">{briefError}</span>
                )}
              </div>
            </div>

            {/* Right panel — sidebar */}
            <div className="w-full lg:w-[380px] flex-shrink-0 space-y-6">
              {/* Cluster details */}
              <TerminalChrome title="trend details">
                <div className="space-y-3">
                  <DetailRow label="lifecycle" value={cluster.lifecycle} />
                  <DetailRow label="velocity" value={`${cluster.velocity_score.toFixed(1)} (${Math.round(cluster.velocity_percentile)}th pctl)`} />
                  <DetailRow label="signals" value={String(cluster.signal_count)} />
                  {cluster.category && (
                    <DetailRow label="category" value={cluster.category} />
                  )}
                  <DetailRow label="first seen" value={formatRelativeTime(cluster.first_seen_at)} />
                  {cluster.last_signal_at && (
                    <DetailRow label="latest" value={formatRelativeTime(cluster.last_signal_at)} />
                  )}
                  {cluster.tags.length > 0 && (
                    <div className="pt-2 border-t border-white/[0.04]">
                      <p className="font-mono text-[10px] text-text-muted/50 mb-1.5">tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cluster.tags.map((tag) => (
                          <span key={tag} className="font-mono text-[10px] text-text-muted/60 px-1.5 py-0.5 rounded-[2px] border border-white/[0.06]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TerminalChrome>

              {/* Score trend button */}
              <button
                type="button"
                onClick={() => setShowScoringFlow(true)}
                className="w-full font-mono text-[12px] text-[#4D8EFF] border border-[#4D8EFF]/15 px-4 py-2.5 rounded-[3px] hover:border-[#4D8EFF]/40 hover:bg-[#4D8EFF]/5 transition-all cursor-pointer tracking-[0.5px] text-center"
              >
                score this trend
              </button>

              {/* Related entities */}
              {relatedEntities.length > 0 && (
                <TerminalChrome title="related entities">
                  <div className="flex flex-wrap gap-1.5">
                    {relatedEntities.map((entity) => (
                      <EntityTag
                        key={entity.id}
                        name={entity.name}
                        entityType={entity.entity_type}
                        signalCount={entity.signal_count}
                      />
                    ))}
                  </div>
                </TerminalChrome>
              )}

              {/* Linked projects */}
              {linkedProjects.length > 0 && (
                <TerminalChrome title="linked projects">
                  <div className="space-y-2">
                    {linkedProjects.map((lp) => (
                      <Link
                        key={lp.project_id}
                        href={`/project/${lp.project_id}`}
                        className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0 hover:text-[#4D8EFF]/80 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[10px] text-text-muted/40">{lp.link_type}</span>
                          <span className="text-[12px] text-text truncate">
                            {lp.projects.project_name}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-text-muted/30 flex-shrink-0">
                          {formatRelativeTime(lp.created_at)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </TerminalChrome>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center mt-24 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70">
          spark by bonfire labs
        </p>
      </main>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-[10px] text-text-muted/50 tracking-[1px] lowercase shrink-0 w-[70px]">
        {label}
      </span>
      <span className="text-[12px] text-text truncate">
        {value}
      </span>
    </div>
  );
}
