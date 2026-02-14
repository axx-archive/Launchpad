"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import TerminalChrome from "@/components/TerminalChrome";
import type { ProjectType, AutonomyLevel } from "@/types/database";

type FormState = "input" | "submitting" | "success" | "error";

const RESEARCH_TYPES: { value: ProjectType; label: string }[] = [
  { value: "market_research", label: "market research" },
  { value: "competitive_analysis", label: "competitive analysis" },
  { value: "funding_landscape", label: "funding landscape" },
];

const TIMELINES = ["no rush", "2-3 weeks", "asap"];

const AUTONOMY_OPTIONS: { value: AutonomyLevel; label: string; description: string }[] = [
  { value: "full_auto", label: "full autonomy", description: "AI research agent handles everything autonomously" },
  { value: "manual", label: "guided", description: "review checkpoints at each research phase" },
];

export default function StrategyIntake() {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<FormState>("input");
  const [errorMsg, setErrorMsg] = useState("");

  const [projectName, setProjectName] = useState("");
  const [company, setCompany] = useState("");
  const [type, setType] = useState<ProjectType | "">("");
  const [audience, setAudience] = useState("");
  const [timeline, setTimeline] = useState("");
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>("full_auto");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (state === "input" && nameRef.current) {
      nameRef.current.focus();
    }
  }, [state]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (state === "submitting" || state === "success") return;

    setErrorMsg("");

    if (!projectName.trim() || !company.trim() || !type) {
      setErrorMsg("need a project name, company, and research type to proceed.");
      setState("error");
      return;
    }

    setState("submitting");

    try {
      const res = await fetch("/api/strategy/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: projectName.trim(),
          company_name: company.trim(),
          type,
          target_audience: audience.trim() || null,
          timeline_preference: timeline || null,
          autonomy_level: autonomyLevel,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "something went wrong. try again.");
        setState("error");
        return;
      }

      const data = await res.json();
      setState("success");

      // Brief delay then redirect
      setTimeout(() => {
        router.push(`/strategy/research/${data.project.id}`);
      }, 1200);
    } catch {
      setErrorMsg("network error. check your connection and try again.");
      setState("error");
    }
  }

  return (
    <>
      <Nav sectionLabel="strategy &mdash; new research" />
      <div className="min-h-screen flex items-center justify-center p-6 pt-24 page-enter">
        <div className="w-full max-w-[600px]">
          <Link
            href="/strategy"
            className="inline-flex items-center gap-2 font-mono text-[12px] text-text-muted hover:text-text transition-colors mb-6"
          >
            &larr; research lab
          </Link>

          <TerminalChrome title={state === "success" ? "strategy — research queued" : "strategy — new research"}>
            {/* Success state */}
            {state === "success" && (
              <div className="py-8 text-center space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[rgba(139,154,107,0.1)] border border-[rgba(139,154,107,0.2)]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="#8B9A6B" strokeWidth="1.5" fill="none" />
                    <line x1="15.5" y1="15.5" x2="20" y2="20" stroke="#8B9A6B" strokeWidth="1.5" />
                  </svg>
                </div>
                <p className="font-display text-[clamp(18px,2.5vw,24px)] font-light text-text">
                  research queued
                </p>
                <p className="font-mono text-[12px] text-text-muted/70">
                  redirecting to research detail...
                </p>
              </div>
            )}

            {/* Form */}
            {(state === "input" || state === "submitting" || state === "error") && (
              <form onSubmit={handleSubmit}>
                <p className="text-text font-display text-[clamp(24px,3vw,32px)] font-light mb-6">
                  new research
                </p>
                <p className="text-text-muted mb-8">
                  what do you want to research? our agents will dig deep.
                </p>

                {/* project name */}
                <div className="flex items-center gap-0 mb-5 flex-wrap">
                  <label htmlFor="research-name" className="text-text-muted whitespace-nowrap cursor-default">
                    <span className="text-accent">$ </span>research name:
                  </label>
                  <input
                    ref={nameRef}
                    id="research-name"
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="q1 market landscape"
                    className="flex-1 min-w-[180px] bg-transparent border-0 border-b border-accent/10 text-text font-mono text-inherit leading-[2] px-2 outline-none transition-colors focus:border-b-accent placeholder:text-text-muted/40"
                    disabled={state === "submitting"}
                  />
                </div>

                {/* company */}
                <div className="flex items-center gap-0 mb-5 flex-wrap">
                  <label htmlFor="research-company" className="text-text-muted whitespace-nowrap cursor-default">
                    <span className="text-accent">$ </span>company / topic:
                  </label>
                  <input
                    id="research-company"
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="acme corp"
                    className="flex-1 min-w-[180px] bg-transparent border-0 border-b border-accent/10 text-text font-mono text-inherit leading-[2] px-2 outline-none transition-colors focus:border-b-accent placeholder:text-text-muted/40"
                    disabled={state === "submitting"}
                  />
                </div>

                {/* research type */}
                <fieldset className="mb-5 border-0 p-0 m-0">
                  <legend className="text-text-muted mb-2">
                    <span className="text-accent">$ </span>research type:
                  </legend>
                  <div className="flex flex-wrap gap-2 pl-4">
                    {RESEARCH_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setType(t.value)}
                        disabled={state === "submitting"}
                        aria-pressed={type === t.value}
                        className={`font-mono text-[12px] px-3 py-1.5 rounded-[3px] border transition-all cursor-pointer ${
                          type === t.value
                            ? "text-accent border-accent/50 bg-accent/10"
                            : "text-text-muted/70 border-border hover:border-accent/30 hover:text-text-muted"
                        } disabled:opacity-50 disabled:cursor-default`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {/* target audience */}
                <div className="flex items-center gap-0 mb-5 flex-wrap">
                  <label htmlFor="research-audience" className="text-text-muted whitespace-nowrap cursor-default">
                    <span className="text-accent">$ </span>target audience:
                  </label>
                  <input
                    id="research-audience"
                    type="text"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="board of directors"
                    className="flex-1 min-w-[180px] bg-transparent border-0 border-b border-accent/10 text-text font-mono text-inherit leading-[2] px-2 outline-none transition-colors focus:border-b-accent placeholder:text-text-muted/40"
                    disabled={state === "submitting"}
                  />
                </div>

                {/* timeline */}
                <fieldset className="mb-5 border-0 p-0 m-0">
                  <legend className="text-text-muted mb-2">
                    <span className="text-accent">$ </span>timeline:
                  </legend>
                  <div className="flex flex-wrap gap-2 pl-4">
                    {TIMELINES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTimeline(timeline === t ? "" : t)}
                        disabled={state === "submitting"}
                        aria-pressed={timeline === t}
                        className={`font-mono text-[12px] px-3 py-1.5 rounded-[3px] border transition-all cursor-pointer ${
                          timeline === t
                            ? "text-accent border-accent/50 bg-accent/10"
                            : "text-text-muted/70 border-border hover:border-accent/30 hover:text-text-muted"
                        } disabled:opacity-50 disabled:cursor-default`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {/* autonomy level */}
                <fieldset className="mb-5 border-0 p-0 m-0">
                  <legend className="text-text-muted mb-2">
                    <span className="text-accent">$ </span>research mode:
                  </legend>
                  <div className="flex flex-wrap gap-2 pl-4">
                    {AUTONOMY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAutonomyLevel(opt.value)}
                        disabled={state === "submitting"}
                        aria-pressed={autonomyLevel === opt.value}
                        className={`font-mono text-[12px] px-3 py-1.5 rounded-[3px] border transition-all cursor-pointer ${
                          autonomyLevel === opt.value
                            ? "text-accent border-accent/50 bg-accent/10"
                            : "text-text-muted/70 border-border hover:border-accent/30 hover:text-text-muted"
                        } disabled:opacity-50 disabled:cursor-default`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-text-muted/70 text-[11px] font-mono pl-4 mt-2">
                    {AUTONOMY_OPTIONS.find((o) => o.value === autonomyLevel)?.description}
                  </p>
                </fieldset>

                {/* notes */}
                <div className="mb-5">
                  <p className="text-text-muted mb-2">
                    <span className="text-accent">$ </span>context / focus areas:
                  </p>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="key questions, focus areas, specific competitors to track..."
                    rows={3}
                    className="w-full bg-transparent border border-accent/10 rounded-[3px] text-text font-mono text-inherit leading-[2] px-3 py-2 outline-none transition-colors focus:border-accent/30 placeholder:text-text-muted/40 resize-none"
                    disabled={state === "submitting"}
                  />
                </div>

                {/* error */}
                {errorMsg && (
                  <p className="text-[#ef4444] text-[13px] mb-4" role="alert">{errorMsg}</p>
                )}

                {/* submit */}
                <div className="mt-6 pt-4 border-t border-white/[0.04]">
                  <button
                    type="submit"
                    disabled={state === "submitting"}
                    className="bg-transparent border-0 text-text font-mono text-inherit cursor-pointer p-0 transition-colors hover:text-accent disabled:opacity-50 disabled:cursor-default leading-[2]"
                  >
                    <span className="text-accent">$ </span>
                    {state === "submitting"
                      ? "submitting..."
                      : "strategy --research"}
                    {state !== "submitting" && (
                      <span className="inline-block w-2 h-4 bg-accent align-text-bottom ml-0.5 animate-[blink_1s_step-end_infinite]" />
                    )}
                  </button>
                </div>
              </form>
            )}
          </TerminalChrome>

          <p className="text-center mt-12 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70">
            strategy by bonfire labs
          </p>
        </div>
      </div>
    </>
  );
}
