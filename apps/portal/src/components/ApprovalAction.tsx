"use client";

import { useState } from "react";
import TerminalChrome from "@/components/TerminalChrome";
import { toast } from "@/components/Toast";

interface ApprovalActionProps {
  projectId: string;
  onScrollToScout?: () => void;
}

type ActionState = "idle" | "loading" | "done";

export default function ApprovalAction({
  projectId,
  onScrollToScout,
}: ApprovalActionProps) {
  const [state, setState] = useState<ActionState>("idle");
  const [resultMessage, setResultMessage] = useState("");

  async function handleAction(action: "approve" | "escalate") {
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
        setResultMessage("approved — your launchpad is going live.");
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
        <div className="text-center py-2">
          <p className="text-accent text-[13px]">{resultMessage}</p>
        </div>
      </TerminalChrome>
    );
  }

  return (
    <TerminalChrome title="review">
      <p className="text-text-muted text-[12px] mb-4">
        your launchpad is ready for review. what would you like to do?
      </p>

      <div className="space-y-2">
        <button
          onClick={() => handleAction("approve")}
          disabled={state === "loading"}
          className="w-full text-left px-4 py-3 rounded-[3px] border border-accent/30 bg-accent/8 text-accent text-[12px] tracking-[0.5px] hover:bg-accent/15 hover:border-accent/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === "loading" ? "processing..." : "$ looks great, go live"}
        </button>

        <button
          onClick={handleChanges}
          disabled={state === "loading"}
          className="w-full text-left px-4 py-3 rounded-[3px] border border-white/8 text-text-muted text-[12px] tracking-[0.5px] hover:border-white/15 hover:text-text transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          $ i have changes
        </button>

        <button
          onClick={() => handleAction("escalate")}
          disabled={state === "loading"}
          className="w-full text-left px-4 py-3 rounded-[3px] border border-white/8 text-text-muted/60 text-[12px] tracking-[0.5px] hover:border-white/15 hover:text-text-muted transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          $ something&apos;s not right (talk to human)
        </button>
      </div>
    </TerminalChrome>
  );
}
