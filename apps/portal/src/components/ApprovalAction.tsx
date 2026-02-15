"use client";

import { useState, useEffect, useCallback } from "react";
import TerminalChrome from "@/components/TerminalChrome";
import { toast } from "@/components/Toast";

interface ApprovalActionProps {
  projectId: string;
  onScrollToScout?: () => void;
}

type ActionState = "idle" | "loading" | "done";
type ConfirmState = "idle" | "confirming" | "ready";

export default function ApprovalAction({
  projectId,
  onScrollToScout,
}: ApprovalActionProps) {
  const [state, setState] = useState<ActionState>("idle");
  const [confirmState, setConfirmState] = useState<ConfirmState>("idle");
  const [resultMessage, setResultMessage] = useState("");

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

  async function executeAction(action: "approve" | "escalate") {
    setConfirmState("idle");
    setState("loading");
    try {
      const res = await fetch(`/api/projects/${projectId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "something went wrong");
      }

      if (action === "approve") {
        setResultMessage("approved — your spark is going live.");
        toast("pitchapp approved", "success");
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

  if (state === "done") {
    return (
      <TerminalChrome title="review">
        <div className="text-center py-4 relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-32 h-32 rounded-full bg-accent/15 celebration-glow" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-accent/8 celebration-glow" style={{ animationDelay: "0.15s" }} />
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
    <TerminalChrome title="review">
      <p className="text-text-muted text-[12px] mb-4">
        your spark is ready for review. what would you like to do?
      </p>

      <div className="space-y-2">
        <button
          onClick={handleApproveClick}
          disabled={state === "loading" || confirmState === "confirming"}
          className="w-full text-left px-4 py-3 rounded-[3px] text-[12px] tracking-[0.5px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed btn-primary"
        >
          {state === "loading"
            ? "processing..."
            : isConfirming
              ? "$ confirm — go live"
              : "$ looks great, go live"}
        </button>

        <button
          onClick={handleChanges}
          disabled={state === "loading"}
          className="w-full text-left px-4 py-3 rounded-[3px] border border-white/8 text-text-muted text-[12px] tracking-[0.5px] hover:border-white/15 hover:text-text transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          $ i have changes
        </button>

        <button
          onClick={() => executeAction("escalate")}
          disabled={state === "loading"}
          className="w-full text-left px-4 py-3 rounded-[3px] border border-white/8 text-text-muted/70 text-[12px] tracking-[0.5px] hover:border-white/15 hover:text-text-muted transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          $ something&apos;s not right (talk to human)
        </button>
      </div>
    </TerminalChrome>
  );
}
