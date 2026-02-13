"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TerminalChrome from "@/components/TerminalChrome";
import FileUpload, { uploadFileViaSignedUrl } from "@/components/FileUpload";
import LaunchSequence from "@/components/LaunchSequence";
import type { ProjectType } from "@/types/database";

type FormState = "input" | "submitting" | "uploading" | "success" | "error";

const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "investor_pitch", label: "investor pitch" },
  { value: "research_report", label: "research report" },
  { value: "website", label: "website" },
  { value: "other", label: "other" },
];

const TIMELINES = ["no rush", "2-3 weeks", "asap"];

export default function NewProjectClient() {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<FormState>("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [projectName, setProjectName] = useState("");
  const [company, setCompany] = useState("");
  const [type, setType] = useState<ProjectType | "">("");
  const [audience, setAudience] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [timeline, setTimeline] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (state === "input" && nameRef.current) {
      nameRef.current.focus();
    }
  }, [state]);

  // Redirect handled by LaunchSequence onComplete

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Fix 6: double-submit guard
    if (state === "submitting" || state === "uploading" || state === "success") return;

    // Fix 3: clear previous error inline
    setErrorMsg("");

    if (!projectName.trim() || !company.trim() || !type) {
      setErrorMsg("need a project name, company, and type to proceed.");
      setState("error");
      return;
    }

    setState("submitting");

    // Fix 2: try-catch around fetch
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: projectName.trim(),
          company_name: company.trim(),
          type,
          target_audience: audience.trim() || null,
          timeline_preference: timeline || null,
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
      const newProjectId = data.project.id;
      setCreatedId(newProjectId);

      // Upload queued files via signed URLs (direct to Supabase)
      if (queuedFiles.length > 0) {
        setState("uploading");
        for (const file of queuedFiles) {
          try {
            await uploadFileViaSignedUrl(file, newProjectId);
          } catch {
            // Non-blocking — project is already created
          }
        }
      }

      setState("success");
    } catch {
      setErrorMsg("network error. check your connection and try again.");
      setState("error");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 page-enter">
      <div className="w-full max-w-[600px]">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 font-mono text-[12px] text-text-muted hover:text-text transition-colors mb-6"
        >
          &larr; mission control
        </Link>

        <TerminalChrome title={state === "success" ? "launchpad — launch sequence" : "launchpad — new mission"}>
          {/* LAUNCH SEQUENCE */}
          {state === "success" && (
            <LaunchSequence
              projectName={projectName}
              fileCount={queuedFiles.length}
              onComplete={() => {
                if (createdId) router.push(`/project/${createdId}`);
              }}
            />
          )}

          {/* Fix 3: form renders in input, submitting, uploading, AND error states */}
          {(state === "input" || state === "submitting" || state === "uploading" || state === "error") && (
            <form onSubmit={handleSubmit}>
              <p className="text-text font-mono text-[clamp(20px,3vw,28px)] font-light mb-6">
                new mission
              </p>
              <p className="text-text-muted mb-8">
                tell us about your project. we'll take it from here.
              </p>

              {/* project name — Fix 1: htmlFor/id pair */}
              <div className="flex items-center gap-0 mb-5 flex-wrap">
                <label htmlFor="project-name" className="text-text-muted whitespace-nowrap cursor-default">
                  <span className="text-accent">$ </span>project name:
                </label>
                <input
                  ref={nameRef}
                  id="project-name"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="series a deck"
                  className="flex-1 min-w-[180px] bg-transparent border-0 border-b border-accent/10 text-text font-mono text-inherit leading-[2] px-2 outline-none transition-colors focus:border-b-accent placeholder:text-text-muted/40"
                  disabled={state === "submitting"}
                />
              </div>

              {/* company — Fix 1: htmlFor/id pair */}
              <div className="flex items-center gap-0 mb-5 flex-wrap">
                <label htmlFor="company" className="text-text-muted whitespace-nowrap cursor-default">
                  <span className="text-accent">$ </span>company:
                </label>
                <input
                  id="company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="acme corp"
                  className="flex-1 min-w-[180px] bg-transparent border-0 border-b border-accent/10 text-text font-mono text-inherit leading-[2] px-2 outline-none transition-colors focus:border-b-accent placeholder:text-text-muted/40"
                  disabled={state === "submitting"}
                />
              </div>

              {/* type — Fix 1: fieldset/legend + aria-pressed */}
              <fieldset className="mb-5 border-0 p-0 m-0">
                <legend className="text-text-muted mb-2">
                  <span className="text-accent">$ </span>type:
                </legend>
                <div className="flex flex-wrap gap-2 pl-4">
                  {PROJECT_TYPES.map((t) => (
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

              {/* target audience — Fix 1: htmlFor/id pair */}
              <div className="flex items-center gap-0 mb-5 flex-wrap">
                <label htmlFor="audience" className="text-text-muted whitespace-nowrap cursor-default">
                  <span className="text-accent">$ </span>target audience:
                </label>
                <input
                  id="audience"
                  type="text"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="seed-stage vcs"
                  className="flex-1 min-w-[180px] bg-transparent border-0 border-b border-accent/10 text-text font-mono text-inherit leading-[2] px-2 outline-none transition-colors focus:border-b-accent placeholder:text-text-muted/40"
                  disabled={state === "submitting"}
                />
              </div>

              {/* file upload */}
              <div className="mb-5">
                <p className="text-text-muted mb-2">
                  <span className="text-accent">$ </span>materials:
                </p>
                <FileUpload
                  queuedFiles={queuedFiles}
                  onQueue={(files) => setQueuedFiles((prev) => [...prev, ...files])}
                  onRemoveQueued={(i) => setQueuedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={state === "submitting" || state === "uploading"}
                />
              </div>

              {/* timeline — Fix 1: fieldset/legend + aria-pressed */}
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

              {/* notes */}
              <div className="mb-5">
                <p className="text-text-muted mb-2">
                  <span className="text-accent">$ </span>notes:
                </p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="anything else we should know..."
                  rows={3}
                  className="w-full bg-transparent border border-accent/10 rounded-[3px] text-text font-mono text-inherit leading-[2] px-3 py-2 outline-none transition-colors focus:border-accent/30 placeholder:text-text-muted/40 resize-none"
                  disabled={state === "submitting"}
                />
              </div>

              {/* Fix 3: inline error above submit */}
              {errorMsg && (
                <p className="text-error text-[13px] mb-4" role="alert">{errorMsg}</p>
              )}

              {/* submit */}
              <div className="mt-6 pt-4 border-t border-white/[0.04]">
                <button
                  type="submit"
                  disabled={state === "submitting" || state === "uploading"}
                  className="bg-transparent border-0 text-text font-mono text-inherit cursor-pointer p-0 transition-colors hover:text-accent disabled:opacity-50 disabled:cursor-default leading-[2]"
                >
                  <span className="text-accent">$ </span>
                  {state === "submitting"
                    ? "submitting..."
                    : state === "uploading"
                    ? "uploading files..."
                    : "launchpad --submit"}
                  {state !== "submitting" && state !== "uploading" && (
                    <span className="inline-block w-2 h-4 bg-accent align-text-bottom ml-0.5 animate-[blink_1s_step-end_infinite]" />
                  )}
                </button>
              </div>
            </form>
          )}
        </TerminalChrome>

        <p className="text-center mt-12 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/50">
          launchpad by bonfire labs
        </p>
      </div>
    </div>
  );
}
