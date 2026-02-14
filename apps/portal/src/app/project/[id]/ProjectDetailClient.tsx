"use client";

import { useState, useRef, useMemo } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import StatusDot from "@/components/StatusDot";
import ScoutChat from "@/components/ScoutChat";
import ToastContainer from "@/components/Toast";
import FileUpload from "@/components/FileUpload";
import FileList from "@/components/FileList";
import ProgressTimeline from "@/components/ProgressTimeline";
import PipelineFlow from "@/components/PipelineFlow";
import PipelineActivity from "@/components/PipelineActivity";
import BuildTheater from "@/components/BuildTheater";
import ApprovalAction from "@/components/ApprovalAction";
import NarrativePreview from "@/components/NarrativePreview";
import NarrativeApproval from "@/components/NarrativeApproval";
import BrandAssetsPanel from "@/components/BrandAssetsPanel";
import BrandCollectionGate from "@/components/BrandCollectionGate";
import ProjectDeliverables from "@/components/ProjectDeliverables";
import ShareButton from "@/components/ShareButton";
import AgencyCredits from "@/components/AgencyCredits";
import CollaboratorAvatars from "@/components/CollaboratorAvatars";
import ShareModal from "@/components/ShareModal";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import type { Project, ScoutMessage, ProjectNarrative, MemberRole, Collaborator } from "@/types/database";
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
  userRole = "owner",
  collaborators = [],
}: {
  project: Project;
  initialMessages: ScoutMessage[];
  editBriefs: ScoutMessage[];
  userId: string;
  narrative: ProjectNarrative | null;
  userRole?: MemberRole;
  collaborators?: Collaborator[];
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [expandedBriefs, setExpandedBriefs] = useState<Set<string>>(new Set());
  const [docRefreshKey, setDocRefreshKey] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [docTotalSize, setDocTotalSize] = useState(0);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [liveProject, setLiveProject] = useState<Project>(project);
  const scoutRef = useRef<HTMLDivElement>(null);
  const creditsTriggerRef = useRef<HTMLButtonElement>(null);

  // Realtime subscription for project status changes
  useRealtimeSubscription({
    table: "projects",
    events: ["UPDATE"],
    filter: { column: "id", value: project.id },
    onEvent: (payload) => {
      const updated = payload.new as Partial<Project> & { id: string } | undefined;
      if (!updated?.id) return;
      setLiveProject((prev) => ({ ...prev, ...updated }));
    },
  });

  const hasPreview = !!liveProject.pitchapp_url;
  const hasNarrative = !!narrative;

  // Build collaborator lookup map for ScoutChat sender attribution
  const collaboratorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of collaborators) {
      if (c.user_id) map[c.user_id] = c.email;
    }
    return map;
  }, [collaborators]);

  // Role-based flags
  const isOwner = userRole === "owner";
  const isViewer = userRole === "viewer";
  const canEdit = isOwner || userRole === "editor";

  const showApproval = liveProject.status === "review" && isOwner;
  const showNarrativeApproval = liveProject.status === "narrative_review" && isOwner && hasNarrative;
  const showNarrativePreview = (liveProject.status === "narrative_review" || liveProject.status === "brand_collection") && hasNarrative;
  const showBrandCollectionGate = liveProject.status === "brand_collection" && isOwner;
  const showBrandAssets =
    liveProject.status !== "requested" &&
    liveProject.status !== "narrative_review" &&
    liveProject.status !== "brand_collection";

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
      <Nav sectionLabel={project.project_name} userRole={userRole} />
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
                  <StatusDot status={liveProject.status} size="md" />
                  <span className="font-mono text-[11px] text-accent px-2.5 py-1 bg-accent/8 rounded-[3px] border border-accent/12 tracking-[1px]">
                    {formatProjectType(project.type)}
                  </span>
                  <span className="font-mono text-[11px] text-text-muted/70 tracking-[0.5px]">
                    submitted {formatRelativeTime(project.created_at)}
                  </span>
                  {collaborators.length > 1 && (
                    <CollaboratorAvatars
                      collaborators={collaborators.map((c) => ({
                        email: c.email,
                        role: c.role,
                      }))}
                    />
                  )}
                </div>
              </div>
              {isOwner && (
                <ShareButton onClick={() => setShareModalOpen(true)} />
              )}
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
                                  : "text-text-muted/70 border border-transparent hover:text-text-muted"
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
                          src={liveProject.pitchapp_url!}
                          className="w-full h-[70vh] border-0"
                          title={`${project.project_name} preview`}
                          sandbox="allow-scripts allow-same-origin"
                        />
                      </div>
                      <div className="px-4 py-3 border-t border-border">
                        <a
                          href={liveProject.pitchapp_url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[11px] text-accent hover:text-accent-light transition-colors"
                        >
                          open in new tab &rarr;
                        </a>
                      </div>
                    </div>
                  ) : liveProject.status === "requested" ? (
                    <div className="bg-bg-card border border-border rounded-lg p-8">
                      <div className="max-w-md mx-auto">
                        <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-5">
                          mission received
                        </p>
                        <p className="font-display text-[clamp(16px,2vw,20px)] font-light text-text mb-6">
                          your project has been received and is entering the pipeline.
                        </p>
                        <div className="space-y-3 mb-6">
                          <div className="flex items-start gap-3">
                            <span className="font-mono text-[10px] text-accent/70 mt-0.5">01</span>
                            <p className="text-text-muted text-[13px]">story extraction &mdash; we analyze your materials and find the narrative arc</p>
                          </div>
                          <div className="flex items-start gap-3">
                            <span className="font-mono text-[10px] text-accent/70 mt-0.5">02</span>
                            <p className="text-text-muted text-[13px]">build &mdash; your pitchapp is designed, coded, and reviewed</p>
                          </div>
                          <div className="flex items-start gap-3">
                            <span className="font-mono text-[10px] text-accent/70 mt-0.5">03</span>
                            <p className="text-text-muted text-[13px]">review &mdash; you&apos;ll get a live preview right here to approve or request changes</p>
                          </div>
                        </div>
                        <p className="font-mono text-[11px] text-text-muted/70">
                          typical build: 24&ndash;48 hours
                        </p>
                      </div>
                    </div>
                  ) : (
                    <BuildTheater projectId={project.id} />
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
                    <p className="text-[13px] text-text-muted/70">
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
                      const senderEmail = brief.sender_id
                        ? brief.sender_id === userId
                          ? "you"
                          : collaboratorMap[brief.sender_id] ?? "unknown"
                        : null;

                      return (
                        <div
                          key={brief.id}
                          className="bg-bg-card border border-border rounded-lg p-5"
                        >
                          <p className="font-mono text-[10px] text-text-muted/70 mb-3">
                            {senderEmail && (
                              <span className="text-text-muted/80">{senderEmail} &middot; </span>
                            )}
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
              {liveProject.status !== "review" && liveProject.status !== "narrative_review" && liveProject.status !== "live" && (
                <div className="mb-4">
                  <ProgressTimeline status={liveProject.status} />
                </div>
              )}

              {/* Pipeline flow — visual DAG of build pipeline */}
              <PipelineFlow projectId={project.id} projectStatus={liveProject.status} />

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

              {/* Deliverables — one-pager + email sequence (show after build starts) */}
              {["in_progress", "review", "revision", "live"].includes(liveProject.status) && (
                <ProjectDeliverables projectId={project.id} />
              )}

              <div ref={scoutRef}>
                <ScoutChat
                  projectId={project.id}
                  projectName={project.project_name}
                  initialMessages={initialMessages}
                  projectStatus={liveProject.status}
                  readOnly={isViewer}
                  collaboratorMap={collaboratorMap}
                  currentUserId={userId}
                />
              </div>

              {/* Brand Assets */}
              {showBrandAssets && (
                <div className="mt-6">
                  <BrandAssetsPanel
                    projectId={project.id}
                    readOnly={isViewer || liveProject.status === "live" || liveProject.status === "on_hold"}
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
                    <span className="font-mono text-[10px] text-text-muted/70">
                      {formatFileSize(docTotalSize)} / 25MB
                    </span>
                  )}
                </div>
                <FileList
                  projectId={project.id}
                  canManage={canEdit}
                  refreshKey={docRefreshKey}
                  onCountChange={setDocCount}
                  onTotalSizeChange={setDocTotalSize}
                />
                {canEdit && (
                  <div className="mt-3">
                    <FileUpload
                      projectId={project.id}
                      existingCount={docCount}
                      totalBytes={docTotalSize}
                      onUpload={() => setDocRefreshKey((k) => k + 1)}
                    />
                  </div>
                )}
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

          {/* Agency Credits button — show for completed builds */}
          {hasPreview && (
            <div className="mt-6 text-center">
              <button
                ref={creditsTriggerRef}
                onClick={() => setCreditsOpen(true)}
                className="font-mono text-[11px] text-text-muted/70 hover:text-accent transition-colors cursor-pointer tracking-[1px]"
              >
                $ view credits
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center mt-24 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70">
          launchpad by bonfire labs
        </p>
      </main>

      {/* Share Modal */}
      {shareModalOpen && (
        <ShareModal
          projectId={project.id}
          projectName={project.project_name}
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
        />
      )}

      {/* Agency Credits Modal */}
      <AgencyCredits
        projectId={project.id}
        isOpen={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        triggerRef={creditsTriggerRef}
      />
    </>
  );
}
