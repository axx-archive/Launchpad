"use client";

import { useEffect, useState, useCallback } from "react";
import TerminalChrome from "./TerminalChrome";
import type { PipelineJobType, PipelineJobStatus } from "@/types/database";

const POLL_INTERVAL = 30_000;

interface PipelineJobSummary {
  id: string;
  job_type: PipelineJobType;
  status: PipelineJobStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  last_error: string | null;
}

const JOB_LABELS: Record<string, string> = {
  "auto-pull": "Pulling project data",
  "auto-narrative": "Extracting your story",
  "auto-copy": "Writing presentation copy",
  "auto-build": "Building your PitchApp",
  "auto-build-html": "Building your PitchApp",
  "auto-review": "Quality review",
  "auto-push": "Deploying",
  "auto-brief": "Pulling edit briefs",
  "auto-revise": "Applying revisions",
  "health-check": "Health check",
};

// Estimated duration in minutes [min, max]
const JOB_ETA: Record<string, [number, number]> = {
  "auto-pull": [0.5, 1],
  "auto-narrative": [5, 15],
  "auto-copy": [3, 8],
  "auto-build": [10, 20],
  "auto-build-html": [10, 20],
  "auto-review": [5, 10],
  "auto-push": [0.5, 1],
  "auto-brief": [0.5, 1],
  "auto-revise": [5, 15],
  "health-check": [0.5, 1],
};

function formatElapsed(startedAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
}

function formatDuration(startedAt: string, completedAt: string): string {
  const seconds = Math.floor(
    (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000,
  );
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
}

function StatusIndicator({ status }: { status: PipelineJobStatus }) {
  if (status === "running") {
    return (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-warning shadow-[0_0_8px_rgba(224,160,32,0.4)]" />
      </span>
    );
  }
  if (status === "completed") {
    return <span className="inline-flex h-2 w-2 rounded-full bg-success shadow-[0_0_8px_rgba(40,200,64,0.4)]" />;
  }
  if (status === "failed") {
    return <span className="inline-flex h-2 w-2 rounded-full bg-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.4)]" />;
  }
  // pending / queued
  return <span className="inline-flex h-2 w-2 rounded-full bg-text-muted/40" />;
}

export default function PipelineActivity({ projectId }: { projectId: string }) {
  const [jobs, setJobs] = useState<PipelineJobSummary[]>([]);
  const [, setTick] = useState(0); // force re-render for elapsed timer

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/pipeline`);
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch {
      // Non-critical — silently fail
    }
  }, [projectId]);

  // Poll for pipeline jobs
  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  // Tick every second for elapsed timer (only when there's a running job)
  const hasRunning = jobs.some((j) => j.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [hasRunning]);

  if (jobs.length === 0) return null;

  const runningJobs = jobs.filter((j) => j.status === "running");
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const queuedJobs = jobs.filter((j) => j.status === "queued" || j.status === "pending");

  return (
    <TerminalChrome title="pipeline activity" className="mb-4">
      <div className="space-y-3 text-[12px]">
        {/* Running jobs */}
        {runningJobs.map((job) => {
          const eta = JOB_ETA[job.job_type];
          return (
            <div key={job.id} className="flex items-start gap-2.5">
              <div className="mt-1 flex-shrink-0">
                <StatusIndicator status={job.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-text font-medium">
                  {JOB_LABELS[job.job_type] ?? job.job_type}...
                </div>
                <div className="text-text-muted/60 text-[10px] mt-0.5">
                  {job.started_at && (
                    <span>{formatElapsed(job.started_at)} elapsed</span>
                  )}
                  {eta && (
                    <span className="ml-2">
                      est. {eta[0]}–{eta[1]} min
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Queued jobs */}
        {queuedJobs.map((job) => (
          <div key={job.id} className="flex items-center gap-2.5">
            <div className="flex-shrink-0">
              <StatusIndicator status={job.status} />
            </div>
            <div className="text-text-muted/60">
              {JOB_LABELS[job.job_type] ?? job.job_type}
              <span className="ml-1.5 text-[10px]">queued</span>
            </div>
          </div>
        ))}

        {/* Divider if we have both active and completed */}
        {(runningJobs.length > 0 || queuedJobs.length > 0) && completedJobs.length > 0 && (
          <div className="border-t border-white/[0.06] my-2" />
        )}

        {/* Completed jobs (show last 5) */}
        {completedJobs.slice(0, 5).map((job) => (
          <div key={job.id} className="flex items-center gap-2.5 opacity-60">
            <div className="flex-shrink-0">
              <StatusIndicator status={job.status} />
            </div>
            <div className="flex-1 min-w-0 text-text-muted">
              {JOB_LABELS[job.job_type] ?? job.job_type}
            </div>
            {job.started_at && job.completed_at && (
              <span className="text-[10px] text-text-muted/50 flex-shrink-0">
                {formatDuration(job.started_at, job.completed_at)}
              </span>
            )}
          </div>
        ))}

        {/* Failed jobs */}
        {failedJobs.slice(0, 3).map((job) => (
          <div key={job.id} className="flex items-start gap-2.5">
            <div className="mt-1 flex-shrink-0">
              <StatusIndicator status={job.status} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[#ef4444]/80">
                {JOB_LABELS[job.job_type] ?? job.job_type} — failed
              </div>
              {job.last_error && (
                <div className="text-[10px] text-text-muted/40 mt-0.5 truncate">
                  {job.last_error}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </TerminalChrome>
  );
}
