"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import type { PipelineJobType, PipelineJobStatus, PipelineJobProgress } from "@/types/database";

/* ---------- Persona definitions ---------- */

interface Persona {
  code: string;
  label: string;
}

const PERSONA_FOR_JOB: Record<string, Persona> = {
  "auto-pull":       { code: "RA", label: "analyst" },
  "auto-research":   { code: "RS", label: "researcher" },
  "auto-narrative":  { code: "NS", label: "strategist" },
  "auto-copy":       { code: "CW", label: "writer" },
  "auto-build":      { code: "DV", label: "developer" },
  "auto-build-html": { code: "DV", label: "developer" },
  "auto-review":     { code: "QA", label: "reviewer" },
  "auto-push":       { code: "DE", label: "deployer" },
  "auto-brief":      { code: "RA", label: "analyst" },
  "auto-revise":     { code: "DV", label: "developer" },
};

const PIPELINE_STAGES = [
  { code: "RA", label: "analyst",    jobTypes: ["auto-pull", "auto-brief"] },
  { code: "RS", label: "researcher", jobTypes: ["auto-research"] },
  { code: "NS", label: "strategist", jobTypes: ["auto-narrative"] },
  { code: "CW", label: "writer",     jobTypes: ["auto-copy"] },
  { code: "DV", label: "developer",  jobTypes: ["auto-build", "auto-build-html", "auto-revise"] },
  { code: "QA", label: "reviewer",   jobTypes: ["auto-review"] },
  { code: "DE", label: "deployer",   jobTypes: ["auto-push"] },
];

/* ---------- Types ---------- */

interface JobSummary {
  id: string;
  job_type: PipelineJobType;
  status: PipelineJobStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  last_error: string | null;
  progress: PipelineJobProgress | null;
}

interface LogEntry {
  id: number;
  time: Date;
  persona: string;
  text: string;
}

/* ---------- Helpers ---------- */

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtElapsed(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, "0")}s`;
}

/* ---------- Component ---------- */

export default function BuildTheater({ projectId }: { projectId: string }) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [, setTick] = useState(0);
  const logPanelRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const seeded = useRef(false);

  /* Append a log entry (deduped against previous) */
  const appendLog = useCallback((persona: string, text: string) => {
    setLog((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.text === text && last.persona === persona) return prev;
      const entry: LogEntry = {
        id: ++nextId.current,
        time: new Date(),
        persona,
        text: text.toLowerCase(),
      };
      const next = [...prev, entry];
      return next.length > 50 ? next.slice(-50) : next;
    });
  }, []);

  /* Fetch pipeline jobs */
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/pipeline`);
      if (!res.ok) return;
      const data = await res.json();
      const fetched: JobSummary[] = data.jobs ?? [];
      setJobs(fetched);

      // Seed log with running job actions on first load
      if (!seeded.current && fetched.length > 0) {
        seeded.current = true;
        for (const j of fetched) {
          if (j.status === "running" && j.progress?.last_action) {
            const p = PERSONA_FOR_JOB[j.job_type];
            if (p) appendLog(p.label, j.progress.last_action);
          }
        }
      }
    } catch {
      // silent
    }
  }, [projectId, appendLog]);

  /* Poll — fast 5s for 2 min, then 60s */
  useEffect(() => {
    fetchJobs();
    const ref = { current: setInterval(fetchJobs, 5_000) };
    const t = setTimeout(() => {
      clearInterval(ref.current);
      ref.current = setInterval(fetchJobs, 60_000);
    }, 120_000);
    return () => {
      clearInterval(ref.current);
      clearTimeout(t);
    };
  }, [fetchJobs]);

  /* Realtime subscription */
  useRealtimeSubscription({
    table: "pipeline_jobs",
    events: ["INSERT", "UPDATE"],
    filter: { column: "project_id", value: projectId },
    onEvent: (payload) => {
      const updated = payload.new as JobSummary | undefined;
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

      if (updated.progress?.last_action) {
        const p = PERSONA_FOR_JOB[updated.job_type];
        if (p) appendLog(p.label, updated.progress.last_action);
      }
    },
  });

  /* Elapsed timer for running jobs */
  const hasRunning = jobs.some((j) => j.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [hasRunning]);

  /* Auto-scroll log panel */
  useEffect(() => {
    logPanelRef.current?.scrollTo({
      top: logPanelRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [log]);

  /* Derived state */
  const runningJob = jobs.find((j) => j.status === "running");
  const activePersona = runningJob ? PERSONA_FOR_JOB[runningJob.job_type] : null;

  function stageStatus(jobTypes: string[]): "idle" | "active" | "done" | "failed" {
    const relevant = jobs.filter((j) => jobTypes.includes(j.job_type));
    if (relevant.some((j) => j.status === "running")) return "active";
    if (relevant.some((j) => j.status === "failed")) return "failed";
    if (relevant.some((j) => j.status === "completed")) return "done";
    return "idle";
  }

  return (
    <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[4px] lowercase text-accent/70 mb-1">
              live build
            </p>
            <p className="font-display text-[clamp(16px,2vw,20px)] font-light text-text">
              your spark is being built
            </p>
          </div>
          {runningJob?.started_at && (
            <span className="font-mono text-[11px] text-text-muted/50 tabular-nums flex-shrink-0">
              {fmtElapsed(runningJob.started_at)}
            </span>
          )}
        </div>
      </div>

      {/* Persona strip */}
      <div className="px-6 py-3 border-b border-white/[0.06] overflow-x-auto">
        <div className="flex gap-1.5 min-w-max">
          {PIPELINE_STAGES.map((stage) => {
            const s = stageStatus(stage.jobTypes);
            return (
              <div
                key={stage.code}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-[3px] border transition-all duration-300 ${
                  s === "active"
                    ? "border-accent/40 bg-accent/8 text-accent"
                    : s === "done"
                    ? "border-white/[0.06] text-text-muted/50"
                    : s === "failed"
                    ? "border-[#ef4444]/20 text-[#ef4444]/60"
                    : "border-transparent text-text-muted/20"
                }`}
              >
                {/* Status dot */}
                <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                  {s === "active" ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
                    </>
                  ) : s === "done" ? (
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success/50" />
                  ) : s === "failed" ? (
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#ef4444]/50" />
                  ) : (
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-text-muted/15" />
                  )}
                </span>
                <span className="font-mono text-[10px] tracking-[1px]">{stage.code}</span>
                <span className="hidden sm:inline text-[11px]">{stage.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active stage detail + progress bar */}
      {runningJob && activePersona && runningJob.progress && (
        <div className="px-6 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[10px] text-accent/80 tracking-[1px]">
              {activePersona.code}
            </span>
            <span className="text-[12px] text-text">{activePersona.label}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-accent/50 rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.round(
                    (runningJob.progress.turn / runningJob.progress.max_turns) * 100
                  )}%`,
                }}
              />
            </div>
            <span className="font-mono text-[10px] text-text-muted/70 tabular-nums flex-shrink-0">
              {runningJob.progress.turn}/{runningJob.progress.max_turns}
            </span>
          </div>
          {runningJob.progress.last_action && (
            <p className="font-mono text-[10px] text-text-muted/60 mt-1.5 truncate">
              {runningJob.progress.last_action.toLowerCase()}
            </p>
          )}
        </div>
      )}

      {/* Live log */}
      <div ref={logPanelRef} className="px-6 py-4 max-h-[180px] overflow-y-auto">
        {log.length === 0 ? (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent/30 animate-pulse" />
            <p className="font-mono text-[11px] text-text-muted/40">
              waiting for pipeline output...
            </p>
          </div>
        ) : (
          <div className="space-y-px">
            {log.map((entry) => (
              <p
                key={entry.id}
                className="font-mono text-[10px] leading-[1.8] text-text-muted/60"
              >
                <span className="text-text-muted/40">[{fmtTime(entry.time)}]</span>{" "}
                <span className="text-accent/50">{entry.persona}:</span>{" "}
                {entry.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
