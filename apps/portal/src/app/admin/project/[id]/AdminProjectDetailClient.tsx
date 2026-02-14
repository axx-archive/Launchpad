"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import StatusDot from "@/components/StatusDot";
import TerminalChrome from "@/components/TerminalChrome";
import ToastContainer, { toast } from "@/components/Toast";
import FileList from "@/components/FileList";
import type { Project, ProjectStatus, AutonomyLevel, ScoutMessage } from "@/types/database";
import { STATUS_LABELS } from "@/types/database";
import DetailRow from "@/components/DetailRow";
import { formatProjectType, formatRelativeTime, formatBriefMarkdown } from "@/lib/format";

const ALL_STATUSES: ProjectStatus[] = [
  "requested",
  "brand_collection",
  "in_progress",
  "review",
  "revision",
  "live",
  "on_hold",
];

const AUTONOMY_LEVELS: { value: AutonomyLevel; label: string }[] = [
  { value: "manual", label: "manual (AJ mode)" },
  { value: "supervised", label: "supervised" },
  { value: "full_auto", label: "full autonomy" },
];

export default function AdminProjectDetailClient({
  project,
  messages,
}: {
  project: Project;
  messages: ScoutMessage[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>(project.autonomy_level ?? "full_auto");
  const [pitchappUrl, setPitchappUrl] = useState(project.pitchapp_url ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasPreview = !!project.pitchapp_url;
  const editBriefs = messages.filter((m) => m.edit_brief_md);

  async function handleDelete() {
    if (!confirm(`Delete "${project.company_name} — ${project.project_name}"? This removes all messages, documents, and notifications. This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error ?? "failed to delete", "error");
        return;
      }
      toast("mission deleted", "success");
      router.push("/admin");
    } catch {
      toast("something went wrong. try again.", "error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          autonomy_level: autonomyLevel,
          pitchapp_url: pitchappUrl || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast(data.error ?? "failed to update", "error");
        return;
      }

      toast("project updated", "success");
      router.refresh();
    } catch {
      toast("something went wrong. try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Nav sectionLabel="admin" isAdmin />
      <ToastContainer />

      <main className="min-h-screen pt-20 px-[clamp(24px,5vw,64px)] pb-16 page-enter">
        <div className="max-w-[1120px] mx-auto">
          {/* Back link + header */}
          <div className="mb-8">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 font-mono text-[12px] text-text-muted hover:text-text transition-colors mb-6"
            >
              &larr; all missions
            </Link>

            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="font-display text-[clamp(26px,4vw,38px)] font-light text-text mb-2">
                  {project.project_name}
                </h1>
                <div className="flex items-center gap-4 flex-wrap">
                  <StatusDot status={project.status} size="md" />
                  <span className="font-mono text-[11px] text-accent px-2.5 py-1 bg-accent/8 rounded-[3px] border border-accent/12 tracking-[1px]">
                    {formatProjectType(project.type)}
                  </span>
                  <span className={`font-mono text-[10px] px-2 py-0.5 rounded-[3px] border tracking-[1px] ${
                    autonomyLevel === "full_auto"
                      ? "text-emerald-400/80 border-emerald-400/20 bg-emerald-400/8"
                      : autonomyLevel === "supervised"
                      ? "text-amber-400/80 border-amber-400/20 bg-amber-400/8"
                      : "text-text-muted/80 border-border bg-white/[0.03]"
                  }`}>
                    {autonomyLevel === "full_auto" ? "auto" : autonomyLevel === "supervised" ? "supervised" : "AJ"}
                  </span>
                  <span className="font-mono text-[11px] text-text-muted/70 tracking-[0.5px]">
                    submitted {formatRelativeTime(project.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Preview */}
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
                preview
              </p>

              {hasPreview ? (
                <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
                  <iframe
                    src={project.pitchapp_url!}
                    className="w-full h-[60vh] border-0"
                    title={`${project.project_name} preview`}
                    sandbox="allow-scripts allow-same-origin"
                  />
                  <div className="px-4 py-3 border-t border-border">
                    <a
                      href={project.pitchapp_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] text-accent hover:text-accent-light transition-colors"
                    >
                      open in new tab &rarr;
                    </a>
                  </div>
                </div>
              ) : (
                <div className="bg-bg-card border border-border rounded-lg flex items-center justify-center h-[40vh]">
                  <p className="text-text-muted/70 text-[13px]">
                    no preview url set
                  </p>
                </div>
              )}

              {/* Edit briefs */}
              {editBriefs.length > 0 && (
                <div className="mt-6">
                  <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
                    edit briefs
                  </p>
                  <div className="space-y-3">
                    {editBriefs.map((brief) => (
                      <div
                        key={brief.id}
                        className="bg-bg-card border border-border rounded-lg p-5"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-mono text-[10px] text-text-muted/70">
                            {formatRelativeTime(brief.created_at)}
                          </p>
                          <span className="font-mono text-[9px] tracking-[1px] text-accent/60 bg-accent/8 px-2 py-0.5 rounded-[2px]">
                            brief
                          </span>
                        </div>
                        <div
                          className="text-[13px] text-text leading-relaxed edit-brief-content"
                          dangerouslySetInnerHTML={{
                            __html: formatBriefMarkdown(brief.edit_brief_md ?? ""),
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Admin controls */}
            <div className="w-full lg:w-[380px] flex-shrink-0 space-y-6">
              {/* Status + URL controls */}
              <div className="bg-bg-card border border-border rounded-lg p-6">
                <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-5">
                  controls
                </p>

                {/* Status dropdown */}
                <div className="mb-5">
                  <label className="block font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70 mb-2">
                    status
                  </label>
                  <div ref={dropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="w-full flex items-center justify-between bg-bg-raised border border-border rounded-[3px] px-3 py-2 font-mono text-[12px] text-text outline-none hover:border-accent/30 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <StatusDot status={status} size="sm" />
                        {STATUS_LABELS[status]}
                      </span>
                      <svg
                        width="10"
                        height="6"
                        viewBox="0 0 10 6"
                        fill="none"
                        className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                      >
                        <path
                          d="M1 1L5 5L9 1"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          className="text-text-muted"
                        />
                      </svg>
                    </button>

                    {dropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-bg-raised border border-border rounded-[3px] py-1 shadow-lg">
                        {ALL_STATUSES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              setStatus(s);
                              setDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 font-mono text-[12px] transition-colors cursor-pointer ${
                              s === status
                                ? "text-accent bg-accent/5"
                                : "text-text hover:bg-white/[0.03]"
                            }`}
                          >
                            <StatusDot status={s} size="sm" />
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Autonomy level */}
                <div className="mb-5">
                  <label className="block font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70 mb-2">
                    build mode
                  </label>
                  <select
                    value={autonomyLevel}
                    onChange={(e) => setAutonomyLevel(e.target.value as AutonomyLevel)}
                    className="w-full bg-bg-raised border border-border rounded-[3px] px-3 py-2 font-mono text-[12px] text-text outline-none hover:border-accent/30 focus:border-accent/30 transition-colors cursor-pointer appearance-none"
                  >
                    {AUTONOMY_LEVELS.map((lvl) => (
                      <option key={lvl.value} value={lvl.value}>
                        {lvl.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* PitchApp URL */}
                <div className="mb-5">
                  <label className="block font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70 mb-2">
                    pitchapp url
                  </label>
                  <input
                    type="url"
                    value={pitchappUrl}
                    onChange={(e) => setPitchappUrl(e.target.value)}
                    placeholder="https://example.vercel.app"
                    className="w-full bg-bg-raised border border-border rounded-[3px] px-3 py-2 font-mono text-[12px] text-text outline-none focus:border-accent/30 transition-colors placeholder:text-text-muted/30"
                  />
                </div>

                {/* Save button */}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-transparent border border-accent/20 text-accent font-mono text-[12px] py-2.5 rounded-[3px] hover:border-accent/50 hover:bg-accent/5 transition-all tracking-[1px] cursor-pointer disabled:opacity-50 disabled:cursor-default"
                >
                  {saving ? "saving..." : "save changes"}
                </button>

                {/* Delete button */}
                <div className="mt-4 pt-4 border-t border-border">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full bg-transparent border border-error/20 text-error/70 font-mono text-[11px] py-2 rounded-[3px] hover:border-error/50 hover:bg-error/5 hover:text-error transition-all tracking-[1px] cursor-pointer disabled:opacity-50 disabled:cursor-default"
                  >
                    {deleting ? "deleting..." : "delete mission"}
                  </button>
                </div>
              </div>

              {/* Project details */}
              <div className="bg-bg-card border border-border rounded-lg p-6">
                <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
                  details
                </p>
                <dl className="space-y-4">
                  <DetailRow label="project" value={project.project_name} />
                  <DetailRow label="company" value={project.company_name} />
                  {project.submitter_email && (
                    <DetailRow
                      label="submitted by"
                      value={project.submitter_email}
                    />
                  )}
                  <DetailRow
                    label="type"
                    value={formatProjectType(project.type)}
                  />
                  {project.target_audience && (
                    <DetailRow
                      label="audience"
                      value={project.target_audience}
                    />
                  )}
                  {project.materials_link && (
                    <DetailRow
                      label="materials link"
                      value={project.materials_link}
                      isLink
                    />
                  )}
                  {project.timeline_preference && (
                    <DetailRow
                      label="timeline"
                      value={project.timeline_preference}
                    />
                  )}
                  {project.notes && (
                    <DetailRow label="notes" value={project.notes} />
                  )}
                </dl>
              </div>

              {/* Documents */}
              <div className="bg-bg-card border border-border rounded-lg p-6">
                <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
                  documents
                </p>
                <FileList
                  projectId={project.id}
                  canManage
                />
              </div>

              {/* Scout conversation (read-only) */}
              {messages.length > 0 && (
                <TerminalChrome title="scout — read only">
                  <div className="max-h-[300px] overflow-y-auto space-y-1 scout-messages">
                    {messages.map((msg) => (
                      <div key={msg.id} className="mb-1">
                        {msg.role === "user" ? (
                          <span className="text-text-muted">
                            <span className="text-text-muted/70">client: </span>
                            {msg.content}
                          </span>
                        ) : (
                          <span className="text-text">
                            <span className="text-accent/70">scout: </span>
                            <span className="whitespace-pre-wrap">
                              {msg.content
                                .replace(
                                  /---EDIT_BRIEF---[\s\S]*?---END_BRIEF---/g,
                                  ""
                                )
                                .trim()}
                            </span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-white/[0.04] pt-3 mt-3">
                    <span className="text-text-muted/70 text-[11px]">read-only view</span>
                  </div>
                </TerminalChrome>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center mt-24 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70">
          launchpad by bonfire labs
        </p>
      </main>
    </>
  );
}

