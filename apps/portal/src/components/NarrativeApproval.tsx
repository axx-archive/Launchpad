"use client";

import { useState, useEffect, useCallback } from "react";
import TerminalChrome from "@/components/TerminalChrome";
import ConfidenceScoresDisplay from "@/components/ConfidenceScores";
import { toast } from "@/components/Toast";
import type { ConfidenceScores } from "@/types/database";

interface NarrativeApprovalProps {
  projectId: string;
  onScrollToScout?: () => void;
}

type ActionState = "idle" | "loading" | "done";
type ConfirmState = "idle" | "confirming" | "ready";

export default function NarrativeApproval({
  projectId,
  onScrollToScout,
}: NarrativeApprovalProps) {
  const [state, setState] = useState<ActionState>("idle");
  const [confirmState, setConfirmState] = useState<ConfirmState>("idle");
  const [resultMessage, setResultMessage] = useState("");
  const [confidence, setConfidence] = useState<ConfidenceScores | null>(null);

  // Fetch confidence scores from the narrative pipeline job
  useEffect(() => {
    let cancelled = false;
    async function fetchConfidence() {
      try {
        const res = await fetch(`/api/projects/${projectId}/pipeline`);
        if (!res.ok) return;
        const data = await res.json();
        const jobs = data.jobs ?? [];
        // Find the most recent auto-narrative job with confidence data
        const narrativeJob = jobs.find(
          (j: { job_type: string; progress?: { confidence?: ConfidenceScores } }) =>
            j.job_type === "auto-narrative" && j.progress?.confidence,
        );
        if (!cancelled && narrativeJob?.progress?.confidence) {
          setConfidence(narrativeJob.progress.confidence);
        }
      } catch (err) {
        console.error("[NarrativeApproval] Failed to fetch confidence:", err);
      }
    }
    fetchConfidence();
    return () => { cancelled = true; };
  }, [projectId]);

  // Auto-revert confirmation after 5s
  useEffect(() => {
    if (confirmState === "idle") return;
    const timeout = setTimeout(() => setConfirmState("idle"), 5000);
    return () => clearTimeout(timeout);
  }, [confirmState]);

  // Enable confirm button after 1s delay
  useEffect(() => {
    if (confirmState !== "confirming") return;
    const delay = setTimeout(() => setConfirmState("ready"), 1000);
    return () => clearTimeout(delay);
  }, [confirmState]);

  const handleApproveClick = useCallback(() => {
    if (confirmState === "idle") {
      setConfirmState("confirming");
      return;
    }
    if (confirmState === "ready") {
      executeAction("approve");
    }
  }, [confirmState]);

  async function executeAction(action: "approve" | "reject" | "escalate", notes?: string) {
    setConfirmState("idle");
    setState("loading");
    try {
      const res = await fetch(`/api/projects/${projectId}/narrative/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "something went wrong");
      }

      if (action === "approve") {
        setResultMessage("approved — now let's arm your story with your brand.");
        toast("narrative approved", "success");
      } else if (action === "reject") {
        setResultMessage("noted — the team will rework the narrative.");
        toast("revision requested", "default");
      } else {
        setResultMessage("escalated — the team has been notified.");
        toast("escalated to the team", "default");
      }
      setState("done");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "something went wrong",
        "error"
      );
      setState("idle");
    }
  }

  function handleChanges() {
    onScrollToScout?.();
  }

  function handleReject() {
    onScrollToScout?.();
  }

  if (state === "done") {
    return (
      <TerminalChrome title="story review">
        <div className="text-center py-4 relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-24 h-24 rounded-full bg-accent/10 celebration-glow" />
          </div>
          <div className="absolute inset-0 flex justify-center pointer-events-none">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="absolute bottom-2 w-1 h-1 rounded-full bg-accent/50 ember-float"
                style={{
                  left: `${25 + i * 12}%`,
                  animationDelay: `${i * 0.12}s`,
                }}
              />
            ))}
          </div>
          <p className="font-display text-[clamp(16px,2.5vw,20px)] font-light text-accent relative celebration-text-enter">
            {resultMessage}
          </p>
        </div>
      </TerminalChrome>
    );
  }

  const isConfirming = confirmState !== "idle";

  return (
    <TerminalChrome title="story review">
      <p className="text-text-muted text-[12px] mb-4">
        your narrative is ready. this is the story arc we&apos;ll use to build your spark.
      </p>

      {/* Confidence scores — shown when available from pipeline */}
      {confidence && (
        <div className="mb-4 pb-4 border-b border-white/[0.06]">
          <ConfidenceScoresDisplay scores={confidence} />
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={handleApproveClick}
          disabled={state === "loading" || confirmState === "confirming"}
          className="w-full text-left px-4 py-3 rounded-[3px] text-[12px] tracking-[0.5px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed btn-primary"
        >
          {state === "loading"
            ? "processing..."
            : isConfirming
              ? "$ confirm — lock in this narrative"
              : "$ this captures it \u2014 build it"}
        </button>

        <button
          onClick={handleChanges}
          disabled={state === "loading"}
          className="w-full text-left px-4 py-3 rounded-[3px] border border-white/8 text-text-muted text-[12px] tracking-[0.5px] hover:border-white/15 hover:text-text transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          $ close, but i have notes
        </button>

        <button
          onClick={handleReject}
          disabled={state === "loading"}
          className="w-full text-left px-4 py-3 rounded-[3px] border border-white/8 text-text-muted/70 text-[12px] tracking-[0.5px] hover:border-white/15 hover:text-text-muted transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          $ this misses the mark
        </button>
      </div>
    </TerminalChrome>
  );
}
