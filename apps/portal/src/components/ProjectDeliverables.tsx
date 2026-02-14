"use client";

import { useState, useEffect, useCallback } from "react";
import TerminalChrome from "./TerminalChrome";
import { toast } from "./Toast";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

interface Deliverable {
  status: "ready" | "generating" | "queued" | "failed";
  content?: string;
  html?: string;
  completed_at?: string;
}

interface DeliverablesData {
  one_pager?: Deliverable;
  emails?: Deliverable;
}

/**
 * Sanitize HTML by stripping script tags, iframes, and inline event handlers.
 * Defense-in-depth — the one-pager HTML is template-rendered from structured
 * JSON (not raw AI output), but we sanitize before download/view anyway.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>.*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "");
}

export default function ProjectDeliverables({
  projectId,
}: {
  projectId: string;
}) {
  const [deliverables, setDeliverables] = useState<DeliverablesData>({});
  const [activeTab, setActiveTab] = useState<"one_pager" | "emails">("one_pager");
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  const fetchDeliverables = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/deliverables`);
      if (!res.ok) return;
      const data = await res.json();
      setDeliverables(data.deliverables ?? {});
    } catch {
      // Non-critical
    }
  }, [projectId]);

  useEffect(() => {
    fetchDeliverables();
  }, [fetchDeliverables]);

  // Refresh when pipeline jobs update (deliverable jobs completing)
  useRealtimeSubscription({
    table: "pipeline_jobs",
    events: ["UPDATE"],
    filter: { column: "project_id", value: projectId },
    onEvent: (payload) => {
      const job = payload.new as { job_type?: string; status?: string } | undefined;
      if (
        job &&
        (job.job_type === "auto-one-pager" || job.job_type === "auto-emails") &&
        job.status === "completed"
      ) {
        fetchDeliverables();
      }
    },
  });

  const onePager = deliverables.one_pager;
  const emails = deliverables.emails;

  // Don't render if no deliverable jobs exist
  if (!onePager && !emails) return null;

  const hasAnyReady = onePager?.status === "ready" || emails?.status === "ready";
  const allGenerating =
    (onePager?.status === "generating" || onePager?.status === "queued") &&
    (emails?.status === "generating" || emails?.status === "queued");

  async function handleCopy(content: string, tab: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedTab(tab);
      toast("copied to clipboard", "success");
      setTimeout(() => setCopiedTab(null), 2000);
    } catch {
      toast("failed to copy", "error");
    }
  }

  function handleDownloadHtml(html: string, filename: string) {
    const safe = sanitizeHtml(html);
    const blob = new Blob([safe], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleViewOnePager(html: string) {
    const safe = sanitizeHtml(html);
    const blob = new Blob([safe], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  function renderStatus(d: Deliverable | undefined, label: string) {
    if (!d) return null;
    if (d.status === "generating" || d.status === "queued") {
      return (
        <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted/70">
          <span className="w-1.5 h-1.5 rounded-full bg-accent progress-pulse" />
          generating {label}...
        </div>
      );
    }
    if (d.status === "failed") {
      return (
        <div className="text-[11px] font-mono text-error/70">
          {label} generation failed
        </div>
      );
    }
    return null;
  }

  return (
    <TerminalChrome title="deliverables" className="mt-6">
      {/* Tab bar */}
      <div role="tablist" className="flex border-b border-white/[0.06] mb-4 -mt-1">
        <button
          role="tab"
          aria-selected={activeTab === "one_pager"}
          aria-controls="panel-one-pager"
          onClick={() => setActiveTab("one_pager")}
          className={`font-mono text-[10px] tracking-[1px] px-3 py-2 transition-colors cursor-pointer ${
            activeTab === "one_pager"
              ? "text-accent border-b border-accent"
              : "text-text-muted/70 hover:text-text-muted"
          }`}
        >
          one-pager
          {onePager?.status === "ready" && (
            <span className="ml-1.5 text-success/70">&#10003;</span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "emails"}
          aria-controls="panel-emails"
          onClick={() => setActiveTab("emails")}
          className={`font-mono text-[10px] tracking-[1px] px-3 py-2 transition-colors cursor-pointer ${
            activeTab === "emails"
              ? "text-accent border-b border-accent"
              : "text-text-muted/70 hover:text-text-muted"
          }`}
        >
          emails
          {emails?.status === "ready" && (
            <span className="ml-1.5 text-success/70">&#10003;</span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "one_pager" && (
        <div id="panel-one-pager" role="tabpanel">
          {onePager?.status === "ready" && onePager.content ? (
            <div>
              <div className="prose-terminal text-[12px] leading-relaxed max-h-[400px] overflow-y-auto mb-3 whitespace-pre-wrap">
                {onePager.content}
              </div>
              <div className="flex gap-3 pt-2 border-t border-white/[0.06]">
                {onePager.html && (
                  <button
                    onClick={() => handleViewOnePager(onePager.html!)}
                    className="font-mono text-[10px] text-accent hover:text-accent-light transition-colors cursor-pointer"
                  >
                    $ view &rarr;
                  </button>
                )}
                <button
                  onClick={() => handleCopy(onePager.content!, "one_pager")}
                  className="font-mono text-[10px] text-text-muted hover:text-text transition-colors cursor-pointer"
                >
                  {copiedTab === "one_pager" ? "copied" : "$ copy markdown"}
                </button>
                {onePager.html && (
                  <button
                    onClick={() =>
                      handleDownloadHtml(onePager.html!, "one-pager.html")
                    }
                    className="font-mono text-[10px] text-text-muted hover:text-text transition-colors cursor-pointer"
                  >
                    $ download
                  </button>
                )}
              </div>
            </div>
          ) : (
            renderStatus(onePager, "one-pager") || (
              <p className="text-[11px] text-text-muted/70 font-mono">
                one-pager will be generated when the build starts.
              </p>
            )
          )}
        </div>
      )}

      {activeTab === "emails" && (
        <div id="panel-emails" role="tabpanel">
          {emails?.status === "ready" && emails.content ? (
            <div>
              <div className="prose-terminal text-[12px] leading-relaxed max-h-[400px] overflow-y-auto mb-3 whitespace-pre-wrap">
                {emails.content}
              </div>
              <div className="flex gap-2 pt-2 border-t border-white/[0.06]">
                <button
                  onClick={() => handleCopy(emails.content!, "emails")}
                  className="font-mono text-[10px] text-accent hover:text-accent-light transition-colors cursor-pointer"
                >
                  {copiedTab === "emails" ? "copied" : "$ copy all emails"}
                </button>
              </div>
            </div>
          ) : (
            renderStatus(emails, "email sequence") || (
              <p className="text-[11px] text-text-muted/70 font-mono">
                email sequence will be generated when the build starts.
              </p>
            )
          )}
        </div>
      )}

      {/* Loading state when both are generating */}
      {allGenerating && !hasAnyReady && (
        <p className="text-[11px] text-text-muted/70 font-mono mt-2">
          generating deliverables alongside the build — this takes a few minutes.
        </p>
      )}
    </TerminalChrome>
  );
}
