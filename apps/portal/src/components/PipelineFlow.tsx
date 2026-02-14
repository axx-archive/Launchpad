"use client";

import { useEffect, useState, useCallback } from "react";
import TerminalChrome from "./TerminalChrome";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import type { PipelineJobStatus } from "@/types/database";

const POLL_INTERVAL = 30_000;

interface PipelineJob {
  id: string;
  job_type: string;
  status: PipelineJobStatus;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
}

// Pipeline DAG nodes in order
const PIPELINE_NODES: readonly { id: string; label: string; jobTypes: readonly string[]; isGate?: boolean }[] = [
  { id: "pull", label: "pull", jobTypes: ["auto-pull"] },
  { id: "research", label: "research", jobTypes: ["auto-research"] },
  { id: "narrative", label: "story", jobTypes: ["auto-narrative"] },
  { id: "approval", label: "approval", jobTypes: [], isGate: true },
  { id: "copy", label: "copy", jobTypes: ["auto-copy"] },
  { id: "build", label: "build", jobTypes: ["auto-build", "auto-build-html"] },
  { id: "review", label: "review", jobTypes: ["auto-review"] },
  { id: "deploy", label: "deploy", jobTypes: ["auto-push"] },
];

type NodeStatus = "completed" | "active" | "failed" | "queued" | "waiting";

function resolveNodeStatus(
  node: (typeof PIPELINE_NODES)[number],
  jobs: PipelineJob[],
  projectStatus: string,
): { status: NodeStatus; job?: PipelineJob; duration?: string } {
  // Special handling for the approval gate
  if (node.isGate) {
    if (projectStatus === "narrative_review") {
      return { status: "active" };
    }
    // If any job after approval exists or project is past narrative_review
    const postApprovalStatuses = ["brand_collection", "in_progress", "review", "revision", "live"];
    if (postApprovalStatuses.includes(projectStatus)) {
      return { status: "completed" };
    }
    return { status: "waiting" };
  }

  // Find matching jobs for this node
  const matchingJobs = jobs.filter((j) => node.jobTypes.includes(j.job_type));
  if (matchingJobs.length === 0) return { status: "waiting" };

  // Prioritize: running > failed > completed > queued
  const running = matchingJobs.find((j) => j.status === "running");
  if (running) return { status: "active", job: running };

  const failed = matchingJobs.find((j) => j.status === "failed");
  if (failed) return { status: "failed", job: failed };

  const completed = matchingJobs.find((j) => j.status === "completed");
  if (completed) {
    let duration: string | undefined;
    if (completed.started_at && completed.completed_at) {
      const seconds = Math.floor(
        (new Date(completed.completed_at).getTime() - new Date(completed.started_at).getTime()) / 1000,
      );
      duration = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
    }
    return { status: "completed", job: completed, duration };
  }

  const queued = matchingJobs.find((j) => j.status === "queued" || j.status === "pending");
  if (queued) return { status: "queued", job: queued };

  return { status: "waiting" };
}

function NodeDot({ status }: { status: NodeStatus }) {
  const base = "w-6 h-6 rounded-full flex items-center justify-center border transition-all flex-shrink-0";

  if (status === "completed") {
    return (
      <span className={`${base} border-accent/50 bg-accent/15`}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent" />
        </svg>
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className={`${base} border-accent bg-accent/20 progress-pulse`}>
        <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_rgba(192,120,64,0.6)]" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className={`${base} border-error/50 bg-error/15`}>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M2 2l4 4M6 2l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-error" />
        </svg>
      </span>
    );
  }
  if (status === "queued") {
    return (
      <span className={`${base} border-white/15 bg-white/[0.03]`}>
        <span className="w-1 h-1 rounded-full bg-text-muted/50" />
      </span>
    );
  }
  // waiting
  return (
    <span className={`${base} border-white/8 bg-transparent`}>
      <span className="w-1 h-1 rounded-full bg-text-muted/30" />
    </span>
  );
}

function Connector({ left, right }: { left: NodeStatus; right: NodeStatus }) {
  const isActive = left === "completed" || left === "active";
  return (
    <span
      className={`flex-1 h-px min-w-3 transition-colors ${
        isActive ? "bg-accent/30" : "bg-white/8"
      }`}
    />
  );
}

export default function PipelineFlow({
  projectId,
  projectStatus,
}: {
  projectId: string;
  projectStatus: string;
}) {
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/pipeline`);
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch (err) {
      console.error("[PipelineFlow] Failed to fetch jobs:", err);
    }
  }, [projectId]);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  useRealtimeSubscription({
    table: "pipeline_jobs",
    events: ["INSERT", "UPDATE"],
    filter: { column: "project_id", value: projectId },
    onEvent: (payload) => {
      const updated = payload.new as PipelineJob | undefined;
      if (!updated?.id) return;
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === updated.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [updated, ...prev];
      });
    },
  });

  const nodeStates = PIPELINE_NODES.map((node) => ({
    ...node,
    ...resolveNodeStatus(node, jobs, projectStatus),
  }));

  // Don't render if no jobs exist and project is still in requested state
  if (jobs.length === 0 && projectStatus === "requested") return null;

  return (
    <TerminalChrome title="pipeline" className="mb-4">
      {/* Desktop: horizontal flow */}
      <div className="hidden sm:flex items-center gap-0">
        {nodeStates.map((node, i) => (
          <div key={node.id} className="contents">
            {/* Node */}
            <button
              type="button"
              onClick={() => setExpandedNode(expandedNode === node.id ? null : node.id)}
              className="flex flex-col items-center gap-1.5 cursor-pointer group min-w-0 focus-visible:ring-1 focus-visible:ring-accent/50 focus-visible:outline-none rounded"
            >
              <NodeDot status={node.status} />
              <span
                className={`font-mono text-[9px] tracking-[1px] lowercase transition-colors ${
                  node.status === "active"
                    ? "text-accent"
                    : node.status === "completed"
                    ? "text-text-muted"
                    : node.status === "failed"
                    ? "text-error/70"
                    : "text-text-muted/70"
                } group-hover:text-text`}
              >
                {node.label}
              </span>
            </button>
            {/* Connector */}
            {i < nodeStates.length - 1 && (
              <Connector left={node.status} right={nodeStates[i + 1].status} />
            )}
          </div>
        ))}
      </div>

      {/* Mobile: vertical flow */}
      <div className="sm:hidden space-y-0">
        {nodeStates.map((node, i) => (
          <div key={node.id}>
            <button
              type="button"
              onClick={() => setExpandedNode(expandedNode === node.id ? null : node.id)}
              className="flex items-center gap-3 py-1.5 cursor-pointer group w-full focus-visible:ring-1 focus-visible:ring-accent/50 focus-visible:outline-none rounded"
            >
              <NodeDot status={node.status} />
              <span
                className={`font-mono text-[11px] tracking-[1px] lowercase ${
                  node.status === "active"
                    ? "text-accent font-medium"
                    : node.status === "completed"
                    ? "text-text-muted"
                    : node.status === "failed"
                    ? "text-error/70"
                    : "text-text-muted/70"
                }`}
              >
                {node.label}
                {node.status === "active" && (
                  <span className="text-accent/50 ml-2">&larr; active</span>
                )}
              </span>
              {node.duration && (
                <span className="ml-auto font-mono text-[9px] text-text-muted/70">
                  {node.duration}
                </span>
              )}
            </button>
            {/* Vertical connector */}
            {i < nodeStates.length - 1 && (
              <div className="ml-3 h-2 border-l border-white/8" />
            )}
          </div>
        ))}
      </div>

      {/* Expanded node detail */}
      {expandedNode && (() => {
        const node = nodeStates.find((n) => n.id === expandedNode);
        if (!node) return null;

        return (
          <div className="mt-3 pt-3 border-t border-white/[0.06] text-[11px]">
            {node.isGate ? (
              <p className="text-text-muted font-mono">
                {node.status === "active"
                  ? "waiting for your review and approval of the narrative."
                  : node.status === "completed"
                  ? "narrative approved — build proceeding."
                  : "narrative will be submitted for your review."}
              </p>
            ) : node.job ? (
              <div className="space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-text-muted">status</span>
                  <span className={
                    node.status === "completed" ? "text-success" :
                    node.status === "active" ? "text-accent" :
                    node.status === "failed" ? "text-error" :
                    "text-text-muted"
                  }>
                    {node.job.status}
                  </span>
                </div>
                {node.duration && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">duration</span>
                    <span className="text-text">{node.duration}</span>
                  </div>
                )}
                {node.job.last_error && (
                  <p className="text-error/70 text-[10px] mt-1 truncate">
                    {node.job.last_error}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-text-muted/70 font-mono">
                this stage hasn&apos;t started yet.
              </p>
            )}
          </div>
        );
      })()}
    </TerminalChrome>
  );
}
