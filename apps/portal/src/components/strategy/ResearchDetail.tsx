"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import StatusDot from "@/components/StatusDot";
import TerminalChrome from "@/components/TerminalChrome";
import ResearchTheater from "@/components/strategy/ResearchTheater";
import ResearchOutput from "@/components/strategy/ResearchOutput";
import PromoteModal from "@/components/strategy/PromoteModal";
import ShareButton from "@/components/ShareButton";
import ShareModal from "@/components/ShareModal";
import CollaboratorAvatars from "@/components/CollaboratorAvatars";
import JourneyTrail from "@/components/JourneyTrail";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { formatProjectType, formatRelativeTime } from "@/lib/format";
import type { Project, MemberRole, Collaborator } from "@/types/database";
import type { ProjectResearch } from "@/types/strategy";

interface ResearchDetailProps {
  project: Project;
  research: ProjectResearch[];
  collaborators?: Collaborator[];
  userRole: MemberRole;
  isAdmin: boolean;
}

export default function ResearchDetail({
  project: initialProject,
  research: initialResearch,
  collaborators = [],
  userRole,
  isAdmin,
}: ResearchDetailProps) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [research, setResearch] = useState(initialResearch);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const isOwner = userRole === "owner" || isAdmin;
  const canReview = isOwner && project.status === "research_review";
  const canPromote = isOwner && project.status === "research_complete";
  const isResearching = ["research_queued", "researching"].includes(project.status);

  const currentResearch = research.find((r) => r.status === "approved") ?? research.find((r) => r.status === "draft") ?? research[0];

  // Subscribe to project status changes
  useRealtimeSubscription({
    table: "projects",
    events: ["UPDATE"],
    filter: { column: "id", value: project.id },
    onEvent: (payload) => {
      const updated = payload.new as Project | undefined;
      if (updated) setProject((prev) => ({ ...prev, ...updated }));
    },
  });

  // Subscribe to new research versions
  useRealtimeSubscription({
    table: "project_research",
    events: ["INSERT", "UPDATE"],
    filter: { column: "project_id", value: project.id },
    onEvent: (payload) => {
      const updated = payload.new as ProjectResearch | undefined;
      if (!updated?.id) return;
      setResearch((prev) => {
        const idx = prev.findIndex((r) => r.id === updated.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [updated, ...prev];
      });
    },
  });

  const handleReview = useCallback(async (action: "approve" | "reject") => {
    if (reviewSubmitting) return;

    if (action === "reject" && !reviewNotes.trim()) {
      setReviewError("notes are required when requesting changes.");
      return;
    }

    setReviewSubmitting(true);
    setReviewError("");

    try {
      const res = await fetch(`/api/strategy/projects/${project.id}/research/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notes: reviewNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReviewError(data.error ?? "review failed. try again.");
        setReviewSubmitting(false);
        return;
      }

      setReviewAction(null);
      setReviewNotes("");
      setReviewSubmitting(false);
      // Status will update via Realtime
    } catch {
      setReviewError("network error. check your connection.");
      setReviewSubmitting(false);
    }
  }, [project.id, reviewNotes, reviewSubmitting]);

  return (
    <>
      <Nav sectionLabel="strategy &mdash; research" isAdmin={isAdmin} />

      {showPromoteModal && (
        <PromoteModal
          projectId={project.id}
          projectName={project.project_name}
          sourceDepartment="strategy"
          onClose={() => setShowPromoteModal(false)}
          onSuccess={(newId) => {
            setShowPromoteModal(false);
            router.push(`/project/${newId}`);
          }}
        />
      )}

      {showShareModal && (
        <ShareModal
          projectId={project.id}
          projectName={project.project_name}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
        />
      )}

      <main id="main-content" className="min-h-screen pt-24 px-[clamp(24px,5vw,64px)] pb-16 page-enter">
        <div className="max-w-[1120px] mx-auto">
          {/* Breadcrumb */}
          <Link
            href="/strategy"
            className="inline-flex items-center gap-2 font-mono text-[12px] text-text-muted hover:text-text transition-colors mb-6"
          >
            &larr; research lab
          </Link>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <StatusDot status={project.status} size="md" />
            </div>
            <h1 className="font-display text-[clamp(24px,3vw,36px)] font-light text-text tracking-[1px] mb-2">
              {project.project_name}
            </h1>
            <p className="text-[14px] text-text-muted">
              {project.company_name}
            </p>
            <div className="flex items-center gap-3 mt-3">
              {collaborators.length > 0 && (
                <CollaboratorAvatars collaborators={collaborators} maxDisplay={4} />
              )}
              {(userRole === "owner" || isAdmin) && (
                <ShareButton onClick={() => setShowShareModal(true)} />
              )}
            </div>
          </div>

          {/* Main content — split layout */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left panel — main content */}
            <div className="flex-1 min-w-0 space-y-6">
              {/* Research Theater (while researching) */}
              {isResearching && (
                <ResearchTheater projectId={project.id} />
              )}

              {/* Research Output (when complete or in review) */}
              {currentResearch && !isResearching && (
                <ResearchOutput research={currentResearch} />
              )}

              {/* Polishing indicator — when research exists but auto-polish is still running */}
              {currentResearch && !isResearching && !currentResearch.is_polished &&
                !["research_review", "research_complete"].includes(project.status) && (
                <div className="bg-bg-card border border-accent/15 rounded-lg p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-accent/70 animate-pulse" />
                    <p className="font-mono text-[12px] text-accent/70">
                      polishing research...
                    </p>
                  </div>
                  <p className="text-[13px] text-text-muted mt-2 ml-5">
                    applying editorial polish and quality scoring. this may take a few minutes.
                  </p>
                </div>
              )}

              {/* Review actions */}
              {canReview && currentResearch && (
                <div className="bg-bg-card border border-border rounded-lg p-6">
                  <p className="font-mono text-[10px] tracking-[4px] lowercase text-[#8B9A6B]/70 mb-3">
                    review research
                  </p>

                  {reviewAction === null ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setReviewAction("approve")}
                        className="font-mono text-[12px] text-success border border-success/20 px-4 py-2 rounded-[3px] hover:border-success/50 hover:bg-success/5 transition-all cursor-pointer"
                      >
                        approve research
                      </button>
                      <button
                        onClick={() => setReviewAction("reject")}
                        className="font-mono text-[12px] text-text-muted/70 border border-white/8 px-4 py-2 rounded-[3px] hover:border-white/15 hover:text-text-muted transition-all cursor-pointer"
                      >
                        request changes
                      </button>
                    </div>
                  ) : reviewAction === "approve" ? (
                    <div className="space-y-3">
                      <p className="text-[13px] text-text">
                        approve this research? it will be marked complete and available for promotion.
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleReview("approve")}
                          disabled={reviewSubmitting}
                          className="font-mono text-[12px] text-success border border-success/30 px-4 py-2 rounded-[3px] hover:border-success/50 hover:bg-success/5 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {reviewSubmitting ? "approving..." : "confirm approve"}
                        </button>
                        <button
                          onClick={() => { setReviewAction(null); setReviewError(""); }}
                          disabled={reviewSubmitting}
                          className="font-mono text-[12px] text-text-muted/70 hover:text-text-muted transition-colors cursor-pointer"
                        >
                          cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[13px] text-text-muted mb-2">
                        what should the research agent focus on?
                      </p>
                      <textarea
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="go deeper on competitive pricing, add market size projections..."
                        rows={3}
                        className="w-full bg-transparent border border-accent/10 rounded-[3px] text-text font-mono text-[12px] leading-[2] px-3 py-2 outline-none transition-colors focus:border-accent/30 placeholder:text-text-muted/40 resize-none"
                        disabled={reviewSubmitting}
                      />
                      {reviewError && (
                        <p className="text-[#ef4444] text-[12px]" role="alert">{reviewError}</p>
                      )}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleReview("reject")}
                          disabled={reviewSubmitting}
                          className="font-mono text-[12px] text-accent border border-accent/20 px-4 py-2 rounded-[3px] hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {reviewSubmitting ? "submitting..." : "send revision notes"}
                        </button>
                        <button
                          onClick={() => { setReviewAction(null); setReviewError(""); setReviewNotes(""); }}
                          disabled={reviewSubmitting}
                          className="font-mono text-[12px] text-text-muted/70 hover:text-text-muted transition-colors cursor-pointer"
                        >
                          cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Promote to Creative */}
              {canPromote && (
                <div className="bg-bg-card border border-[rgba(139,154,107,0.15)] rounded-lg p-6">
                  <p className="font-mono text-[10px] tracking-[4px] lowercase text-[#8B9A6B]/70 mb-3">
                    next step
                  </p>
                  <p className="text-[13px] text-text-muted mb-4">
                    research is complete. promote to creative to build a pitchapp from these findings.
                  </p>
                  <button
                    onClick={() => setShowPromoteModal(true)}
                    className="font-mono text-[12px] text-accent border border-accent/20 px-4 py-2 rounded-[3px] hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer tracking-[0.5px]"
                  >
                    promote to creative &rarr;
                  </button>
                </div>
              )}
            </div>

            {/* Right panel — sidebar */}
            <div className="w-full lg:w-[380px] flex-shrink-0 space-y-6">
              {/* Project details */}
              <TerminalChrome title="research details">
                <div className="space-y-3">
                  <DetailRow label="type" value={formatProjectType(project.type)} />
                  <DetailRow label="company" value={project.company_name} />
                  <DetailRow label="status" value={project.status.replace(/_/g, " ")} />
                  <DetailRow label="created" value={formatRelativeTime(project.created_at)} />
                  <DetailRow label="updated" value={formatRelativeTime(project.updated_at)} />
                  {project.target_audience && (
                    <DetailRow label="audience" value={project.target_audience} />
                  )}
                  {project.timeline_preference && (
                    <DetailRow label="timeline" value={project.timeline_preference} />
                  )}
                  {project.notes && (
                    <div className="pt-2 border-t border-white/[0.04]">
                      <p className="font-mono text-[10px] text-text-muted/50 mb-1">notes</p>
                      <p className="text-[12px] text-text-muted leading-relaxed">{project.notes}</p>
                    </div>
                  )}
                </div>
              </TerminalChrome>

              {/* Journey trail — cross-department provenance */}
              <JourneyTrail projectId={project.id} projectDepartment={project.department} projectName={project.project_name} companyName={project.company_name} />

              {/* Research history */}
              {research.length > 1 && (
                <TerminalChrome title="research versions">
                  <div className="space-y-2">
                    {research.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-text">
                            v{r.version}
                          </span>
                          <span
                            className={`font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] ${
                              r.status === "approved"
                                ? "text-success/80 bg-success/8"
                                : r.status === "draft"
                                ? "text-accent/80 bg-accent/8"
                                : "text-text-muted/50 bg-white/[0.04]"
                            }`}
                          >
                            {r.status}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-text-muted/50">
                          {formatRelativeTime(r.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </TerminalChrome>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center mt-24 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70">
          spark by bonfire labs
        </p>
      </main>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-[10px] text-text-muted/50 tracking-[1px] lowercase shrink-0 w-[70px]">
        {label}
      </span>
      <span className="text-[12px] text-text truncate">
        {value}
      </span>
    </div>
  );
}
