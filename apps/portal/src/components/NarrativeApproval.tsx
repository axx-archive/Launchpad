"use client";

import { useState } from "react";
import TerminalChrome from "@/components/TerminalChrome";
import { toast } from "@/components/Toast";

interface NarrativeApprovalProps {
  projectId: string;
  onScrollToScout?: () => void;
}

type ActionState = "idle" | "loading" | "done";

export default function NarrativeApproval({
  projectId,
  onScrollToScout,
}: NarrativeApprovalProps) {
  const [state, setState] = useState<ActionState>("idle");
  const [resultMessage, setResultMessage] = useState("");

  async function handleAction(action: "approve" | "reject" | "escalate", notes?: string) {
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
        setResultMessage("approved — your launchpad build is starting.");
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
    // For reject, we send to Scout for structured notes
    onScrollToScout?.();
  }

  if (state === "done") {
    return (
      <TerminalChrome title="story review">
        <div className="text-center py-2">
          <p className="text-accent text-[13px]">{resultMessage}</p>
        </div>
      </TerminalChrome>
    );
  }

  return (
    <TerminalChrome title="story review">
      <p className="text-text-muted text-[12px] mb-4">
        your narrative is ready. this is the story arc we&apos;ll use to build your launchpad.
      </p>

      <div className="space-y-2">
        <button
          onClick={() => handleAction("approve")}
          disabled={state === "loading"}
          className="w-full text-left px-4 py-3 rounded-[3px] border border-accent/30 bg-accent/8 text-accent text-[12px] tracking-[0.5px] hover:bg-accent/15 hover:border-accent/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === "loading" ? "processing..." : "$ this captures it \u2014 build it"}
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
          className="w-full text-left px-4 py-3 rounded-[3px] border border-white/8 text-text-muted/60 text-[12px] tracking-[0.5px] hover:border-white/15 hover:text-text-muted transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          $ this misses the mark
        </button>
      </div>
    </TerminalChrome>
  );
}
