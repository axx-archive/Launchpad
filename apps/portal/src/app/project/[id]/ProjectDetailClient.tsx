"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import StatusDot from "@/components/StatusDot";
import ScoutChat from "@/components/ScoutChat";
import ToastContainer from "@/components/Toast";
import FileUpload from "@/components/FileUpload";
import FileList from "@/components/FileList";
import ProgressTimeline from "@/components/ProgressTimeline";
import PipelineActivity from "@/components/PipelineActivity";
import ApprovalAction from "@/components/ApprovalAction";
import NarrativePreview from "@/components/NarrativePreview";
import NarrativeApproval from "@/components/NarrativeApproval";
import BrandAssetsPanel from "@/components/BrandAssetsPanel";
import BrandCollectionGate from "@/components/BrandCollectionGate";
import type { Project, ScoutMessage, ProjectNarrative } from "@/types/database";
import DetailRow from "@/components/DetailRow";
import ViewerInsights from "@/components/ViewerInsights";
import VersionHistory from "@/components/VersionHistory";
import { formatProjectType, formatRelativeTime, formatBriefMarkdown, formatFileSize } from "@/lib/format";

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTHS: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

export default function ProjectDetailClient({
  project,
  initialMessages,
  editBriefs,
  userId,
  narrative,
}: {
  project: Project;
  initialMessages: ScoutMessage[];
  editBriefs: ScoutMessage[];
  userId: string;
  narrative: ProjectNarrative | null;
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [expandedBriefs, setExpandedBriefs] = useState<Set<string>>(new Set());
  const [docRefreshKey, setDocRefreshKey] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [docTotalSize, setDocTotalSize] = useState(0);
  const scoutRef = useRef<HTMLDivElement>(null);
  const hasPreview = !!project.pitchapp_url;
  const hasNarrative = !!narrative;
  const isOwner = project.user_id === userId;
  const showApproval = project.status === "review" && isOwner;
  const showNarrativeApproval = project.status === "narrative_review" && isOwner && hasNarrative;
  const showNarrativePreview = (project.status === "narrative_review" || project.status === "brand_collection") && hasNarrative;
  const showBrandCollectionGate = project.status === "brand_collection" && isOwner;
  const showBrandAssets =
    project.status !== "requested" &&
    project.status !== "narrative_review" &&
    project.status !== "brand_collection" &&
    isOwner;

  function toggleBrief(id: string) {
    setExpandedBriefs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <Nav sectionLabel={project.project_name} />
      <ToastContainer />

      <main id="main-content" className="min-h-screen pt-20 px-[clamp(24px,5vw,64px)] pb-16 page-enter">
        <div className="max-w-[1120px] mx-auto">
          {/* Back link + header */}
          <div className="mb-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 font-mono text-[12px] text-text-muted hover:text-text transition-colors mb-6"
            >
              &larr; mission control
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
                  <span className="font-mono text-[11px] text-text-muted/60 tracking-[0.5px]">
                    submitted {formatRelativeTime(project.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Split view */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Preview panel */}
            <div className="flex-1 min-w-0">
              {/* Mobile-only narrative approval (above preview) */}
              {showNarrativeApproval && (
                <div className="mb-4 lg:hidden">
                  <NarrativeApproval
                    projectId={project.id}
                    onScrollToScout={() =>
                      scoutRef.current?.scrollIntoView({ behavior: "smooth" })
                    }
                  />
                </div>
              )}

              {showNarrativePreview ? (
                <NarrativePreview narrative={narrative!} />
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-1">
                        preview
                      </p>
                      <p className="text-[13px] text-text-muted">
                        your launchpad, live.
                      </p>
                    </div>

                    {hasPreview && (
                      <div className="flex items-center gap-1">
                        {(["desktop", "tablet", "mobile"] as Viewport[]).map(
                          (vp) => (
                            <button
                              key={vp}
                              onClick={() => setViewport(vp)}
                              className={`font-mono text-[10px] px-2.5 py-1 rounded-[2px] transition-all cursor-pointer ${
                                viewport === vp
                                  ? "bg-accent/15 text-accent border border-accent/30"
                                  : "text-text-muted/60 border border-transparent hover:text-text-muted"
                              }`}
                            >
                              {vp}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>

                  {hasPreview ? (
                    <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
                      <div
                        className="mx-auto transition-all duration-300"
                        style={{ maxWidth: VIEWPORT_WIDTHS[viewport] }}
                      >
                        <iframe
                          src={project.pitchapp_url!}
                          className="w-full h-[70vh] border-0"
                          title={`${project.project_name} preview`}
                          sandbox="allow-scripts allow-same-origin"
                        />
                      </div>
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
                    <div className="bg-bg-card border border-border rounded-lg flex items-center justify-center h-[50vh]">
                      <div className="text-center px-8">
                        <p className="text-text-muted text-[14px] mb-1">
                          your launchpad is being built.
                        </p>
                        <p className="text-text-muted/60 text-[13px]">
                          you&apos;ll see a live preview here once it&apos;s ready.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Edit history */}
              <div className="mt-8">
                <div className="mb-4">
                  <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-1">
                    edit history
                  </p>
                  <p className="text-[13px] text-text-muted">
                    a record of every change.
                  </p>
                </div>

                {editBriefs.length === 0 ? (
                  <div className="bg-bg-card border border-border rounded-lg p-5">
                    <p className="text-[13px] text-text-muted/60">
                      no edits yet. use scout to request changes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {editBriefs.map((brief) => {
                      const isExpanded = expandedBriefs.has(brief.id);
                      const content = brief.edit_brief_md ?? "";
                      const preview = content.split("\n").slice(0, 3).join("\n");
                      const needsTruncation = content.split("\n").length > 3;

                      return (
                        <div
                          key={brief.id}
                          className="bg-bg-card border border-border rounded-lg p-5"
                        >
                          <p className="font-mono text-[10px] text-text-muted/60 mb-3">
                            {formatRelativeTime(brief.created_at)}
                          </p>
                          <div
                            className="text-[13px] text-text leading-relaxed edit-brief-content"
                            dangerouslySetInnerHTML={{
                              __html: formatBriefMarkdown(
                                isExpanded ? content : preview
                              ),
                            }}
                          />
                          {needsTruncation && (
                            <button
                              onClick={() => toggleBrief(brief.id)}
                              aria-expanded={isExpanded}
                              className="mt-3 font-mono text-[11px] text-accent hover:text-accent-light transition-colors cursor-pointer"
                            >
                              {isExpanded ? "collapse" : "show full brief"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Project info panel */}
            <div className="w-full lg:w-[380px] flex-shrink-0">
              {/* Progress timeline — show when not yet in review */}
              {project.status !== "review" && project.status !== "narrative_review" && project.status !== "live" && (
                <div className="mb-4">
                  <ProgressTimeline status={project.status} />
                </div>
              )}

              {/* Pipeline activity — shows active/completed/queued jobs */}
              <PipelineActivity projectId={project.id} />

              {/* Brand collection gate — show when in brand_collection and user is owner */}
              {showBrandCollectionGate && (
                <div className="mb-4">
                  <BrandCollectionGate projectId={project.id} />
                </div>
              )}

              {/* Narrative approval — show when in narrative_review and user is owner (desktop) */}
              {showNarrativeApproval && (
                <div className="mb-4 hidden lg:block">
                  <NarrativeApproval
                    projectId={project.id}
                    onScrollToScout={() =>
                      scoutRef.current?.scrollIntoView({ behavior: "smooth" })
                    }
                  />
                </div>
              )}

              {/* Approval action — show when in pitchapp review and user is owner */}
              {showApproval && (
                <div className="mb-4">
                  <ApprovalAction
                    projectId={project.id}
                    onScrollToScout={() =>
                      scoutRef.current?.scrollIntoView({ behavior: "smooth" })
                    }
                  />
                </div>
              )}

              <div ref={scoutRef}>
                <ScoutChat
                  projectId={project.id}
                  projectName={project.project_name}
                  initialMessages={initialMessages}
                  projectStatus={project.status}
                />
              </div>

              {/* Brand Assets */}
              {showBrandAssets && (
                <div className="mt-6">
                  <BrandAssetsPanel
                    projectId={project.id}
                    readOnly={project.status === "live" || project.status === "on_hold"}
                  />
                </div>
              )}

              {/* Project details */}
              <div className="mt-6 bg-bg-card border border-border rounded-lg p-6">
                <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
                  details
                </p>
                <dl className="space-y-4">
                  <DetailRow label="project" value={project.project_name} />
                  <DetailRow label="company" value={project.company_name} />
                  <DetailRow
                    label="type"
                    value={formatProjectType(project.type)}
                  />
                  {project.target_audience && (
                    <DetailRow label="audience" value={project.target_audience} />
                  )}
                  {project.materials_link && (
                    <DetailRow label="materials link" value={project.materials_link} isLink />
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
              <div className="mt-6 bg-bg-card border border-border rounded-lg p-6">
                <div className="flex items-baseline justify-between mb-4">
                  <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent">
                    documents
                  </p>
                  {docTotalSize > 0 && (
                    <span className="font-mono text-[10px] text-text-muted/40">
                      {formatFileSize(docTotalSize)} / 25MB
                    </span>
                  )}
                </div>
                <FileList
                  projectId={project.id}
                  canManage
                  refreshKey={docRefreshKey}
                  onCountChange={setDocCount}
                  onTotalSizeChange={setDocTotalSize}
                />
                <div className="mt-3">
                  <FileUpload
                    projectId={project.id}
                    existingCount={docCount}
                    totalBytes={docTotalSize}
                    onUpload={() => setDocRefreshKey((k) => k + 1)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Viewer Insights + Version History — below the split view */}
          {hasPreview && (
            <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ViewerInsights projectId={project.id} />
              <VersionHistory projectId={project.id} />
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center mt-24 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/50">
          launchpad by bonfire labs
        </p>
      </main>
    </>
  );
}

