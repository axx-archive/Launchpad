"use client";

import { useState } from "react";
import type { Department, ProjectType } from "@/types/database";
import TerminalChrome from "@/components/TerminalChrome";

const DEPT_BADGE_STYLES: Record<Department, string> = {
  intelligence: "text-[#4D8EFF]/80 bg-[#4D8EFF]/10 border-[#4D8EFF]/20",
  strategy: "text-[#8B9A6B]/80 bg-[#8B9A6B]/10 border-[#8B9A6B]/20",
  creative: "text-accent/80 bg-accent/10 border-accent/20",
};

const DEPT_ABBREV: Record<Department, string> = {
  intelligence: "INT",
  strategy: "STR",
  creative: "CRE",
};

/** Reusable cross-department promotion modal.
 *  Works for Strategy→Creative and Intelligence→Strategy/Creative handoffs. */

interface PromoteModalProps {
  projectId: string;
  projectName: string;
  sourceDepartment: Department;
  /** When promoting a non-project source (e.g. a trend cluster), set this to identify the source type */
  sourceType?: "project" | "trend";
  onClose: () => void;
  onSuccess: (newProjectId: string) => void;
}

const TARGET_OPTIONS: Record<Department, { value: Department; label: string; description: string }[]> = {
  strategy: [
    { value: "creative", label: "creative", description: "build a pitchapp from this research" },
  ],
  intelligence: [
    { value: "strategy", label: "strategy", description: "deep-dive research based on this signal" },
    { value: "creative", label: "creative", description: "build a pitchapp from this signal" },
  ],
  creative: [],
};

const CREATIVE_TYPES: { value: ProjectType; label: string }[] = [
  { value: "investor_pitch", label: "investor pitch" },
  { value: "client_proposal", label: "client proposal" },
  { value: "research_report", label: "research report" },
  { value: "website", label: "website" },
  { value: "other", label: "other" },
];

const STRATEGY_TYPES: { value: ProjectType; label: string }[] = [
  { value: "market_research", label: "market research" },
  { value: "competitive_analysis", label: "competitive analysis" },
  { value: "funding_landscape", label: "funding landscape" },
];

type PromoteState = "input" | "confirm" | "submitting" | "success" | "error";

export default function PromoteModal({
  projectId,
  projectName,
  sourceDepartment,
  sourceType = "project",
  onClose,
  onSuccess,
}: PromoteModalProps) {
  const options = TARGET_OPTIONS[sourceDepartment] ?? [];

  const [state, setState] = useState<PromoteState>("input");
  const [targetDept, setTargetDept] = useState<Department | "">(options.length === 1 ? options[0].value : "");
  const [newName, setNewName] = useState(projectName);
  const [projectType, setProjectType] = useState<ProjectType | "">("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const typeOptions = targetDept === "creative" ? CREATIVE_TYPES : targetDept === "strategy" ? STRATEGY_TYPES : [];

  async function handleSubmit() {
    if (!targetDept) return;
    if (state === "submitting") return;

    if (state === "input") {
      setState("confirm");
      return;
    }

    setState("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: sourceType,
          source_id: projectId,
          target_department: targetDept,
          project_name: newName.trim() || projectName,
          type: projectType || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "promotion failed. try again.");
        setState("error");
        return;
      }

      const data = await res.json();
      setState("success");
      onSuccess(data.project.id);
    } catch {
      setErrorMsg("network error. check your connection.");
      setState("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={state === "submitting" ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[480px]">
        <TerminalChrome title={`promote to ${targetDept || "..."}`}>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Source → Target path with department badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] tracking-[1px] text-text-muted/50">from:</span>
            <span className={`font-mono text-[9px] tracking-[1px] uppercase px-1.5 py-0.5 rounded-[2px] border ${DEPT_BADGE_STYLES[sourceDepartment]}`}>
              {DEPT_ABBREV[sourceDepartment]}
            </span>
            <span className="font-mono text-[11px] text-text/70 truncate max-w-[120px]">
              {projectName}
            </span>
            <span className="text-text-muted/30">&rarr;</span>
            <span className="font-mono text-[10px] tracking-[1px] text-text-muted/50">to:</span>
            {targetDept ? (
              <span className={`font-mono text-[9px] tracking-[1px] uppercase px-1.5 py-0.5 rounded-[2px] border ${DEPT_BADGE_STYLES[targetDept]}`}>
                {DEPT_ABBREV[targetDept]}
              </span>
            ) : (
              <span className="font-mono text-[11px] text-text-muted/40">
                select...
              </span>
            )}
            {targetDept && (
              <span className="font-mono text-[11px] text-text/70">
                new project
              </span>
            )}
          </div>

          {/* Target department picker (if multiple options) */}
          {options.length > 1 && (
            <fieldset className="border-0 p-0 m-0">
              <legend className="text-text-muted text-[13px] mb-2">
                <span className="text-accent">$ </span>target department:
              </legend>
              <div className="flex flex-wrap gap-2">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setTargetDept(opt.value); setProjectType(""); }}
                    disabled={state === "submitting"}
                    aria-pressed={targetDept === opt.value}
                    className={`font-mono text-[12px] px-3 py-1.5 rounded-[3px] border transition-all cursor-pointer ${
                      targetDept === opt.value
                        ? "text-accent border-accent/50 bg-accent/10"
                        : "text-text-muted/70 border-border hover:border-accent/30 hover:text-text-muted"
                    } disabled:opacity-50 disabled:cursor-default`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {/* Project type for target department */}
          {targetDept && typeOptions.length > 0 && (
            <fieldset className="border-0 p-0 m-0">
              <legend className="text-text-muted text-[13px] mb-2">
                <span className="text-accent">$ </span>project type:
              </legend>
              <div className="flex flex-wrap gap-2">
                {typeOptions.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setProjectType(t.value)}
                    disabled={state === "submitting"}
                    aria-pressed={projectType === t.value}
                    className={`font-mono text-[12px] px-3 py-1.5 rounded-[3px] border transition-all cursor-pointer ${
                      projectType === t.value
                        ? "text-accent border-accent/50 bg-accent/10"
                        : "text-text-muted/70 border-border hover:border-accent/30 hover:text-text-muted"
                    } disabled:opacity-50 disabled:cursor-default`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {/* Project name override */}
          <div className="flex items-center gap-0 flex-wrap">
            <label htmlFor="promote-name" className="text-text-muted text-[13px] whitespace-nowrap cursor-default">
              <span className="text-accent">$ </span>name:
            </label>
            <input
              id="promote-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={projectName}
              className="flex-1 min-w-[180px] bg-transparent border-0 border-b border-accent/10 text-text font-mono text-inherit leading-[2] px-2 outline-none transition-colors focus:border-b-accent placeholder:text-text-muted/40"
              disabled={state === "submitting"}
            />
          </div>

          {/* Notes */}
          <div>
            <p className="text-text-muted text-[13px] mb-2">
              <span className="text-accent">$ </span>context:
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="any additional context for the new project..."
              rows={2}
              className="w-full bg-transparent border border-accent/10 rounded-[3px] text-text font-mono text-inherit leading-[2] px-3 py-2 outline-none transition-colors focus:border-accent/30 placeholder:text-text-muted/40 resize-none"
              disabled={state === "submitting"}
            />
          </div>

          {/* Error */}
          {errorMsg && (
            <p className="text-[#ef4444] text-[13px]" role="alert">{errorMsg}</p>
          )}

          {/* What gets transferred — reassurance block */}
          {targetDept && (
            <div className="border border-white/[0.06] rounded-[3px] px-3 py-2.5 space-y-1.5">
              <p className="font-mono text-[10px] tracking-[2px] uppercase text-text-muted/50">
                what gets transferred
              </p>
              <ul className="space-y-1">
                <li className="flex items-start gap-2">
                  <span className="font-mono text-[10px] text-accent/60 mt-0.5">&#x2713;</span>
                  <span className="font-mono text-[11px] text-text-muted/70">
                    research findings passed as context for {targetDept === "creative" ? "narrative strategist" : "research agent"}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono text-[10px] text-accent/60 mt-0.5">&#x2713;</span>
                  <span className="font-mono text-[11px] text-text-muted/70">
                    project membership carries over
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono text-[10px] text-accent/60 mt-0.5">&#x2713;</span>
                  <span className="font-mono text-[11px] text-text-muted/70">
                    cross-department link maintained for provenance
                  </span>
                </li>
              </ul>
              <p className="font-mono text-[10px] text-text-muted/40 italic">
                you won&apos;t lose the original report.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={state === "submitting"}
            className="font-mono text-[12px] text-text-muted/70 hover:text-text-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!targetDept || state === "submitting" || state === "success"}
            className="font-mono text-[12px] text-accent border border-accent/20 px-4 py-2 rounded-[3px] hover:border-accent/50 hover:bg-accent/5 transition-all tracking-[0.5px] cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {state === "submitting"
              ? "promoting..."
              : state === "confirm"
              ? "confirm promotion?"
              : state === "success"
              ? "promoted!"
              : "promote"}
          </button>
        </div>
        </TerminalChrome>
      </div>
    </div>
  );
}
